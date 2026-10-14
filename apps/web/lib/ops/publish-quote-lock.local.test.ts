// apps/web/lib/ops/publish-quote-lock.local.test.ts
//
// Decision 2026-10-13 item 13 (signed 2026-10-14; supersedes Phase 18 D-13): Pricing › Distance rules
// "Price stays valid for [24] hours" edits the draft's rate_versions.quote_lock_minutes, and Publish keeps
// it on the live book and on the new settings_versions row (1440 = 24 hours when the draft has none).
//
// The real rate-book PUT and Publish route handlers on a real local database, through the real Worker
// client (asStaff: login `vamos_edge`, role vamos_staff, `fetch_types: false`, prepared statements). Only
// the admin session check, the unpaid-booking mail, the class-photo sweep and the extras prune are
// replaced (same pattern as publish-label.local.test.ts).
//
// Skipped unless VAMOS_LOCAL_DB_PORT names a DISPOSABLE local stack (the test lab, seeded with
// seed-live-like.sql); refuses without the throwaway marker role. Committed rows: one staff user and two
// published price books (a live or retired book can never be removed; the lab is destroyed after the job;
// the last one published here holds the 24-hour default). A draft this test made and did not publish is
// deleted in afterAll. Synthetic values only; no amount is written.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { workerSql } from "../../../../packages/db/test/support/worker-client";
import type { VamosClaims } from "../db/identity";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"];
const MARKER_ROLE = "vamos_throwaway_test_stack";

const ctx = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: ctx.env }) }));

const tag = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
const adminId = `${tag}-0000-4000-a000-0000000000d7`;
const STAFF = { sub: adminId, role: "authenticated", aal: "aal2", app_metadata: { vamos_role: "admin" } } as VamosClaims;

vi.mock("@/lib/ops/staff-json", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ops/staff-json")>();
  return {
    ...actual,
    withAdmin: (handler: (claims: unknown, request: Request) => Promise<Response> | Response) => (request: Request) =>
      handler(STAFF, request),
  };
});
vi.mock("@/lib/checkout/lock-mail", () => ({ notifyPriceChangedForUnpaid: async () => undefined }));
vi.mock("@/lib/ops/class-photo-sweep", () => ({ removeUnusedClassPhotos: async () => undefined }));
vi.mock("@/lib/ops/rate-book", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ops/rate-book")>();
  return { ...actual, pruneExtraLabels: async () => undefined };
});

type Answer = { ok: boolean; code?: string; data?: Record<string, unknown> };

describe.skipIf(!PORT)("price-valid hours: lock save path and Publish keeping the draft's minutes (local lab)", () => {
  let su!: ReturnType<typeof workerSql>;
  const env = () => ctx.env as unknown as CloudflareEnv;
  const before = new Set<string>();
  const made: number[] = [];

  async function put(body: Record<string, unknown>): Promise<{ status: number; json: Answer }> {
    const { PUT } = await import("@/app/[locale]/(ops)/api/staff/rate-book/route");
    const res = await PUT(
      new Request("https://dashboard.localhost/api/staff/rate-book", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
    return { status: res.status, json: (await res.json()) as Answer };
  }

  async function publish(id: number): Promise<Answer> {
    const { POST } = await import("@/app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route");
    const res = await POST(new Request("https://dashboard.localhost/api/staff/rate-versions/x/publish", { method: "POST" }), {
      params: Promise.resolve({ id: String(id) }),
    });
    return (await res.json()) as Answer;
  }

  async function lockOf(id: number | string): Promise<number | null> {
    const rows = await su<{ m: number | null }[]>`select quote_lock_minutes as m from public.rate_versions where id = ${id}`;
    return rows[0]?.m ?? null;
  }

  async function settingsLockOf(id: number): Promise<number | null> {
    const rows = await su<{ m: number | null }[]>`
      select quote_lock_minutes as m from public.settings_versions where slug = ${`fare-publish-${id}`}`;
    return rows[0]?.m ?? null;
  }

  async function freshDraft(): Promise<{ draftId: number; liveId: string }> {
    const live = (await su<{ id: string; label: string }[]>`
      select id::text as id, label from public.rate_versions where status = 'live'`)[0]!;
    const { forkLiveRateVersion } = await import("@/lib/ops/rate-book");
    const draftId = await forkLiveRateVersion(env(), STAFF, { id: Number(live.id), label: live.label });
    if (!before.has(String(draftId))) made.push(draftId);
    return { draftId, liveId: live.id };
  }

  beforeAll(async () => {
    su = workerSql(`postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`);
    const marker = await su`select 1 from pg_roles where rolname = ${MARKER_ROLE}`;
    if (marker.length === 0) throw new Error(`refusing: ${MARKER_ROLE} missing, not a throwaway test stack`);
    ctx.env = {
      HYPERDRIVE_NOCACHE: { connectionString: `postgres://vamos_edge:vamos_edge@127.0.0.1:${PORT}/postgres` },
    };
    for (const row of await su<{ id: string }[]>`select id::text as id from public.rate_versions where status = 'draft'`) {
      before.add(row.id);
    }
    await su`insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
             values (${adminId}, ${`ql-admin-${tag}@example.test`}, 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now())`;
    await su`insert into public.staff (user_id, role, active, accepted_at, full_name) values (${adminId}, 'admin', true, now(), 'QL Admin')`;
    // Publish refuses an incomplete book: the lab's classes carry no photo.
    await su`update public.vehicle_classes set photo_path = 'lab/stand-in.jpg' where nullif(btrim(photo_path), '') is null`;
  });

  afterAll(async () => {
    if (su) {
      // Drafts this test made and did not publish (a failed run). Live and retired books stay (frozen).
      for (const id of made) {
        const still = await su`select 1 from public.rate_versions where id = ${id} and status = 'draft'`;
        if (still.length === 0) continue;
        await su`delete from public.coupons where rate_version_id = ${id}`;
        await su`delete from public.surcharges where rate_version_id = ${id}`;
        await su`delete from public.fixed_routes where rate_version_id = ${id}`;
        await su`delete from public.distance_rates where rate_version_id = ${id}`;
        await su`delete from public.rate_versions where id = ${id} and status = 'draft'`;
      }
    }
    await su?.end({ timeout: 5 });
  });

  it("saves, refuses, publishes 2880, then publishes the 1440 default", { timeout: 120_000 }, async () => {
    // (a) whole hours land on the draft as minutes; the answer carries the hours; the live book stays.
    const { draftId, liveId } = await freshDraft();
    const liveBefore = await lockOf(liveId);
    const saved = await put({ kind: "rule", ruleKind: "quote_lock", quoteLockHours: 48, versionId: draftId });
    expect(saved.status).toBe(200);
    expect(saved.json.ok).toBe(true);
    expect(saved.json.data?.quoteLockHours).toBe("48");
    expect(await lockOf(draftId)).toBe(2880);
    expect(await lockOf(liveId)).toBe(liveBefore);

    // (b) a value that is not whole hours ≥ 1 is refused and changes nothing.
    for (const hours of [0, -1, "x", 1.5]) {
      const bad = await put({ kind: "rule", ruleKind: "quote_lock", quoteLockHours: hours, versionId: draftId });
      expect(bad.status, String(hours)).toBe(400);
      expect(bad.json.code).toBe("invalid");
      expect(await lockOf(draftId)).toBe(2880);
    }

    // (c) any other rule kind is refused (the Rules list is gone).
    const waiting = await put({ kind: "rule", ruleKind: "waiting", quoteLockHours: 72, versionId: draftId });
    expect(waiting.status).toBe(400);
    expect(await lockOf(draftId)).toBe(2880);

    // (f) another kind carrying quoteLockHours no longer writes the minutes (the old generic pre-block
    // ran before every kind's branch; a route PUT without Mapbox ends 400 after that point, writing nothing).
    const other = await put({ kind: "route", quoteLockHours: 99, versionId: draftId });
    expect(other.status).toBe(400);
    expect(await lockOf(draftId)).toBe(2880);

    // (d) Publish keeps the draft's minutes on the live book and on the new settings_versions row.
    expect(await publish(draftId)).toMatchObject({ ok: true, data: { id: draftId, status: "live" } });
    expect(await lockOf(draftId)).toBe(2880);
    expect(await settingsLockOf(draftId)).toBe(2880);
    const newest = await su<{ m: number }[]>`
      select quote_lock_minutes as m from public.settings_versions
       order by effective_from desc, id desc limit 1`;
    expect(newest[0]?.m).toBe(2880);

    // (e) a draft with no minutes publishes the 24-hour default on both.
    const second = await freshDraft();
    expect(await lockOf(second.draftId)).toBe(2880); // the fork copies the live book's minutes
    await su`update public.rate_versions set quote_lock_minutes = null where id = ${second.draftId} and status = 'draft'`;
    expect(await lockOf(second.draftId)).toBeNull();
    expect(await publish(second.draftId)).toMatchObject({ ok: true, data: { id: second.draftId, status: "live" } });
    expect(await lockOf(second.draftId)).toBe(1440);
    expect(await settingsLockOf(second.draftId)).toBe(1440);
  });
});

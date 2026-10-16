// apps/web/lib/ops/publish-quote-lock.local.test.ts
//
// Decision 2026-10-13 item 13 (signed 2026-10-14; supersedes Phase 18 D-13): Pricing › Distance rules
// "Price stays valid for [24] hours" edits the draft's rate_versions.quote_lock_minutes, and Publish keeps
// it on the live book and on the new settings_versions row (1440 = 24 hours when the draft has none).
// Decision 2026-10-13 item 17 (D1, quick 261015-6om): Publish also mirrors those minutes into the new row's
// checkout_window_minutes (the payment window), and a snapshot baked before Publish keeps both deadlines;
// create_quote_snapshot on the old settings row still gives the old window.
// Quick 261015-6om Task 3 (b), signed by the owner 2026-10-15: the field takes 1 to 24 hours, so the PUT
// refuses 25 and the test publishes 12 hours (720 minutes), a window that differs from the lab's 1440.
//
// The real rate-book PUT and Publish route handlers on a real local database, through the real Worker
// client (asStaff: login `vamos_edge`, role vamos_staff, `fetch_types: false`, prepared statements). Only
// the admin session check, the unpaid-booking mail, the class-photo sweep and the extras prune are
// replaced (same pattern as publish-label.local.test.ts).
//
// Skipped unless VAMOS_LOCAL_DB_PORT names a DISPOSABLE local stack (the test lab, seeded with
// seed-live-like.sql); refuses without the throwaway marker role. Committed rows: one staff user and two
// published price books (a live or retired book can never be removed; the lab is destroyed after the job;
// the last one published here holds the 24-hour default) and unpriced price_snapshots rows tagged
// `quote-engine@hold-<tag>-…` (append-only; the lab is disposable). A draft this test made and did not
// publish is deleted in afterAll. Synthetic values only; no amount is written.
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

  async function settingsWindowOf(id: number): Promise<number | null> {
    const rows = await su<{ m: number | null }[]>`
      select checkout_window_minutes as m from public.settings_versions where slug = ${`fare-publish-${id}`}`;
    return rows[0]?.m ?? null;
  }

  /** Item 17: one unpriced snapshot through the real write door (owner; G10 left no grantee). Returns its id. */
  async function snapshot(settingsId: string, label: string): Promise<string> {
    const rows = await su<{ id: string }[]>`
      select public.create_quote_snapshot(
        p_quote_id => gen_random_uuid(),
        p_vehicle_class_id => (select id from public.vehicle_classes order by id limit 1),
        p_rate_version_id => (select id from public.rate_versions where status = 'live' order by id desc limit 1),
        p_settings_version_id => ${settingsId}::int8,
        p_engine_version => ${`quote-engine@hold-${tag}-${label}`}::text,
        p_lock_exp => now() + interval '45 minutes',
        p_pax => 1::smallint,
        p_bags => 0::smallint,
        p_lines => '[]'::jsonb,
        p_policy => jsonb_build_object(
          'cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24, 'airport_waiting_minutes', 60,
          'city_waiting_minutes', 15, 'settings_version_id', ${settingsId}::int8,
          'modification_deadline_hours', 24, 'min_advance_minutes', 180, 'policy_doc', 'hold'),
        p_shown_alternatives => '[]'::jsonb,
        p_legs => jsonb_build_array(jsonb_build_object(
          'leg_seq', 1, 'distance_km', null, 'duration_min', null, 'leg_subtotal_rappen', null, 'booking_leg_id', null))
      )::text as id`;
    return rows[0]!.id;
  }

  async function clocksOf(snapshotId: string): Promise<{ e: string; l: string }> {
    const rows = await su<{ e: string; l: string }[]>`
      select expires_at::text as e, quote_lock_expires_at::text as l
        from public.price_snapshots where id = ${snapshotId}::int8`;
    return rows[0]!;
  }

  /** expires_at within ±1 minute of now() + minutes, compared in SQL (no JS clock). */
  async function windowIs(snapshotId: string, minutes: number): Promise<boolean> {
    const rows = await su<{ ok: boolean }[]>`
      select expires_at between now() + make_interval(mins => ${minutes}::int - 1)
                            and now() + make_interval(mins => ${minutes}::int + 1) as ok
        from public.price_snapshots where id = ${snapshotId}::int8`;
    return rows[0]?.ok === true;
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

  it("saves, refuses, publishes 720, then publishes the 1440 default", { timeout: 120_000 }, async () => {
    // (a) whole hours land on the draft as minutes; the answer carries the hours; the live book stays.
    const { draftId, liveId } = await freshDraft();
    const liveBefore = await lockOf(liveId);
    const saved = await put({ kind: "rule", ruleKind: "quote_lock", quoteLockHours: 12, versionId: draftId });
    expect(saved.status).toBe(200);
    expect(saved.json.ok).toBe(true);
    expect(saved.json.data?.quoteLockHours).toBe("12");
    expect(await lockOf(draftId)).toBe(720);
    expect(await lockOf(liveId)).toBe(liveBefore);

    // (b) a value that is not whole hours from 1 to 24 is refused and changes nothing.
    for (const hours of [0, -1, "x", 1.5, 25, "48"]) {
      const bad = await put({ kind: "rule", ruleKind: "quote_lock", quoteLockHours: hours, versionId: draftId });
      expect(bad.status, String(hours)).toBe(400);
      expect(bad.json.code).toBe("invalid");
      expect(await lockOf(draftId)).toBe(720);
    }

    // (c) any other rule kind is refused (the Rules list is gone).
    const waiting = await put({ kind: "rule", ruleKind: "waiting", quoteLockHours: 72, versionId: draftId });
    expect(waiting.status).toBe(400);
    expect(await lockOf(draftId)).toBe(720);

    // (f) another kind carrying quoteLockHours no longer writes the minutes (the old generic pre-block
    // ran before every kind's branch; a route PUT without Mapbox ends 400 after that point, writing nothing).
    const other = await put({ kind: "route", quoteLockHours: 99, versionId: draftId });
    expect(other.status).toBe(400);
    expect(await lockOf(draftId)).toBe(720);

    // (d0) item 17: the current settings row and a snapshot baked on it, before Publish.
    const oldRow = (await su<{ id: string; w: number | null }[]>`
      select id::text as id, checkout_window_minutes as w from public.settings_versions
       where effective_from <= now() order by effective_from desc, id desc limit 1`)[0]!;
    const oldSv = oldRow.id;
    const oldWindow = oldRow.w;
    expect(oldWindow).not.toBeNull();
    expect(oldWindow).not.toBe(720); // 1440 on the lab seed: the two windows must differ to prove anything
    const pre = await snapshot(oldSv, "pre");
    const preClocks = await clocksOf(pre);

    // (d) Publish keeps the draft's minutes on the live book and on the new settings_versions row, and
    // (item 17) mirrors them into checkout_window_minutes.
    expect(await publish(draftId)).toMatchObject({ ok: true, data: { id: draftId, status: "live" } });
    expect(await lockOf(draftId)).toBe(720);
    expect(await settingsLockOf(draftId)).toBe(720);
    expect(await settingsWindowOf(draftId)).toBe(720);
    const newest = await su<{ m: number; w: number }[]>`
      select quote_lock_minutes as m, checkout_window_minutes as w from public.settings_versions
       order by effective_from desc, id desc limit 1`;
    expect(newest[0]?.m).toBe(720);
    expect(newest[0]?.w).toBe(720);

    // (d1) nothing already quoted moves: the earlier snapshot's two deadlines are exactly as before.
    expect(await clocksOf(pre)).toEqual(preClocks);

    // (d2) the clocks read the quote's own settings row: the old id still gives the old window, the new
    // fare-publish row gives 720 minutes.
    const newSv = (await su<{ id: string }[]>`
      select id::text as id from public.settings_versions where slug = ${`fare-publish-${draftId}`}`)[0]!.id;
    expect(await windowIs(await snapshot(oldSv, "old"), oldWindow!)).toBe(true);
    expect(await windowIs(await snapshot(newSv, "new"), 720)).toBe(true);

    // (e) a draft with no minutes publishes the 24-hour default on both.
    const second = await freshDraft();
    expect(await lockOf(second.draftId)).toBe(720); // the fork copies the live book's minutes
    await su`update public.rate_versions set quote_lock_minutes = null where id = ${second.draftId} and status = 'draft'`;
    expect(await lockOf(second.draftId)).toBeNull();
    expect(await publish(second.draftId)).toMatchObject({ ok: true, data: { id: second.draftId, status: "live" } });
    expect(await lockOf(second.draftId)).toBe(1440);
    expect(await settingsLockOf(second.draftId)).toBe(1440);
    expect(await settingsWindowOf(second.draftId)).toBe(1440);

    // (g) PR #85 review, Low 1: a draft above the 24-hour cap (written past the PUT, by hand) is refused
    // by Publish with lock-over-cap, and nothing moves: the draft stays a draft, the live book and the
    // settings rows are as before.
    const third = await freshDraft();
    await su`update public.rate_versions set quote_lock_minutes = 1441 where id = ${third.draftId} and status = 'draft'`;
    const settingsBefore = (await su<{ n: string }[]>`select count(*)::text as n from public.settings_versions`)[0]!.n;
    expect(await publish(third.draftId)).toMatchObject({ ok: false, code: "lock-over-cap" });
    expect((await su<{ s: string }[]>`select status::text as s from public.rate_versions where id = ${third.draftId}`)[0]?.s).toBe("draft");
    expect((await su<{ s: string }[]>`select status::text as s from public.rate_versions where id = ${second.draftId}`)[0]?.s).toBe("live");
    expect((await su<{ n: string }[]>`select count(*)::text as n from public.settings_versions`)[0]!.n).toBe(settingsBefore);
    expect(await settingsLockOf(third.draftId)).toBeNull();
  });
});

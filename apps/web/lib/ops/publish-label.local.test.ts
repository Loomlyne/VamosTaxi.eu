// apps/web/lib/ops/publish-label.local.test.ts
//
// 261005 review follow-up (M18): the real Publish route handler on a real local database, through the real
// Worker client (asStaff: login `vamos_edge`, role vamos_staff, `fetch_types: false`, prepared statements).
// Only the admin session check, the unpaid-booking mail, the class-photo sweep and the extras prune are
// replaced.
//
// Publish flips rate_versions.status to live but used to keep the draft's label, so the live book (what
// the dashboard shows) read "... draft" although the settings_versions row it writes already had the label
// without it. The same UPDATE now sets the label. A draft whose label is only "draft" keeps it.
//
// Skipped unless VAMOS_LOCAL_DB_PORT names a DISPOSABLE local stack (the test lab, seeded with
// seed-live-like.sql). Committed rows: one staff user and one published price book (this test leaves a new
// live book; the lab is destroyed after the job). Existing rows are never rewritten by the app.
// Test-only raw client to read and seed the disposable stack as the superuser; named in
// scripts/db-access-fence-allowlist.json. Never bundled.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "../db/identity";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"];
const MARKER_ROLE = "vamos_throwaway_test_stack";

const ctx = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: ctx.env }) }));

const tag = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
const adminId = `${tag}-0000-4000-a000-0000000000b6`;
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

type Row = { label: string; status: string };

describe.skipIf(!PORT)("Publish writes the label without ' draft' on the live book (local lab, committed rows)", () => {
  let su: postgres.Sql;
  const env = () => ctx.env as unknown as CloudflareEnv;

  beforeAll(async () => {
    su = postgres(`postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`, { max: 1, onnotice: () => undefined });
    const marker = await su`select 1 from pg_roles where rolname = ${MARKER_ROLE}`;
    if (marker.length === 0) throw new Error(`refusing: ${MARKER_ROLE} missing, not a throwaway test stack`);
    ctx.env = {
      HYPERDRIVE_NOCACHE: { connectionString: `postgres://vamos_edge:vamos_edge@127.0.0.1:${PORT}/postgres` },
    };
    await su`insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
             values (${adminId}, ${`pl-admin-${tag}@example.test`}, 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now())`;
    await su`insert into public.staff (user_id, role, active, accepted_at, full_name) values (${adminId}, 'admin', true, now(), 'PL Admin')`;
    // Publish refuses an incomplete book: the lab's classes carry no photo.
    await su`update public.vehicle_classes set photo_path = 'lab/stand-in.jpg' where nullif(btrim(photo_path), '') is null`;
  });
  afterAll(async () => {
    await su?.end({ timeout: 5 });
  });

  it("a draft labelled '... draft draft draft' is published as '...': rate_versions and settings_versions agree", { timeout: 60_000 }, async () => {
    const live = (await su<{ id: string; label: string }[]>`select id::text as id, label from public.rate_versions where status = 'live'`)[0]!;
    // A fixed base, so a re-run on the same lab (whose live book an earlier run published) is the same test.
    const base = `Publish label ${tag}`;

    const { forkLiveRateVersion } = await import("@/lib/ops/rate-book");
    const draftId = await forkLiveRateVersion(env(), STAFF, { id: Number(live.id), label: live.label });
    // The stacked label live rows carry today (a clone of a clone ...).
    await su`update public.rate_versions set label = ${`${base} draft draft draft`} where id = ${draftId}`;

    const { POST } = await import("@/app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route");
    const res = await POST(new Request("https://dashboard.localhost/api/staff/rate-versions/x/publish", { method: "POST" }), {
      params: Promise.resolve({ id: String(draftId) }),
    });
    expect(await res.json()).toMatchObject({ ok: true, data: { id: draftId, status: "live" } });

    const published = (await su<Row[]>`select label, status::text as status from public.rate_versions where id = ${draftId}`)[0]!;
    expect(published).toEqual({ label: base, status: "live" });
    const settings = (await su<{ label: string }[]>`
      select label from public.settings_versions where slug = ${`fare-publish-${draftId}`}`)[0]!;
    expect(settings.label).toBe(base);
    // The previous book is retired with its own label untouched (nothing existing is rewritten).
    const old = (await su<Row[]>`select label, status::text as status from public.rate_versions where id = ${live.id}`)[0]!;
    expect(old).toEqual({ label: live.label, status: "retired" });
  });

  it("a draft labelled only 'draft' keeps that label (an empty label is never written)", { timeout: 60_000 }, async () => {
    const live = (await su<{ id: string; label: string }[]>`select id::text as id, label from public.rate_versions where status = 'live'`)[0]!;
    const { forkLiveRateVersion } = await import("@/lib/ops/rate-book");
    const draftId = await forkLiveRateVersion(env(), STAFF, { id: Number(live.id), label: live.label });
    await su`update public.rate_versions set label = 'draft' where id = ${draftId}`;

    const { POST } = await import("@/app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route");
    const res = await POST(new Request("https://dashboard.localhost/api/staff/rate-versions/x/publish", { method: "POST" }), {
      params: Promise.resolve({ id: String(draftId) }),
    });
    expect(await res.json()).toMatchObject({ ok: true });
    const published = (await su<Row[]>`select label, status::text as status from public.rate_versions where id = ${draftId}`)[0]!;
    expect(published).toEqual({ label: "draft", status: "live" });
  });
});

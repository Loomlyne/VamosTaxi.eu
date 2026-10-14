// apps/web/lib/ops/rate-book-clone-retired.local.test.ts
//
// Phase 30 CLS-06 / review R7: `forkLiveRateVersion` on a real local database, through the real Worker
// client (asStaff: login `vamos_edge`, role vamos_staff, `fetch_types: false`). A new price book copied
// from a source book carries no distance rate or fixed route of a retired class, and carries those of a
// Live class. Km bands, region % and the Rules list were removed (decision 2026-10-13 items 10, 13), so
// this test no longer needs a temporary staff policy on their tables.
//
// Skipped unless VAMOS_LOCAL_DB_PORT names a DISPOSABLE local stack (the test lab). The source book is a
// private draft book created by this test (its own random tag), so the lab's live book is untouched.
// Synthetic integer rappen only.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { workerSql } from "../../../../packages/db/test/support/worker-client";
import type { VamosClaims } from "../db/identity";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"];
const MARKER_ROLE = "vamos_throwaway_test_stack";

const ctx = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: ctx.env }) }));

const tag = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
const adminId = `${tag}-0000-4000-a000-0000000000c1`;
const STAFF = { sub: adminId, role: "authenticated", aal: "aal2", app_metadata: { vamos_role: "admin" } } as VamosClaims;

describe.skipIf(!PORT)("new price book skips a retired class (local lab)", () => {
  let su!: ReturnType<typeof workerSql>;
  const env = () => ctx.env as unknown as CloudflareEnv;

  beforeAll(async () => {
    su = workerSql(`postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`);
    const marker = await su`select 1 from pg_roles where rolname = ${MARKER_ROLE}`;
    if (marker.length === 0) throw new Error(`refusing: ${MARKER_ROLE} missing, not a throwaway test stack`);
    ctx.env = {
      HYPERDRIVE_NOCACHE: { connectionString: `postgres://vamos_edge:vamos_edge@127.0.0.1:${PORT}/postgres` },
    };
    await su`insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
             values (${adminId}, ${`cl-admin-${tag}@example.test`}, 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now())`;
    await su`insert into public.staff (user_id, role, active, accepted_at, full_name) values (${adminId}, 'admin', true, now(), 'CL Admin')`;
  });
  afterAll(async () => {
    await su?.end({ timeout: 5 });
  });

  it("copies the Live class's rate and route; the Retired class has neither", { timeout: 60_000 }, async () => {
    const live = (await su<{ id: string }[]>`
      insert into public.vehicle_classes (slug, name, passenger_capacity, luggage_capacity, active)
      values (${`cl-live-${tag}`}, 'Clone live', 3, 3, true) returning id::text as id`)[0]!.id;
    const gone = (await su<{ id: string }[]>`
      insert into public.vehicle_classes (slug, name, passenger_capacity, luggage_capacity, active, hidden_at)
      values (${`cl-gone-${tag}`}, 'Clone retired', 3, 3, false, now()) returning id::text as id`)[0]!.id;
    const zoneA = (await su<{ id: string }[]>`
      insert into public.service_zones (slug) values (${`cl-a-${tag}`}) returning id::text as id`)[0]!.id;
    const zoneB = (await su<{ id: string }[]>`
      insert into public.service_zones (slug) values (${`cl-b-${tag}`}) returning id::text as id`)[0]!.id;

    const src = (await su<{ id: string }[]>`
      insert into public.rate_versions (slug, label, status)
      values (${`cl-src-${tag}`}, ${`Clone source ${tag}`}, 'draft') returning id::text as id`)[0]!.id;
    for (const cls of [live, gone]) {
      await su`insert into public.distance_rates (rate_version_id, vehicle_class_id, base_fare_rappen, per_km_rappen, min_fare_rappen, max_pax, available)
               values (${src}, ${cls}, 100, 10, 100, 3, true)`;
      await su`insert into public.fixed_routes (rate_version_id, origin_zone_id, dest_zone_id, vehicle_class_id, price_rappen, live)
               values (${src}, ${zoneA}, ${zoneB}, ${cls}, 100, true)`;
    }

    const { forkLiveRateVersion } = await import("@/lib/ops/rate-book");
    const draftId = await forkLiveRateVersion(env(), STAFF, { id: Number(src), label: `Clone source ${tag}` });

    const rates = await su<{ cls: string }[]>`select vehicle_class_id::text as cls from public.distance_rates where rate_version_id = ${draftId}`;
    expect(rates.map((r) => r.cls)).toEqual([live]);

    const routes = await su<{ cls: string }[]>`select vehicle_class_id::text as cls from public.fixed_routes where rate_version_id = ${draftId}`;
    expect(routes.map((r) => r.cls)).toEqual([live]);
  });
});

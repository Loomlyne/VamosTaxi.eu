// apps/web/lib/ops/rate-book-clone-retired.local.test.ts
//
// Phase 30 CLS-06 / review R7: `forkLiveRateVersion` on a real local database, through the real Worker
// client (asStaff: login `vamos_edge`, role vamos_staff, `fetch_types: false`). A new price book copied
// from a source book carries no distance rate, distance band or city_pair rule of a retired class, and
// still carries every distance band that has no class at all.
//
// Skipped unless VAMOS_LOCAL_DB_PORT names a DISPOSABLE local stack (the test lab). The source book is a
// private draft book created by this test (its own random tag), so the lab's live book is untouched.
// Synthetic integer rappen only.
//
// Finding while writing this (deferred-items.md): on a database built from the migration files,
// distance_bands and rate_version_rules carry only RESTRICTIVE policies for vamos_staff (no permissive
// one, unlike distance_rates), so a staff session reads and copies none of their rows. To test the
// clone's SQL itself, this test adds a permissive policy on those two tables for its own duration and
// drops it afterwards (disposable lab only).
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

describe.skipIf(!PORT)("new price book skips a retired class and keeps class-less bands (local lab)", () => {
  let su!: ReturnType<typeof workerSql>;
  const env = () => ctx.env as unknown as CloudflareEnv;

  beforeAll(async () => {
    su = workerSql(`postgres://postgres:postgres@127.0.0.1:${PORT}/postgres`);
    const marker = await su`select 1 from pg_roles where rolname = ${MARKER_ROLE}`;
    if (marker.length === 0) throw new Error(`refusing: ${MARKER_ROLE} missing, not a throwaway test stack`);
    ctx.env = {
      HYPERDRIVE_NOCACHE: { connectionString: `postgres://vamos_edge:vamos_edge@127.0.0.1:${PORT}/postgres` },
    };
    await su`drop policy if exists p30_clone_test_all on public.distance_bands`;
    await su`drop policy if exists p30_clone_test_all on public.rate_version_rules`;
    await su`create policy p30_clone_test_all on public.distance_bands as permissive for all to vamos_staff using (true) with check (true)`;
    await su`create policy p30_clone_test_all on public.rate_version_rules as permissive for all to vamos_staff using (true) with check (true)`;
    await su`insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
             values (${adminId}, ${`cl-admin-${tag}@example.test`}, 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now())`;
    await su`insert into public.staff (user_id, role, active, accepted_at, full_name) values (${adminId}, 'admin', true, now(), 'CL Admin')`;
  });
  afterAll(async () => {
    if (su) {
      await su`drop policy if exists p30_clone_test_all on public.distance_bands`;
      await su`drop policy if exists p30_clone_test_all on public.rate_version_rules`;
    }
    await su?.end({ timeout: 5 });
  });

  it("copies the Live class and the class-less band; the Retired class has no rate, band or city_pair rule", { timeout: 60_000 }, async () => {
    const live = (await su<{ id: string }[]>`
      insert into public.vehicle_classes (slug, name, passenger_capacity, luggage_capacity, active)
      values (${`cl-live-${tag}`}, 'Clone live', 3, 3, true) returning id::text as id`)[0]!.id;
    const gone = (await su<{ id: string }[]>`
      insert into public.vehicle_classes (slug, name, passenger_capacity, luggage_capacity, active, hidden_at)
      values (${`cl-gone-${tag}`}, 'Clone retired', 3, 3, false, now()) returning id::text as id`)[0]!.id;

    const src = (await su<{ id: string }[]>`
      insert into public.rate_versions (slug, label, status)
      values (${`cl-src-${tag}`}, ${`Clone source ${tag}`}, 'draft') returning id::text as id`)[0]!.id;
    for (const cls of [live, gone]) {
      await su`insert into public.distance_rates (rate_version_id, vehicle_class_id, base_fare_rappen, per_km_rappen, min_fare_rappen, max_pax, available)
               values (${src}, ${cls}, 100, 10, 100, 3, true)`;
      await su`insert into public.distance_bands (rate_version_id, vehicle_class_id, from_km, to_km, per_km_rappen)
               values (${src}, ${cls}, 0, 50, 10)`;
      await su`insert into public.rate_version_rules (rate_version_id, kind, payload)
               values (${src}, 'city_pair', ${su.json({ vehicleClassId: cls, pairId: `cl-${tag}` })})`;
    }
    await su`insert into public.distance_bands (rate_version_id, vehicle_class_id, from_km, to_km, per_km_rappen)
             values (${src}, null, 50, 200, 7)`;

    const { forkLiveRateVersion } = await import("@/lib/ops/rate-book");
    const draftId = await forkLiveRateVersion(env(), STAFF, { id: Number(src), label: `Clone source ${tag}` });

    const rates = await su<{ cls: string }[]>`select vehicle_class_id::text as cls from public.distance_rates where rate_version_id = ${draftId}`;
    expect(rates.map((r) => r.cls)).toEqual([live]);

    const bands = await su<{ cls: string | null; from_km: number; to_km: number; per_km_rappen: number }[]>`
      select vehicle_class_id::text as cls, from_km, to_km, per_km_rappen from public.distance_bands
       where rate_version_id = ${draftId} order by from_km, cls nulls last`;
    expect(bands).toEqual([
      { cls: live, from_km: 0, to_km: 50, per_km_rappen: 10 },
      { cls: null, from_km: 50, to_km: 200, per_km_rappen: 7 },
    ]);

    const rules = await su<{ cls: string }[]>`
      select payload ->> 'vehicleClassId' as cls from public.rate_version_rules
       where rate_version_id = ${draftId} and kind = 'city_pair'`;
    expect(rules.map((r) => r.cls)).toEqual([live]);
  });
});

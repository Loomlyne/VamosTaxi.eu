// apps/web/lib/ops/rate-book-fork-bands-rules.local.test.ts
//
// Owner-signed pricing fix (decision 2026-10-13 item 2, finding D-30-03-1): `forkLiveRateVersion` on a real
// local database, through the real Worker client (asStaff: login `vamos_edge`, role vamos_staff,
// `fetch_types: false`). A new price book copied from a source book carries every distance band (with a
// class and without) and every rate_version_rules row, and a staff session reads them back.
//
// Before migration 20261012250000 these two tables had only RESTRICTIVE policies for vamos_staff, so a staff
// session read zero rows and the fork copied none of them. This test uses NO temporary policy: it relies on
// that migration being applied to the lab.
//
// Skipped unless VAMOS_LOCAL_DB_PORT names a DISPOSABLE local stack (the test lab). It commits rows (one
// staff user, one private draft source book, the new draft book, two classes) on that throwaway stack only,
// never on any other database. Synthetic integer rappen only.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { workerSql } from "../../../../packages/db/test/support/worker-client";
import type { VamosClaims } from "../db/identity";

const PORT = process.env["VAMOS_LOCAL_DB_PORT"];
const MARKER_ROLE = "vamos_throwaway_test_stack";

const ctx = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: ctx.env }) }));

const tag = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
const adminId = `${tag}-0000-4000-a000-0000000000c2`;
const STAFF = { sub: adminId, role: "authenticated", aal: "aal2", app_metadata: { vamos_role: "admin" } } as VamosClaims;

describe.skipIf(!PORT)("a new price book keeps every distance band and rule of its source (local lab)", () => {
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
             values (${adminId}, ${`fb-admin-${tag}@example.test`}, 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now())`;
    await su`insert into public.staff (user_id, role, active, accepted_at, full_name) values (${adminId}, 'admin', true, now(), 'FB Admin')`;
  });
  afterAll(async () => {
    await su?.end({ timeout: 5 });
  });

  it("copies every band and rule into the new draft, and a staff session reads them", { timeout: 60_000 }, async () => {
    const classes: string[] = [];
    for (const key of ["a", "b"]) {
      const row = (await su<{ id: string }[]>`
        insert into public.vehicle_classes (slug, name, passenger_capacity, luggage_capacity, active)
        values (${`fb-${key}-${tag}`}, ${`Fork ${key}`}, 3, 3, true) returning id::text as id`)[0]!;
      classes.push(row.id);
    }

    const src = (await su<{ id: string }[]>`
      insert into public.rate_versions (slug, label, status)
      values (${`fb-src-${tag}`}, ${`Fork source ${tag}`}, 'draft') returning id::text as id`)[0]!.id;
    for (const cls of classes) {
      await su`insert into public.distance_rates (rate_version_id, vehicle_class_id, base_fare_rappen, per_km_rappen, min_fare_rappen, max_pax, available)
               values (${src}, ${cls}, 100, 10, 100, 3, true)`;
      await su`insert into public.distance_bands (rate_version_id, vehicle_class_id, from_km, to_km, per_km_rappen)
               values (${src}, ${cls}, 0, 50, 10)`;
      await su`insert into public.rate_version_rules (rate_version_id, kind, payload)
               values (${src}, 'city_pair', ${su.json({ vehicleClassId: cls, pairId: `fb-${tag}` })})`;
    }
    await su`insert into public.distance_bands (rate_version_id, vehicle_class_id, from_km, to_km, per_km_rappen)
             values (${src}, null, 50, 200, 7)`;
    await su`insert into public.rate_version_rules (rate_version_id, kind, payload)
             values (${src}, 'waiting', '{}'::jsonb)`;

    const { forkLiveRateVersion, loadQuoteBookDocForVersion } = await import("@/lib/ops/rate-book");
    const { asStaff } = await import("@/lib/db/identity");
    const draftId = await forkLiveRateVersion(env(), STAFF, { id: Number(src), label: `Fork source ${tag}` });
    expect(String(draftId)).not.toBe(src);

    type Band = { cls: string | null; from_km: number; to_km: number; per_km_rappen: number };
    const bandsOf = (id: string | number) => su<Band[]>`
      select vehicle_class_id::text as cls, from_km, to_km, per_km_rappen from public.distance_bands
       where rate_version_id = ${id} order by from_km, cls nulls last`;
    const srcBands = await bandsOf(src);
    expect(srcBands).toHaveLength(3);
    expect(await bandsOf(draftId)).toEqual(srcBands);

    type Rule = { kind: string; payload: unknown };
    const rulesOf = (id: string | number) => su<Rule[]>`
      select kind, payload from public.rate_version_rules where rate_version_id = ${id} order by id`;
    const srcRules = await rulesOf(src);
    expect(srcRules).toHaveLength(3);
    expect(await rulesOf(draftId)).toEqual(srcRules);

    // The bug itself: a staff session must read the copied rows (it read zero before the migration).
    const doc = (await loadQuoteBookDocForVersion(env(), STAFF, Number(draftId))) as { distance_bands: unknown[] };
    expect(doc.distance_bands).toHaveLength(3);
    const seen = await asStaff(env(), STAFF, (tx) =>
      tx<{ n: number }[]>`select count(*)::int as n from public.rate_version_rules where rate_version_id = ${draftId}`,
    );
    expect(seen[0]!.n).toBe(3);
  });
});

// apps/web/lib/ops/pricing.ts
//
// Rate-version list + completeness reader for the ops Pricing screen.
// Amounts are `number | null` and are never coerced to a zero — a NULL column
// is the signal that renders the Law 04 placeholder, not a stated price.

import { asStaff, type VamosClaims } from "../db/identity";

export type RateVersionStatus = "draft" | "live" | "retired";

export type RateVersionRow = {
  id: number;
  slug: string;
  label: string;
  status: RateVersionStatus;
  note: string | null;
  created_at: Date | string;
  created_by: string | null;
  published_at: Date | string | null;
  published_by: string | null;
};

export type CompletenessKind = "distance_rate" | "surcharge" | "fixed_route";

export type CompletenessGap = {
  kind: CompletenessKind;
  name: string;
};

type VersionQueryRow = {
  id: number | string;
  slug: string;
  label: string;
  status: RateVersionStatus;
  note: string | null;
  created_at: Date | string;
  created_by: string | null;
  published_at: Date | string | null;
  published_by: string | null;
};

function asVersionId(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

export async function loadRateVersions(
  env: CloudflareEnv,
  claims: VamosClaims,
): Promise<RateVersionRow[]> {
  const rows = await asStaff(env, claims, async (tx) => {
    return tx<VersionQueryRow[]>`
      select id, slug, label, status, note, created_at, created_by, published_at, published_by
        from public.rate_versions
       order by created_at desc
    `;
  });
  return rows.map((row) => ({
    ...row,
    id: asVersionId(row.id),
  }));
}

/**
 * Mirrors `tg_rate_version_transition` in
 * `packages/db/supabase/migrations/20260823000008_rate_versions.sql`.
 * Changing one without the other is the known failure mode: the checklist
 * would disagree with the publish gate.
 */
export async function loadCompleteness(
  env: CloudflareEnv,
  claims: VamosClaims,
  versionId: number,
): Promise<CompletenessGap[]> {
  return asStaff(env, claims, async (tx) => {
    const distance = await tx<{ name: string }[]>`
      select vc.slug as name
        from public.distance_rates r
        join public.vehicle_classes vc on vc.id = r.vehicle_class_id
       where r.rate_version_id = ${versionId} and r.available
         and (r.base_fare_rappen is null or r.per_km_rappen is null or r.min_fare_rappen is null)
    `;
    const surcharges = await tx<{ name: string }[]>`
      select s.code as name
        from public.surcharges s
       where s.rate_version_id = ${versionId} and s.active and s.kind <> 'included'
         and coalesce(s.amount_rappen, (s.percent * 100)::integer) is null
    `;
    const routes = await tx<{ name: string }[]>`
      select oz.slug || '→' || dz.slug || ':' || vc.slug as name
        from public.fixed_routes f
        join public.service_zones oz on oz.id = f.origin_zone_id
        join public.service_zones dz on dz.id = f.dest_zone_id
        join public.vehicle_classes vc on vc.id = f.vehicle_class_id
       where f.rate_version_id = ${versionId} and f.live and f.price_rappen is null
    `;
    return [
      ...distance.map((row) => ({ kind: "distance_rate" as const, name: row.name })),
      ...surcharges.map((row) => ({ kind: "surcharge" as const, name: row.name })),
      ...routes.map((row) => ({ kind: "fixed_route" as const, name: row.name })),
    ];
  });
}

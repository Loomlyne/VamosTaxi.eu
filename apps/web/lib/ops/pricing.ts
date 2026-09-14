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

export type CompletenessKind =
  | "distance_rate"
  | "surcharge"
  | "fixed_route"
  | "coupon"
  | "rule"
  | "band"
  | "band_overlap";

export type CompletenessGap = {
  kind: CompletenessKind;
  name: string;
  id?: string;
  missing?: string[];
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

function asGapId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

function asMissing(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.length > 0);
  }
  if (typeof value === "string") {
    return value
      .replace(/[{}]/g, "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
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
 * `packages/db/supabase/migrations/20260913180000_ops_pricing_source.sql`
 * (D-08; replaces the min_fare check from 20260823000008_rate_versions.sql).
 * Changing one without the other is the known failure mode: the checklist
 * would disagree with the publish gate.
 *
 * Extra TS-only gaps (coupon / rule / band) catch empty admin-added rows the
 * trigger does not yet name. Zero rows in those tables is not a gap.
 */
export async function loadCompleteness(
  env: CloudflareEnv,
  claims: VamosClaims,
  versionId: number,
): Promise<CompletenessGap[]> {
  return asStaff(env, claims, async (tx) => {
    const distance = await tx<
      { id: number | string; name: string; missing: unknown }[]
    >`
      select r.id,
             coalesce(nullif(btrim(vc.name), ''), vc.slug) as name,
             array_remove(array[
               case when nullif(btrim(vc.name), '') is null then 'name' end,
               case when nullif(btrim(vc.photo_path), '') is null then 'photo' end,
               case when r.base_fare_rappen is null then 'start' end,
               case when r.per_km_rappen is null then 'per_km' end,
               case when r.max_pax is null then 'max_pax' end,
               case when vc.luggage_capacity is null then 'max_bags' end
             ], null) as missing
        from public.distance_rates r
        left join public.vehicle_classes vc on vc.id = r.vehicle_class_id
       where r.rate_version_id = ${versionId} and r.available
         and (
              r.base_fare_rappen is null
           or r.per_km_rappen is null
           or r.max_pax is null
           or vc.id is null
           or nullif(btrim(vc.slug), '') is null
           or nullif(btrim(vc.name), '') is null
           or nullif(btrim(vc.photo_path), '') is null
           or vc.luggage_capacity is null
         )
    `;
    const surcharges = await tx<{ name: string }[]>`
      select s.code as name
        from public.surcharges s
       where s.rate_version_id = ${versionId} and s.active
         and (
              (s.kind <> 'included' and coalesce(s.amount_rappen, (s.percent * 100)::integer) is null)
           or s.predicate = '{}'::jsonb
         )
    `;
    const routes = await tx<{ name: string }[]>`
      select oz.slug || '→' || dz.slug || ':' || vc.slug as name
        from public.fixed_routes f
        join public.service_zones oz on oz.id = f.origin_zone_id
        join public.service_zones dz on dz.id = f.dest_zone_id
        join public.vehicle_classes vc on vc.id = f.vehicle_class_id
       where f.rate_version_id = ${versionId} and f.live and f.price_rappen is null
    `;
    const coupons = await tx<{ name: string }[]>`
      select c.code as name
        from public.coupons c
       where c.rate_version_id = ${versionId} and c.active
         and (
              nullif(btrim(c.code), '') is null
           or (c.kind = 'percent' and c.percent is null)
           or (c.kind = 'amount' and c.amount_rappen is null)
         )
    `;
    const rules = await tx<{ name: string }[]>`
      select r.kind as name
        from public.rate_version_rules r
       where r.rate_version_id = ${versionId}
         and (nullif(btrim(r.kind), '') is null or r.payload = '{}'::jsonb)
    `;
    const bands = await tx<{ name: string }[]>`
      select coalesce(nullif(btrim(vc.slug), ''), 'band') as name
        from public.distance_bands b
        left join public.vehicle_classes vc on vc.id = b.vehicle_class_id
       where b.rate_version_id = ${versionId}
         and (b.vehicle_class_id is null or b.per_km_rappen is null)
    `;
    const bandOverlap = await tx<{ name: string }[]>`
      select distinct coalesce(nullif(btrim(vc.slug), ''), 'band') as name
        from public.distance_bands as overlap_left
        join public.distance_bands as overlap_right
          on overlap_left.rate_version_id = overlap_right.rate_version_id
         and overlap_left.vehicle_class_id = overlap_right.vehicle_class_id
         and overlap_left.id < overlap_right.id
        left join public.vehicle_classes vc on vc.id = overlap_left.vehicle_class_id
       where overlap_left.rate_version_id = ${versionId}
         and overlap_left.from_km < coalesce(overlap_right.to_km, 1000000000)
         and overlap_right.from_km < coalesce(overlap_left.to_km, 1000000000)
    `;
    return [
      ...distance.map((row) => ({
        kind: "distance_rate" as const,
        name: row.name,
        id: asGapId(row.id),
        missing: asMissing(row.missing),
      })),
      ...surcharges.map((row) => ({ kind: "surcharge" as const, name: row.name })),
      ...routes.map((row) => ({ kind: "fixed_route" as const, name: row.name })),
      ...coupons.map((row) => ({ kind: "coupon" as const, name: row.name })),
      ...rules.map((row) => ({ kind: "rule" as const, name: row.name })),
      ...bands.map((row) => ({ kind: "band" as const, name: row.name })),
      ...bandOverlap.map((row) => ({ kind: "band_overlap" as const, name: row.name })),
    ];
  });
}

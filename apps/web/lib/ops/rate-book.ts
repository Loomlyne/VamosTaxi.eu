// apps/web/lib/ops/rate-book.ts
//
// Reader + constraint-mirroring validators for a rate_version's three priced
// child tables and the service_zones those routes are built between.
// Mutations live in the Server Actions; this module never writes.
//
// Freeze SQLSTATE is 23001 (restrict_violation). 06-07 corrected D-13's
// 23514/P0001 against 20260823000008_rate_versions.sql — every raise on these
// paths is `using errcode = 'restrict_violation'`. Do not "fix" this back.

import type postgres from "postgres";
import { asStaff, type VamosClaims } from "../db/identity";
import { mapSqlState } from "./sqlstate";
import { loadRateVersions, type RateVersionStatus } from "./pricing";

type StaffTx = postgres.TransactionSql;

export type { RateVersionStatus };

export { SURCHARGE_CODES, type SurchargeCode } from "./surcharge-codes";
export type SurchargeKind = "amount" | "percent" | "included";
export type SurchargeAppliesTo = "leg" | "booking";

export type DistanceRateRow = {
  id: number;
  rateVersionId: number;
  vehicleClassId: string;
  vehicleClassSlug: string;
  baseFareRappen: number | null;
  perKmRappen: number | null;
  minFareRappen: number | null;
  /** Comment 11. NULL until staff set it. */
  airportStartRappen: number | null;
  /** Comment 11. One city add. NULL until staff set it. */
  cityPriceRappen: number | null;
  maxPax: number;
  available: boolean;
  hideFromPublic: boolean;
};

export type FixedRouteRow = {
  id: number;
  rateVersionId: number;
  originZoneId: string;
  destZoneId: string;
  originSlug: string;
  destSlug: string;
  originIata: string | null;
  destIata: string | null;
  vehicleClassId: string;
  vehicleClassSlug: string;
  priceRappen: number | null;
  live: boolean;
};

export type SurchargeRow = {
  id: number;
  rateVersionId: number;
  code: string;
  kind: SurchargeKind;
  amountRappen: number | null;
  percent: number | null;
  appliesTo: SurchargeAppliesTo;
  active: boolean;
  ruleId: number | null;
};

export type DistanceBandRow = {
  id: number;
  rateVersionId: number;
  vehicleClassId: string;
  vehicleClassSlug: string;
  fromKm: number;
  toKm: number | null;
  perKmRappen: number | null;
};

export type RegionPremiumRow = {
  id: number;
  rateVersionId: number;
  zoneId: string;
  percent: number;
};

export type RateRuleRow = {
  id: number;
  rateVersionId: number;
  kind: string;
  payload: unknown;
};

export type VehicleClassRef = {
  id: string;
  slug: string;
  name?: string | null;
  photoPath?: string | null;
  luggageCapacity?: number | null;
};

export type RateBook = {
  versionId: number;
  status: RateVersionStatus;
  slug: string;
  label: string;
  vatRateBps: number | null;
  quoteLockMinutes: number | null;
  freeWaitMinutes: number | null;
  distanceRates: DistanceRateRow[];
  fixedRoutes: FixedRouteRow[];
  surcharges: SurchargeRow[];
  distanceBands: DistanceBandRow[];
  regionPremiums: RegionPremiumRow[];
  rules: RateRuleRow[];
  vehicleClasses: VehicleClassRef[];
};

export type ServiceZoneRow = {
  id: string;
  slug: string;
  iata: string | null;
  active: boolean;
  label: string | null;
};

export type DistanceRateInput = {
  vehicleClassId: string;
  baseFareRappen: number | null;
  perKmRappen: number | null;
  minFareRappen: number | null;
  airportStartRappen: number | null;
  cityPriceRappen: number | null;
  maxPax: number;
  available: boolean;
  hideFromPublic: boolean;
};

export type FixedRouteInput = {
  originZoneId: string;
  destZoneId: string;
  vehicleClassId: string;
  priceRappen: number | null;
  live: boolean;
};

export type SurchargeInput = {
  code: string;
  kind: SurchargeKind;
  amountRappen: number | null;
  percent: number | null;
  appliesTo: SurchargeAppliesTo;
  active: boolean;
  ruleId: number | null;
};

export type ServiceZoneInput = {
  slug: string;
  iata: string | null;
  active: boolean;
};

export class RateBookInputError extends Error {
  readonly key: string;

  constructor(key: string) {
    super(key);
    this.name = "RateBookInputError";
    this.key = key;
  }
}

export type PricingFailure =
  | { kind: "frozen"; code: "23001" }
  | { kind: "duplicate"; code: "23505" }
  | { kind: "check"; code: "23514" }
  | { kind: "forbidden"; code: "42501" }
  | { kind: "fk"; code: "23503" }
  | { kind: "unknown" };

function codeOf(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  if (!("code" in err)) return undefined;
  const code = (err as { code: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/**
 * Wraps mapSqlState. Discriminants the UI branches on — never message text (D-13).
 * 23001 is restrict_violation from tg_pricing_row_frozen, not check_violation.
 */
export function classifyPricingFailure(err: unknown): PricingFailure {
  if (codeOf(err) === "23503") return { kind: "fk", code: "23503" };
  const mapped = mapSqlState(err);
  switch (mapped.kind) {
    case "restrict":
      return { kind: "frozen", code: "23001" };
    case "unique":
      return { kind: "duplicate", code: "23505" };
    case "check":
      return { kind: "check", code: "23514" };
    case "privilege":
      return { kind: "forbidden", code: "42501" };
    default:
      return { kind: "unknown" };
  }
}

function asId(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

function asRappen(value: number | string | null): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asPercent(value: number | string | null): number | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const KEBAB_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isSurchargeCode(value: string): boolean {
  return KEBAB_SLUG.test(value);
}

function rejectNegativeRappen(value: number | null, key: string): number | null {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 0) {
    throw new RateBookInputError(key);
  }
  return value;
}

export function assertDistanceRateInput(input: DistanceRateInput): DistanceRateInput {
  if (!input.vehicleClassId) {
    throw new RateBookInputError("rateBook.error-class-required");
  }
  if (!Number.isInteger(input.maxPax) || input.maxPax < 1 || input.maxPax > 16) {
    throw new RateBookInputError("rateBook.error-max-pax");
  }
  return {
    vehicleClassId: input.vehicleClassId,
    baseFareRappen: rejectNegativeRappen(input.baseFareRappen, "rateBook.error-rappen"),
    perKmRappen: rejectNegativeRappen(input.perKmRappen, "rateBook.error-rappen"),
    minFareRappen: rejectNegativeRappen(input.minFareRappen, "rateBook.error-rappen"),
    airportStartRappen: rejectNegativeRappen(
      input.airportStartRappen,
      "rateBook.error-rappen",
    ),
    cityPriceRappen: rejectNegativeRappen(input.cityPriceRappen, "rateBook.error-rappen"),
    maxPax: input.maxPax,
    available: input.available,
    hideFromPublic: input.hideFromPublic === true,
  };
}

export function assertFixedRouteInput(input: FixedRouteInput): FixedRouteInput {
  if (!input.originZoneId || !input.destZoneId || !input.vehicleClassId) {
    throw new RateBookInputError("rateBook.error-route-required");
  }
  if (input.originZoneId === input.destZoneId) {
    throw new RateBookInputError("rateBook.error-same-zone");
  }
  return {
    originZoneId: input.originZoneId,
    destZoneId: input.destZoneId,
    vehicleClassId: input.vehicleClassId,
    priceRappen: rejectNegativeRappen(input.priceRappen, "rateBook.error-rappen"),
    live: input.live,
  };
}

export function assertSurchargeInput(input: SurchargeInput): SurchargeInput {
  if (!isSurchargeCode(input.code)) {
    throw new RateBookInputError("rateBook.error-surcharge-code");
  }
  if (input.appliesTo !== "leg" && input.appliesTo !== "booking") {
    throw new RateBookInputError("rateBook.error-applies-to");
  }
  const amount = input.amountRappen;
  const percent = input.percent;
  if (input.kind === "amount") {
    if (percent != null) throw new RateBookInputError("rateBook.error-kind-field");
    return {
      code: input.code,
      kind: "amount",
      amountRappen: rejectNegativeRappen(amount, "rateBook.error-rappen"),
      percent: null,
      appliesTo: input.appliesTo,
      active: input.active,
      ruleId: input.ruleId ?? null,
    };
  }
  if (input.kind === "percent") {
    if (amount != null) throw new RateBookInputError("rateBook.error-kind-field");
    if (percent != null && (!Number.isFinite(percent) || percent < 0 || percent > 100)) {
      throw new RateBookInputError("rateBook.error-percent");
    }
    return {
      code: input.code,
      kind: "percent",
      amountRappen: null,
      percent,
      appliesTo: input.appliesTo,
      active: input.active,
      ruleId: input.ruleId ?? null,
    };
  }
  if (amount != null || percent != null) {
    throw new RateBookInputError("rateBook.error-kind-field");
  }
  return {
    code: input.code,
    kind: "included",
    amountRappen: null,
    percent: null,
    appliesTo: input.appliesTo,
    active: input.active,
    ruleId: input.ruleId ?? null,
  };
}

export function assertServiceZoneInput(input: ServiceZoneInput): ServiceZoneInput {
  const slug = input.slug.trim();
  if (!KEBAB_SLUG.test(slug)) {
    throw new RateBookInputError("rateBook.error-zone-slug");
  }
  const iata = input.iata?.trim() ?? "";
  return {
    slug,
    iata: iata.length > 0 ? iata.toUpperCase() : null,
    active: input.active,
  };
}

type VersionSqlRow = {
  id: number | string;
  slug: string;
  label: string;
  status: RateVersionStatus;
  vat_rate_bps: number | string | null;
  quote_lock_minutes: number | string | null;
  free_wait_minutes?: number | string | null;
};

type DistanceSqlRow = {
  id: number | string;
  rate_version_id: number | string;
  vehicle_class_id: string;
  vehicle_class_slug: string;
  vehicle_class_name?: string | null;
  vehicle_class_photo?: string | null;
  luggage_capacity?: number | null;
  base_fare_rappen: number | string | null;
  per_km_rappen: number | string | null;
  min_fare_rappen: number | string | null;
  airport_start_rappen: number | string | null;
  city_price_rappen: number | string | null;
  max_pax: number;
  available: boolean;
  hide_from_public: boolean;
};

type RouteSqlRow = {
  id: number | string;
  rate_version_id: number | string;
  origin_zone_id: string;
  dest_zone_id: string;
  origin_slug: string;
  dest_slug: string;
  origin_iata: string | null;
  dest_iata: string | null;
  vehicle_class_id: string;
  vehicle_class_slug: string;
  price_rappen: number | string | null;
  live: boolean;
};

type SurchargeSqlRow = {
  id: number | string;
  rate_version_id: number | string;
  code: string;
  kind: SurchargeKind;
  amount_rappen: number | string | null;
  percent: number | string | null;
  applies_to: SurchargeAppliesTo;
  active: boolean;
  rule_id: number | string | null;
};

type BandSqlRow = {
  id: number | string;
  rate_version_id: number | string;
  vehicle_class_id: string;
  vehicle_class_slug: string;
  from_km: number | string;
  to_km: number | string | null;
  per_km_rappen: number | string | null;
};

type RegionSqlRow = {
  id: number | string;
  rate_version_id: number | string;
  zone_id: string;
  percent: number | string;
};

type RuleSqlRow = {
  id: number | string;
  rate_version_id: number | string;
  kind: string;
  payload: unknown;
};

type ClassSqlRow = {
  id: string;
  slug: string;
  name?: string | null;
  photo_path?: string | null;
  luggage_capacity?: number | null;
};

type ZoneSqlRow = {
  id: string;
  slug: string;
  iata: string | null;
  active: boolean;
  label: string | null;
};

export async function loadRateBook(
  env: CloudflareEnv,
  claims: VamosClaims,
  versionId: number,
): Promise<RateBook | null> {
  return asStaff(env, claims, async (tx) => {
    const versions = await tx<VersionSqlRow[]>`
      select id, slug, label, status, vat_rate_bps, quote_lock_minutes, free_wait_minutes
        from public.rate_versions
       where id = ${versionId}
       limit 1
    `;
    const version = versions[0];
    if (!version) return null;

    const distance = await tx<DistanceSqlRow[]>`
      select
        r.id,
        r.rate_version_id,
        r.vehicle_class_id,
        vc.slug as vehicle_class_slug,
        vc.name as vehicle_class_name,
        vc.photo_path as vehicle_class_photo,
        vc.luggage_capacity,
        r.base_fare_rappen,
        r.per_km_rappen,
        r.min_fare_rappen,
        r.airport_start_rappen,
        r.city_price_rappen,
        r.max_pax,
        r.available,
        r.hide_from_public
      from public.distance_rates r
      join public.vehicle_classes vc on vc.id = r.vehicle_class_id
      where r.rate_version_id = ${versionId}
      order by vc.slug
    `;

    const routes = await tx<RouteSqlRow[]>`
      select
        f.id,
        f.rate_version_id,
        f.origin_zone_id,
        f.dest_zone_id,
        oz.slug as origin_slug,
        dz.slug as dest_slug,
        oz.iata as origin_iata,
        dz.iata as dest_iata,
        f.vehicle_class_id,
        vc.slug as vehicle_class_slug,
        f.price_rappen,
        f.live
      from public.fixed_routes f
      join public.service_zones oz on oz.id = f.origin_zone_id
      join public.service_zones dz on dz.id = f.dest_zone_id
      join public.vehicle_classes vc on vc.id = f.vehicle_class_id
      where f.rate_version_id = ${versionId}
      order by oz.slug, dz.slug, vc.slug
    `;

    const surcharges = await tx<SurchargeSqlRow[]>`
      select
        s.id,
        s.rate_version_id,
        s.code,
        s.kind,
        s.amount_rappen,
        s.percent,
        s.applies_to,
        s.active,
        s.rule_id
      from public.surcharges s
      where s.rate_version_id = ${versionId}
      order by s.code
    `;

    const bands = await tx<BandSqlRow[]>`
      select
        b.id,
        b.rate_version_id,
        b.vehicle_class_id,
        vc.slug as vehicle_class_slug,
        b.from_km,
        b.to_km,
        b.per_km_rappen
      from public.distance_bands b
      join public.vehicle_classes vc on vc.id = b.vehicle_class_id
      where b.rate_version_id = ${versionId}
      order by vc.slug, b.from_km
    `;

    const regions = await tx<RegionSqlRow[]>`
      select id, rate_version_id, zone_id, percent
        from public.region_premiums
       where rate_version_id = ${versionId}
       order by zone_id
    `;

    const rules = await tx<RuleSqlRow[]>`
      select id, rate_version_id, kind, payload
        from public.rate_version_rules
       where rate_version_id = ${versionId}
       order by id
    `;

    const classes = await tx<ClassSqlRow[]>`
      select id, slug, name, photo_path, luggage_capacity
        from public.vehicle_classes
       order by sort_order, slug
    `;

    return {
      versionId: asId(version.id),
      status: version.status,
      slug: version.slug,
      label: version.label,
      vatRateBps: asRappen(version.vat_rate_bps),
      quoteLockMinutes: asRappen(version.quote_lock_minutes),
      freeWaitMinutes: asRappen(version.free_wait_minutes ?? null),
      distanceRates: distance.map((row) => ({
        id: asId(row.id),
        rateVersionId: asId(row.rate_version_id),
        vehicleClassId: row.vehicle_class_id,
        vehicleClassSlug: row.vehicle_class_slug,
        baseFareRappen: asRappen(row.base_fare_rappen),
        perKmRappen: asRappen(row.per_km_rappen),
        minFareRappen: asRappen(row.min_fare_rappen),
        airportStartRappen: asRappen(row.airport_start_rappen),
        cityPriceRappen: asRappen(row.city_price_rappen),
        maxPax: row.max_pax,
        available: row.available,
        hideFromPublic: row.hide_from_public === true,
      })),
      fixedRoutes: routes.map((row) => ({
        id: asId(row.id),
        rateVersionId: asId(row.rate_version_id),
        originZoneId: row.origin_zone_id,
        destZoneId: row.dest_zone_id,
        originSlug: row.origin_slug,
        destSlug: row.dest_slug,
        originIata: row.origin_iata,
        destIata: row.dest_iata,
        vehicleClassId: row.vehicle_class_id,
        vehicleClassSlug: row.vehicle_class_slug,
        priceRappen: asRappen(row.price_rappen),
        live: row.live,
      })),
      surcharges: surcharges.flatMap((row) => {
        if (!isSurchargeCode(row.code)) return [];
        return [
          {
            id: asId(row.id),
            rateVersionId: asId(row.rate_version_id),
            code: row.code,
            kind: row.kind,
            amountRappen: asRappen(row.amount_rappen),
            percent: asPercent(row.percent),
            appliesTo: row.applies_to,
            active: row.active,
            ruleId: row.rule_id == null ? null : asId(row.rule_id),
          },
        ];
      }),
      distanceBands: bands.map((row) => ({
        id: asId(row.id),
        rateVersionId: asId(row.rate_version_id),
        vehicleClassId: row.vehicle_class_id,
        vehicleClassSlug: row.vehicle_class_slug,
        fromKm: asRappen(row.from_km) ?? 0,
        toKm: asRappen(row.to_km),
        perKmRappen: asRappen(row.per_km_rappen),
      })),
      regionPremiums: regions.map((row) => ({
        id: asId(row.id),
        rateVersionId: asId(row.rate_version_id),
        zoneId: row.zone_id,
        percent: asPercent(row.percent) ?? 0,
      })),
      rules: rules.map((row) => ({
        id: asId(row.id),
        rateVersionId: asId(row.rate_version_id),
        kind: row.kind,
        payload: row.payload,
      })),
      vehicleClasses: classes.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: typeof row.name === "string" ? row.name : null,
        photoPath: typeof row.photo_path === "string" ? row.photo_path : null,
        luggageCapacity: row.luggage_capacity == null ? null : Number(row.luggage_capacity),
      })),
    };
  });
}

export async function loadServiceZones(
  env: CloudflareEnv,
  claims: VamosClaims,
): Promise<ServiceZoneRow[]> {
  return asStaff(env, claims, async (tx) => {
    const rows = await tx<ZoneSqlRow[]>`
      select
        z.id,
        z.slug,
        z.iata,
        z.active,
        cs.en as label
      from public.service_zones z
      left join public.content_strings cs
        on cs.key = 'zone.' || z.slug
      order by z.slug
    `;
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      iata: row.iata,
      active: row.active,
      label: row.label,
    }));
  });
}

export type VehicleClassOption = {
  id: string;
  slug: string;
};

export async function loadVehicleClassOptions(
  env: CloudflareEnv,
  claims: VamosClaims,
): Promise<VehicleClassOption[]> {
  return asStaff(env, claims, async (tx) => {
    return tx<VehicleClassOption[]>`
      select id, slug
        from public.vehicle_classes
       order by sort_order, slug
    `;
  });
}

export { vehicleClassLabelKey } from "./vehicle-class-label";

/**
 * Clone a live or retired book into a new draft (D-06 / D-09).
 * When `tx` is passed, the copy joins that asStaff transaction — Publish
 * must clone in the same tx as the public_chf / VAT flip.
 */
async function cloneRateVersionFrom(
  tx: StaffTx,
  source: { id: number; label: string },
): Promise<number> {
  const slug = `ops-draft-from-${source.id}`;
  const existing = await tx<{ id: number | string }[]>`
    select id from public.rate_versions
    where slug = ${slug} and status = 'draft'
    limit 1
  `;
  if (existing[0]) return asId(existing[0].id);

  const created = await tx<{ id: number | string }[]>`
    insert into public.rate_versions (
      slug, label, status,
      vat_rate_bps, quote_lock_minutes, service_area_geojson,
      free_wait_minutes, max_extra_stops
    )
    select
      ${slug},
      ${`${source.label} draft`},
      'draft',
      vat_rate_bps, quote_lock_minutes, service_area_geojson,
      free_wait_minutes, max_extra_stops
      from public.rate_versions
     where id = ${source.id}
    returning id
  `;
  const newId = asId(created[0]!.id);

  await tx`
    insert into public.distance_rates (
      rate_version_id, vehicle_class_id, base_fare_rappen, per_km_rappen,
      min_fare_rappen, airport_start_rappen, city_price_rappen,
      max_pax, available, hide_from_public
    )
    select ${newId}, vehicle_class_id, base_fare_rappen, per_km_rappen,
           min_fare_rappen, airport_start_rappen, city_price_rappen,
           max_pax, available, hide_from_public
      from public.distance_rates
     where rate_version_id = ${source.id}
  `;
  await tx`
    insert into public.fixed_routes (
      rate_version_id, origin_zone_id, dest_zone_id, vehicle_class_id, price_rappen, live
    )
    select ${newId}, origin_zone_id, dest_zone_id, vehicle_class_id, price_rappen, live
      from public.fixed_routes
     where rate_version_id = ${source.id}
  `;
  await tx`
    insert into public.rate_version_rules (rate_version_id, kind, payload)
    select ${newId}, kind, payload
      from public.rate_version_rules
     where rate_version_id = ${source.id}
     order by id
  `;
  await tx`
    insert into public.surcharges (
      rate_version_id, code, kind, amount_rappen, percent, applies_to, active,
      predicate, quantity_source, rule_id
    )
    select
      ${newId}, s.code, s.kind, s.amount_rappen, s.percent, s.applies_to, s.active,
      s.predicate, s.quantity_source,
      (
        select n.id
          from public.rate_version_rules n
          join public.rate_version_rules o on o.id = s.rule_id
         where n.rate_version_id = ${newId}
           and n.kind is not distinct from o.kind
           and n.payload is not distinct from o.payload
         order by n.id
         limit 1
      )
      from public.surcharges s
     where s.rate_version_id = ${source.id}
  `;
  await tx`
    insert into public.distance_bands (
      rate_version_id, vehicle_class_id, from_km, to_km, per_km_rappen
    )
    select ${newId}, vehicle_class_id, from_km, to_km, per_km_rappen
      from public.distance_bands
     where rate_version_id = ${source.id}
  `;
  await tx`
    insert into public.region_premiums (
      rate_version_id, zone_id, percent
    )
    select ${newId}, zone_id, percent
      from public.region_premiums
     where rate_version_id = ${source.id}
  `;
  await tx`
    insert into public.coupons (
      code, kind, percent, amount_rappen, valid_from, valid_until,
      global_limit, per_user_limit, active, note, rate_version_id
    )
    select
      code, kind, percent, amount_rappen, valid_from, valid_until,
      global_limit, per_user_limit, active, note, ${newId}
      from public.coupons
     where rate_version_id = ${source.id}
    on conflict (rate_version_id, code) do nothing
  `;
  return newId;
}

export async function forkLiveRateVersion(
  env: CloudflareEnv,
  claims: VamosClaims,
  source: { id: number; label: string },
  tx?: StaffTx,
): Promise<number> {
  if (tx) return cloneRateVersionFrom(tx, source);
  return asStaff(env, claims, (inner) => cloneRateVersionFrom(inner, source));
}

/** Overlay writes always land on a draft. Fork live first when needed (D-01). */
export async function resolveWritableDraftId(
  env: CloudflareEnv,
  claims: VamosClaims,
): Promise<number | null> {
  const versions = await loadRateVersions(env, claims);
  const draft = versions.find((row) => row.status === "draft");
  if (draft) return draft.id;
  const live = versions.find((row) => row.status === "live");
  if (live) return forkLiveRateVersion(env, claims, live);
  return versions[0]?.id ?? null;
}

/**
 * Staff analog of `quote_rate_book(true)` that still returns the draft after a
 * live row exists. The public RPC prefers live first; preview must not.
 */
export async function loadDraftQuoteBookDoc(
  env: CloudflareEnv,
  claims: VamosClaims,
): Promise<unknown> {
  return asStaff(env, claims, async (tx) => {
    const drafts = await tx<{ id: number | string }[]>`
      select id
        from public.rate_versions
       where status = 'draft'
       order by created_at desc, id desc
       limit 1
    `;
    const draftId = drafts[0]?.id;
    if (draftId == null) {
      const fallback = await tx<{ result: unknown }[]>`
        select public.quote_rate_book(true) as result
      `;
      return fallback[0]?.result ?? null;
    }
    const rows = await tx<{ result: unknown }[]>`
      select jsonb_build_object(
        'rate_version', jsonb_build_object(
          'id', rv.id,
          'slug', rv.slug,
          'status', rv.status,
          'vat_rate_bps', rv.vat_rate_bps,
          'quote_lock_minutes', rv.quote_lock_minutes
        ),
        'classes', (
          select coalesce(jsonb_agg(to_jsonb(c) order by c.sort_order, c.slug), '[]'::jsonb)
            from public.vehicle_classes as c
        ),
        'distance_rates', (
          select coalesce(jsonb_agg(to_jsonb(d) order by d.vehicle_class_id), '[]'::jsonb)
            from public.distance_rates as d
           where d.rate_version_id = rv.id
        ),
        'distance_bands', (
          select coalesce(jsonb_agg(to_jsonb(b) order by b.vehicle_class_id, b.from_km), '[]'::jsonb)
            from public.distance_bands as b
           where b.rate_version_id = rv.id
        ),
        'region_premiums', (
          select coalesce(jsonb_agg(to_jsonb(p) order by p.zone_id), '[]'::jsonb)
            from public.region_premiums as p
           where p.rate_version_id = rv.id
        ),
        'fixed_routes', (
          select coalesce(
                   jsonb_agg(to_jsonb(f) order by f.origin_zone_id, f.dest_zone_id, f.vehicle_class_id),
                   '[]'::jsonb
                 )
            from public.fixed_routes as f
           where f.rate_version_id = rv.id
        ),
        'surcharges', (
          select coalesce(jsonb_agg(to_jsonb(s) order by s.code), '[]'::jsonb)
            from public.surcharges as s
           where s.rate_version_id = rv.id
        ),
        'coupons', (
          select coalesce(jsonb_agg(to_jsonb(cp) order by cp.code), '[]'::jsonb)
            from public.coupons as cp
           where cp.rate_version_id = rv.id
        ),
        'zones', (
          select coalesce(jsonb_agg(to_jsonb(z) order by z.slug), '[]'::jsonb)
            from public.service_zones as z
        )
      ) as result
        from public.rate_versions as rv
       where rv.id = ${draftId}
       limit 1
    `;
    return rows[0]?.result ?? null;
  });
}

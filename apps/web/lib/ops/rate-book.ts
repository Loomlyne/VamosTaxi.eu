// apps/web/lib/ops/rate-book.ts
//
// Reader + constraint-mirroring validators for a rate_version's three priced
// child tables and the service_zones those routes are built between.
// Mutations live in the Server Actions; this module never writes.
//
// Freeze SQLSTATE is 23001 (restrict_violation). 06-07 corrected D-13's
// 23514/P0001 against 20260823000008_rate_versions.sql — every raise on these
// paths is `using errcode = 'restrict_violation'`. Do not "fix" this back.

import { asStaff, type VamosClaims } from "../db/identity";
import { mapSqlState } from "./sqlstate";
import type { RateVersionStatus } from "./pricing";

export type { RateVersionStatus };

export { SURCHARGE_CODES, type SurchargeCode } from "./surcharge-codes";
import { SURCHARGE_CODES, type SurchargeCode } from "./surcharge-codes";
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
  maxPax: number;
  available: boolean;
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
  code: SurchargeCode;
  kind: SurchargeKind;
  amountRappen: number | null;
  percent: number | null;
  appliesTo: SurchargeAppliesTo;
  active: boolean;
};

export type RateBook = {
  versionId: number;
  status: RateVersionStatus;
  slug: string;
  label: string;
  distanceRates: DistanceRateRow[];
  fixedRoutes: FixedRouteRow[];
  surcharges: SurchargeRow[];
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
  maxPax: number;
  available: boolean;
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

function isSurchargeCode(value: string): value is SurchargeCode {
  return (SURCHARGE_CODES as readonly string[]).includes(value);
}

function rejectNegativeRappen(value: number | null, key: string): number | null {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 0) {
    throw new RateBookInputError(key);
  }
  return value;
}

const KEBAB_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
    maxPax: input.maxPax,
    available: input.available,
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
};

type DistanceSqlRow = {
  id: number | string;
  rate_version_id: number | string;
  vehicle_class_id: string;
  vehicle_class_slug: string;
  base_fare_rappen: number | string | null;
  per_km_rappen: number | string | null;
  min_fare_rappen: number | string | null;
  max_pax: number;
  available: boolean;
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
      select id, slug, label, status
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
        r.base_fare_rappen,
        r.per_km_rappen,
        r.min_fare_rappen,
        r.max_pax,
        r.available
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
        s.active
      from public.surcharges s
      where s.rate_version_id = ${versionId}
      order by s.code
    `;

    return {
      versionId: asId(version.id),
      status: version.status,
      slug: version.slug,
      label: version.label,
      distanceRates: distance.map((row) => ({
        id: asId(row.id),
        rateVersionId: asId(row.rate_version_id),
        vehicleClassId: row.vehicle_class_id,
        vehicleClassSlug: row.vehicle_class_slug,
        baseFareRappen: asRappen(row.base_fare_rappen),
        perKmRappen: asRappen(row.per_km_rappen),
        minFareRappen: asRappen(row.min_fare_rappen),
        maxPax: row.max_pax,
        available: row.available,
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
          },
        ];
      }),
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

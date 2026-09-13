// apps/web/lib/pricing/rateBook.ts
//
// Pure mapping from the quote_rate_book / quote_settings_version jsonb
// document onto the kernel's RateBook / SettingsSnapshot (D-07, D-33, D-34).
//
// This file is inside the kernel directory's fence: it imports no database
// client, opens no connection, reads no env, calls no clock and performs no
// arithmetic. The grep fence plan 04-03 put on apps/web/lib/pricing/ still
// holds after this file lands.
//
// Two rules:
//   1. numeric stays a string. to_jsonb(numeric) preserves the exact decimal
//      and postgres.js hands it over as text; coercing "7.35" to a float
//      would leave percentToHundredths (plan 04-01) with nothing exact to
//      parse. This file never coerces decimals to IEEE floats.
//   2. Order is SQL's. Plan 04-06's RPC carries an explicit ORDER BY per
//      array so one place decides; reordering here would be a second answer
//      that agrees today and drifts the day someone changes one of them.
//
// Fields are enumerated, never copied wholesale — the same
// enumerate-don't-spread discipline packages/db/src/claims.ts already uses
// for a different reason. Missing arrays become []. Missing nullable
// scalars become null. An unexpected extra key is dropped.
//
// derivePricingLive is the greppable QUOTE-10 sentence. The preview flag is
// deliberately absent from its inputs (D-33): that flag chooses WHICH
// version is loaded, never whether it counts as live.

import type {
  DistanceBandRow,
  DistanceRateRow,
  FixedRouteRow,
  RateBook,
  RegionPremiumRow,
  SettingsSnapshot,
  SurchargeRow,
  VehicleClassRow,
  VehicleClassSlug,
  ZoneRow,
  ZoneType,
} from "./types";

/** Version handle as the RPC emits it — status is required for QUOTE-10. */
export type RateVersionRef = {
  id: number;
  slug: string;
  status: string;
};

export type MappedRateBook = RateBook & {
  rate_version: RateVersionRef | null;
};

/**
 * Settings row as mapped from quote_settings_version. Extra columns the
 * kernel does not yet name stay on this type so a later phase can read them
 * without widening types.ts in this plan.
 */
export type MappedSettingsSnapshot = SettingsSnapshot & {
  night_window_tz: string | null;
  cancellation_tiers: SettingsSnapshot["cancellation_tiers"] | null;
  service_area_geojson: unknown | null;
  effective_from: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mapList<T>(value: unknown, mapOne: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const item of value) {
    out.push(mapOne(item));
  }
  return out;
}

function mapTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string") out.push(item);
  }
  return out;
}

function mapRateVersion(value: unknown): RateVersionRef | null {
  if (!isRecord(value)) return null;
  return {
    id: value.id as number,
    slug: value.slug as string,
    status: value.status as string,
  };
}

function mapClass(item: unknown): VehicleClassRow {
  const row = isRecord(item) ? item : {};
  return {
    id: row.id as string,
    slug: row.slug as VehicleClassSlug,
    passenger_capacity: row.passenger_capacity as number,
    luggage_capacity: row.luggage_capacity as number,
    sort_order: row.sort_order as number,
    active: row.active as boolean,
  };
}

function mapDistanceRate(item: unknown): DistanceRateRow {
  const row = isRecord(item) ? item : {};
  return {
    id: row.id as number,
    rate_version_id: row.rate_version_id as number,
    vehicle_class_id: row.vehicle_class_id as string,
    base_fare_rappen: (row.base_fare_rappen ?? null) as number | null,
    per_km_rappen: (row.per_km_rappen ?? null) as number | null,
    min_fare_rappen: (row.min_fare_rappen ?? null) as number | null,
    max_pax: row.max_pax as number,
    available: row.available as boolean,
    hide_from_public:
      typeof row.hide_from_public === "boolean"
        ? row.hide_from_public
        : undefined,
  };
}

function mapDistanceBand(item: unknown): DistanceBandRow {
  const row = isRecord(item) ? item : {};
  return {
    id: row.id as number,
    rate_version_id: row.rate_version_id as number,
    vehicle_class_id: row.vehicle_class_id as string,
    from_km: row.from_km as number,
    to_km: (row.to_km ?? null) as number | null,
    per_km_rappen: row.per_km_rappen as number,
  };
}

function mapRegionPremium(item: unknown): RegionPremiumRow {
  const row = isRecord(item) ? item : {};
  return {
    id: row.id as number,
    rate_version_id: row.rate_version_id as number,
    zone_id: row.zone_id as string,
    percent: (row.percent ?? 0) as number | string,
  };
}

function mapFixedRoute(item: unknown): FixedRouteRow {
  const row = isRecord(item) ? item : {};
  return {
    id: row.id as number,
    rate_version_id: row.rate_version_id as number,
    origin_zone_id: row.origin_zone_id as string,
    dest_zone_id: row.dest_zone_id as string,
    vehicle_class_id: row.vehicle_class_id as string,
    price_rappen: (row.price_rappen ?? null) as number | null,
    live: row.live as boolean,
  };
}

function mapSurcharge(item: unknown): SurchargeRow {
  const row = isRecord(item) ? item : {};
  const predicate = isRecord(row.predicate) ? row.predicate : {};
  return {
    id: row.id as number,
    rate_version_id: row.rate_version_id as number,
    code: row.code as string,
    kind: row.kind as SurchargeRow["kind"],
    amount_rappen: (row.amount_rappen ?? null) as number | null,
    percent: (row.percent ?? null) as number | string | null,
    applies_to: row.applies_to as SurchargeRow["applies_to"],
    active: row.active as boolean,
    predicate: predicate as SurchargeRow["predicate"],
    quantity_source: (row.quantity_source ?? null) as string | null,
  };
}

function mapZone(item: unknown): ZoneRow {
  const row = isRecord(item) ? item : {};
  return {
    id: row.id as string,
    slug: row.slug as string,
    iata: (row.iata ?? null) as string | null,
    active: row.active as boolean,
    zone_type: row.zone_type as ZoneType,
    tags: mapTags(row.tags),
  };
}

export function mapRateBook(doc: unknown): MappedRateBook {
  if (!isRecord(doc)) {
    return {
      rate_version: null,
      classes: [],
      distance_rates: [],
      distance_bands: [],
      region_premiums: [],
      fixed_routes: [],
      surcharges: [],
      zones: [],
    };
  }
  return {
    rate_version: mapRateVersion(doc.rate_version),
    classes: mapList(doc.classes, mapClass),
    distance_rates: mapList(doc.distance_rates, mapDistanceRate),
    distance_bands: mapList(doc.distance_bands, mapDistanceBand),
    region_premiums: mapList(doc.region_premiums, mapRegionPremium),
    fixed_routes: mapList(doc.fixed_routes, mapFixedRoute),
    surcharges: mapList(doc.surcharges, mapSurcharge),
    zones: mapList(doc.zones, mapZone),
  };
}

/**
 * QUOTE-10: live means the loaded version's status is the live token, and
 * nothing else. Draft, retired and null are all not live. The preview flag
 * is not an input (D-33).
 */
export function derivePricingLive(
  rateVersion: { status: string } | null,
): boolean {
  return rateVersion !== null && rateVersion.status === "live";
}

export function mapSettingsSnapshot(
  doc: unknown,
): MappedSettingsSnapshot | null {
  if (!isRecord(doc)) return null;
  return {
    id: doc.id as number,
    slug: doc.slug as string,
    free_cancel_hours: (doc.free_cancel_hours ?? null) as number | null,
    modification_deadline_hours: (doc.modification_deadline_hours ??
      null) as number | null,
    min_advance_minutes: (doc.min_advance_minutes ?? null) as number | null,
    airport_waiting_minutes: (doc.airport_waiting_minutes ??
      null) as number | null,
    city_waiting_minutes: (doc.city_waiting_minutes ?? null) as number | null,
    manage_link_validity_days: (doc.manage_link_validity_days ??
      null) as number | null,
    round_trip_discount_percent: (doc.round_trip_discount_percent ??
      null) as number | string | null,
    night_window_start: (doc.night_window_start ?? null) as string | null,
    night_window_end: (doc.night_window_end ?? null) as string | null,
    night_window_tz:
      typeof doc.night_window_tz === "string"
        ? doc.night_window_tz
        : "Europe/Zurich",
    quote_lock_minutes: (doc.quote_lock_minutes ?? null) as number | null,
    checkout_window_minutes: (doc.checkout_window_minutes ??
      null) as number | null,
    cancellation_tiers: (doc.cancellation_tiers ??
      null) as MappedSettingsSnapshot["cancellation_tiers"],
    policy_doc_slug: (doc.policy_doc_slug ?? null) as string | null,
    policy_doc_version: (doc.policy_doc_version ?? null) as string | null,
    service_area_geojson: (doc.service_area_geojson ?? null) as unknown | null,
    effective_from: (doc.effective_from ?? null) as string | null,
  };
}

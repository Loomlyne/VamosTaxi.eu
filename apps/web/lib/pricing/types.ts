// apps/web/lib/pricing/types.ts
//
// Frozen kernel input/output contract for Phase 4 quote pricing (D-01, D-02, D-09).
// These are the shapes the pure engine, the route handlers and the snapshot writer
// share. Field names match 04-CONTEXT.md <specifics> and 04-RESEARCH.md §13
// verbatim — a rename here breaks plans 04-07, 04-09, 04-12 and 04-14 at once.
//
// Negative space: these types describe rows already fetched. Nothing in this
// file imports a database client, a Cloudflare binding, postgres, or a clock.
// Amounts stay number | string | null where the database type is rappen/numeric
// (postgres.js returns numeric(5,2) as a string; percentToHundredths parses it).
//
// D-01: max_bags lives only on ClassBoardEntry (from vehicle_classes.luggage_capacity).
// DistanceRateRow has no max_bags — the column does not exist.
// D-03: QuoteMode is one_way | return only. Owner sheet: four classes.

/**
 * D-19: open class lineup. Lowercase kebab slug (existing economy /
 * business / first / van remain valid). Do not close this to four keys.
 */
export type VehicleClassSlug = string;

/** D-03: only one_way | return reach the kernel; other modes are refused at the HTTP boundary. */
export type QuoteMode = "one_way" | "return";

/** service_zones.zone_type (plan 04-04 additive column; D-10). */
export type ZoneType = "airport" | "city" | "ski" | "other";

/**
 * surcharges.predicate jsonb discriminators (D-09).
 * An empty object or unknown kind is not-applicable — never silently true.
 */
export type SurchargePredicate =
  | { kind: "always" }
  | { kind: "pickup_zone_type"; zone_type: ZoneType }
  | { kind: "local_time_window"; tz: string; from: string; to: string }
  | { kind: "dest_zone_tag"; tag: string }
  | { kind: "quantity" };

/** vehicle_classes row facts the kernel reads. */
export interface VehicleClassRow {
  id: string;
  slug: VehicleClassSlug;
  passenger_capacity: number;
  luggage_capacity: number;
  sort_order: number;
  active: boolean;
  /** D-29: typed display name. Optional until owner SQL apply. */
  name?: string | null;
  /** D-30: R2 key under classes/. Optional until owner SQL apply. */
  photo_path?: string | null;
}

/**
 * distance_rates — no max_bags column (D-01).
 * rappen columns may arrive as number | null; never invent a second bag cap.
 */
export interface DistanceRateRow {
  id: number;
  rate_version_id: number;
  vehicle_class_id: string;
  base_fare_rappen: number | null;
  per_km_rappen: number | null;
  min_fare_rappen: number | null;
  max_pax: number;
  available: boolean;
  /** D-19: listed on the public board, not selectable, amount null. */
  hide_from_public?: boolean;
}

/**
 * D-14: From inclusive / To exclusive; null to_km = open last.
 * Band CHF is on top of class per-km, filtered by vehicle_class_id.
 */
export interface DistanceBandRow {
  id: number;
  rate_version_id: number;
  vehicle_class_id: string;
  from_km: number;
  to_km: number | null;
  per_km_rappen: number;
}

/** Region percent when pickup or dropoff is this zone. */
export interface RegionPremiumRow {
  id: number;
  rate_version_id: number;
  zone_id: string;
  percent: number | string;
}

/** fixed_routes row. */
export interface FixedRouteRow {
  id: number;
  rate_version_id: number;
  origin_zone_id: string;
  dest_zone_id: string;
  vehicle_class_id: string;
  price_rappen: number | null;
  live: boolean;
  /** D-20: canton rows lose to exact place. Missing kind is inferred from zone tags. */
  kind?: "place" | "canton";
}

/**
 * surcharges row. percent is numeric(5,2) — may arrive as string from postgres.js
 * and is parsed by percentToHundredths (D-07). predicate/quantity_source land in 04-04.
 */
export interface SurchargeRow {
  id: number;
  rate_version_id: number;
  code: string;
  kind: "amount" | "percent" | "included";
  amount_rappen: number | null;
  /** numeric(5,2) — string | number | null from the driver. */
  percent: number | string | null;
  applies_to: "leg" | "booking";
  active: boolean;
  predicate: SurchargePredicate | Record<string, unknown>;
  quantity_source: string | null;
}

/**
 * service_zones — zone_type and tags are additive (D-10); iata is display-only
 * and must never drive airport inference in the kernel.
 */
export interface ZoneRow {
  id: string;
  slug: string;
  iata: string | null;
  active: boolean;
  zone_type: ZoneType;
  tags: string[];
}

/**
 * Rate book handed to the pure kernel after the loader has already ORDER BY'd
 * every collection (research T5). The kernel must not re-sort by anything other
 * than the deterministic line `seq` rule when assembling output.
 */
export interface RateBook {
  rate_version: { id: number; slug: string } | null;
  classes: VehicleClassRow[];
  distance_rates: DistanceRateRow[];
  distance_bands: DistanceBandRow[];
  region_premiums: RegionPremiumRow[];
  fixed_routes: FixedRouteRow[];
  surcharges: SurchargeRow[];
  zones: ZoneRow[];
}

/**
 * settings_versions fields the engine reads — every policy number nullable
 * (ADR-002 labelled-gap discipline). Names match landed columns exactly.
 */
export interface SettingsSnapshot {
  id: number;
  slug: string;
  free_cancel_hours: number | null;
  modification_deadline_hours: number | null;
  min_advance_minutes: number | null;
  airport_waiting_minutes: number | null;
  city_waiting_minutes: number | null;
  manage_link_validity_days: number | null;
  /** numeric(5,2) — may arrive as string. */
  round_trip_discount_percent: number | string | null;
  night_window_start: string | null;
  night_window_end: string | null;
  night_window_tz: string;
  quote_lock_minutes: number | null;
  checkout_window_minutes: number | null;
  cancellation_tiers: CancellationTier[];
  policy_doc_slug: string | null;
  policy_doc_version: string | null;
}

export interface CancellationTier {
  from_hours_before?: number;
  no_show?: boolean;
  refund_percent: number;
}

/** One journey leg on the quote input. scheduled_local is wall-clock text, never a Date. */
export interface QuoteLegInput {
  leg_seq: number;
  scheduled_local: string;
  distance_m: number;
  duration_s: number;
  origin_zone_id: string | null;
  dest_zone_id: string | null;
  /** D-20: Mapbox region code (ZH), not a tick-list fence. */
  origin_canton?: string | null;
  dest_canton?: string | null;
  waypoints: unknown[];
}

/**
 * Kernel input. computed_at is an injected ISO string — the kernel never reads
 * a clock (D-07 / research T2).
 */
export interface QuoteInput {
  mode: QuoteMode;
  pax: number;
  bags: number;
  display_currency: string;
  computed_at: string;
  legs: QuoteLegInput[];
  extras: Record<string, number>;
  coupon: string | null;
}

/** Line kind on the snapshot / board. */
export type LineKind = "fare" | "surcharge" | "included" | "discount" | "extra";

/**
 * basis.rule and related justification fields — open record so plan 04-03 can
 * attach per-rule keys without widening this freeze.
 */
export type LineBasis = {
  rule: string;
  why?: Record<string, string | number | boolean | null>;
  [key: string]: unknown;
};

export interface LineSourceRow {
  table: string;
  id: number;
  rate_version_id?: number;
}

/**
 * §13 price line. amount_rappen is number | null on every line.
 * allocation is required on any line whose leg_seq is null (booking-level).
 */
export type Line =
  | {
      seq: number;
      leg_seq: number;
      kind: LineKind;
      code: string;
      i18n_key: string;
      params?: Record<string, string | number | null>;
      basis: LineBasis;
      source_row?: LineSourceRow;
      allocation?: string;
      amount_rappen: number | null;
    }
  | {
      seq: number;
      leg_seq: null;
      kind: LineKind;
      code: string;
      i18n_key: string;
      params?: Record<string, string | number | null>;
      basis: LineBasis;
      source_row?: LineSourceRow;
      /** Required when leg_seq is null — single-leg refund apportions by this rule. */
      allocation: string;
      amount_rappen: number | null;
    };

/** §13 policy object built from settings_versions as of computed_at. */
export interface PolicySnapshot {
  settings_version_id: number;
  free_cancel_hours: number | null;
  modification_deadline_hours: number | null;
  min_advance_minutes: number | null;
  airport_waiting_minutes: number | null;
  city_waiting_minutes: number | null;
  cancellation_tiers: CancellationTier[];
  policy_doc: { slug: string; version: string } | null;
}

/**
 * One entry per class in QuoteResponse.classes[] (D-02 board).
 * max_bags is luggage_capacity only — never a distance_rates field (D-01).
 */
export interface ClassBoardEntry {
  slug: VehicleClassSlug;
  eligible: boolean;
  ineligible_reason:
    | "pax"
    | "bags"
    | "unavailable"
    | "no_rate"
    | "route_off"
    | null;
  effective_max_pax: number;
  max_bags: number;
  fixed_route: boolean;
  total_rappen: number | null;
  lines: Line[];
}

/** Kernel output shape assembled by priceQuote (plan 04-03+) from these modules. */
export interface PriceQuoteResult {
  no_eligible_class: boolean;
  classes: ClassBoardEntry[];
  policy: PolicySnapshot | null;
  rate_version: { id: number; slug: string } | null;
  engine_version: string;
  pricing_live: boolean;
}

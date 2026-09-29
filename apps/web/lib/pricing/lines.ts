// apps/web/lib/pricing/lines.ts
//
// Per-leg line construction for the quote pipeline (D-08, D-08a, D-08b, D-09,
// D-45). Fare → airport fee → city/canton pair → percent/amount/included
// surcharges → quantity extras. Every percent is taken of THAT LEG'S fare
// line only — never a running total, never another surcharge (D-06).
//
// D-08: per leg the price is start fare + per-km × km, with no distance band
// and no minimum fare ever entering the amount. buildAirportFeeLine (D-08b)
// adds an airport pickup fee on top of that start — it never replaces it —
// when the pickup is an airport (place resolution or zone_type) or the
// customer entered a flight number. A city or canton pair (D-09) is a
// separate extra on top: it applies in both directions and never when pickup
// and destination resolve to the same place; when both a city and a canton
// pair match the same leg, only the city pair applies (D-09a). Extra stops
// skip that pair extra. Child seat / oversized luggage emit one line per
// leg_seq on a return. Extra stop is Mapbox places on the D-11 distance
// recipe, not a chip fare (D-37).
//
// Negative space: this module reads no clock, performs no I/O, formats nothing,
// and never decides IF a surcharge applies — that is predicates.ts, called from
// here. Client-supplied amounts are not parameters; quantities only. A
// client-sent fare_kind is not a pricing trust boundary — airport and pair
// signals come from server-resolved place/zone fields (26.1-09).

import { evaluatePredicate } from "./predicates";
import { percentOf, percentToHundredths, perKm } from "./round";
import type {
  DistanceBandRow,
  DistanceRateRow,
  FareKind,
  FixedRouteRow,
  Line,
  LineKind,
  QuoteInput,
  QuoteLegInput,
  RegionPremiumRow,
  SettingsSnapshot,
  SurchargeRow,
  VehicleClassRow,
  VehicleClassSlug,
  ZoneRow,
} from "./types";
import { fareKindOrOneWay } from "./types";

/** Kind rank for deterministic seq — fare < surcharge < included < discount (T5). */
const KIND_RANK: Record<string, number> = {
  fare: 0,
  surcharge: 1,
  extra: 1,
  included: 2,
  discount: 3,
};

/**
 * Pure sort key from (leg_seq, kind rank, code). Used to order lines so the same
 * book in a different row order produces the same numbered lines (research T5).
 * Final consecutive `seq` is assigned by `numberLines`.
 */
export function seqFor(
  leg_seq: number | null,
  kind: LineKind | string,
  code: string,
): number {
  const leg = leg_seq === null ? 9_000 : leg_seq;
  const rank = KIND_RANK[kind] ?? 9;
  // Encode leg and rank in high digits; code order is applied at sort time.
  return leg * 100 + rank;
}

function compareLines(
  a: { leg_seq: number | null; kind: string; code: string },
  b: { leg_seq: number | null; kind: string; code: string },
): number {
  const la = a.leg_seq === null ? 1_000_000 : a.leg_seq;
  const lb = b.leg_seq === null ? 1_000_000 : b.leg_seq;
  if (la !== lb) return la - lb;
  const ka = KIND_RANK[a.kind] ?? 9;
  const kb = KIND_RANK[b.kind] ?? 9;
  if (ka !== kb) return ka - kb;
  if (a.code < b.code) return -1;
  if (a.code > b.code) return 1;
  return 0;
}

/**
 * Sort by (leg_seq, kind rank, code) and assign consecutive seq 1..n.
 * Remaps basis.of_line_seq when a previousSeq → newSeq map is provided via
 * lines that still carry the fare's pre-number identity in basis._fare_key
 * (stripped after numbering).
 */
export function numberLines(lines: Line[]): Line[] {
  const sorted = [...lines].sort(compareLines);
  // First pass: assign seq; remember old seq → new for of_line_seq remap.
  const oldToNew = new Map<number, number>();
  const numbered: Line[] = sorted.map((line, i) => {
    const seq = i + 1;
    if (typeof line.seq === "number") {
      oldToNew.set(line.seq, seq);
    }
    return { ...line, seq };
  });
  // Second pass: fix of_line_seq on percent bases.
  return numbered.map((line) => {
    const basis = line.basis;
    if (
      basis &&
      typeof basis === "object" &&
      "of_line_seq" in basis &&
      typeof basis.of_line_seq === "number"
    ) {
      const mapped = oldToNew.get(basis.of_line_seq as number);
      if (mapped !== undefined) {
        return {
          ...line,
          basis: { ...basis, of_line_seq: mapped },
        };
      }
    }
    return line;
  });
}

function percentString(value: number | string | null): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    // Kernel callers may pass a unit-free integer percent (e.g. 10) or a
    // hundredths-ready value already stringified by the loader. Format as
    // numeric(5,2)-shaped digit string without float math on the value path
    // used by percentToHundredths (integer path only for whole percents).
    if (!Number.isSafeInteger(value)) return null;
    return String(value);
  }
  return value;
}

export interface BuildFareLineArgs {
  leg: QuoteLegInput;
  vehicleClass: VehicleClassRow;
  distanceRate: DistanceRateRow | null;
  fixedRoutes: FixedRouteRow[];
  rateVersionId: number | null;
  distanceBands?: DistanceBandRow[];
  /** D-20: airport identity and canton tags live on service_zones. */
  zones?: ZoneRow[];
  /** D-21: extra stop on the journey → skip fixed_routes, use distance recipe. */
  hasExtraStops?: boolean;
  /**
   * Comment 11. Airport pickup uses a different start. Class city price is
   * a separate line. A Comment 8 pair is not this fare line.
   * Overlap with comment 10: this does not add a One way tab.
   */
  fareKind?: FareKind;
}

function journeyHasExtraStops(
  leg: QuoteLegInput,
  hasExtraStops?: boolean,
): boolean {
  if (hasExtraStops === true) return true;
  return Array.isArray(leg.waypoints) && leg.waypoints.length > 0;
}

export function cantonOfZone(zone: ZoneRow | undefined): string | null {
  if (!zone) return null;
  for (const tag of zone.tags) {
    const hit = /^canton:(.+)$/i.exec(tag.trim());
    if (hit?.[1]) return normalizeCanton(hit[1]);
  }
  const slug = /^canton-([a-z0-9]{2,})$/i.exec(zone.slug.trim());
  return slug?.[1] ? normalizeCanton(slug[1]) : null;
}

function normalizeCanton(raw: string): string {
  return raw.trim().toUpperCase().replace(/^CH-/, "");
}

/** D-20 / D-26: attach a Mapbox place name to a seeded or owner-created zone. */
export function zoneIdMatchingPlace(
  text: string | null | undefined,
  zones: readonly ZoneRow[],
): string | null {
  if (!text) return null;
  const hay = text.toLowerCase().replace(/[.-]/g, " ");
  let best: ZoneRow | null = null;
  let bestLen = 0;
  for (const zone of zones) {
    if (zone.iata && hay.includes(zone.iata.toLowerCase())) return zone.id;
    const needle = zone.slug.replace(/-/g, " ");
    if (needle.length >= 4 && hay.includes(needle) && needle.length > bestLen) {
      best = zone;
      bestLen = needle.length;
    }
  }
  return best?.id ?? null;
}

export function attachPlaceZones(
  input: QuoteInput,
  zones: readonly ZoneRow[],
): QuoteInput {
  if (!zones.length) return input;
  return {
    ...input,
    legs: input.legs.map((leg) => ({
      ...leg,
      origin_zone_id:
        leg.origin_zone_id ?? zoneIdMatchingPlace(leg.origin_place, zones),
      dest_zone_id:
        leg.dest_zone_id ?? zoneIdMatchingPlace(leg.dest_place, zones),
    })),
  };
}

export function isCantonFixed(
  row: FixedRouteRow,
  byId: Map<string, ZoneRow>,
): boolean {
  if (row.kind === "canton") return true;
  if (row.kind === "place") return false;
  return (
    cantonOfZone(byId.get(row.origin_zone_id)) != null &&
    cantonOfZone(byId.get(row.dest_zone_id)) != null
  );
}

function liveClassRows(
  rows: FixedRouteRow[],
  classId: string,
): FixedRouteRow[] {
  return rows.filter((r) => r.vehicle_class_id === classId && r.live === true);
}

/**
 * Comment 11. Exactly one city price, booking-level, like an addon.
 * Not emitted for one way or airport pickup. Null amount when staff have
 * not set the price — never a guessed CHF figure.
 */
export function buildCityPriceLine(args: {
  fareKind: FareKind | undefined;
  cityPriceRappen: number | null;
  distanceRateId: number | null;
  rateVersionId: number | null;
}): Line | null {
  if (fareKindOrOneWay(args.fareKind) !== "city_to_city") return null;
  return {
    seq: 0,
    leg_seq: null,
    kind: "extra",
    code: "city_price",
    i18n_key: "price.line.city_price",
    basis: {
      rule: "city_price",
      city_price_rappen: args.cityPriceRappen,
    },
    ...(args.distanceRateId !== null
      ? {
          source_row: {
            table: "distance_rates",
            id: args.distanceRateId,
            ...(args.rateVersionId !== null
              ? { rate_version_id: args.rateVersionId }
              : {}),
          },
        }
      : {}),
    allocation: "pro_rata",
    amount_rappen: args.cityPriceRappen,
  };
}

function isLabelBoundary(ch: string): boolean {
  return ch === "" || !/[\p{L}\p{N}]/u.test(ch);
}

function placeHasLabel(
  place: string | null | undefined,
  label: string | null | undefined,
): boolean {
  if (!place || !label) return false;
  const needle = label.trim().toLowerCase();
  if (needle.length < 2) return false;
  const hay = place.toLowerCase();
  let from = 0;
  while (from <= hay.length - needle.length) {
    const at = hay.indexOf(needle, from);
    if (at < 0) return false;
    const before = at === 0 ? "" : hay.charAt(at - 1);
    const after =
      at + needle.length >= hay.length ? "" : hay.charAt(at + needle.length);
    if (isLabelBoundary(before) && isLabelBoundary(after)) return true;
    from = at + 1;
  }
  return false;
}

function zonePairLabel(zone: ZoneRow | undefined): string | null {
  if (!zone) return null;
  const slug = zone.slug.trim();
  if (!slug || /^canton-/i.test(slug)) return null;
  const words = slug.split("-").filter(Boolean);
  if (!words.length) return null;
  return words
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Comment 18. The published tab stores zone ids and the row amount.
 * Quote rows often have no kind. Stamp a city label from the zone slug
 * so the existing matcher can see them. Do not invent an amount.
 */
export function publishedCityToCityRoutes(
  routes: readonly FixedRouteRow[],
  zones: readonly ZoneRow[],
): FixedRouteRow[] {
  const byId = new Map(zones.map((zone) => [zone.id, zone]));
  return routes.map((row) => {
    if (row.kind === "place" || row.kind === "city" || row.kind === "canton") {
      return row;
    }
    if (isCantonFixed(row, byId)) return { ...row, kind: "canton" };
    return {
      ...row,
      kind: "city",
      origin_label: row.origin_label ?? zonePairLabel(byId.get(row.origin_zone_id)),
      dest_label: row.dest_label ?? zonePairLabel(byId.get(row.dest_zone_id)),
    };
  });
}

/** D-09/26.1-10: service_zones tag `mapbox_place:<id>` — language-independent city identity. */
function cityIdOfZone(zone: ZoneRow | undefined): string | null {
  if (!zone) return null;
  for (const tag of zone.tags) {
    const hit = /^mapbox_place:(.+)$/i.exec(tag.trim());
    if (hit?.[1]) return hit[1];
  }
  return null;
}

/**
 * D-09: a city pair covers both directions and never applies when pickup and
 * destination resolve to the same place. Prefers 26.1-09's Mapbox city ids
 * (language-independent); falls back to the label match when ids are absent.
 */
function matchCityPair(
  rows: FixedRouteRow[],
  leg: QuoteLegInput,
  byId: Map<string, ZoneRow>,
): FixedRouteRow | null {
  const originCityId =
    leg.origin_city_id ??
    (leg.origin_zone_id ? cityIdOfZone(byId.get(leg.origin_zone_id)) : null);
  const destCityId =
    leg.dest_city_id ??
    (leg.dest_zone_id ? cityIdOfZone(byId.get(leg.dest_zone_id)) : null);

  if (originCityId && destCityId) {
    if (originCityId === destCityId) return null; // D-09 same-place guard
    return (
      rows.find((row) => {
        if (row.kind !== "city") return false;
        const rowOriginId = cityIdOfZone(byId.get(row.origin_zone_id));
        const rowDestId = cityIdOfZone(byId.get(row.dest_zone_id));
        if (!rowOriginId || !rowDestId) return false;
        return (
          (rowOriginId === originCityId && rowDestId === destCityId) ||
          (rowOriginId === destCityId && rowDestId === originCityId)
        );
      }) ?? null
    );
  }

  // Label fallback (no Mapbox city ids resolved yet — pre-26.1-09 legs).
  const originPlace = leg.origin_place;
  const destPlace = leg.dest_place;
  if (
    originPlace &&
    destPlace &&
    originPlace.trim().toLowerCase() === destPlace.trim().toLowerCase()
  ) {
    return null; // D-09 same-place guard
  }
  return (
    rows.find((row) => {
      if (row.kind !== "city") return false;
      const forward =
        placeHasLabel(originPlace, row.origin_label) &&
        placeHasLabel(destPlace, row.dest_label);
      const reverse =
        placeHasLabel(originPlace, row.dest_label) &&
        placeHasLabel(destPlace, row.origin_label);
      return forward || reverse;
    }) ?? null
  );
}

/**
 * D-09: a canton pair covers both directions and never applies when pickup
 * and destination resolve to the same canton.
 */
function matchCantonPair(
  rows: FixedRouteRow[],
  leg: QuoteLegInput,
  byId: Map<string, ZoneRow>,
): FixedRouteRow | null {
  const origin = leg.origin_zone_id;
  const dest = leg.dest_zone_id;
  const originCanton =
    (typeof leg.origin_canton === "string" && leg.origin_canton
      ? normalizeCanton(leg.origin_canton)
      : null) ?? (origin ? cantonOfZone(byId.get(origin)) : null);
  const destCanton =
    (typeof leg.dest_canton === "string" && leg.dest_canton
      ? normalizeCanton(leg.dest_canton)
      : null) ?? (dest ? cantonOfZone(byId.get(dest)) : null);
  if (!originCanton || !destCanton) return null;
  if (originCanton === destCanton) return null; // D-09 same-place guard
  return (
    rows.find((row) => {
      if (!isCantonFixed(row, byId)) return false;
      const oc = cantonOfZone(byId.get(row.origin_zone_id));
      const dc = cantonOfZone(byId.get(row.dest_zone_id));
      return (
        (oc === originCanton && dc === destCanton) ||
        (oc === destCanton && dc === originCanton)
      );
    }) ?? null
  );
}

/**
 * Comment 8 / D-09 / D-09a. City-to-city or canton-to-canton extra on the
 * distance fare. A pair matches both directions; a Mapbox place pin is not a
 * pair. When both a city and a canton pair match the same leg, the city pair
 * applies — exactly one pair extra per leg. No match returns null — never an
 * invented amount.
 */
/**
 * 26.1-11 / UI-SPEC §8: the pair line names both ends in the leg's own
 * direction so checkout can label it "{origin} – {destination} route".
 * Display only — both names must be known and non-blank, otherwise the line
 * carries no params and checkout falls back to the plain "Route price" label.
 */
function pairLineParams(
  leg: QuoteLegInput,
): { origin: string; destination: string } | null {
  const origin = leg.origin_city_name?.trim();
  const destination = leg.dest_city_name?.trim();
  if (!origin || !destination) return null;
  return { origin, destination };
}

export function buildFixedRouteExtraLine(args: {
  leg: QuoteLegInput;
  vehicleClass: VehicleClassRow;
  fixedRoutes: FixedRouteRow[];
  rateVersionId: number | null;
  zones?: ZoneRow[];
  hasExtraStops?: boolean;
  /**
   * Comment 18. City-to-city booking reads this tab's published rows.
   * Untyped rows are city pairs (zone slug as the label). A place pin stays
   * a place pin. No second city_price line.
   */
  publishedPairs?: boolean;
}): Line | null {
  const { leg, vehicleClass, rateVersionId, zones, hasExtraStops } = args;
  if (journeyHasExtraStops(leg, hasExtraStops)) return null;
  const zoneRows = zones ?? [];
  const fixedRoutes = args.publishedPairs
    ? publishedCityToCityRoutes(args.fixedRoutes, zoneRows)
    : args.fixedRoutes;
  const live = liveClassRows(fixedRoutes, vehicleClass.id);
  const byId = new Map(zoneRows.map((zone) => [zone.id, zone]));
  const city = matchCityPair(live, leg, byId);
  const canton = matchCantonPair(live, leg, byId);
  // D-09a: when both match the same leg, the city pair applies — one route extra per leg.
  let fixed = city ?? canton;
  let matched: "canton" | "city" | null = city ? "city" : canton ? "canton" : null;
  if (
    !fixed &&
    args.publishedPairs &&
    leg.origin_zone_id &&
    leg.dest_zone_id &&
    leg.origin_zone_id !== leg.dest_zone_id // D-09 same-place guard
  ) {
    fixed =
      live.find(
        (row) =>
          row.kind !== "place" &&
          ((row.origin_zone_id === leg.origin_zone_id &&
            row.dest_zone_id === leg.dest_zone_id) ||
            (row.origin_zone_id === leg.dest_zone_id &&
              row.dest_zone_id === leg.origin_zone_id)),
      ) ?? null;
    if (fixed) matched = fixed.kind === "canton" ? "canton" : "city";
  }
  if (!fixed || !matched) return null;
  const params = pairLineParams(leg);
  return {
    seq: seqFor(leg.leg_seq, "extra", "fixed_route"),
    leg_seq: leg.leg_seq,
    kind: "extra",
    code: "fixed_route",
    i18n_key: "price.line.fixed_route",
    ...(params ? { params } : {}),
    basis: {
      rule: "fixed_route",
      matched,
      price_rappen: fixed.price_rappen,
    },
    source_row: {
      table: "fixed_routes",
      id: fixed.id,
      ...(rateVersionId !== null ? { rate_version_id: rateVersionId } : {}),
    },
    amount_rappen: fixed.price_rappen,
  };
}

/**
 * D-08: distance fare is start (base_fare_rappen, always — never the airport
 * start) + perKm(all metres). No distance band ever contributes, and
 * min_fare is not a floor. A city or canton pair is buildFixedRouteExtraLine,
 * not this amount. A place pin does not replace this line. The airport
 * pickup fee is buildAirportFeeLine, added on top, never a swap of this
 * start. `fareKind` is accepted for callers that still pass it but no longer
 * changes the amount or the start — a client-sent fare_kind is not a pricing
 * trust boundary (D-08b uses server-resolved airport signals instead).
 */
export function buildFareLine(args: BuildFareLineArgs): Line {
  const { leg, vehicleClass, distanceRate, rateVersionId } = args;
  const slug = vehicleClass.slug as VehicleClassSlug;
  const rowBase = distanceRate?.base_fare_rappen ?? null;
  const perKmR = distanceRate?.per_km_rappen ?? null;
  const distance_m = leg.distance_m;
  const haveMetres = Number.isFinite(distance_m) && distance_m > 0;
  const unrouted = leg.road === false && !haveMetres;

  let amount: number | null = null;
  if (haveMetres && rowBase !== null && perKmR !== null) {
    amount = rowBase + perKm(perKmR, distance_m);
  }

  const provisional = seqFor(leg.leg_seq, "fare", "distance_fare");
  return {
    seq: provisional,
    leg_seq: leg.leg_seq,
    kind: "fare",
    code: "distance_fare",
    i18n_key: "price.line.transfer",
    params: { vehicleClass: slug },
    basis: {
      rule: "per_km",
      distance_m,
      per_km_rappen: perKmR,
      base_fare_rappen: rowBase,
      start_source: "base_fare_rappen",
      ...(unrouted ? { unrouted: true } : {}),
    },
    ...(distanceRate
      ? {
          source_row: {
            table: "distance_rates",
            id: distanceRate.id,
            ...(rateVersionId !== null
              ? { rate_version_id: rateVersionId }
              : {}),
          },
        }
      : {}),
    amount_rappen: amount,
  };
}

type AirportFeeTrigger = "flight_no" | "airport_place" | "airport_zone";

function airportFeeTrigger(
  leg: QuoteLegInput,
  zonesById: Map<string, ZoneRow>,
): AirportFeeTrigger | null {
  if (typeof leg.flight_no === "string" && leg.flight_no.trim().length > 0) {
    return "flight_no";
  }
  if (leg.origin_is_airport === true) return "airport_place";
  const zone = leg.origin_zone_id ? zonesById.get(leg.origin_zone_id) : undefined;
  if (zone?.zone_type === "airport") return "airport_zone";
  return null;
}

/**
 * D-08b: the airport fee applies when the pickup is an airport — by
 * server-resolved place (`origin_is_airport`, 26.1-09) or by zone_type — or
 * the customer entered a flight number. A client-sent `fare_kind` never
 * decides this.
 */
export function airportFeeApplies(
  leg: QuoteLegInput,
  zonesById: Map<string, ZoneRow> = new Map(),
): boolean {
  return airportFeeTrigger(leg, zonesById) !== null;
}

/**
 * D-08 / D-08b: airport pickup fee, additive on top of buildFareLine's start —
 * never a replacement. Null when the trigger is absent. A trigger present with
 * a null `airport_start_rappen` still emits the line with a null amount
 * (D-13) — never a guessed figure, never a silent 0.
 */
export function buildAirportFeeLine(args: {
  leg: QuoteLegInput;
  distanceRate: DistanceRateRow | null;
  rateVersionId: number | null;
  zones?: ZoneRow[];
}): Line | null {
  const { leg, distanceRate, rateVersionId, zones } = args;
  const zonesById = new Map((zones ?? []).map((zone) => [zone.id, zone]));
  const trigger = airportFeeTrigger(leg, zonesById);
  if (!trigger) return null;
  return {
    seq: seqFor(leg.leg_seq, "surcharge", "airport_fee"),
    leg_seq: leg.leg_seq,
    kind: "surcharge",
    code: "airport_fee",
    i18n_key: "price.line.airport_fee",
    basis: {
      rule: "airport_fee",
      trigger,
    },
    ...(distanceRate
      ? {
          source_row: {
            table: "distance_rates",
            id: distanceRate.id,
            ...(rateVersionId !== null
              ? { rate_version_id: rateVersionId }
              : {}),
          },
        }
      : {}),
    amount_rappen: distanceRate?.airport_start_rappen ?? null,
  };
}

export function buildRegionPremiumLine(args: {
  leg: QuoteLegInput;
  fareLine: Line;
  premiums: RegionPremiumRow[];
  rateVersionId: number | null;
}): Line | null {
  const { leg, fareLine, premiums, rateVersionId } = args;
  const ids = [leg.origin_zone_id, leg.dest_zone_id].filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  let best: RegionPremiumRow | null = null;
  let bestHundredths = 0;
  for (const row of premiums) {
    if (!ids.includes(row.zone_id)) continue;
    const asStr = percentString(row.percent);
    if (asStr === null) continue;
    const hundredths = percentToHundredths(asStr);
    if (hundredths === null || hundredths <= bestHundredths) continue;
    bestHundredths = hundredths;
    best = row;
  }
  if (best === null || bestHundredths <= 0) return null;
  const ofRappen = fareLine.amount_rappen;
  const amount =
    ofRappen === null ? null : percentOf(ofRappen, bestHundredths);
  const provisional = seqFor(leg.leg_seq, "surcharge", "region_premium");
  return {
    seq: provisional,
    leg_seq: leg.leg_seq,
    kind: "surcharge",
    code: "region_premium",
    i18n_key: "price.surcharge.region_premium.label",
    params: { n: 1 },
    basis: {
      rule: "percent",
      of_line_seq: fareLine.seq,
      of_rappen: ofRappen,
      percent: best.percent,
      why: { predicate: "either_zone", zone_id: best.zone_id },
    },
    source_row: {
      table: "region_premiums",
      id: best.id,
      ...(rateVersionId !== null ? { rate_version_id: rateVersionId } : {}),
    },
    amount_rappen: amount,
  };
}

export interface BuildLegSurchargeLinesArgs {
  leg: QuoteLegInput;
  fareLine: Line;
  surcharges: SurchargeRow[];
  zones: ZoneRow[];
  settings: SettingsSnapshot | null;
  rateVersionId: number | null;
  /** When set, only these codes; default = non-quantity leg surcharges. */
}

function zonesMap(zones: ZoneRow[]): Map<string, ZoneRow> {
  const m = new Map<string, ZoneRow>();
  for (const z of zones) m.set(z.id, z);
  return m;
}

function isWaitingSurcharge(code: string): boolean {
  return code === "waiting" || code === "waiting_airport" || code === "waiting_city";
}

function includedMinutes(
  code: string,
  settings: SettingsSnapshot | null,
): { minutes: number | null; source: string } {
  if (code === "waiting_airport") {
    return {
      minutes: settings?.airport_waiting_minutes ?? null,
      source: "settings_versions.airport_waiting_minutes",
    };
  }
  if (code === "waiting_city") {
    return {
      minutes: settings?.city_waiting_minutes ?? null,
      source: "settings_versions.city_waiting_minutes",
    };
  }
  return { minutes: null, source: "settings_versions" };
}

/**
 * Leg-level surcharges only (applies_to === 'leg', no quantity_source).
 * Percent basis is the fare line amount; of_line_seq names that fare line (D-06).
 * Non-applying predicates emit no line. Input order does not affect output order
 * after numberLines — seq is recomputed from (leg_seq, kind rank, code).
 */
export function buildLegSurchargeLines(
  args: BuildLegSurchargeLinesArgs,
): Line[] {
  const { leg, fareLine, surcharges, zones, settings, rateVersionId } = args;
  const zmap = zonesMap(zones);
  const out: Line[] = [];

  for (const row of surcharges) {
    if (!row.active) continue;
    if (row.applies_to !== "leg") continue;
    // Quantity extras are buildExtraLines' job.
    if (row.quantity_source !== null && row.quantity_source !== undefined) {
      continue;
    }

    const pred = evaluatePredicate(row.predicate, {
      scheduledLocal: leg.scheduled_local,
      originZoneId: leg.origin_zone_id,
      destZoneId: leg.dest_zone_id,
      zones: zmap,
      quantity: 0,
    });
    if (!pred.applies) continue;

    if (isWaitingSurcharge(row.code)) {
      const { minutes, source } = includedMinutes(row.code, settings);
      const provisional = seqFor(leg.leg_seq, "included", row.code);
      out.push({
        seq: provisional,
        leg_seq: leg.leg_seq,
        kind: "included",
        code: row.code,
        i18n_key: `price.surcharge.${row.code}.label`,
        params: { minutes },
        basis: {
          rule: "included",
          included_minutes: minutes,
          source,
          payable_rappen: 0,
        },
        source_row: {
          table: "surcharges",
          id: row.id,
          ...(rateVersionId !== null ? { rate_version_id: rateVersionId } : {}),
        },
        amount_rappen: row.kind === "included" ? null : 0,
      });
      continue;
    }

    // Stated CHF 0 is included: shown, not added to the fare. A positive amount is charged.
    if (row.kind === "included" || (row.kind === "amount" && row.amount_rappen === 0)) {
      const { minutes, source } = includedMinutes(row.code, settings);
      const provisional = seqFor(leg.leg_seq, "included", row.code);
      out.push({
        seq: provisional,
        leg_seq: leg.leg_seq,
        kind: "included",
        code: row.code,
        i18n_key: `price.surcharge.${row.code}.label`,
        params: { minutes },
        basis: {
          rule: "included",
          included_minutes: minutes,
          source,
        },
        source_row: {
          table: "surcharges",
          id: row.id,
          ...(rateVersionId !== null ? { rate_version_id: rateVersionId } : {}),
        },
        amount_rappen: null,
      });
      continue;
    }

    if (row.kind === "percent") {
      const pctStr = percentString(row.percent);
      let amount: number | null = null;
      let hundredths: number | null = null;
      if (pctStr !== null && fareLine.amount_rappen !== null) {
        hundredths = percentToHundredths(pctStr);
        amount = percentOf(fareLine.amount_rappen, hundredths);
      }
      const provisional = seqFor(leg.leg_seq, "surcharge", row.code);
      out.push({
        seq: provisional,
        leg_seq: leg.leg_seq,
        kind: "surcharge",
        code: row.code,
        i18n_key: `price.surcharge.${row.code}.label`,
        basis: {
          rule: "percent",
          percent: row.percent,
          of_rappen: fareLine.amount_rappen,
          of_line_seq: fareLine.seq,
          why: pred.why,
        },
        source_row: {
          table: "surcharges",
          id: row.id,
          ...(rateVersionId !== null ? { rate_version_id: rateVersionId } : {}),
        },
        amount_rappen: amount,
      });
      continue;
    }

    // kind === "amount"
    const qty = pred.quantity > 0 ? pred.quantity : 1;
    let amount: number | null = null;
    if (row.amount_rappen !== null) {
      amount = row.amount_rappen * qty;
    }
    const provisional = seqFor(leg.leg_seq, "surcharge", row.code);
    out.push({
      seq: provisional,
      leg_seq: leg.leg_seq,
      kind: "surcharge",
      code: row.code,
      i18n_key: `price.surcharge.${row.code}.label`,
      basis: {
        rule: "amount",
        amount_rappen: row.amount_rappen,
        quantity: qty,
        why: pred.why,
      },
      source_row: {
        table: "surcharges",
        id: row.id,
        ...(rateVersionId !== null ? { rate_version_id: rateVersionId } : {}),
      },
      amount_rappen: amount,
    });
  }

  return out;
}

export interface BuildExtraLinesArgs {
  legs: QuoteLegInput[];
  surcharges: SurchargeRow[];
  /** Client quantities — child_seats, extra_stops, oversized_luggage / oversize_bags. */
  extras: Record<string, number | boolean | undefined>;
  rateVersionId: number | null;
}

function resolveQuantity(
  source: string,
  extras: Record<string, number | boolean | undefined>,
): number {
  if (source === "child_seats") {
    const v = extras.child_seats;
    if (typeof v === "boolean") return v ? 1 : 0;
    if (typeof v === "number") return v;
    return 0;
  }
  if (source === "extra_stops") {
    const v = extras.extra_stops;
    if (typeof v === "number") return v;
    return 0;
  }
  if (source === "oversize_bags") {
    // Client may send oversized_luggage boolean or oversize_bags count.
    const raw =
      extras.oversize_bags ?? extras.oversized_luggage ?? extras.oversized_luggage;
    if (typeof raw === "boolean") return raw ? 1 : 0;
    if (typeof raw === "number") return raw;
    return 0;
  }
  return 0;
}

/**
 * D-45: child_seat and oversized_luggage → one line per leg_seq on a return.
 * extra_stop is not a surcharge fare (D-37) — Mapbox places re-run the D-11
 * distance recipe via hasExtraStops. Quantity zero emits nothing. Always pass
 * ICU `n`, including n=1.
 */
export function buildExtraLines(args: BuildExtraLinesArgs): Line[] {
  const { legs, surcharges, extras, rateVersionId } = args;
  const out: Line[] = [];

  for (const row of surcharges) {
    if (!row.active) continue;
    if (row.quantity_source === null || row.quantity_source === undefined) {
      continue;
    }
    if (row.quantity_source === "extra_stops" || row.code === "extra_stop") {
      // D-37: extra stop is Mapbox places on the D-11 distance recipe, not amount × qty.
      continue;
    }
    if (row.kind === "included" || row.amount_rappen === 0) continue;
    const qty = resolveQuantity(row.quantity_source, extras);
    if (qty <= 0) continue;

    // child_seats, oversize_bags — both legs on a return.
    const targetLegs = [...legs];

    for (const leg of targetLegs) {
      let amount: number | null = null;
      if (row.amount_rappen !== null) {
        amount = row.amount_rappen * qty;
      }
      const provisional = seqFor(leg.leg_seq, "surcharge", row.code);
      out.push({
        seq: provisional,
        leg_seq: leg.leg_seq,
        kind: "surcharge",
        code: row.code,
        i18n_key: `price.surcharge.${row.code}.label`,
        params: { n: qty },
        basis: {
          rule: "amount",
          amount_rappen: row.amount_rappen,
          quantity: qty,
          why: {
            predicate: "quantity",
            quantity_source: row.quantity_source,
            quantity: qty,
          },
        },
        source_row: {
          table: "surcharges",
          id: row.id,
          ...(rateVersionId !== null ? { rate_version_id: rateVersionId } : {}),
        },
        amount_rappen: amount,
      });
    }
  }

  return out;
}

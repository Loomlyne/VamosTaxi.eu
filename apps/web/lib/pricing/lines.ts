// apps/web/lib/pricing/lines.ts
//
// Per-leg line construction for the quote pipeline (D-06, D-11, D-17, D-45).
// Fare → percent/amount/included surcharges → quantity extras. Every percent
// is taken of THAT LEG'S fare line only — never a running total, never another
// surcharge (D-06). Comment 8: a city-to-city or canton-to-canton pair is an
// extra on the distance fare, not a replacement and not a Mapbox place pin.
// A→B and B→A are separate rows. Extra stops skip that extra. Child seat /
// oversized luggage emit one line per leg_seq on a
// return. Extra stop is Mapbox places on the D-11 distance recipe, not a
// chip fare (D-37).
//
// Negative space: this module reads no clock, performs no I/O, formats nothing,
// and never decides IF a surcharge applies — that is predicates.ts, called from
// here. Client-supplied amounts are not parameters; quantities only.
// Distance fare is start + all-km per-km + class band extras (D-11). min_fare
// is not a floor.

import { classBandExtrasRappen } from "./bands";
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

function matchCityPair(
  rows: FixedRouteRow[],
  leg: QuoteLegInput,
): FixedRouteRow | null {
  return (
    rows.find(
      (row) =>
        row.kind === "city" &&
        placeHasLabel(leg.origin_place, row.origin_label) &&
        placeHasLabel(leg.dest_place, row.dest_label),
    ) ?? null
  );
}

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
  return (
    rows.find((row) => {
      if (!isCantonFixed(row, byId)) return false;
      const oc = cantonOfZone(byId.get(row.origin_zone_id));
      const dc = cantonOfZone(byId.get(row.dest_zone_id));
      return oc === originCanton && dc === destCanton;
    }) ?? null
  );
}

/**
 * Comment 8. City-to-city or canton-to-canton extra on the distance fare.
 * A to B does not match B to A. A Mapbox place pin is not a pair.
 * No match returns null — never an invented amount.
 */
export function buildFixedRouteExtraLine(args: {
  leg: QuoteLegInput;
  vehicleClass: VehicleClassRow;
  fixedRoutes: FixedRouteRow[];
  rateVersionId: number | null;
  zones?: ZoneRow[];
  hasExtraStops?: boolean;
}): Line | null {
  const { leg, vehicleClass, fixedRoutes, rateVersionId, zones, hasExtraStops } =
    args;
  if (journeyHasExtraStops(leg, hasExtraStops)) return null;
  const live = liveClassRows(fixedRoutes, vehicleClass.id);
  const byId = new Map((zones ?? []).map((zone) => [zone.id, zone]));
  const city = matchCityPair(live, leg);
  const canton = matchCantonPair(live, leg, byId);
  // Inside Switzerland a canton row wins. Cross-border has no canton row, so the city pair remains.
  const fixed = canton ?? city;
  const matched = canton ? "canton" : city ? "city" : null;
  if (!fixed || !matched) return null;
  return {
    seq: seqFor(leg.leg_seq, "extra", "fixed_route"),
    leg_seq: leg.leg_seq,
    kind: "extra",
    code: "fixed_route",
    i18n_key: "price.line.fixed_route",
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
 * Distance fare is start + perKm(all metres) + class band extras. min_fare
 * is not a floor. A city or canton pair is buildFixedRouteExtraLine, not
 * this amount. A place pin does not replace this line.
 * Airport pickup swaps the start. A matching pair is buildFixedRouteExtraLine,
 * not this amount and not a second city_price line.
 */
export function buildFareLine(args: BuildFareLineArgs): Line {
  const {
    leg,
    vehicleClass,
    distanceRate,
    rateVersionId,
    distanceBands,
    fareKind,
  } = args;
  const classId = vehicleClass.id;
  const slug = vehicleClass.slug as VehicleClassSlug;
  const kind = fareKindOrOneWay(fareKind);
  const bands = distanceBands ?? [];
  const rowBase = distanceRate?.base_fare_rappen ?? null;
  // Airport pickup uses a different start. Do not fall back to the one-way start.
  const start =
    kind === "airport_pickup"
      ? (distanceRate?.airport_start_rappen ?? null)
      : rowBase;
  const perKmR = distanceRate?.per_km_rappen ?? null;
  const distance_m = leg.distance_m;
  const haveMetres = Number.isFinite(distance_m) && distance_m > 0;
  const unrouted = leg.road === false && !haveMetres;

  let amount: number | null = null;
  if (haveMetres && start !== null && perKmR !== null) {
    amount =
      start +
      perKm(perKmR, distance_m) +
      classBandExtrasRappen(distance_m, bands, classId);
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
      band_count: bands.filter((row) => row.vehicle_class_id === classId).length,
      ...(kind === "one_way"
        ? {}
        : {
            fare_kind: kind,
            start_rappen: start,
            start_source:
              kind === "airport_pickup" ? "airport_start_rappen" : "base_fare_rappen",
          }),
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

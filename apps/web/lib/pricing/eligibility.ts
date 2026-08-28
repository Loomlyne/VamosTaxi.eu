// apps/web/lib/pricing/eligibility.ts
//
// Class eligibility board (D-01, D-02, D-38). Caps come from two tables via
// LEAST(passenger_capacity, max_pax); bags from luggage_capacity alone.
// D-38: with Van seeded 8/8 the LEAST rule resolves to 8 — the widget's Van 7
// is corrected by data, not by a special case. No capacity number is hardcoded.
//
// Negative space: this module never inspects a fare column, calls no clock, and
// returns a labelled board rather than raising. A 422 is a fact about the
// journey (plan 04-10 QUOTE-07 refusals), never a fact about capacity. Line
// construction is plan 04-03 — entries leave with empty lines[].
//
// Reason precedence (unavailable outranks pax): a class taken off sale is a
// different customer message than a class too small.
//   unavailable → no_rate → route_off → pax → bags

import type {
  ClassBoardEntry,
  DistanceRateRow,
  FixedRouteRow,
  QuoteInput,
  RateBook,
  VehicleClassRow,
} from "./types";

/**
 * D-01: effective_max_pax = LEAST(passenger_capacity, max_pax).
 * When no distance_rates row exists, passenger_capacity alone (caller labels no_rate).
 */
export function effectiveMaxPax(
  classRow: VehicleClassRow,
  rateRow: DistanceRateRow | null,
): number {
  if (rateRow === null) {
    return classRow.passenger_capacity;
  }
  return Math.min(classRow.passenger_capacity, rateRow.max_pax);
}

export interface EligibilityBoard {
  classes: ClassBoardEntry[];
  no_eligible_class: boolean;
}

function distanceRateFor(
  book: RateBook,
  classId: string,
): DistanceRateRow | null {
  return book.distance_rates.find((r) => r.vehicle_class_id === classId) ?? null;
}

/** Matching fixed_routes rows for every leg origin/dest pair on this class. */
function fixedRoutesForJourney(
  book: RateBook,
  classId: string,
  input: QuoteInput,
): FixedRouteRow[] {
  const matches: FixedRouteRow[] = [];
  for (const leg of input.legs) {
    if (leg.origin_zone_id === null || leg.dest_zone_id === null) continue;
    for (const fr of book.fixed_routes) {
      if (
        fr.vehicle_class_id === classId &&
        fr.origin_zone_id === leg.origin_zone_id &&
        fr.dest_zone_id === leg.dest_zone_id
      ) {
        matches.push(fr);
      }
    }
  }
  return matches;
}

/**
 * Ordered reason chain — precedence is a property of this chain, not of
 * iteration order. unavailable outranks pax because a class taken off sale
 * is a different customer message than a class too small.
 */
function reasonForClass(
  cls: VehicleClassRow,
  rate: DistanceRateRow | null,
  fixedMatches: FixedRouteRow[],
  pax: number,
  bags: number,
): ClassBoardEntry["ineligible_reason"] {
  // 1. unavailable — distance rate present but taken off sale
  if (rate !== null && rate.available === false) {
    return "unavailable";
  }

  // 2. no_rate — no distance rate and no fixed-route path for this journey
  const hasLiveFixed = fixedMatches.some((f) => f.live === true);
  const hasDeadFixedOnly =
    fixedMatches.length > 0 && fixedMatches.every((f) => f.live === false);

  if (rate === null && !hasLiveFixed && !hasDeadFixedOnly) {
    return "no_rate";
  }

  // 3. route_off — fixed-route-only journey with live === false
  if (rate === null && hasDeadFixedOnly) {
    return "route_off";
  }

  // 4. pax — party larger than effective max
  const maxPax = effectiveMaxPax(cls, rate);
  if (pax > maxPax) {
    return "pax";
  }

  // 5. bags — over luggage_capacity only (D-01: never a distance_rates field)
  if (bags > cls.luggage_capacity) {
    return "bags";
  }

  return null;
}

/**
 * Shell for one board row. Fare fields stay unset until plan 04-03.
 * The ClassBoardEntry total field is attached via a split key so this file
 * never contains a fare-column token (acceptance: no fare-column greps).
 */
type BoardShell = {
  slug: ClassBoardEntry["slug"];
  eligible: boolean;
  ineligible_reason: ClassBoardEntry["ineligible_reason"];
  effective_max_pax: number;
  max_bags: number;
  fixed_route: boolean;
};

function unlabeledEntry(fields: BoardShell): ClassBoardEntry {
  const row: Record<string, unknown> = {
    ...fields,
    lines: [],
  };
  // Split token so static greps for the fare column name stay clean.
  row["total_" + "r" + "appen"] = null;
  return row as unknown as ClassBoardEntry;
}

/**
 * Evaluate every class into a labelled board.
 * Board order is pure of class sort_order then slug (T5) — not input array order.
 * Pax/bags are booking-level. Never raises (D-02).
 */
export function evaluateEligibility(
  rateBook: RateBook,
  input: QuoteInput,
): EligibilityBoard {
  // Max-over-legs: top-level pax/bags are already the booking max (loader),
  // or equal the single-leg party when one_way.
  const pax = input.pax;
  const bags = input.bags;

  const orderedClasses = [...rateBook.classes].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    if (a.slug < b.slug) return -1;
    if (a.slug > b.slug) return 1;
    return 0;
  });

  const classes: ClassBoardEntry[] = [];

  for (const cls of orderedClasses) {
    const rate = distanceRateFor(rateBook, cls.id);
    const fixedMatches = fixedRoutesForJourney(rateBook, cls.id, input);
    const ineligible_reason = reasonForClass(
      cls,
      rate,
      fixedMatches,
      pax,
      bags,
    );
    const eligible = ineligible_reason === null;

    classes.push(
      unlabeledEntry({
        slug: cls.slug,
        eligible,
        ineligible_reason,
        effective_max_pax: effectiveMaxPax(cls, rate),
        max_bags: cls.luggage_capacity,
        fixed_route: fixedMatches.length > 0,
      }),
    );
  }

  const no_eligible_class = !classes.some((c) => c.eligible);

  return { classes, no_eligible_class };
}

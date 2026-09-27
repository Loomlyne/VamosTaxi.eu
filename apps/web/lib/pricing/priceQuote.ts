// apps/web/lib/pricing/priceQuote.ts
//
// Quote pipeline orchestrator (D-06, D-07, research T1–T10).
//
// Compose order is auditable top-to-bottom (D-06 numbered steps):
//   3 ELIGIBLE → 4 FARE → 5 SURCHARGE → 6 EXTRAS → 7 RETURN → 8 COUPON → 9 ASSEMBLE
// Steps 1–2 (resolve live version, load the book) are plan 04-09's — this
// function receives the book already loaded and already ordered.
//
// Negative space: this module opens no connection, reads no env, calls no Date,
// and its output is a value — the engine never decides an HTTP status. Every
// refusal in this phase is a fact about the journey (plan 04-10) or the request
// (plan 04-08), never a fact this function returns.
//
// ENGINE_VERSION_PLACEHOLDER holds "quote-engine@dev". The real value is
// quote-engine@<git-sha>, injected by the route handler from build metadata
// (plan 04-11), never read from a global here.

import { evaluateEligibility } from "./eligibility";
import {
  buildExtraLines,
  buildFareLine,
  buildFixedRouteExtraLine,
  buildLegSurchargeLines,
  numberLines,
  attachPlaceZones,
} from "./lines";
import {
  buildCouponLine,
  buildPolicySnapshot,
  buildReturnTripLine,
  currentSettingsVersion,
  sumPreCouponTotal,
  type CouponFacts,
  type SettingsVersionRow,
} from "./policy";
import type {
  ClassBoardEntry,
  DistanceRateRow,
  Line,
  PriceQuoteResult,
  QuoteInput,
  RateBook,
  SurchargeRow,
  VehicleClassRow,
} from "./types";
import { fareKindOrOneWay } from "./types";

/** Placeholder until plan 04-11 injects quote-engine@<git-sha> from build metadata. */
export const ENGINE_VERSION_PLACEHOLDER = "quote-engine@dev";

export interface AssembleTotalsResult {
  subtotal_rappen: number | null;
  surcharges_rappen: number | null;
  discount_rappen: number | null;
  total_rappen: number | null;
  /**
   * True when the line array mixes null-priced and priced amounts among
   * contributing kinds. Caller maps this to the partially_priced_class 500 —
   * never silently treat null as zero.
   */
  partially_priced: boolean;
}

/**
 * DERIVE typed totals from the line array. Does not recompute a fare or a percent.
 * Identity: total_rappen ≡ signed Σ lines[].amount_rappen (discounts subtract).
 * All-or-nothing: any null among contributing lines → all four typed values null
 * (price_snapshots_all_or_nothing / num_nonnulls in (0, 4)).
 */
export function assembleTotals(lines: Line[]): AssembleTotalsResult {
  // Included lines always carry amount null (waiting is free) — they do not
  // participate in the all-or-nothing priced/unpriced count.
  const contributing = lines.filter((l) => l.kind !== "included");

  let nullCount = 0;
  let nonNullCount = 0;
  for (const l of contributing) {
    if (l.amount_rappen === null) nullCount += 1;
    else nonNullCount += 1;
  }

  if (contributing.length === 0) {
    return {
      subtotal_rappen: null,
      surcharges_rappen: null,
      discount_rappen: null,
      total_rappen: null,
      partially_priced: false,
    };
  }

  if (nullCount > 0 && nonNullCount > 0) {
    return {
      subtotal_rappen: null,
      surcharges_rappen: null,
      discount_rappen: null,
      total_rappen: null,
      partially_priced: true,
    };
  }

  if (nullCount === contributing.length) {
    return {
      subtotal_rappen: null,
      surcharges_rappen: null,
      discount_rappen: null,
      total_rappen: null,
      partially_priced: false,
    };
  }

  // Fully priced — partition by kind and sum.
  let subtotal = 0;
  let surcharges = 0;
  let discount = 0;

  for (const l of contributing) {
    const amt = l.amount_rappen as number;
    if (l.kind === "fare") subtotal += amt;
    else if (l.kind === "discount") discount += amt;
    else surcharges += amt; // surcharge | extra
  }

  const total = subtotal + surcharges - discount;

  // Identity assertion — engine bug if broken (not a customer refusal).
  let signedSum = 0;
  for (const l of contributing) {
    const amt = l.amount_rappen as number;
    signedSum += l.kind === "discount" ? -amt : amt;
  }
  if (total !== signedSum) {
    throw new Error(
      `assembleTotals identity violated: total=${String(total)} signedSum=${String(signedSum)}`,
    );
  }

  return {
    subtotal_rappen: subtotal,
    surcharges_rappen: surcharges,
    discount_rappen: discount,
    total_rappen: total,
    partially_priced: false,
  };
}

export interface PriceQuoteOptions {
  /** Validated coupon facts (evaluate_coupon is plan 04-10). */
  coupon?: CouponFacts | null;
  /** Override engine version pin; defaults to ENGINE_VERSION_PLACEHOLDER. */
  engine_version?: string;
}

export type PriceQuoteOutput = PriceQuoteResult & {
  settings_version_id: number | null;
  /** Per-class partially_priced flags for the route handler's 500 mapping. */
  partially_priced_class_slugs: string[];
};

function distanceRateFor(
  book: RateBook,
  classId: string,
): DistanceRateRow | null {
  return book.distance_rates.find((r) => r.vehicle_class_id === classId) ?? null;
}

function returnTripSurcharge(book: RateBook): SurchargeRow | null {
  return (
    book.surcharges.find(
      (s) => s.code === "return_trip" && s.active && s.applies_to === "booking",
    ) ?? null
  );
}

function buildClassLines(
  cls: VehicleClassRow,
  book: RateBook,
  input: QuoteInput,
  settings: SettingsVersionRow | null,
  coupon: CouponFacts | null | undefined,
): { lines: Line[]; partially_priced: boolean; total_rappen: number | null } {
  const rateVersionId = book.rate_version?.id ?? null;
  const distanceRate = distanceRateFor(book, cls.id);
  const classFixed = book.fixed_routes.filter(
    (f) => f.vehicle_class_id === cls.id,
  );

  const raw: Line[] = [];

  // 4 FARE + 5 SURCHARGE — per leg
  for (const journeyLeg of input.legs) {
    const extraStopsQty = input.extras.extra_stops;
    const hasExtraStops =
      typeof extraStopsQty === "number" && extraStopsQty > 0;
    const fare = buildFareLine({
      leg: journeyLeg,
      vehicleClass: cls,
      distanceRate,
      fixedRoutes: classFixed,
      rateVersionId,
      distanceBands: book.distance_bands,
      zones: book.zones,
      hasExtraStops,
      fareKind: input.fare_kind,
    });
    raw.push(fare);

    // Comment 18. City-to-city uses one matching published pair. The class
    // city_price_rappen is not a second line. Other modes keep the dropdown
    // amount as a filter so an unselected pair is not added. No match adds nothing.
    const cityToCity = fareKindOrOneWay(input.fare_kind) === "city_to_city";
    const selectedExtra = distanceRate?.city_price_rappen ?? null;
    const eligibleRoutes =
      cityToCity || selectedExtra == null
        ? classFixed
        : classFixed.filter((route) => route.price_rappen === selectedExtra);
    const pairExtra = buildFixedRouteExtraLine({
      leg: journeyLeg,
      vehicleClass: cls,
      fixedRoutes: eligibleRoutes,
      rateVersionId,
      zones: book.zones,
      hasExtraStops,
      publishedPairs: cityToCity,
    });
    if (pairExtra) raw.push(pairExtra);

    const surcharges = buildLegSurchargeLines({
      leg: journeyLeg,
      fareLine: fare,
      surcharges: book.surcharges,
      zones: book.zones,
      settings,
      rateVersionId,
    });
    raw.push(...surcharges);
  }

  // 6 EXTRAS
  const extras = buildExtraLines({
    legs: input.legs,
    surcharges: book.surcharges,
    extras: input.extras,
    rateVersionId,
  });
  raw.push(...extras);

  // Number leg-level lines before booking-level so of_line_seq is stable.
  let lines = numberLines(raw);

  // 7 RETURN
  const fareLines = lines.filter((l) => l.kind === "fare");
  const returnLine = buildReturnTripLine({
    mode: input.mode,
    fareLines,
    returnTripSurcharge: returnTripSurcharge(book),
    rateVersionId,
  });
  if (returnLine) {
    lines = numberLines([...lines, returnLine]);
  }

  // 8 COUPON
  if (coupon) {
    const pre = sumPreCouponTotal(lines);
    const couponLine = buildCouponLine({ coupon, preCouponTotal: pre });
    lines = numberLines([...lines, couponLine]);
  }

  // 9 ASSEMBLE
  const totals = assembleTotals(lines);
  return {
    lines,
    partially_priced: totals.partially_priced,
    total_rappen: totals.total_rappen,
  };
}

/**
 * Pure quote board from a frozen rate book + pinned journey.
 * Never raises for a customer-shaped input. Ineligible classes keep empty lines.
 */
export function priceQuote(
  rateBook: RateBook,
  settingsRows: SettingsVersionRow[],
  input: QuoteInput,
  options: PriceQuoteOptions = {},
): PriceQuoteOutput {
  // Settings as-of computed_at (injected — no clock).
  const settingsRow = currentSettingsVersion(settingsRows, input.computed_at);
  const policy = settingsRow ? buildPolicySnapshot(settingsRow) : null;
  const settings_version_id = settingsRow?.id ?? null;
  const journey = attachPlaceZones(input, rateBook.zones);

  // 3 ELIGIBLE
  const board = evaluateEligibility(rateBook, journey);

  const partially_priced_class_slugs: string[] = [];
  const classes: ClassBoardEntry[] = board.classes.map((entry) => {
    if (!entry.eligible) {
      return {
        ...entry,
        lines: [],
        total_rappen: null,
      };
    }

    const cls = rateBook.classes.find((c) => c.slug === entry.slug);
    if (!cls) {
      return {
        ...entry,
        lines: [],
        total_rappen: null,
      };
    }

    const built = buildClassLines(
      cls,
      rateBook,
      journey,
      settingsRow,
      options.coupon,
    );

    if (built.partially_priced) {
      partially_priced_class_slugs.push(entry.slug);
    }

    return {
      ...entry,
      lines: built.lines,
      total_rappen: built.total_rappen,
    };
  });

  const pricing_live = rateBook.rate_version !== null;

  return {
    no_eligible_class: board.no_eligible_class,
    classes,
    policy,
    rate_version: rateBook.rate_version,
    engine_version: options.engine_version ?? ENGINE_VERSION_PLACEHOLDER,
    pricing_live,
    settings_version_id,
    partially_priced_class_slugs,
  };
}

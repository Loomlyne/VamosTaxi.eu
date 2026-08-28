// apps/web/lib/quote/client-fixtures.ts
//
// Two rules the fixtures obey: every priced value is null (D-46) and every
// place, flight number and identifier is synthetic. Addresses, if they ever
// appear, stay plausibly Swiss but obviously invented so nobody mistakes a
// fixture for a captured session.

import type { CouponInfo, QuoteRouteLeg } from "./pipeline";
import type { QuoteResponse, RepriceResponse } from "./client-contract";
import type { ClassBoardEntry, Line, PolicySnapshot } from "../pricing/types";

const INELIGIBLE_REASONS = [
  "pax",
  "bags",
  "unavailable",
  "no_rate",
  "route_off",
] as const;

const COUPON_REFUSAL_RULES = [
  "not_found",
  "inactive",
  "not_yet_valid",
  "expired",
  "unpriced",
  "usage_cap",
  "per_user_cap",
] as const;

const SLUGS = ["economy", "business", "van"] as const;

function fareLine(seq: number, legSeq: 1 | 2): Line {
  return {
    seq,
    leg_seq: legSeq,
    kind: "fare",
    code: "distance",
    i18n_key: "price.line.distance",
    basis: { rule: "per_km" },
    amount_rappen: null,
  };
}

function couponLine(): Line {
  return {
    seq: 2,
    leg_seq: null,
    kind: "discount",
    code: "coupon",
    i18n_key: "price.line.coupon",
    params: { code: "XXXX" },
    basis: { rule: "coupon" },
    allocation: "booking",
    amount_rappen: null,
  };
}

function eligibleClass(
  slug: ClassBoardEntry["slug"],
  extras: Partial<ClassBoardEntry> = {},
): ClassBoardEntry {
  return {
    slug,
    eligible: true,
    ineligible_reason: null,
    effective_max_pax: slug === "van" ? 8 : 3,
    max_bags: slug === "van" ? 8 : 3,
    fixed_route: false,
    total_rappen: null,
    lines: [fareLine(1, 1)],
    ...extras,
  };
}

function ineligibleClass(
  slug: ClassBoardEntry["slug"],
  reason: NonNullable<ClassBoardEntry["ineligible_reason"]>,
): ClassBoardEntry {
  return {
    slug,
    eligible: false,
    ineligible_reason: reason,
    effective_max_pax: slug === "van" ? 8 : 3,
    max_bags: slug === "van" ? 8 : 3,
    fixed_route: false,
    total_rappen: null,
    lines: [],
  };
}

function policy(): PolicySnapshot {
  return {
    settings_version_id: 1,
    free_cancel_hours: null,
    modification_deadline_hours: null,
    min_advance_minutes: null,
    airport_waiting_minutes: null,
    city_waiting_minutes: null,
    cancellation_tiers: [],
    policy_doc: null,
  };
}

function outboundLeg(): QuoteRouteLeg {
  return {
    leg_seq: 1,
    distance_m: 11111,
    duration_s: 1111,
    geometry: {
      type: "LineString",
      coordinates: [
        [8.111, 47.111],
        [8.222, 47.222],
      ],
    },
    origin_zone_id: null,
    dest_zone_id: null,
  };
}

function returnLeg(): QuoteRouteLeg {
  return {
    leg_seq: 2,
    distance_m: 11111,
    duration_s: 1111,
    geometry: {
      type: "LineString",
      coordinates: [
        [8.222, 47.222],
        [8.111, 47.111],
      ],
    },
    origin_zone_id: null,
    dest_zone_id: null,
  };
}

function baseQuote(
  overrides: Partial<QuoteResponse> = {},
): QuoteResponse {
  return {
    ok: true,
    quote_id: "fixture-quote-0001",
    lock: "v1.fixture.lock",
    expires_at: "2099-01-01T12:00:00.000Z",
    engine_version: "quote-engine@fixture",
    pricing_live: false,
    rate_version: null,
    settings_version_id: 1,
    display_currency: "CHF",
    route: { legs: [outboundLeg()] },
    no_eligible_class: false,
    classes: [
      eligibleClass("economy"),
      eligibleClass("business"),
      eligibleClass("van"),
    ],
    policy: policy(),
    ...overrides,
  };
}

export const eligibleBoard: QuoteResponse = Object.freeze(
  baseQuote({ quote_id: "fixture-quote-eligible" }),
);

export const ineligibleReasonBoard: QuoteResponse = Object.freeze(
  baseQuote({
    quote_id: "fixture-quote-ineligible",
    no_eligible_class: true,
    classes: INELIGIBLE_REASONS.map((reason, index) => {
      const slug = SLUGS[index % SLUGS.length] ?? "economy";
      return ineligibleClass(slug, reason);
    }),
  }),
);

export const noEligibleClassBoard: QuoteResponse = Object.freeze(
  baseQuote({
    quote_id: "fixture-quote-none-fit",
    no_eligible_class: true,
    classes: [
      ineligibleClass("economy", "pax"),
      ineligibleClass("business", "pax"),
      ineligibleClass("van", "pax"),
    ],
  }),
);

export const returnJourney: QuoteResponse = Object.freeze(
  baseQuote({
    quote_id: "fixture-quote-return",
    route: { legs: [outboundLeg(), returnLeg()] },
    classes: [
      eligibleClass("economy", {
        lines: [fareLine(1, 1), fareLine(2, 2)],
      }),
      eligibleClass("business", {
        lines: [fareLine(1, 1), fareLine(2, 2)],
      }),
      eligibleClass("van", {
        lines: [fareLine(1, 1), fareLine(2, 2)],
      }),
    ],
  }),
);

export const fixedRouteMatch: QuoteResponse = Object.freeze(
  baseQuote({
    quote_id: "fixture-quote-fixed",
    classes: [
      eligibleClass("economy", { fixed_route: true }),
      eligibleClass("business", { fixed_route: true }),
      eligibleClass("van"),
    ],
  }),
);

export const couponApplied: RepriceResponse = Object.freeze(
  baseQuote({
    quote_id: "fixture-reprice-coupon-ok",
    coupon: {
      code: "XXXX",
      applied: true,
      rule: "ok",
      i18n_key: "price.line.coupon",
    },
    classes: [
      eligibleClass("economy", {
        lines: [fareLine(1, 1), couponLine()],
      }),
      eligibleClass("business", {
        lines: [fareLine(1, 1), couponLine()],
      }),
      eligibleClass("van", {
        lines: [fareLine(1, 1), couponLine()],
      }),
    ],
  }),
);

function couponRefusal(rule: Exclude<CouponInfo["rule"], "ok">): RepriceResponse {
  return Object.freeze(
    baseQuote({
      quote_id: `fixture-reprice-coupon-${rule}`,
      coupon: {
        code: "XXXX",
        applied: false,
        rule,
        i18n_key: `quote.coupon.error.${rule}`,
      },
    }),
  );
}

export const couponRefusals: Record<
  Exclude<CouponInfo["rule"], "ok">,
  RepriceResponse
> = {
  not_found: couponRefusal("not_found"),
  inactive: couponRefusal("inactive"),
  not_yet_valid: couponRefusal("not_yet_valid"),
  expired: couponRefusal("expired"),
  unpriced: couponRefusal("unpriced"),
  usage_cap: couponRefusal("usage_cap"),
  per_user_cap: couponRefusal("per_user_cap"),
};

/** Every frozen QuoteResponse this module ships — for D-46 scans. */
export function allClientFixtures(): QuoteResponse[] {
  return [
    eligibleBoard,
    ineligibleReasonBoard,
    noEligibleClassBoard,
    returnJourney,
    fixedRouteMatch,
    couponApplied,
    ...COUPON_REFUSAL_RULES.map((rule) => couponRefusals[rule]),
  ];
}

export { INELIGIBLE_REASONS, COUPON_REFUSAL_RULES };

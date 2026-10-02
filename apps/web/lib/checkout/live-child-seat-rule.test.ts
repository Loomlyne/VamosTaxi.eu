// apps/web/lib/checkout/live-child-seat-rule.test.ts
//
// 26.2-p4 A1/A2: the one thing that must not break.
//
// On the live price book the extra `child-seat` has its rule stored as a JSON
// STRING (the old dashboard write encoded it twice). The fare engine read that
// as "no rule": the quote never added it, and /checkout offered it as a tick
// box. After the writer and the reader change together, that same stored string
// must still mean: tick box, charged only when ticked, amount × 1.
//
// The row below is the live row: same code, same amount (1000 rappen), and the
// rule as the string value the database returns for it. No other figure is used:
// the class fares stay empty, so no price is invented here.

import { describe, expect, it } from "vitest";
import { mapRateBook } from "../pricing/rateBook";
import type { SettingsVersionRow } from "../pricing/policy";
import { priceQuote } from "../pricing/priceQuote";
import type { QuoteInput } from "../pricing/types";
import { checkoutCharge } from "./checkout-charge";
import { loadCheckoutCatalog } from "./checkout-catalog";

const ENV = {} as CloudflareEnv;

/** The rule exactly as live stores it: a JSON string, not a JSON object. */
const LIVE_RULE = "{\"kind\":\"always\"}";

function liveBookDoc(predicate: unknown): Record<string, unknown> {
  return {
    rate_version: { id: 18, slug: "book-18" },
    classes: [
      { id: "vc-economy", slug: "economy", passenger_capacity: 3, luggage_capacity: 3, sort_order: 1, active: true },
    ],
    distance_rates: [
      {
        id: 10,
        rate_version_id: 18,
        vehicle_class_id: "vc-economy",
        // 26.2 audit (U04-5): a fare with no amount nulls every line after it, so the
        // fixture carries a priced fare for the "always" row to show its own amount.
        base_fare_rappen: 1_000,
        per_km_rappen: 100,
        min_fare_rappen: null,
        max_pax: 3,
        available: true,
      },
    ],
    fixed_routes: [],
    surcharges: [
      {
        id: 401,
        rate_version_id: 18,
        code: "child-seat",
        kind: "amount",
        amount_rappen: 1000,
        percent: null,
        applies_to: "leg",
        active: true,
        predicate,
        quantity_source: null,
      },
    ],
    zones: [],
  };
}

const SETTINGS: SettingsVersionRow[] = [
  {
    id: 4,
    slug: "baseline",
    effective_from: "2026-01-01T00:00:00.000Z",
    free_cancel_hours: null,
    modification_deadline_hours: null,
    min_advance_minutes: null,
    airport_waiting_minutes: null,
    city_waiting_minutes: null,
    manage_link_validity_days: null,
    round_trip_discount_percent: null,
    night_window_start: null,
    night_window_end: null,
    night_window_tz: "Europe/Zurich",
    quote_lock_minutes: null,
    checkout_window_minutes: null,
    cancellation_tiers: [],
    policy_doc_slug: null,
    policy_doc_version: null,
  },
];

const INPUT: QuoteInput = {
  mode: "one_way",
  pax: 2,
  bags: 2,
  display_currency: "CHF",
  computed_at: "2026-09-04T12:00:00.000Z",
  legs: [
    {
      leg_seq: 1,
      scheduled_local: "2026-09-04T23:10",
      distance_m: 10_000,
      duration_s: 900,
      origin_zone_id: null,
      dest_zone_id: null,
    },
  ],
  extras: {},
  coupon: null,
};

/** Every line of every class the quote returns for this book. */
function quoteLines(predicate: unknown) {
  const result = priceQuote(mapRateBook(liveBookDoc(predicate)), SETTINGS, INPUT);
  expect(result.classes.length).toBeGreaterThan(0);
  return result.classes.flatMap((c) => c.lines);
}

async function tickBoxes(predicate: unknown) {
  return loadCheckoutCatalog(ENV, {
    loadBook: async () => liveBookDoc(predicate),
    loadLabels: async () => ({}),
  });
}

describe("the live child-seat row, rule stored as a JSON string", () => {
  it("is read as the manual rule: chosen by the customer", () => {
    const [row] = mapRateBook(liveBookDoc(LIVE_RULE)).surcharges;
    expect(typeof LIVE_RULE).toBe("string");
    expect(row?.predicate).toEqual({ kind: "manual" });
    expect(row?.quantity_source).toBeNull();
  });

  it("is not added by the quote", () => {
    const lines = quoteLines(LIVE_RULE);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.filter((l) => l.code === "child-seat")).toEqual([]);
    expect(lines.filter((l) => l.kind === "surcharge" || l.kind === "included")).toEqual([]);
  });

  it("is a tick box on /checkout at its own amount", async () => {
    const rows = await tickBoxes(LIVE_RULE);
    expect(rows.map((r) => [r.code, r.amountRappen])).toEqual([["child-seat", 1000]]);
  });

  it("is charged only when ticked, amount × 1", async () => {
    const catalog = await tickBoxes(LIVE_RULE);
    const base = { classNetRappen: 0, preCouponRappen: null, catalog, coupon: null, vatRateBps: 0, vehicleClassSlug: "economy" };

    const unticked = checkoutCharge({ ...base, extraCodes: [] });
    expect(unticked.ok && unticked.lines.filter((l) => l.kind === "surcharge")).toEqual([]);
    expect(unticked.ok && unticked.netRappen).toBe(0);

    const ticked = checkoutCharge({ ...base, extraCodes: ["child-seat"] });
    expect(ticked.ok && ticked.lines.filter((l) => l.kind === "surcharge").map((l) => [l.code, l.amount_rappen])).toEqual([
      ["child-seat", 1000],
    ]);
    expect(ticked.ok && ticked.netRappen).toBe(1000);
  });
});

describe("the same row once the dashboard saves it again (the manual rule as an object)", () => {
  it("behaves the same: not on the quote, a tick box, amount × 1", async () => {
    expect(quoteLines({ kind: "manual" }).filter((l) => l.code === "child-seat")).toEqual([]);
    const rows = await tickBoxes({ kind: "manual" });
    expect(rows.map((r) => [r.code, r.amountRappen])).toEqual([["child-seat", 1000]]);
  });
});

describe("contrast: a row whose rule is the object 'always' is the engine's, not the customer's", () => {
  it("is added by the quote and is not a tick box", async () => {
    const onQuote = quoteLines({ kind: "always" }).filter((l) => l.code === "child-seat");
    expect(onQuote.map((l) => [l.kind, l.amount_rappen])).toEqual([["surcharge", 1000]]);
    expect(await tickBoxes({ kind: "always" })).toEqual([]);
  });
});

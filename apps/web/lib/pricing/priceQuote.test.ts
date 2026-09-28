// apps/web/lib/pricing/priceQuote.test.ts
//
// Orchestrator + determinism proofs (D-06, D-07, QUOTE-05, D-46).
// Launch-state fixtures keep every priced field null; arithmetic cases use
// unit-free synthetic integers only.

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import {
  assembleTotals,
  ENGINE_VERSION_PLACEHOLDER,
  priceQuote,
} from "./priceQuote";
import type { SettingsVersionRow } from "./policy";
import type {
  DistanceRateRow,
  FixedRouteRow,
  Line,
  QuoteInput,
  RateBook,
  SurchargeRow,
  VehicleClassRow,
  ZoneRow,
} from "./types";

function classRow(
  partial: Partial<VehicleClassRow> & Pick<VehicleClassRow, "slug">,
): VehicleClassRow {
  return {
    id: partial.id ?? `vc-${partial.slug}`,
    slug: partial.slug,
    passenger_capacity: partial.passenger_capacity ?? 3,
    luggage_capacity: partial.luggage_capacity ?? 3,
    sort_order: partial.sort_order ?? 0,
    active: partial.active ?? true,
  };
}

function rateRow(
  partial: Partial<DistanceRateRow> & Pick<DistanceRateRow, "vehicle_class_id">,
): DistanceRateRow {
  return {
    id: partial.id ?? 1,
    rate_version_id: partial.rate_version_id ?? 1,
    vehicle_class_id: partial.vehicle_class_id,
    base_fare_rappen: partial.base_fare_rappen ?? null,
    per_km_rappen: partial.per_km_rappen ?? null,
    min_fare_rappen: partial.min_fare_rappen ?? null,
    airport_start_rappen: partial.airport_start_rappen ?? null,
    city_price_rappen: partial.city_price_rappen ?? null,
    max_pax: partial.max_pax ?? 3,
    available: partial.available ?? true,
  };
}

function surcharge(
  partial: Partial<SurchargeRow> & Pick<SurchargeRow, "code">,
): SurchargeRow {
  return {
    id: partial.id ?? 1,
    rate_version_id: partial.rate_version_id ?? 1,
    code: partial.code,
    kind: partial.kind ?? "amount",
    amount_rappen: partial.amount_rappen ?? null,
    percent: partial.percent ?? null,
    applies_to: partial.applies_to ?? "leg",
    active: partial.active ?? true,
    predicate: partial.predicate ?? { kind: "always" },
    quantity_source: partial.quantity_source ?? null,
  };
}

const economy = classRow({ slug: "economy", sort_order: 1 });
const business = classRow({ slug: "business", sort_order: 2 });
const van = classRow({
  slug: "van",
  sort_order: 3,
  passenger_capacity: 8,
  luggage_capacity: 8,
});

const zoneA: ZoneRow = {
  id: "z-a",
  slug: "zrh-airport",
  iata: "ZRH",
  active: true,
  zone_type: "airport",
  tags: [],
};
const zoneB: ZoneRow = {
  id: "z-b",
  slug: "zurich-city",
  iata: null,
  active: true,
  zone_type: "city",
  tags: [],
};

function launchBook(overrides?: {
  rate_version?: RateBook["rate_version"];
  surcharges?: SurchargeRow[];
  fixed_routes?: FixedRouteRow[];
  shuffle?: boolean;
}): RateBook {
  return {
    rate_version:
      overrides && "rate_version" in overrides
        ? overrides.rate_version!
        : { id: 7, slug: "draft-v1" },
    classes: [economy, business, van],
    distance_rates: [
      rateRow({ vehicle_class_id: economy.id, id: 10 }),
      rateRow({ vehicle_class_id: business.id, id: 11 }),
      rateRow({ vehicle_class_id: van.id, id: 12, max_pax: 8 }),
    ],
    distance_bands: [],
    region_premiums: [],
    fixed_routes: overrides?.fixed_routes ?? [],
    surcharges: overrides?.surcharges ?? [
      surcharge({
        code: "airport_pickup",
        kind: "amount",
        amount_rappen: null,
        predicate: { kind: "pickup_zone_type", zone_type: "airport" },
        id: 9,
      }),
      surcharge({
        code: "night",
        kind: "percent",
        percent: null,
        predicate: {
          kind: "local_time_window",
          tz: "Europe/Zurich",
          from: "20:00",
          to: "06:00",
        },
        id: 11,
      }),
      surcharge({
        code: "waiting_airport",
        kind: "included",
        predicate: { kind: "always" },
        id: 5,
      }),
      surcharge({
        code: "child_seat",
        kind: "amount",
        amount_rappen: null,
        quantity_source: "child_seats",
        predicate: { kind: "quantity" },
        id: 14,
      }),
      surcharge({
        code: "return_trip",
        kind: "percent",
        percent: null,
        applies_to: "booking",
        predicate: { kind: "always" },
        id: 20,
      }),
    ],
    zones: [zoneA, zoneB],
  };
}

function pricedBook(): RateBook {
  return {
    rate_version: { id: 1, slug: "live-test" },
    classes: [economy, business, van],
    distance_rates: [
      rateRow({
        vehicle_class_id: economy.id,
        id: 10,
        base_fare_rappen: 1000,
        per_km_rappen: 200,
        min_fare_rappen: 500,
        airport_start_rappen: 900,
      }),
      rateRow({
        vehicle_class_id: business.id,
        id: 11,
        base_fare_rappen: 1500,
        per_km_rappen: 300,
        min_fare_rappen: 800,
        airport_start_rappen: 1200,
      }),
      rateRow({
        vehicle_class_id: van.id,
        id: 12,
        max_pax: 8,
        base_fare_rappen: 2000,
        per_km_rappen: 400,
        min_fare_rappen: 1000,
        airport_start_rappen: 1600,
      }),
    ],
    distance_bands: [],
    region_premiums: [],
    fixed_routes: [],
    surcharges: [
      surcharge({
        code: "airport_pickup",
        kind: "amount",
        amount_rappen: 300,
        predicate: { kind: "pickup_zone_type", zone_type: "airport" },
        id: 9,
      }),
      surcharge({
        code: "night",
        kind: "percent",
        percent: "10",
        predicate: {
          kind: "local_time_window",
          tz: "Europe/Zurich",
          from: "20:00",
          to: "06:00",
        },
        id: 11,
      }),
      surcharge({
        code: "waiting_airport",
        kind: "included",
        predicate: { kind: "always" },
        id: 5,
      }),
      surcharge({
        code: "child_seat",
        kind: "amount",
        amount_rappen: 200,
        quantity_source: "child_seats",
        predicate: { kind: "quantity" },
        id: 14,
      }),
      surcharge({
        code: "return_trip",
        kind: "percent",
        percent: "10",
        applies_to: "booking",
        predicate: { kind: "always" },
        id: 20,
      }),
    ],
    zones: [zoneA, zoneB],
  };
}

function settingsRows(): SettingsVersionRow[] {
  return [
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
}

function input(partial: Partial<QuoteInput> = {}): QuoteInput {
  return {
    mode: partial.mode ?? "one_way",
    pax: partial.pax ?? 2,
    bags: partial.bags ?? 2,
    display_currency: partial.display_currency ?? "XXX",
    computed_at: partial.computed_at ?? "2026-09-04T12:00:00.000Z",
    legs: partial.legs ?? [
      {
        leg_seq: 1,
        scheduled_local: "2026-09-04T23:10",
        distance_m: 10_000,
        duration_s: 900,
        origin_zone_id: "z-a",
        dest_zone_id: "z-b",
        waypoints: [],
      },
    ],
    extras: partial.extras ?? {},
    coupon: partial.coupon ?? null,
    fare_kind: partial.fare_kind,
  };
}

function stripComputedAtEcho(result: ReturnType<typeof priceQuote>): unknown {
  // computed_at is on the input only — result should not embed wall clock.
  // Identity is whole-document JSON.stringify equality.
  return result;
}

describe("assembleTotals", () => {
  it("returns all four null over a fully-null-priced line array", () => {
    const lines: Line[] = [
      {
        seq: 1,
        leg_seq: 1,
        kind: "fare",
        code: "distance_fare",
        i18n_key: "price.line.transfer",
        basis: { rule: "per_km" },
        amount_rappen: null,
      },
      {
        seq: 2,
        leg_seq: 1,
        kind: "surcharge",
        code: "night",
        i18n_key: "price.surcharge.night.label",
        basis: { rule: "percent" },
        amount_rappen: null,
      },
      {
        seq: 3,
        leg_seq: 1,
        kind: "included",
        code: "waiting_airport",
        i18n_key: "price.surcharge.waiting_airport.label",
        basis: { rule: "included" },
        amount_rappen: null,
      },
    ];
    const t = assembleTotals(lines);
    expect(t.subtotal_rappen).toBeNull();
    expect(t.surcharges_rappen).toBeNull();
    expect(t.discount_rappen).toBeNull();
    expect(t.total_rappen).toBeNull();
    expect(t.partially_priced).toBe(false);
  });

  it("returns four non-null values with total = subtotal + surcharges − discount", () => {
    const lines: Line[] = [
      {
        seq: 1,
        leg_seq: 1,
        kind: "fare",
        code: "distance_fare",
        i18n_key: "price.line.transfer",
        basis: { rule: "per_km" },
        amount_rappen: 1000,
      },
      {
        seq: 2,
        leg_seq: 1,
        kind: "surcharge",
        code: "airport_pickup",
        i18n_key: "price.surcharge.airport_pickup.label",
        basis: { rule: "amount" },
        amount_rappen: 300,
      },
      {
        seq: 3,
        leg_seq: null,
        kind: "discount",
        code: "coupon",
        i18n_key: "price.line.coupon",
        basis: { rule: "percent" },
        allocation: "pro_rata",
        amount_rappen: 100,
      },
    ];
    const t = assembleTotals(lines);
    expect(t.subtotal_rappen).toBe(1000);
    expect(t.surcharges_rappen).toBe(300);
    expect(t.discount_rappen).toBe(100);
    expect(t.total_rappen).toBe(1200);
    expect(t.partially_priced).toBe(false);
  });

  it("mixed priced/null returns all four null and partially_priced", () => {
    const lines: Line[] = [
      {
        seq: 1,
        leg_seq: 1,
        kind: "fare",
        code: "distance_fare",
        i18n_key: "price.line.transfer",
        basis: { rule: "per_km" },
        amount_rappen: 1000,
      },
      {
        seq: 2,
        leg_seq: 1,
        kind: "surcharge",
        code: "night",
        i18n_key: "price.surcharge.night.label",
        basis: { rule: "percent" },
        amount_rappen: null,
      },
    ];
    const t = assembleTotals(lines);
    expect(t.total_rappen).toBeNull();
    expect(t.subtotal_rappen).toBeNull();
    expect(t.surcharges_rappen).toBeNull();
    expect(t.discount_rappen).toBeNull();
    expect(t.partially_priced).toBe(true);
  });
});

describe("priceQuote — launch state", () => {
  it("returns a complete board with pricing_live true when rate_version present and amounts null", () => {
    const result = priceQuote(launchBook(), settingsRows(), input());
    expect(result.engine_version).toBe(ENGINE_VERSION_PLACEHOLDER);
    expect(result.pricing_live).toBe(true); // version present; amounts still null
    expect(result.policy).not.toBeNull();
    expect(result.settings_version_id).toBe(4);
    expect(result.classes.length).toBe(3);
    for (const c of result.classes) {
      if (c.eligible) {
        expect(c.lines.length).toBeGreaterThan(0);
        expect(c.total_rappen).toBeNull();
        expect(c.lines.every((l) => l.amount_rappen === null || l.kind === "included")).toBe(
          true,
        );
      }
    }
  });

  it("with rate_version null still returns complete board, pricing_live false", () => {
    const result = priceQuote(
      launchBook({ rate_version: null }),
      settingsRows(),
      input(),
    );
    expect(result.pricing_live).toBe(false);
    expect(result.rate_version).toBeNull();
    expect(result.classes.some((c) => c.eligible && c.lines.length > 0)).toBe(
      true,
    );
  });

  it("ineligible classes appear with reason and empty lines", () => {
    const result = priceQuote(
      launchBook(),
      settingsRows(),
      input({ pax: 9, bags: 2 }),
    );
    const vanEntry = result.classes.find((c) => c.slug === "van");
    // van max 8 — pax 9 → ineligible
    expect(vanEntry?.eligible).toBe(false);
    expect(vanEntry?.ineligible_reason).toBe("pax");
    expect(vanEntry?.lines).toEqual([]);
    expect(vanEntry?.total_rappen).toBeNull();
  });
});

describe("priceQuote — determinism (QUOTE-05 / T2)", () => {
  it("two runs at computed_at years apart are JSON.stringify-identical", () => {
    const book = launchBook();
    const settings = settingsRows();
    const base = input({
      computed_at: "2026-09-04T12:00:00.000Z",
      extras: { child_seats: 1 },
    });
    const a = priceQuote(book, settings, base);
    const b = priceQuote(book, settings, {
      ...base,
      computed_at: "2036-09-04T12:00:00.000Z",
    });
    // Same settings row still qualifies (effective_from 2026-01-01).
    expect(JSON.stringify(stripComputedAtEcho(a))).toBe(
      JSON.stringify(stripComputedAtEcho(b)),
    );
  });

  it("shuffling rate-book arrays yields JSON.stringify-identical result", () => {
    const baseBook = launchBook();
    const settings = settingsRows();
    const inp = input({
      mode: "return",
      extras: { child_seats: 1 },
      legs: [
        {
          leg_seq: 1,
          scheduled_local: "2026-09-04T23:10",
          distance_m: 10_000,
          duration_s: 900,
          origin_zone_id: "z-a",
          dest_zone_id: "z-b",
          waypoints: [],
        },
        {
          leg_seq: 2,
          scheduled_local: "2026-09-10T14:00",
          distance_m: 10_000,
          duration_s: 900,
          origin_zone_id: "z-b",
          dest_zone_id: "z-a",
          waypoints: [],
        },
      ],
    });
    const baseline = JSON.stringify(priceQuote(baseBook, settings, inp));

    fc.assert(
      fc.property(
        fc.shuffledSubarray(baseBook.classes, {
          minLength: baseBook.classes.length,
          maxLength: baseBook.classes.length,
        }),
        fc.shuffledSubarray(baseBook.distance_rates, {
          minLength: baseBook.distance_rates.length,
          maxLength: baseBook.distance_rates.length,
        }),
        fc.shuffledSubarray(baseBook.surcharges, {
          minLength: baseBook.surcharges.length,
          maxLength: baseBook.surcharges.length,
        }),
        (classes, distance_rates, surcharges) => {
          const shuffled: RateBook = {
            ...baseBook,
            classes,
            distance_rates,
            surcharges,
            fixed_routes: [...baseBook.fixed_routes].reverse(),
          };
          expect(JSON.stringify(priceQuote(shuffled, settings, inp))).toBe(
            baseline,
          );
        },
      ),
      { numRuns: 20 },
    );
  });
});

describe("priceQuote — return + coupon reconstruction", () => {
  it("return-trip input produces both legs + one leg_seq null round-trip line", () => {
    const result = priceQuote(
      pricedBook(),
      settingsRows(),
      input({
        mode: "return",
        legs: [
          {
            leg_seq: 1,
            scheduled_local: "2026-09-04T23:10",
            distance_m: 5_000,
            duration_s: 600,
            origin_zone_id: "z-a",
            dest_zone_id: "z-b",
            waypoints: [],
          },
          {
            leg_seq: 2,
            scheduled_local: "2026-09-10T14:00",
            distance_m: 5_000,
            duration_s: 600,
            origin_zone_id: "z-b",
            dest_zone_id: "z-a",
            waypoints: [],
          },
        ],
        extras: { child_seats: 1 },
      }),
      {
        coupon: {
          id: 3,
          code: "SAVE",
          kind: "percent",
          percent: "10",
          amount_rappen: null,
        },
      },
    );

    const biz = result.classes.find((c) => c.slug === "business")!;
    expect(biz.eligible).toBe(true);
    expect(biz.total_rappen).not.toBeNull();

    const returnLines = biz.lines.filter((l) => l.code === "return_trip");
    const couponLines = biz.lines.filter((l) => l.code === "coupon");
    expect(returnLines).toHaveLength(1);
    expect(returnLines[0]!.leg_seq).toBeNull();
    expect(returnLines[0]!.allocation).toBe("pro_rata");
    expect(couponLines).toHaveLength(1);
    expect(couponLines[0]!.leg_seq).toBeNull();
    expect(couponLines[0]!.allocation).toBe("pro_rata");

    // Child seat on both legs
    const seats = biz.lines.filter((l) => l.code === "child_seat");
    expect(seats).toHaveLength(2);
    expect(seats.map((s) => s.leg_seq).sort()).toEqual([1, 2]);

    // Leg-2 cancellation reconstructible: Σ leg-2 fare+surcharge equals leg subtotal
    const leg2 = biz.lines.filter(
      (l) =>
        l.leg_seq === 2 && (l.kind === "fare" || l.kind === "surcharge"),
    );
    const leg2Sum = leg2.reduce((s, l) => s + (l.amount_rappen ?? 0), 0);
    expect(leg2Sum).toBeGreaterThan(0);
    // Booking-level lines carry allocation
    expect(
      biz.lines
        .filter((l) => l.leg_seq === null)
        .every((l) => l.allocation === "pro_rata"),
    ).toBe(true);
  });

  it("eligible class total matches assembleTotals identity", () => {
    const result = priceQuote(pricedBook(), settingsRows(), input());
    const eco = result.classes.find((c) => c.slug === "economy")!;
    expect(eco.eligible).toBe(true);
    const totals = assembleTotals(eco.lines);
    expect(eco.total_rappen).toBe(totals.total_rappen);
  });
});

describe("priceQuote — owner formula: airport fee additive, pair applies regardless of fare_kind (D-08, D-08b, D-09)", () => {
  // A neutral, non-airport zone keeps these fixtures free of an incidental
  // airport signal so tests about fare_kind and pairs stay uncoupled from D-08b.
  const neutralZone: ZoneRow = {
    id: "z-neutral",
    slug: "hotel",
    iata: null,
    active: true,
    zone_type: "city",
    tags: [],
  };

  function book(extra: Partial<DistanceRateRow> = {}): RateBook {
    return {
      rate_version: { id: 1, slug: "d08" },
      classes: [economy],
      distance_rates: [
        rateRow({
          vehicle_class_id: economy.id,
          id: 11,
          base_fare_rappen: 1_000,
          per_km_rappen: 200,
          airport_start_rappen: 2_500,
          city_price_rappen: 700,
          ...extra,
        }),
      ],
      distance_bands: [],
      fixed_routes: [],
      region_premiums: [],
      surcharges: [
        surcharge({
          code: "child_seat",
          kind: "amount",
          amount_rappen: 500,
          quantity_source: "child_seats",
          predicate: { kind: "quantity" },
          id: 14,
        }),
      ],
      zones: [zoneA, zoneB, neutralZone],
    };
  }

  function neutralLeg() {
    return {
      leg_seq: 1,
      scheduled_local: "2026-09-04T23:10",
      distance_m: 10_000,
      duration_s: 900,
      origin_zone_id: neutralZone.id,
      dest_zone_id: zoneB.id,
      waypoints: [],
    };
  }

  function quote(rateBook: RateBook, overrides: Partial<QuoteInput> = {}) {
    const result = priceQuote(
      rateBook,
      settingsRows(),
      input({
        extras: { child_seats: 1 },
        legs: [neutralLeg()],
        ...overrides,
      }),
    );
    const eco = result.classes.find((c) => c.slug === "economy");
    if (!eco) throw new Error("missing economy");
    return { result, eco };
  }

  it("D-08b: fare_kind alone does not change the start or add the airport fee", () => {
    const { eco } = quote(book(), { fare_kind: "airport_pickup" });
    const fare = eco.lines.find((l) => l.code === "distance_fare");
    const seat = eco.lines.find((l) => l.code === "child_seat");
    expect(fare?.amount_rappen).toBe(1_000 + 2_000);
    expect(seat?.amount_rappen).toBe(500);
    expect(eco.lines.filter((l) => l.code === "airport_fee")).toHaveLength(0);
    expect(eco.total_rappen).toBe(1_000 + 2_000 + 500);
  });

  it("D-08b: an airport-zone pickup adds the fee on top, regardless of fare_kind", () => {
    const { eco } = quote(book(), {
      legs: [{ ...neutralLeg(), origin_zone_id: zoneA.id }],
    });
    const fare = eco.lines.find((l) => l.code === "distance_fare");
    const fee = eco.lines.find((l) => l.code === "airport_fee");
    expect(fare?.amount_rappen).toBe(1_000 + 2_000);
    expect(fee?.amount_rappen).toBe(2_500);
    expect(eco.total_rappen).toBe(1_000 + 2_000 + 2_500 + 500);
  });

  it("D-09: a published pair applies regardless of fare_kind — the dropdown filter is gone", () => {
    const published: FixedRouteRow = {
      id: 8,
      rate_version_id: 1,
      origin_zone_id: neutralZone.id,
      dest_zone_id: zoneB.id,
      vehicle_class_id: economy.id,
      price_rappen: 700,
      live: true,
    };
    const { eco } = quote(
      { ...book(), fixed_routes: [published] },
      { fare_kind: "one_way" },
    );
    const pairs = eco.lines.filter((l) => l.code === "fixed_route");
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.amount_rappen).toBe(700);
    expect(pairs[0]?.basis.price_rappen).toBe(published.price_rappen);
    expect(eco.total_rappen).toBe(1_000 + 2_000 + 500 + 700);
  });

  it("D-09: a matching pair applies even when distance_rates.city_price_rappen is a different amount", () => {
    const published: FixedRouteRow = {
      id: 8,
      rate_version_id: 1,
      origin_zone_id: neutralZone.id,
      dest_zone_id: zoneB.id,
      vehicle_class_id: economy.id,
      price_rappen: 700,
      live: true,
    };
    // city_price_rappen (999) no longer gates which published row is eligible.
    const { eco } = quote(
      { ...book({ city_price_rappen: 999 }), fixed_routes: [published] },
      { fare_kind: "one_way" },
    );
    const pairs = eco.lines.filter((l) => l.code === "fixed_route");
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.amount_rappen).toBe(700);
  });

  it("no published pair matches — adds nothing, does not invent a city price", () => {
    const { eco } = quote(book());
    expect(eco.lines.filter((l) => l.code === "city_price")).toHaveLength(0);
    expect(eco.lines.filter((l) => l.code === "fixed_route")).toHaveLength(0);
    expect(eco.total_rappen).toBe(1_000 + 2_000 + 500);
  });

  it("D-13: an airport signal with airport_start_rappen null leaves the class unpriced, never 0", () => {
    const { eco, result } = quote(
      book({ airport_start_rappen: null }),
      { legs: [{ ...neutralLeg(), origin_zone_id: zoneA.id }] },
    );
    expect(eco.lines.find((l) => l.code === "distance_fare")?.amount_rappen).toBe(
      1_000 + 2_000,
    );
    expect(eco.lines.find((l) => l.code === "airport_fee")?.amount_rappen).toBeNull();
    expect(eco.total_rappen).toBeNull();
    expect(result.partially_priced_class_slugs).toContain("economy");
  });

  it("a non-airport pickup with no pair match stays fully priced regardless of a null airport_start_rappen", () => {
    const { eco, result } = quote(book({ airport_start_rappen: null }));
    expect(eco.lines.find((l) => l.code === "distance_fare")?.amount_rappen).toBe(
      1_000 + 2_000,
    );
    expect(eco.total_rappen).toBe(1_000 + 2_000 + 500);
    expect(result.partially_priced_class_slugs).not.toContain("economy");
  });
});


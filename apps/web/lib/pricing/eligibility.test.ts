// apps/web/lib/pricing/eligibility.test.ts
//
// Class eligibility board proofs (D-01, D-02, D-38). Fixtures carry null
// amounts only (D-46) — seats and bags are physical facts, not CHF.

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import {
  effectiveMaxPax,
  evaluateEligibility,
} from "./eligibility";
import type {
  ClassBoardEntry,
  QuoteInput,
  RateBook,
  VehicleClassRow,
  DistanceRateRow,
  FixedRouteRow,
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
    base_fare_rappen: null,
    per_km_rappen: null,
    min_fare_rappen: null,
    max_pax: partial.max_pax ?? 3,
    available: partial.available ?? true,
  };
}

function fixedRow(
  partial: Partial<FixedRouteRow> &
    Pick<FixedRouteRow, "vehicle_class_id" | "origin_zone_id" | "dest_zone_id">,
): FixedRouteRow {
  return {
    id: partial.id ?? 1,
    rate_version_id: partial.rate_version_id ?? 1,
    origin_zone_id: partial.origin_zone_id,
    dest_zone_id: partial.dest_zone_id,
    vehicle_class_id: partial.vehicle_class_id,
    price_rappen: null,
    live: partial.live ?? true,
  };
}

/** ADR-014 §6 seed shape: Economy 3/3, Business 3/3, Van 8/8 — all amounts null. */
function seededBook(overrides?: {
  vanMaxPax?: number;
  vanAvailable?: boolean;
  omitVanRate?: boolean;
  vanFixedLive?: boolean | "none";
  vanLuggage?: number;
}): RateBook {
  const economy = classRow({ slug: "economy", sort_order: 1, passenger_capacity: 3, luggage_capacity: 3 });
  const business = classRow({ slug: "business", sort_order: 2, passenger_capacity: 3, luggage_capacity: 3 });
  const van = classRow({
    slug: "van",
    sort_order: 3,
    passenger_capacity: 8,
    luggage_capacity: overrides?.vanLuggage ?? 8,
  });

  const distance_rates: DistanceRateRow[] = [
    rateRow({ vehicle_class_id: economy.id, max_pax: 3, id: 10 }),
    rateRow({ vehicle_class_id: business.id, max_pax: 3, id: 11 }),
  ];
  if (!overrides?.omitVanRate) {
    distance_rates.push(
      rateRow({
        vehicle_class_id: van.id,
        max_pax: overrides?.vanMaxPax ?? 8,
        available: overrides?.vanAvailable ?? true,
        id: 12,
      }),
    );
  }

  const fixed_routes: FixedRouteRow[] = [];
  if (overrides?.vanFixedLive !== "none" && overrides?.vanFixedLive !== undefined) {
    fixed_routes.push(
      fixedRow({
        vehicle_class_id: van.id,
        origin_zone_id: "z-a",
        dest_zone_id: "z-b",
        live: overrides.vanFixedLive,
        id: 20,
      }),
    );
  }

  return {
    rate_version: { id: 1, slug: "draft-v1" },
    classes: [economy, business, van],
    distance_rates,
    fixed_routes,
    surcharges: [],
    zones: [],
  };
}

function input(partial: Partial<QuoteInput> = {}): QuoteInput {
  return {
    mode: "one_way",
    pax: partial.pax ?? 2,
    bags: partial.bags ?? 2,
    display_currency: "CHF",
    computed_at: "2026-09-04T12:00:00Z",
    legs: partial.legs ?? [
      {
        leg_seq: 1,
        scheduled_local: "2026-09-04T12:00",
        distance_m: 10000,
        duration_s: 900,
        origin_zone_id: "z-a",
        dest_zone_id: "z-b",
        waypoints: [],
      },
    ],
    extras: {},
    coupon: null,
  };
}

function entry(board: { classes: ClassBoardEntry[] }, slug: string): ClassBoardEntry {
  const e = board.classes.find((c) => c.slug === slug);
  if (!e) throw new Error(`missing class ${slug}`);
  return e;
}

describe("effectiveMaxPax", () => {
  it("returns LEAST(passenger_capacity, max_pax) when a rate row exists", () => {
    const cls = classRow({ slug: "van", passenger_capacity: 8 });
    const rate = rateRow({ vehicle_class_id: cls.id, max_pax: 8 });
    expect(effectiveMaxPax(cls, rate)).toBe(8);
  });

  it("returns the smaller of the two caps", () => {
    const cls = classRow({ slug: "van", passenger_capacity: 8 });
    const rate = rateRow({ vehicle_class_id: cls.id, max_pax: 5 });
    expect(effectiveMaxPax(cls, rate)).toBe(5);
  });

  it("returns passenger_capacity when no distance_rates row exists", () => {
    const cls = classRow({ slug: "van", passenger_capacity: 8 });
    expect(effectiveMaxPax(cls, null)).toBe(8);
  });
});

describe("evaluateEligibility", () => {
  it("marks Van eligible for a party of 8 against 8/8 seed", () => {
    const board = evaluateEligibility(seededBook(), input({ pax: 8, bags: 8 }));
    const van = entry(board, "van");
    expect(van.eligible).toBe(true);
    expect(van.ineligible_reason).toBeNull();
    expect(van.effective_max_pax).toBe(8);
    expect(van.max_bags).toBe(8);
    expect(board.no_eligible_class).toBe(false);
  });

  it("marks Van pax-ineligible for a party of 9 and still reports effective_max_pax", () => {
    const board = evaluateEligibility(seededBook(), input({ pax: 9, bags: 2 }));
    const van = entry(board, "van");
    expect(van.eligible).toBe(false);
    expect(van.ineligible_reason).toBe("pax");
    expect(van.effective_max_pax).toBe(8);
  });

  it("clamps bags against luggage_capacity only — over bags is bags not pax", () => {
    const board = evaluateEligibility(
      seededBook({ vanLuggage: 8 }),
      input({ pax: 4, bags: 9 }),
    );
    const van = entry(board, "van");
    expect(van.eligible).toBe(false);
    expect(van.ineligible_reason).toBe("bags");
    expect(van.max_bags).toBe(8);
  });

  it("labels unavailable when distance_rates.available is false", () => {
    const board = evaluateEligibility(
      seededBook({ vanAvailable: false }),
      input({ pax: 2, bags: 2 }),
    );
    expect(entry(board, "van").ineligible_reason).toBe("unavailable");
    expect(entry(board, "van").eligible).toBe(false);
  });

  it("labels no_rate when the class has no distance_rates row", () => {
    const board = evaluateEligibility(
      seededBook({ omitVanRate: true, vanFixedLive: "none" }),
      input({ pax: 2, bags: 2 }),
    );
    expect(entry(board, "van").ineligible_reason).toBe("no_rate");
  });

  it("labels route_off for a fixed-route-only journey whose fixed_routes.live is false", () => {
    // No distance rate + dead fixed route for this origin/dest pair.
    const book = seededBook({ omitVanRate: true, vanFixedLive: false });
    const board = evaluateEligibility(book, input({ pax: 2, bags: 2 }));
    expect(entry(board, "van").ineligible_reason).toBe("route_off");
  });

  it("applies reason precedence: unavailable outranks pax", () => {
    const board = evaluateEligibility(
      seededBook({ vanAvailable: false }),
      input({ pax: 99, bags: 2 }),
    );
    expect(entry(board, "van").ineligible_reason).toBe("unavailable");
  });

  it("applies reason precedence: no_rate outranks pax when rate missing", () => {
    const board = evaluateEligibility(
      seededBook({ omitVanRate: true, vanFixedLive: "none" }),
      input({ pax: 99, bags: 2 }),
    );
    expect(entry(board, "van").ineligible_reason).toBe("no_rate");
  });

  it("applies reason precedence: pax outranks bags", () => {
    const board = evaluateEligibility(
      seededBook(),
      input({ pax: 99, bags: 99 }),
    );
    expect(entry(board, "van").ineligible_reason).toBe("pax");
  });

  it("returns no_eligible_class true with a full labelled board and never throws (D-02)", () => {
    const board = evaluateEligibility(seededBook(), input({ pax: 9, bags: 2 }));
    expect(board.no_eligible_class).toBe(true);
    expect(board.classes).toHaveLength(3);
    for (const c of board.classes) {
      expect(c.eligible).toBe(false);
      expect(c.ineligible_reason).not.toBeNull();
      expect(typeof c.effective_max_pax).toBe("number");
      expect(typeof c.max_bags).toBe("number");
      expect(c.lines).toEqual([]);
      expect(c.total_rappen).toBeNull();
    }
  });

  it("clamps using the max party size across the booking (max-over-legs via top-level pax)", () => {
    // Loader / HTTP layer collapses per-leg counts into input.pax = max over legs
    // (e.g. 2 outbound + 5 return → pax: 5). QuoteInput carries booking-level max.
    const board = evaluateEligibility(
      seededBook(),
      input({
        pax: 5,
        bags: 1,
        mode: "return",
        legs: [
          {
            leg_seq: 1,
            scheduled_local: "2026-09-04T12:00",
            distance_m: 10000,
            duration_s: 900,
            origin_zone_id: "z-a",
            dest_zone_id: "z-b",
            waypoints: [],
          },
          {
            leg_seq: 2,
            scheduled_local: "2026-09-05T12:00",
            distance_m: 10000,
            duration_s: 900,
            origin_zone_id: "z-b",
            dest_zone_id: "z-a",
            waypoints: [],
          },
        ],
      }),
    );
    expect(entry(board, "economy").ineligible_reason).toBe("pax");
    expect(entry(board, "business").ineligible_reason).toBe("pax");
    expect(entry(board, "van").eligible).toBe(true);
  });

  it("is identical whether amounts are null — never reads a price field", () => {
    const a = evaluateEligibility(seededBook(), input({ pax: 2, bags: 2 }));
    const book = seededBook();
    // Mutate null amounts — still null; eligibility must not care.
    for (const r of book.distance_rates) {
      r.base_fare_rappen = null;
      r.per_km_rappen = null;
    }
    const b = evaluateEligibility(book, input({ pax: 2, bags: 2 }));
    expect(a).toEqual(b);
  });

  it("preserves rate-book class order", () => {
    const board = evaluateEligibility(seededBook(), input());
    expect(board.classes.map((c) => c.slug)).toEqual([
      "economy",
      "business",
      "van",
    ]);
  });

  it("property: every class is either eligible or has a non-null reason", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 0, max: 20 }),
        (pax, bags) => {
          const board = evaluateEligibility(seededBook(), input({ pax, bags }));
          for (const c of board.classes) {
            const labelled =
              c.eligible === true
                ? c.ineligible_reason === null
                : c.ineligible_reason !== null;
            expect(labelled).toBe(true);
            // Exactly one of eligible===true or non-null reason
            expect(c.eligible === true || c.ineligible_reason !== null).toBe(
              true,
            );
            expect(!(c.eligible === true && c.ineligible_reason !== null)).toBe(
              true,
            );
          }
          const anyEligible = board.classes.some((c) => c.eligible);
          expect(board.no_eligible_class).toBe(!anyEligible);
        },
      ),
      { numRuns: 100 },
    );
  });
});

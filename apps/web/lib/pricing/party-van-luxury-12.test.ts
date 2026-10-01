// apps/web/lib/pricing/party-van-luxury-12.test.ts
//
// Quick 261001: the class rows decide who fits. Economy 3, Business 7, Van luxury 12 (class capacity and
// rate max_pax); a party of 10 fits Van luxury only, 13 fits none, and the lower of class capacity and
// rate max_pax wins. Fixtures carry null amounts only: seats are physical facts, not money.

import { describe, expect, it } from "vitest";
import { evaluateEligibility } from "./eligibility";
import type {
  ClassBoardEntry,
  DistanceRateRow,
  QuoteInput,
  RateBook,
  VehicleClassRow,
} from "./types";

function classRow(slug: string, sort_order: number, passenger_capacity: number, luggage_capacity: number): VehicleClassRow {
  return { id: `vc-${slug}`, slug, passenger_capacity, luggage_capacity, sort_order, active: true };
}

function rateRow(id: number, vehicle_class_id: string, max_pax: number): DistanceRateRow {
  return {
    id,
    rate_version_id: 1,
    vehicle_class_id,
    base_fare_rappen: null,
    per_km_rappen: null,
    min_fare_rappen: null,
    max_pax,
    available: true,
  };
}

/** Live rows: saden 3/3, mercedes-benz-v-class 7/6, van-luxury 12/9; rate max_pax 3 / 7 / `vanRateMaxPax`. */
function liveBook(vanRateMaxPax = 12): RateBook {
  const saden = classRow("saden", 1, 3, 3);
  const vClass = classRow("mercedes-benz-v-class", 2, 7, 6);
  const van = classRow("van-luxury", 3, 12, 9);
  return {
    rate_version: { id: 1, slug: "draft-v1" },
    classes: [saden, vClass, van],
    distance_rates: [rateRow(10, saden.id, 3), rateRow(11, vClass.id, 7), rateRow(12, van.id, vanRateMaxPax)],
    distance_bands: [],
    region_premiums: [],
    fixed_routes: [],
    surcharges: [],
    zones: [],
  };
}

function input(pax: number, bags: number): QuoteInput {
  return {
    mode: "one_way",
    pax,
    bags,
    display_currency: "XXX",
    computed_at: "2026-10-01T12:00:00Z",
    legs: [
      {
        leg_seq: 1,
        scheduled_local: "2026-10-01T12:00",
        distance_m: 10000,
        duration_s: 900,
        origin_zone_id: "z-a",
        dest_zone_id: "z-b",
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

describe("Van luxury takes 12 (class rows 3 / 7 / 12)", () => {
  it("10 travellers, 2 bags: only Van luxury is eligible, the other two are blocked by seats", () => {
    const board = evaluateEligibility(liveBook(), input(10, 2));
    expect(entry(board, "van-luxury").eligible).toBe(true);
    expect(entry(board, "van-luxury").effective_max_pax).toBe(12);
    for (const slug of ["saden", "mercedes-benz-v-class"]) {
      expect(entry(board, slug).eligible).toBe(false);
      expect(entry(board, slug).ineligible_reason).toBe("pax");
    }
    expect(board.no_eligible_class).toBe(false);
  });

  it("12 travellers: Van luxury is still eligible", () => {
    const board = evaluateEligibility(liveBook(), input(12, 2));
    expect(entry(board, "van-luxury").eligible).toBe(true);
    expect(board.no_eligible_class).toBe(false);
  });

  it("13 travellers: no class is eligible", () => {
    const board = evaluateEligibility(liveBook(), input(13, 2));
    expect(board.classes.every((c) => !c.eligible)).toBe(true);
    expect(entry(board, "van-luxury").ineligible_reason).toBe("pax");
    expect(board.no_eligible_class).toBe(true);
  });

  it("the lower of class capacity and rate max_pax wins: rate 8 on a 12-seat class -> 10 travellers do not fit", () => {
    const board = evaluateEligibility(liveBook(8), input(10, 2));
    const van = entry(board, "van-luxury");
    expect(van.effective_max_pax).toBe(8);
    expect(van.eligible).toBe(false);
    expect(van.ineligible_reason).toBe("pax");
    expect(board.no_eligible_class).toBe(true);
  });
});

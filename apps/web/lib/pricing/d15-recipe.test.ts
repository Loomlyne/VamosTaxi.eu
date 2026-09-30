// apps/web/lib/pricing/d15-recipe.test.ts
//
// Wave 0 (18-01) / green in 18-04: D-15 owner examples in rappen. 100 + 14.6 km × 12
// = 275.20 (27520 rappen). 12.3 km × 10 = 123 (12300 rappen km money). Never invent
// a currency mark in assertions.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { classBandExtrasRappen } from "./bands";
import { buildFareLine } from "./lines";
import { perKm } from "./round";
import type {
  DistanceRateRow,
  QuoteLegInput,
  VehicleClassRow,
} from "./types";

const cls: VehicleClassRow = {
  id: "vc-d15",
  slug: "suv",
  passenger_capacity: 4,
  luggage_capacity: 3,
  sort_order: 1,
  active: true,
};

function rate(
  partial: Pick<DistanceRateRow, "base_fare_rappen" | "per_km_rappen">,
): DistanceRateRow {
  return {
    id: 1,
    rate_version_id: 1,
    vehicle_class_id: cls.id,
    min_fare_rappen: null,
    max_pax: 4,
    available: true,
    ...partial,
  };
}

function leg(distance_m: number): QuoteLegInput {
  return {
    leg_seq: 1,
    scheduled_local: "2026-09-14T12:00",
    distance_m,
    duration_s: 900,
    origin_zone_id: "z-a",
    dest_zone_id: "z-b",
  };
}

describe("D-15 distance recipe (275.20 / 27520 and 123 / 12300)", () => {
  it("start 10000 + perKm(1200, 14600) = 27520 with no bands", () => {
    expect(perKm(1200, 14_600)).toBe(17_520);
    expect(classBandExtrasRappen(14_600, [], cls.id)).toBe(0);
    const line = buildFareLine({
      leg: leg(14_600),
      vehicleClass: cls,
      distanceRate: rate({
        base_fare_rappen: 10_000,
        per_km_rappen: 1_200,
      }),
      fixedRoutes: [],
      rateVersionId: 1,
      distanceBands: [],
    });
    expect(line.amount_rappen).toBe(27_520);
    expect(line.amount_rappen).toBe(10_000 + perKm(1_200, 14_600));
  });

  it("km-only 12.3 km × 10 CHF = 12300 rappen", () => {
    expect(perKm(1_000, 12_300)).toBe(12_300);
    const line = buildFareLine({
      leg: leg(12_300),
      vehicleClass: cls,
      distanceRate: rate({
        base_fare_rappen: 0,
        per_km_rappen: 1_000,
      }),
      fixedRoutes: [],
      rateVersionId: 1,
      distanceBands: [],
    });
    expect(line.amount_rappen).toBe(12_300);
  });

  it("1 km uses the same start + perKm recipe, not a min fare", () => {
    const line = buildFareLine({
      leg: leg(1_000),
      vehicleClass: cls,
      distanceRate: rate({
        base_fare_rappen: 10_000,
        per_km_rappen: 1_200,
      }),
      fixedRoutes: [],
      rateVersionId: 1,
      distanceBands: [],
    });
    expect(line.amount_rappen).toBe(10_000 + perKm(1_200, 1_000));
  });
});

describe("D-17 public stack emits no region %", () => {
  it("priceQuote does not call buildRegionPremiumLine", () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "priceQuote.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/buildRegionPremiumLine/);
    expect(src).not.toMatch(/region_premium/);
  });
});

import { describe, expect, it } from "vitest";
import { blendedFareRappen } from "./bands";
import type { DistanceBandRow } from "./types";

const sheet2: DistanceBandRow[] = [
  { id: 1, rate_version_id: 1, from_km: 20, to_km: 50, per_km_rappen: 380 },
  { id: 2, rate_version_id: 1, from_km: 50, to_km: 100, per_km_rappen: 340 },
  { id: 3, rate_version_id: 1, from_km: 100, to_km: 150, per_km_rappen: 320 },
  { id: 4, rate_version_id: 1, from_km: 150, to_km: 200, per_km_rappen: 300 },
  { id: 5, rate_version_id: 1, from_km: 200, to_km: null, per_km_rappen: 280 },
];

describe("blendedFareRappen — owner sheet-2 examples", () => {
  it("10 km is the class floor only", () => {
    expect(blendedFareRappen(10_000, 8000, sheet2)).toBe(8000);
    expect(blendedFareRappen(10_000, 10000, sheet2)).toBe(10000);
    expect(blendedFareRappen(10_000, 15000, sheet2)).toBe(15000);
  });

  it("40 km = floor + 20 km at 380", () => {
    expect(blendedFareRappen(40_000, 8000, sheet2)).toBe(15600);
  });

  it("70 km = floor + 30 km at 380 + 20 km at 340", () => {
    expect(blendedFareRappen(70_000, 8000, sheet2)).toBe(26200);
    expect(blendedFareRappen(70_000, 10000, sheet2)).toBe(28200);
    expect(blendedFareRappen(70_000, 15000, sheet2)).toBe(33200);
  });

  it("120 km = floor + 30@380 + 50@340 + 20@320", () => {
    expect(blendedFareRappen(120_000, 8000, sheet2)).toBe(42800);
  });
});

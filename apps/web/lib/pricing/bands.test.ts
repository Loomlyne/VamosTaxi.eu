import { describe, expect, it } from "vitest";
import { classBandExtrasRappen } from "./bands";
import { perKm } from "./round";
import type { DistanceBandRow } from "./types";

const ECONOMY = "vc-economy";
const BUSINESS = "vc-business";

function band(
  partial: Pick<DistanceBandRow, "vehicle_class_id" | "from_km" | "per_km_rappen"> &
    Partial<DistanceBandRow>,
): DistanceBandRow {
  return {
    id: partial.id ?? 1,
    rate_version_id: partial.rate_version_id ?? 1,
    vehicle_class_id: partial.vehicle_class_id,
    from_km: partial.from_km,
    to_km: partial.to_km === undefined ? null : partial.to_km,
    per_km_rappen: partial.per_km_rappen,
  };
}

describe("classBandExtrasRappen — D-11 D-12 D-13 D-14 per-class extras on top of all km", () => {
  it("D-11: extras accrue below 20 km — not a DISTANCE_FLOOR_KM lump", () => {
    const rows = [
      band({
        vehicle_class_id: ECONOMY,
        from_km: 0,
        to_km: 20,
        per_km_rappen: 50,
      }),
    ];
    // 10 km sits inside [0, 20). Live recipe: 10 km × 50, not a class-floor lump.
    expect(classBandExtrasRappen(10_000, rows, ECONOMY)).toBe(perKm(50, 10_000));
  });

  it("D-14: per-class extras sit on top of class per-km for metres in that slice", () => {
    const rows = [
      band({
        id: 1,
        vehicle_class_id: ECONOMY,
        from_km: 20,
        to_km: 50,
        per_km_rappen: 380,
      }),
      band({
        id: 2,
        vehicle_class_id: BUSINESS,
        from_km: 20,
        to_km: 50,
        per_km_rappen: 999,
      }),
    ];
    // 40 km → metres in [20, 40) = 20 km at economy 380, not business 999.
    expect(classBandExtrasRappen(40_000, rows, ECONOMY)).toBe(perKm(380, 20_000));
    expect(classBandExtrasRappen(40_000, rows, BUSINESS)).toBe(perKm(999, 20_000));
  });

  it("D-14: From inclusive / To exclusive except open last (to_km null)", () => {
    const rows = [
      band({
        id: 1,
        vehicle_class_id: ECONOMY,
        from_km: 20,
        to_km: 50,
        per_km_rappen: 1000,
      }),
      band({
        id: 2,
        vehicle_class_id: ECONOMY,
        from_km: 50,
        to_km: 100,
        per_km_rappen: 2000,
      }),
      band({
        id: 3,
        vehicle_class_id: ECONOMY,
        from_km: 100,
        to_km: null,
        per_km_rappen: 300,
      }),
    ];
    // Exactly 20 km: From inclusive is a boundary — zero metres inside [20, 50).
    expect(classBandExtrasRappen(20_000, rows, ECONOMY)).toBe(0);
    // 20 km + 1 m: first metre of [20, 50) at 1000 rappen/km → 1 rappen.
    expect(classBandExtrasRappen(20_001, rows, ECONOMY)).toBe(perKm(1000, 1));
    // Exactly 50 km: To exclusive — 30 km in [20, 50), zero in [50, 100).
    expect(classBandExtrasRappen(50_000, rows, ECONOMY)).toBe(perKm(1000, 30_000));
    // 51 km: 30 km @ 1000 plus 1 km @ 2000.
    expect(classBandExtrasRappen(51_000, rows, ECONOMY)).toBe(
      perKm(1000, 30_000) + perKm(2000, 1_000),
    );
    // Open last: 120 km uses [100, ∞) for 20 km.
    expect(classBandExtrasRappen(120_000, rows, ECONOMY)).toBe(
      perKm(1000, 30_000) + perKm(2000, 50_000) + perKm(300, 20_000),
    );
  });

  it("D-14: overlapping bands, higher per_km_rappen wins", () => {
    const rows = [
      band({
        id: 1,
        vehicle_class_id: ECONOMY,
        from_km: 20,
        to_km: 50,
        per_km_rappen: 100,
      }),
      band({
        id: 2,
        vehicle_class_id: ECONOMY,
        from_km: 30,
        to_km: 60,
        per_km_rappen: 180,
      }),
    ];
    // 70 km: [20,30) @ 100 + [30,50) @ 180 + [50,60) @ 180.
    expect(classBandExtrasRappen(70_000, rows, ECONOMY)).toBe(
      perKm(100, 10_000) + perKm(180, 20_000) + perKm(180, 10_000),
    );
  });

  it("D-11 D-12: no bands → extra is 0; fare is start + all-km per-km elsewhere", () => {
    expect(classBandExtrasRappen(40_000, [], ECONOMY)).toBe(0);
    expect(classBandExtrasRappen(1_000, [], ECONOMY)).toBe(0);
  });

  it("D-14: extras require vehicle_class_id — other classes do not leak", () => {
    const rows = [
      band({
        vehicle_class_id: BUSINESS,
        from_km: 0,
        to_km: 10,
        per_km_rappen: 500,
      }),
    ];
    expect(classBandExtrasRappen(5_000, rows, ECONOMY)).toBe(0);
  });
});

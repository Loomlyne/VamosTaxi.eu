// apps/web/lib/ops/vehicle-seats.test.ts
//
// Morning / Night cap. Exact refuse keys for UI-SPEC copy (D-07 D-08).

import { describe, expect, it } from "vitest";
import { VehicleSeatError, assertVehicleSeats } from "./vehicle-seats";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("assertVehicleSeats (D-07 D-08)", () => {
  it("accepts empty seats", () => {
    expect(
      assertVehicleSeats({ morningId: null, nightId: null, chauffeurId: A, seat: "morning" }),
    ).toEqual({ morningId: A, nightId: null });
  });

  it("accepts replacing the same seat with the same id", () => {
    expect(
      assertVehicleSeats({ morningId: A, nightId: null, chauffeurId: A, seat: "morning" }),
    ).toEqual({ morningId: A, nightId: null });
  });

  it("refuses a second Morning chauffeur", () => {
    expect(() =>
      assertVehicleSeats({ morningId: A, nightId: null, chauffeurId: B, seat: "morning" }),
    ).toThrow(VehicleSeatError);
    try {
      assertVehicleSeats({ morningId: A, nightId: null, chauffeurId: B, seat: "morning" });
    } catch (err) {
      expect(err).toBeInstanceOf(VehicleSeatError);
      expect((err as VehicleSeatError).key).toBe("fleet-seat-morning-taken");
    }
  });

  it("refuses a second Night chauffeur", () => {
    try {
      assertVehicleSeats({ morningId: null, nightId: A, chauffeurId: B, seat: "night" });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(VehicleSeatError);
      expect((err as VehicleSeatError).key).toBe("fleet-seat-night-taken");
    }
  });

  it("refuses a third chauffeur when Morning and Night are filled", () => {
    try {
      assertVehicleSeats({ morningId: A, nightId: B, chauffeurId: C, seat: "morning" });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(VehicleSeatError);
      expect((err as VehicleSeatError).key).toBe("fleet-seat-both-taken");
    }
  });

  it("refuses the same chauffeur on both seats", () => {
    try {
      assertVehicleSeats({ morningId: A, nightId: null, chauffeurId: A, seat: "night" });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(VehicleSeatError);
      expect((err as VehicleSeatError).key).toBe("fleet-seat-both-taken");
    }
  });
});

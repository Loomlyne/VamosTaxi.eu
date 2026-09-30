// apps/web/lib/ops/vehicle-seats.test.ts
//
// Morning / Night cap. Exact refuse keys for UI-SPEC copy (D-07 D-08).

import { describe, expect, it } from "vitest";
import { VehicleSeatError, replaceVehicleSeats } from "./vehicle-seats";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("replaceVehicleSeats (OpsFleet save)", () => {
  it("replaces an occupied Morning seat", () => {
    expect(replaceVehicleSeats({ morningId: B, nightId: null })).toEqual({
      morningId: B,
      nightId: null,
    });
  });

  it("writes a posted Morning/Night pair", () => {
    expect(replaceVehicleSeats({ morningId: A, nightId: B })).toEqual({
      morningId: A,
      nightId: B,
    });
  });

  it("clears both seats", () => {
    expect(replaceVehicleSeats({ morningId: null, nightId: null })).toEqual({
      morningId: null,
      nightId: null,
    });
  });

  it("refuses the same chauffeur on both seats", () => {
    try {
      replaceVehicleSeats({ morningId: A, nightId: A });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(VehicleSeatError);
      expect((err as VehicleSeatError).key).toBe("fleet-seat-both-taken");
    }
  });
});

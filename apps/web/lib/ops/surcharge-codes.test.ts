import { describe, expect, it } from "vitest";
import {
  extraWriteFields,
  isAutomaticSurcharge,
  isPassengerExtra,
  normalizeSurchargeCode,
} from "./surcharge-codes";

describe("surcharge codes", () => {
  it("maps ops aliases onto book codes", () => {
    expect(normalizeSurchargeCode("ski")).toBe("ski_rack");
    expect(normalizeSurchargeCode("waiting")).toBe("waiting_city");
    expect(normalizeSurchargeCode("child_seat")).toBe("child_seat");
  });

  it("treats passenger extras as the checkout catalog, not night", () => {
    expect(isPassengerExtra("child_seat")).toBe(true);
    expect(isPassengerExtra("ski")).toBe(true);
    expect(isPassengerExtra("pet")).toBe(true);
    expect(isPassengerExtra("night")).toBe(false);
    expect(isPassengerExtra("weekend")).toBe(false);
    expect(isPassengerExtra("holiday")).toBe(false);
    expect(isPassengerExtra("waiting_airport")).toBe(false);
    expect(isAutomaticSurcharge("waiting_airport")).toBe(true);
    expect(isPassengerExtra("bike_rack")).toBe(true);
  });

  it("pairs quantity extras with the quote source", () => {
    expect(extraWriteFields("child_seat")).toEqual({
      predicate: { kind: "quantity" },
      quantitySource: "child_seats",
    });
    expect(extraWriteFields("meet_greet")).toEqual({
      predicate: { kind: "always" },
      quantitySource: null,
    });
  });
});

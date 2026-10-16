import { describe, expect, it } from "vitest";
import { policyHours } from "./policy-settings";

describe("policyHours", () => {
  it("reads free_cancel_hours, the payment window and the price hold from the jsonb row", () => {
    expect(
      policyHours({ free_cancel_hours: 24, checkout_window_minutes: 1440, quote_lock_minutes: 2880 }),
    ).toEqual({ freeCancelHours: 24, checkoutWindowMinutes: 1440, priceHoldMinutes: 2880 });
  });

  it("does not invent hours when the row is missing", () => {
    const empty = { freeCancelHours: null, checkoutWindowMinutes: null, priceHoldMinutes: null };
    expect(policyHours(null)).toEqual(empty);
    expect(policyHours({})).toEqual(empty);
  });

  it("reads quote_lock_minutes as a numeric string and refuses negative or non-numeric values", () => {
    expect(policyHours({ quote_lock_minutes: "2880" }).priceHoldMinutes).toBe(2880);
    expect(policyHours({ quote_lock_minutes: -5 }).priceHoldMinutes).toBeNull();
    expect(policyHours({ quote_lock_minutes: "abc" }).priceHoldMinutes).toBeNull();
  });
});

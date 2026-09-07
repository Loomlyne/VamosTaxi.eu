import { describe, expect, it } from "vitest";
import { policyHours } from "./policy-settings";

describe("policyHours", () => {
  it("reads free_cancel_hours from the jsonb row", () => {
    expect(
      policyHours({ free_cancel_hours: 24, checkout_window_minutes: 1440 }),
    ).toEqual({ freeCancelHours: 24, checkoutWindowMinutes: 1440 });
  });

  it("does not invent hours when the row is missing", () => {
    expect(policyHours(null)).toEqual({
      freeCancelHours: null,
      checkoutWindowMinutes: null,
    });
    expect(policyHours({})).toEqual({
      freeCancelHours: null,
      checkoutWindowMinutes: null,
    });
  });
});

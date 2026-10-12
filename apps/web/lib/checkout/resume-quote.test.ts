import { describe, expect, it } from "vitest";
import { finishPaymentHref } from "./resume-quote";

const Q = "11111111-2222-4333-8444-555555555555";

describe("finishPaymentHref (W3-06)", () => {
  it("is the booking's checkout resume, not the bare empty checkout", () => {
    expect(finishPaymentHref("en", Q)).toBe(`/checkout?resume=${Q}`);
    expect(finishPaymentHref("de", Q.toUpperCase())).toBe(`/de/checkout?resume=${Q}`);
  });
  it("is null when no quote is known or it is not a uuid (no dead button)", () => {
    expect(finishPaymentHref("en", null)).toBeNull();
    expect(finishPaymentHref("en", "x&evil=1")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { checkoutForwardPath } from "./step-forward";

describe("checkoutForwardPath", () => {
  it("keeps the query and drops the step", () => {
    expect(checkoutForwardPath("en", { from: "A b", pax: "2" })).toBe("/checkout?from=A+b&pax=2");
  });
  it("prefixes de, fr and ar but not en", () => {
    expect(checkoutForwardPath("de", { pax: "2" })).toBe("/de/checkout?pax=2");
    expect(checkoutForwardPath("ar", {})).toBe("/ar/checkout");
    expect(checkoutForwardPath("en", {})).toBe("/checkout");
  });
  it("cannot leave the site: unknown locale falls back, repeated keys use the first", () => {
    expect(checkoutForwardPath("//evil.example", { to: ["x", "y"] })).toBe("/checkout?to=x");
    expect(checkoutForwardPath("https:", {})).toBe("/checkout");
  });
});

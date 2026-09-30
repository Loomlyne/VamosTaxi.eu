import { describe, expect, it } from "vitest";
import {
  checkoutExtraKindFromRappen,
  isPlaceholderAmount,
  rappenFromMoneySet,
  rappenFromUnknown,
} from "./rappen";

describe("rappenFromUnknown", () => {
  it("keeps CHF 0 as 0 rappen — not a gap", () => {
    expect(rappenFromUnknown(0)).toBe(0);
    expect(rappenFromUnknown("0")).toBe(0);
    expect(rappenFromUnknown("000")).toBe(0);
    expect(rappenFromUnknown("0.00")).toBe(0);
    expect(rappenFromUnknown("00")).toBe(0);
    expect(rappenFromMoneySet({ CHF: "0" })).toBe(0);
    expect(rappenFromMoneySet({ CHF: 0 })).toBe(0);
  });

  it("treats only a blank or dash as unfilled", () => {
    expect(isPlaceholderAmount("")).toBe(true);
    expect(isPlaceholderAmount("  ")).toBe(true);
    expect(isPlaceholderAmount("—")).toBe(true);
    expect(isPlaceholderAmount("000")).toBe(false);
    expect(rappenFromUnknown("")).toBeNull();
    expect(rappenFromUnknown("—")).toBeNull();
    expect(rappenFromUnknown(null)).toBeNull();
  });

  it("reads franc strings as rappen", () => {
    expect(rappenFromUnknown("20")).toBe(2000);
    expect(rappenFromUnknown("20.00")).toBe(2000);
  });
});

describe("checkoutExtraKindFromRappen", () => {
  it("treats checkout extra 0 as included and any positive price, including 1 CHF, as an extra", () => {
    expect(checkoutExtraKindFromRappen(null)).toBeNull();
    expect(checkoutExtraKindFromRappen(0)).toBe("included");
    expect(checkoutExtraKindFromRappen(100)).toBe("amount");
    expect(checkoutExtraKindFromRappen(1)).toBe("amount");
  });
});

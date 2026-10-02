import { describe, expect, it } from "vitest";
import { chfRappenToMinor, rateToMillionths } from "./convert";
import { chfRappenToDisplay, formatChfRappen } from "./format";

describe("display FX", () => {
  it("CHF identity", () => {
    expect(chfRappenToMinor(8000, 1_000_000)).toBe(8000);
  });

  it("80 CHF at 4.534498 AED/CHF is 362.76 AED", () => {
    expect(chfRappenToMinor(8000, rateToMillionths(4.534498))).toBe(36276);
  });
});

describe("formatChfRappen", () => {
  const rates = { CHF: 1 as const, EUR: 1.063086, USD: 1.234718, AED: 4.534498 };

  it("null stays mark-only 000", () => {
    expect(formatChfRappen(null, "USD", rates)).toBe("$000");
    expect(formatChfRappen(null, "AED", rates)).toBe("AED 000");
  });

  it("CHF identity uses francs not rappen", () => {
    expect(formatChfRappen(8000, "CHF", rates)).toBe("CHF 80.00");
  });

  it("converts 80 CHF to AED", () => {
    expect(formatChfRappen(8000, "AED", rates)).toBe("AED 362.76");
  });

  it("FX down keeps CHF", () => {
    const shown = chfRappenToDisplay(10_000, "USD", null);
    expect(shown.currency).toBe("CHF");
    expect(shown.usedFx).toBe(false);
    expect(formatChfRappen(10_000, "USD", null)).toBe("CHF 100.00");
  });
});

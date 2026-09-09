import { describe, expect, it } from "vitest";
import { vatIncludedRappen } from "./vat";

describe("vatIncludedRappen", () => {
  it("takes 8.1% out of a Van floor without adding on top", () => {
    // 150.00 → 11.24 included. Total stays 150.00.
    expect(vatIncludedRappen(15_000)).toBe(1_124);
  });

  it("matches the four live class floors", () => {
    expect(vatIncludedRappen(8_000)).toBe(599);
    expect(vatIncludedRappen(10_000)).toBe(749);
    expect(vatIncludedRappen(13_000)).toBe(974);
    expect(vatIncludedRappen(15_000)).toBe(1_124);
  });

  it("does not invent a slice when the lock is empty", () => {
    expect(vatIncludedRappen(0)).toBe(0);
    expect(vatIncludedRappen(-1)).toBe(0);
    expect(vatIncludedRappen(Number.NaN)).toBe(0);
  });
});

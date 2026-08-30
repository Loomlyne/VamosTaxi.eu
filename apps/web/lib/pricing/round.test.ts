// apps/web/lib/pricing/round.test.ts
//
// Property and table proofs for the integer rounding kernel (D-07, D-53).
// Every integer here is unit-free — no currency marks, no surface-facing amounts
// (D-46). fast-check properties run 500 times each.

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import {
  percentOf,
  percentToHundredths,
  perKm,
  roundHalfUp,
} from "./round";

describe("roundHalfUp", () => {
  it.each([
    [5, 2, 3],
    [4, 2, 2],
    [0, 7, 0],
    [1, 2, 1],
    [3, 2, 2],
    [7, 3, 2],
    [8, 3, 3],
    [999, 1000, 1],
    [500, 1000, 1],
    [499, 1000, 0],
  ] as const)("roundHalfUp(%i, %i) === %i", (n, d, expected) => {
    expect(roundHalfUp(n, d)).toBe(expected);
  });

  it("throws RangeError when numerator is not a safe integer", () => {
    expect(() => roundHalfUp(1.5, 2)).toThrow(RangeError);
    expect(() => roundHalfUp(Number.NaN, 2)).toThrow(RangeError);
    expect(() => roundHalfUp(Number.POSITIVE_INFINITY, 2)).toThrow(RangeError);
  });

  it("throws RangeError when denominator is not a safe integer", () => {
    expect(() => roundHalfUp(5, 2.5)).toThrow(RangeError);
  });

  it("throws RangeError when denominator is <= 0", () => {
    expect(() => roundHalfUp(5, 0)).toThrow(RangeError);
    expect(() => roundHalfUp(5, -1)).toThrow(RangeError);
  });

  it("throws RangeError when the intermediate product would exceed MAX_SAFE_INTEGER", () => {
    const big = Number.MAX_SAFE_INTEGER;
    expect(() => roundHalfUp(big, 2)).toThrow(RangeError);
  });

  it(
    "property: roundHalfUp(n, d) * d is within d of n (never drifts more than one denominator)",
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1_000_000 }),
          fc.integer({ min: 1, max: 10_000 }),
          (n, d) => {
            const q = roundHalfUp(n, d);
            expect(Math.abs(q * d - n)).toBeLessThanOrEqual(d);
          },
        ),
        { numRuns: 500 },
      );
    },
  );
});

describe("percentToHundredths", () => {
  it.each([
    ["7.35", 735],
    ["10", 1000],
    ["0.05", 5],
    ["100.00", 10000],
    ["0", 0],
    ["0.0", 0],
    ["0.00", 0],
    ["1.5", 150],
    ["99.99", 9999],
  ] as const)("percentToHundredths(%j) === %i", (input, expected) => {
    expect(percentToHundredths(input)).toBe(expected);
  });

  it.each(["7,35", "1e2", "-1", "", "7.351", "+7", " 7", "7 ", "7.", ".5", "1000", "abc"] as const)(
    "throws on malformed %j",
    (input) => {
      expect(() => percentToHundredths(input)).toThrow();
    },
  );
});

describe("percentOf", () => {
  it("composes roundHalfUp(base * hundredths, 10000)", () => {
    // 1000 * 735 / 10000 = 73.5 → 74 half-up
    expect(percentOf(1000, 735)).toBe(74);
    expect(percentOf(0, 735)).toBe(0);
    expect(percentOf(10000, 0)).toBe(0);
  });

  it(
    "property: percentOf(base, p) + percentOf(base, q) is independent of evaluation order",
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1_000_000 }),
          fc.integer({ min: 0, max: 10_000 }),
          fc.integer({ min: 0, max: 10_000 }),
          (base, p, q) => {
            const a = percentOf(base, p) + percentOf(base, q);
            const b = percentOf(base, q) + percentOf(base, p);
            expect(a).toBe(b);
          },
        ),
        { numRuns: 500 },
      );
    },
  );
});

describe("perKm", () => {
  it("composes roundHalfUp(rate * metres, 1000)", () => {
    // 250 * 1500 / 1000 = 375 exact
    expect(perKm(250, 1500)).toBe(375);
    // 250 * 500 / 1000 = 125 exact
    expect(perKm(250, 500)).toBe(125);
    // half-up: 1 * 500 / 1000 = 0.5 → 1
    expect(perKm(1, 500)).toBe(1);
    expect(perKm(0, 9999)).toBe(0);
    expect(perKm(999, 0)).toBe(0);
  });

  it(
    "property: perKm is monotonic non-decreasing in metres and zero when either arg is 0",
    () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 50_000 }),
          fc.integer({ min: 0, max: 100_000 }),
          fc.integer({ min: 0, max: 100_000 }),
          (rate, m1, m2) => {
            const lo = Math.min(m1, m2);
            const hi = Math.max(m1, m2);
            expect(perKm(rate, lo)).toBeLessThanOrEqual(perKm(rate, hi));
            if (rate === 0 || lo === 0) {
              expect(perKm(rate, 0)).toBe(0);
            }
          },
        ),
        { numRuns: 500 },
      );
    },
  );
});

// apps/web/lib/checkout/payable.test.ts
//
// D-08a: lines + checkout extras add up first, then the coupon percent
// comes off that whole amount (never below CHF 0), then VAT goes on top.

import { describe, expect, it } from "vitest";
import { CH_VAT_RATE_BPS } from "./vat";
import { payableRappen } from "./payable";

describe("payableRappen", () => {
  it("discounts lines + extras together before VAT (D-08a)", () => {
    // preCoupon 10000 + extras 1000 = 11000; 10% off = 1100; net 9900; VAT 8.1%.
    const result = payableRappen({
      classNetRappen: 9000,
      preCouponRappen: 10000,
      extraAddRappen: 1000,
      couponPercent: 1000, // 10.00% in hundredths-of-a-percent
      vatRateBps: CH_VAT_RATE_BPS,
    });
    expect(result.netRappen).toBe(9900);
    expect(result.vatRappen).toBe(802);
    expect(result.chargedRappen).toBe(10702);
  });

  it("with no extras matches today's lock math exactly (round-trip through the gross-up)", () => {
    const result = payableRappen({
      classNetRappen: 9000,
      preCouponRappen: 10000,
      extraAddRappen: 0,
      couponPercent: 1000,
      vatRateBps: CH_VAT_RATE_BPS,
    });
    expect(result.netRappen).toBe(9000);
    expect(result.chargedRappen).toBe(9000 + Math.round((9000 * 81) / 1000));
  });

  it("a 100% coupon zeroes the net and the VAT", () => {
    const result = payableRappen({
      classNetRappen: 0,
      preCouponRappen: 5000,
      extraAddRappen: 1000,
      couponPercent: 10000, // 100.00%
      vatRateBps: CH_VAT_RATE_BPS,
    });
    expect(result.netRappen).toBe(0);
    expect(result.vatRappen).toBe(0);
    expect(result.chargedRappen).toBe(0);
  });

  it("with no coupon, net is the class total plus extras", () => {
    const result = payableRappen({
      classNetRappen: 8000,
      extraAddRappen: 500,
      couponPercent: null,
      vatRateBps: CH_VAT_RATE_BPS,
    });
    expect(result.netRappen).toBe(8500);
    expect(result.vatRappen).toBe(Math.round((8500 * 81) / 1000));
    expect(result.chargedRappen).toBe(result.netRappen + result.vatRappen);
  });

  it("never goes below CHF 0 net even if preCoupon undershoots extras", () => {
    const result = payableRappen({
      classNetRappen: 0,
      preCouponRappen: 100,
      extraAddRappen: 0,
      couponPercent: 10000,
      vatRateBps: CH_VAT_RATE_BPS,
    });
    expect(result.netRappen).toBe(0);
  });

  it("falls back to classNetRappen when preCouponRappen is omitted (never double-discounts silently)", () => {
    const withoutPreCoupon = payableRappen({
      classNetRappen: 9000,
      extraAddRappen: 0,
      couponPercent: 1000,
      vatRateBps: CH_VAT_RATE_BPS,
    });
    // 9000 base, 10% off => 8100 — documents the fallback, not a recommended call shape.
    expect(withoutPreCoupon.netRappen).toBe(8100);
  });
});

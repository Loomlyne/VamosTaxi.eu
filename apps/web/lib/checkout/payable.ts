// apps/web/lib/checkout/payable.ts
//
// D-08a payable order: lines + checkout extras add up first; the coupon
// percent comes off that whole amount, and the total never goes below
// CHF 0; VAT 8.1% is added on top last. Coupon before VAT.
//
// Pure and testable without a lock, a database or a live rate book — the
// same discipline lib/pricing/round.ts holds for the quote kernel.

import { roundHalfUp } from "../pricing/round";
import { vatOnTopRappen } from "./vat";

export type PayableRappenInput = {
  /**
   * The lock's already-signed class total: post-coupon, lines only, no
   * checkout extras. Used as the whole net when this payment carries no
   * coupon (couponPercent null/0) — D-08a's order then has nothing left to
   * subtract before VAT.
   */
  classNetRappen: number;
  /**
   * Lines total BEFORE the coupon comes off. Required whenever
   * couponPercent is set, so the percent discounts checkout extras too
   * (D-08a) — the lock only ever carries the post-coupon figure, so the
   * caller (lib/checkout/intent.ts) grosses it back up from the
   * re-evaluated percent before calling this function. Omitted while
   * couponPercent is set falls back to classNetRappen — documented, not
   * recommended: it discounts the already-discounted class total a second
   * time rather than silently skipping the extras discount.
   */
  preCouponRappen?: number | null;
  /** Checkout extras selected after the lock — always in scope for the coupon (D-08a). */
  extraAddRappen: number;
  /**
   * Hundredths of one percent — the same scale lib/pricing/round.ts's
   * percentToHundredths returns ('10.00' -> 1000), never a float parse of
   * the coupon's numeric(5,2) percent. Null/0/undefined = no coupon, or an
   * amount-kind coupon (unchanged by this function; D-08a's extras clause
   * names percent coupons only).
   */
  couponPercent?: number | null;
  vatRateBps: number;
};

export type PayableRappen = {
  netRappen: number;
  vatRappen: number;
  chargedRappen: number;
};

const HUNDREDTHS_PERCENT_DENOMINATOR = 10_000;

function nonNegative(rappen: number): number {
  return rappen > 0 ? rappen : 0;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.trunc(value), HUNDREDTHS_PERCENT_DENOMINATOR);
}

/**
 * D-08a: (lines + extras) − coupon% (floor 0), then VAT on top.
 */
export function payableRappen(input: PayableRappenInput): PayableRappen {
  const extras = input.extraAddRappen > 0 ? Math.trunc(input.extraAddRappen) : 0;
  const percent = clampPercent(input.couponPercent ?? 0);

  let netRappen: number;
  if (percent > 0) {
    const preCoupon = input.preCouponRappen ?? input.classNetRappen;
    const base = preCoupon + extras;
    const discount = roundHalfUp(base * percent, HUNDREDTHS_PERCENT_DENOMINATOR);
    netRappen = nonNegative(base - discount);
  } else {
    netRappen = input.classNetRappen + extras;
  }

  const vatRappen = vatOnTopRappen(netRappen, input.vatRateBps);
  return { netRappen, vatRappen, chargedRappen: netRappen + vatRappen };
}

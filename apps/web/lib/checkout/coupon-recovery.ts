/**
 * 26.1-32 (D-11): what the checkout client does when /api/checkout/intent or
 * /api/checkout/pay-link refuses `coupon_no_longer_valid`.
 *
 * - `reprice_without_coupon`: the refused lock priced a coupon into its total,
 *   so the client reprices to an undiscounted lock before the next attempt.
 * - `drop_body_coupon`: the lock never priced a coupon; only the client's
 *   applied-coupon state is stale, so clearing it is enough.
 * - `show_refusal`: anything else, including a second refusal after one
 *   automatic recovery already ran — bounds recovery to one attempt per lock.
 *
 * `lockCoupon`/`bodyCoupon` mirror the server pair in `intent.ts`.
 */
export type CouponRefusalAction = "reprice_without_coupon" | "drop_body_coupon" | "show_refusal";

export function couponRefusalAction({
  code,
  lockCoupon,
  bodyCoupon,
  alreadyRecovered,
}: {
  code: string;
  lockCoupon: string | null;
  bodyCoupon: string | null;
  alreadyRecovered: boolean;
}): CouponRefusalAction {
  if (code !== "coupon_no_longer_valid" || alreadyRecovered) return "show_refusal";
  if (lockCoupon !== null) return "reprice_without_coupon";
  if (bodyCoupon !== null) return "drop_body_coupon";
  return "show_refusal";
}

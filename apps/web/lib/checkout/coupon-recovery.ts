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

/**
 * Quick 260928-cpn: what the client does after acting on a `couponRefusalAction`.
 *
 * - `recovered`: the reprice without the coupon stored a new lock, or the
 *   action was `drop_body_coupon`, which needs no reprice.
 * - `restore_lock_coupon`: the reprice failed and the stored lock still prices
 *   `lockCoupon`, so the field must show that coupon as applied again (it
 *   agrees with the discounted price on screen); the next Pay recovers through
 *   `payClickAction` (`recover_price`).
 * - `none`: nothing more to do (`show_refusal`, or no coupon left in the lock).
 */
export type CouponRecoveryOutcome = "recovered" | "restore_lock_coupon" | "none";

export function couponRecoveryOutcome({
  action,
  repriceOk,
  lockCoupon,
}: {
  action: CouponRefusalAction;
  repriceOk: boolean;
  lockCoupon: string | null;
}): CouponRecoveryOutcome {
  if (action === "drop_body_coupon") return "recovered";
  if (action !== "reprice_without_coupon") return "none";
  if (repriceOk) return "recovered";
  return lockCoupon !== null ? "restore_lock_coupon" : "none";
}

/**
 * Quick 260928-rld: what a click on Pay does. The card form only mounts with a
 * payment session, so without one there is no card to complete and the click
 * must not ask for it.
 *
 * - `recover_price`: no session, the coupon was refused and the lock on screen
 *   still prices it (a recovery reprice failed). Reprice without the coupon,
 *   like Remove; the session and card form follow. Never charges.
 * - `start_session`: no session otherwise. Let the automatic intent open one so
 *   the card form appears. Never charges.
 * - `ask_card`: a session and card form exist but the card is incomplete.
 * - `pay`: a session exists and the card is complete. The only charging action.
 */
export type PayClickAction = "recover_price" | "start_session" | "ask_card" | "pay";

export function payClickAction({
  hasSession,
  cardComplete,
  couponInvalid,
  lockCoupon,
}: {
  hasSession: boolean;
  cardComplete: boolean;
  couponInvalid: boolean;
  lockCoupon: string | null;
}): PayClickAction {
  if (!hasSession) {
    return couponInvalid && lockCoupon !== null ? "recover_price" : "start_session";
  }
  return cardComplete ? "pay" : "ask_card";
}

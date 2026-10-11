// J5 (W3-01): which message the checkout shows for a `pay=` outcome of the Stripe return route.
// One exhaustive map over PAY_OUTCOMES, so adding an outcome to the schema without a message is a
// type error and a test failure, not a silent blank page.

import type { PayOutcome } from "./trip-url";

export type PayOutcomeNoticeKey =
  | "payUnknownNotice"
  | "payUnpaidNotice"
  | "payFailedNotice"
  | "backFromStripe";

export const PAY_OUTCOME_NOTICE: Record<PayOutcome, PayOutcomeNoticeKey> = {
  unknown: "payUnknownNotice",
  unpaid: "payUnpaidNotice",
  failed: "payFailedNotice",
  cancelled: "backFromStripe",
};

/**
 * `backNoticeShown`: the resume flow already shows "Payment not finished" in the payment section
 * (same words as `cancelled`), so that outcome adds no second copy of it.
 */
export function payOutcomeNoticeKey(
  outcome: PayOutcome | null,
  backNoticeShown: boolean,
): PayOutcomeNoticeKey | null {
  if (!outcome) return null;
  const key = PAY_OUTCOME_NOTICE[outcome];
  return key === "backFromStripe" && backNoticeShown ? null : key;
}

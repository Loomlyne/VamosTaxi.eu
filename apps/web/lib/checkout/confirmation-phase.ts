import {
  isCapturedPayment,
  isFailedStatus,
  isVoucherStatus,
} from "./booking-status";

/** After this long unconfirmed the loading screen switches to "Payment received." (D-27). */
export const CONFIRMING_MS = 20_000;

/**
 * J5 (W3-04): the status poll's total budget. After this long the page stops asking and shows a
 * final "check again" state. A payer with no cookie or claims (pay-link payer, another device)
 * is answered `visible:false` for ever, so an unbounded poll never ends and spends the shared
 * read limiter (120 a minute per address). 5 minutes is the agent's choice; the owner may change it.
 */
export const POLL_BUDGET_MS = 5 * 60_000;

export type ReturnPhase = "confirming" | "received" | "stalled" | "booked" | "hidden";

/**
 * Which post-payment screen to show. Pure so the clock can be injected.
 * `status` is empty/null while the booking is not visible yet (cookie race).
 * There is deliberately no error phase: after a Stripe return the customer only
 * ever sees confirming, received or booked. A cancelled/refunded booking is not
 * on the return path and keeps its own headings ("hidden" here). `stalled` is the final state
 * once the poll budget is spent: polling stops, the page offers "Check again".
 */
export function confirmationPhase(input: {
  elapsedMs: number;
  status: string | null | undefined;
  paymentStatus: string | null | undefined;
}): ReturnPhase {
  const status = (input.status ?? "").toLowerCase();
  if (isVoucherStatus(status) || isCapturedPayment(input.paymentStatus ?? "")) return "booked";
  if (isFailedStatus(status)) return "hidden";
  if (input.elapsedMs >= POLL_BUDGET_MS) return "stalled";
  return input.elapsedMs < CONFIRMING_MS ? "confirming" : "received";
}

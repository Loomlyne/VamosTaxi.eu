import {
  isCapturedPayment,
  isFailedStatus,
  isVoucherStatus,
} from "./booking-status";

/** After this long unconfirmed the loading screen switches to "Payment received." (D-27). */
export const CONFIRMING_MS = 20_000;

export type ReturnPhase = "confirming" | "received" | "booked" | "hidden";

/**
 * Which post-payment screen to show. Pure so the clock can be injected.
 * `status` is empty/null while the booking is not visible yet (cookie race).
 * There is deliberately no error phase: after a Stripe return the customer only
 * ever sees confirming, received or booked. A cancelled/refunded booking is not
 * on the return path and keeps its own headings ("hidden" here).
 */
export function confirmationPhase(input: {
  elapsedMs: number;
  status: string | null | undefined;
  paymentStatus: string | null | undefined;
}): ReturnPhase {
  const status = (input.status ?? "").toLowerCase();
  if (isVoucherStatus(status) || isCapturedPayment(input.paymentStatus ?? "")) return "booked";
  if (isFailedStatus(status)) return "hidden";
  return input.elapsedMs < CONFIRMING_MS ? "confirming" : "received";
}

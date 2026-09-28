import type { BookingStatus } from "@/components/transfer/StatusBadge";
import { isCapturedPayment, isFailedPayment } from "./booking-status";

/** Map a booking row onto StatusBadge's closed set. Unpaid pending is `pending`. */
export function voucherBadgeStatus(
  status: string | null | undefined,
  paymentStatus?: string | null,
): BookingStatus {
  const s = (status ?? "").toLowerCase().replace(/_/g, "-");
  if (s === "refunded") return "refunded";
  if (s === "cancelled" || s === "canceled" || s === "partially-cancelled") return "cancelled";
  if (s === "no-show") return "no-show";
  if (s === "completed" || s === "partially-completed") return "completed";
  if (s === "assigned") return "assigned";
  if (s === "confirmed") return "confirmed";
  if (s === "paid") return "paid";
  if (s === "quote") return "quote";
  if (isFailedPayment(paymentStatus ?? "")) return "cancelled";
  if (isCapturedPayment(paymentStatus ?? "")) return "paid";
  return "pending";
}

export function voucherNeedsPayment(badge: BookingStatus): boolean {
  return badge === "pending" || badge === "quote";
}

/** checkout.* / statusBadge.* key for the voucher's refund row (UI-SPEC §2). */
export type VoucherRefundLabelKey =
  | "refundPendingOps"
  | "refundProcessing"
  | "refunded"
  | "refundFailedLabel"
  | "refundDeclinedLabel";

/** Maps bookings.refund_status onto the customer's plain refund words. `refunded` is a statusBadge key. */
export function voucherRefundLabelKey(refundStatus: string | null | undefined): VoucherRefundLabelKey | null {
  const s = (refundStatus ?? "").trim().toLowerCase();
  if (s === "pending_ops") return "refundPendingOps";
  if (s === "processing") return "refundProcessing";
  if (s === "refunded") return "refunded";
  if (s === "failed") return "refundFailedLabel";
  if (s === "declined") return "refundDeclinedLabel";
  return null;
}

function positiveRappen(value: number | null | undefined): number | null {
  const n = Number(value);
  return value != null && Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * D-23a: the refund amount the voucher prints, in rappen, or null when there is
 * nothing decided to show. Pending/processing show the decided (owed) amount;
 * refunded prefers what actually moved. Declined, failed and none show no amount.
 */
export function voucherRefundAmountRappen(facts: {
  refundStatus?: string | null;
  refundOwedRappen?: number | null;
  refundedRappen?: number | null;
}): number | null {
  const s = (facts.refundStatus ?? "").trim().toLowerCase();
  if (s === "refunded") return positiveRappen(facts.refundedRappen) ?? positiveRappen(facts.refundOwedRappen);
  if (s === "pending_ops" || s === "processing") return positiveRappen(facts.refundOwedRappen);
  return null;
}

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

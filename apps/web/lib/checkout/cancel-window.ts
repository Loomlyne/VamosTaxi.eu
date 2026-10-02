// apps/web/lib/checkout/cancel-window.ts
//
// 26.1-18 (D-23/D-24): the customer cancel screens mirror SQL
// compute_cancellation_refund v2 (26.1-17). The server decides the money; this
// only picks the sheet copy and whether the confirm button shows.

export type CustomerCancelWindow = "auto_full" | "pending_ops";

/**
 * Refund tier for a paid booking the customer cancels `hours` before pickup.
 * More than 24 h: automatic full refund (D-23). Anything later, including after
 * pickup: the admin reviews it and sets the percentage (D-24). There is no
 * time-based "no refund" zone any more. Callers only use this for paid bookings;
 * an unpaid booking never reaches the customer cancel sheet.
 */
export function customerCancelWindow(hours: number): CustomerCancelWindow {
  return Number.isFinite(hours) && hours > 24 ? "auto_full" : "pending_ops";
}

/** Statuses a customer can no longer cancel from: the trip ran, was cancelled, or was refunded. */
const NOT_CANCELLABLE: readonly string[] = Object.freeze([
  "completed",
  "no_show",
  "cancelled",
  "partially_cancelled",
  "refunded",
]);

/**
 * 261002: whether the Cancel button shows on the customer's booking page, for the manage link and for the
 * signed-in view alike. False once the trip ended or was cancelled/refunded, and once the customer reviewed it.
 * The server still decides what a cancel does; this only keeps the button off a booking that is already over.
 */
export function customerCanCancel(status: string, reviewSubmitted: boolean): boolean {
  return !NOT_CANCELLABLE.includes(String(status).trim().toLowerCase()) && !reviewSubmitted;
}

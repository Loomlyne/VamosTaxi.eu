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

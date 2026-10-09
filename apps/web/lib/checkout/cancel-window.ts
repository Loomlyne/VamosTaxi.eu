// apps/web/lib/checkout/cancel-window.ts
//
// 26.1-18 (D-23/D-24): the customer cancel screens show the answer of SQL compute_cancellation_refund. The
// server decides the money; this only picks the sheet copy and whether the confirm button shows.
//
// J7 W6-01: the full-refund window is the published `free_cancel_hours` the booking was sold under, so the
// screens no longer compute "more than 24 hours" themselves (the old TypeScript mirror of the literal 24 is
// gone): they ask the same database function the cancel itself uses and map its refund_mode.

export type CustomerCancelWindow = "auto_full" | "pending_ops";

/**
 * Sheet copy for a paid booking, from compute_cancellation_refund's refund_mode. auto_full: the cancel
 * refunds in full automatically. Anything else (pending_ops, none, an unreadable answer): the admin
 * reviews it, which promises the customer nothing the cancel might not keep. Callers only use this for paid
 * bookings; an unpaid booking never reaches the customer cancel sheet.
 */
export function cancelWindowFromMode(mode: string | null | undefined): CustomerCancelWindow {
  return mode === "auto_full" ? "auto_full" : "pending_ops";
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

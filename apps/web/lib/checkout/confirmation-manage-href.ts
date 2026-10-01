/**
 * Where MANAGE BOOKING on /confirmation goes (2026-10-01 redesign, plan check 1).
 *
 * - The page read this booking through the guest manage cookie: /manage-booking
 *   opens it straight away from that cookie (no lookup form).
 * - The page read it through the customer's session only (an older trip opened from
 *   the account list, where the cookie may belong to another booking):
 *   /booking-detail?ref=… loads it from the account by reference.
 * - Nothing was readable yet (return path before the webhook): /manage-booking; the
 *   page refreshes once booked and the server picks again.
 */
export type ConfirmationReadVia = "cookie" | "account" | null;

export function confirmationManageHref(locale: string, reference: string, via: ConfirmationReadVia): string {
  if (via === "account") {
    return `/${locale}/booking-detail?ref=${encodeURIComponent(reference)}`;
  }
  return `/${locale}/manage-booking`;
}

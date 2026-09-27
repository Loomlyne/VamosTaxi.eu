// Owner rules for a public booking. Home always starts a new one.
// Extras stay off until /checkout/details. Trip is never a Postgres row.

import { e164Phone, isCheckoutEmail } from "./contact-validate";

export type TravelerFields = {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
};

export type ExtraOff = {
  childSeat: false;
  oversizedLuggage: false;
  skiRack: false;
  stops: 0;
};

export const EXTRAS_OFF: ExtraOff = {
  childSeat: false,
  oversizedLuggage: false,
  skiRack: false,
  stops: 0,
};

export function isTravelerComplete(contact: TravelerFields): boolean {
  return (
    Boolean(contact.firstName.trim()) &&
    Boolean(contact.lastName.trim()) &&
    isCheckoutEmail(contact.email) &&
    e164Phone(contact.mobile).length >= 10
  );
}

/** /checkout/trip is never a saved booking. Details/payment only when who-is-travelling is complete. */
export function shouldPersistUnpaidBooking(
  step: "trip" | "details" | "payment",
  contact: TravelerFields,
): boolean {
  if (step === "trip") return false;
  return isTravelerComplete(contact);
}

export function accountListIncludesStatus(status: string, payLinkSent = false): boolean {
  const s = status.toLowerCase();
  if (s === "quote") return false;
  if (s === "pending") return payLinkSent;
  return true;
}

export type AccountUiStatus =
  | "unpaid"
  | "finished"
  | "new"
  | "confirmed"
  | "assigned"
  | "completed"
  | "cancelled";

export function accountUiStatus(status: string, payLinkSent = false): AccountUiStatus {
  const s = status.toLowerCase();
  if (s === "pending") return "unpaid";
  if (s === "cancelled" || s === "refunded" || s === "no_show") return "cancelled";
  if (s === "completed" || s === "partially_completed") return "completed";
  if (s === "assigned") return "assigned";
  if ((s === "confirmed" || s === "paid") && payLinkSent) return "finished";
  if (s === "confirmed" || s === "paid") return "confirmed";
  return "new";
}

export function accountBookingHref(status: string, reference: string, payLinkSent = false): string {
  if (!reference) return "/account";
  if (accountUiStatus(status, payLinkSent) === "unpaid") return `/confirmation/${reference}`;
  return `/confirmation/${reference}`;
}

export function shouldAbandonUnpaid(status: string, payLinkSent = false): boolean {
  return status.toLowerCase() === "pending" && !payLinkSent;
}

/** Unpaid pending rows cancel themselves after this many hours. */
export const UNPAID_TTL_HOURS = 24;

// apps/web/lib/checkout/pay-flow.ts
//
// Pure helpers of the one-page checkout's PAY path (26.3-19): the intent body (no
// amounts, T-26.3-19-01), the Stripe origin check (T-26.3-19-02), the sign-in
// returnTo, and "did anything change since Back from Stripe" (D-24).

import { buildTripQuery, type Trip } from "./trip-url";

export const STRIPE_CHECKOUT_ORIGIN = "https://checkout.stripe.com";

/** Redirect only to the hosted Stripe page; anything else is a failed start. */
export function isStripeCheckoutUrl(raw: unknown): raw is string {
  if (typeof raw !== "string") return false;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.origin === STRIPE_CHECKOUT_ORIGIN;
  } catch {
    return false;
  }
}

export type ContactInput = { firstName: string; lastName: string; email: string; mobile: string };
export type CompanyInput = { name: string; address: string; vat: string };

export type IntentInput = {
  quoteId: string;
  lock: string;
  trip: Trip;
  vehicleClass: string;
  extraCodes: readonly string[];
  coupon: string | null;
  contact: ContactInput;
  company: CompanyInput;
  note: string;
  supersedes: string | null;
  locale: string;
  currency: string;
  idempotencyKey: string;
};

export function fullName(contact: Pick<ContactInput, "firstName" | "lastName">): string {
  return `${contact.firstName.trim()} ${contact.lastName.trim()}`.trim();
}

/** The body POST /api/checkout/intent takes. Carries selections, never an amount. */
export function buildIntentBody(input: IntentInput): Record<string, unknown> {
  const { trip } = input;
  const body: Record<string, unknown> = {
    quote_id: input.quoteId,
    lock: input.lock,
    vehicle_class: input.vehicleClass,
    extra_codes: [...input.extraCodes],
    coupon: input.coupon,
    flight_no: trip.flight,
    contact: { name: fullName(input.contact), email: input.contact.email.trim(), phone: input.contact.mobile.trim() },
    company_name: input.company.name.trim(),
    company_address: input.company.address.trim(),
    company_vat: input.company.vat.trim(),
    driver_note: input.note.trim(),
    trip: {
      from: trip.from,
      fid: trip.fid,
      to: trip.to,
      tid: trip.tid,
      gs: trip.gs,
      when: trip.when,
      pax: trip.pax,
      bags: trip.bags,
      flight: trip.flight,
    },
    locale: input.locale,
    display_currency: input.currency,
    idempotency_key: input.idempotencyKey,
  };
  if (input.supersedes) body.supersedes = input.supersedes;
  return body;
}

/** `/checkout?<trip>&class=&extras=` — what sign-in returns to. No contact data. */
export function checkoutReturnPath(pathname: string, trip: Trip, cls: string | null, extras: readonly string[]): string {
  const qs = buildTripQuery({ ...trip, class: cls, extras: [...extras], resume: null, pay: null });
  return qs ? `${pathname}?${qs}` : pathname;
}

export function signInHref(returnTo: string): string {
  return `/sign-in?returnTo=${encodeURIComponent(returnTo)}`;
}

export type ResumedBooking = {
  trip_query: string;
  contact: { name: string; email: string; phone: string };
  company: { name: string; address: string; vat: string };
  note: string;
  class: string | null;
  extra_codes: string[];
  coupon: string | null;
};

export type CurrentSelection = {
  trip: Trip;
  vehicleClass: string | null;
  extraCodes: readonly string[];
  coupon: string | null;
  contact: ContactInput;
  company: CompanyInput;
  note: string;
};

function tripKey(trip: Trip): string {
  return buildTripQuery({ ...trip, class: null, extras: [], resume: null, pay: null });
}

/**
 * D-24: after Back from Stripe, PAY goes straight to the open Stripe URL only when
 * nothing that is stored on the booking changed: trip, class, extras, voucher, contact,
 * company, note. Any difference posts the intent (with supersedes).
 */
export function sameSelectionAsResumed(
  resumed: ResumedBooking,
  current: CurrentSelection,
  parseTrip: (query: string) => Trip,
): boolean {
  const norm = (v: string) => v.trim();
  const codes = (list: readonly string[]) => [...list].sort().join(",");
  if (resumed.class !== current.vehicleClass) return false;
  if (codes(resumed.extra_codes) !== codes(current.extraCodes)) return false;
  if ((resumed.coupon ?? "").toLowerCase() !== (current.coupon ?? "").toLowerCase()) return false;
  if (norm(resumed.contact.name) !== fullName(current.contact)) return false;
  if (norm(resumed.contact.email).toLowerCase() !== norm(current.contact.email).toLowerCase()) return false;
  if (norm(resumed.contact.phone) !== norm(current.contact.mobile)) return false;
  if (
    norm(resumed.company.name) !== norm(current.company.name) ||
    norm(resumed.company.address) !== norm(current.company.address) ||
    norm(resumed.company.vat) !== norm(current.company.vat)
  ) {
    return false;
  }
  if (norm(resumed.note) !== norm(current.note)) return false;
  return tripKey(parseTrip(resumed.trip_query)) === tripKey(current.trip);
}

/** sessionStorage key: voucher, company and note survive sign-in in this tab only. */
export const RETURN_STORAGE_KEY = "vamosCheckoutReturn";

export type ReturnStash = { voucher: string; company: CompanyInput; note: string };

export function readReturnStash(storage: Pick<Storage, "getItem" | "removeItem">): ReturnStash | null {
  let raw: string | null = null;
  try {
    raw = storage.getItem(RETURN_STORAGE_KEY);
    storage.removeItem(RETURN_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<ReturnStash>;
    const str = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");
    return {
      voucher: str(v.voucher, 64),
      company: {
        name: str(v.company?.name, 200),
        address: str(v.company?.address, 400),
        vat: str(v.company?.vat, 40),
      },
      note: str(v.note, 500),
    };
  } catch {
    return null;
  }
}

export function writeReturnStash(storage: Pick<Storage, "setItem">, stash: ReturnStash): void {
  try {
    storage.setItem(RETURN_STORAGE_KEY, JSON.stringify(stash));
  } catch {
    // private mode: the customer retypes three optional fields
  }
}

// packages/emails/src/lib/types.ts
//
// BookingForEmail is assembled by the Queue consumer (plan 07-07) from
// guest-readable columns only. This package never reads Postgres.

export type EmailLocale = "en" | "de" | "fr" | "ar";

export type BookingLegForEmail = {
  legSeq: number;
  direction: string;
  pickupText: string;
  dropoffText: string;
  scheduledLocal: string;
  scheduledAt: string;
  flightNo: string | null;
  vehicleClassLabel: string;
  pax: number;
  bags: number;
  estimatedDurationMinutes: number | null;
};

export type PayLinkVehicle = string;

/** @deprecated 26.3 — extras are data now; use EmailExtraLine. Plan 21 deletes this alias. */
export type PayLinkExtraCode = string;

/** One ticked extra. `names` come from the booking's snapshot lines; missing language falls back to `names.en`, then `name`. */
export type EmailExtraLine = {
  name: string;
  names?: Partial<Record<EmailLocale, string>>;
  amountRappen: number | null;
};

/**
 * One row of the S6 money block. `label` is the variable part only:
 * fare = class name, surcharge = extra name, coupon = voucher code, vat = unused.
 * The template owns the surrounding words so they translate.
 */
export type EmailMoneyLine = {
  kind: "fare" | "surcharge" | "coupon" | "vat";
  label: string;
  amountRappen: number;
};

export type EmailMoney = {
  lines: EmailMoneyLine[];
  vatRateBps: number;
  /** charged_rappen of the succeeded payment — the Stripe charge (D-29). */
  chargedRappen: number;
  /** Set only when the customer paid in a currency other than CHF (D-21). */
  presentment: { amountMinor: number; currency: string } | null;
};

export type BookingForEmail = {
  reference: string;
  contactName: string;
  contactEmail: string;
  locale: EmailLocale;
  displayCurrency: string;
  /** Null until pricing_live — render as `CHF 000`. */
  totalRappen: number | null;
  legs: BookingLegForEmail[];
  /** Caller already assembled this, raw manage token included. */
  manageUrl: string;
  extras?: EmailExtraLine[];
  money?: EmailMoney;
};

export type PayLinkForEmail = {
  reference: string;
  locale: EmailLocale;
  payUrl: string;
  /** Null until pricing_live — render as `CHF 000`. */
  totalRappen: number | null;
  pickupText: string;
  dropoffText: string;
  scheduledLocal: string;
  flightNo: string | null;
  vehicleClass: PayLinkVehicle;
  pax: number;
  bags: number;
  extras: EmailExtraLine[];
  coupon: string | null;
  contactName: string;
  contactPhone: string;
  companyName: string;
  companyAddress: string;
  companyVat: string;
};

/**
 * Mirrors the settle RPC's exactly-one-of-two contract so the consumer
 * cannot pass both a provider id and an error.
 */
export type SendOutcome =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string };

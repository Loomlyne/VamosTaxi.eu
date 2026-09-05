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
};

/**
 * Mirrors `notification_settle`'s exactly-one-of-two contract so the consumer
 * cannot pass both a provider id and an error.
 */
export type SendOutcome =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string };

// packages/emails/src/RefundFailedEmail.tsx
//
// D-08 refund-failed mail to bookings@vamostaxi.site. Trip stays cancelled.
// PayLink envelope. No WhatsApp. No invented CHF.

import type { EmailLocale } from "./lib/types";
import { t } from "./lib/t";
import { LifecycleMail, tripLines } from "./lib/lifecycle-mail";

export type RefundFailedForEmail = {
  reference: string;
  locale: EmailLocale;
  pickupText?: string;
  dropoffText?: string;
  scheduledLocal?: string;
};

export function RefundFailedEmail({ trip }: { trip: RefundFailedForEmail }) {
  const locale = trip.locale;
  return (
    <LifecycleMail
      locale={locale}
      preview={t(locale, "refundFailed.preheader")}
      headline={t(locale, "refundFailed.headline")}
      reference={trip.reference}
      intro={t(locale, "refundFailed.body")}
      pickupText={trip.pickupText}
      dropoffText={trip.dropoffText}
      scheduledLocal={trip.scheduledLocal}
    />
  );
}

export function refundFailedPlainText(trip: RefundFailedForEmail): string {
  const locale = trip.locale;
  return [t(locale, "refundFailed.headline"), t(locale, "refundFailed.body"), ...tripLines(trip)].join(
    "\n",
  );
}

export function refundFailedSubject(trip: RefundFailedForEmail): string {
  return t(trip.locale, "refundFailed.subject", { reference: trip.reference });
}

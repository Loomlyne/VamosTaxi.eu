// packages/emails/src/ReviewRequestEmail.tsx
//
// D-17 review-request after Completed or paid no-show.
// D-21: /review?token= stays forever; still one submit. No expiry copy.
// PayLink envelope. No WhatsApp. No invented CHF.

import type { EmailLocale } from "./lib/types";
import { t } from "./lib/t";
import { LifecycleMail, tripLines } from "./lib/lifecycle-mail";

const PUBLIC_ORIGIN = "https://vamostaxi.site";

export type ReviewRequestForEmail = {
  reference: string;
  locale: EmailLocale;
  token: string;
  pickupText?: string;
  dropoffText?: string;
  scheduledLocal?: string;
};

export function reviewHref(token: string): string {
  return `${PUBLIC_ORIGIN}/review?token=${token}`;
}

export function ReviewRequestEmail({ trip }: { trip: ReviewRequestForEmail }) {
  const locale = trip.locale;
  return (
    <LifecycleMail
      locale={locale}
      preview={t(locale, "reviewRequest.preheader")}
      headline={t(locale, "reviewRequest.headline")}
      reference={trip.reference}
      intro={t(locale, "reviewRequest.body")}
      pickupText={trip.pickupText}
      dropoffText={trip.dropoffText}
      scheduledLocal={trip.scheduledLocal}
      cta={{ href: reviewHref(trip.token), label: t(locale, "reviewRequest.cta") }}
    />
  );
}

export function reviewRequestPlainText(trip: ReviewRequestForEmail): string {
  const locale = trip.locale;
  return [
    t(locale, "reviewRequest.headline"),
    t(locale, "reviewRequest.body"),
    ...tripLines(trip),
    reviewHref(trip.token),
  ].join("\n");
}

export function reviewRequestSubject(trip: ReviewRequestForEmail): string {
  return t(trip.locale, "reviewRequest.subject", { reference: trip.reference });
}

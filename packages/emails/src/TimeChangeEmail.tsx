// packages/emails/src/TimeChangeEmail.tsx
//
// D-23: confirmed vs refused are distinct copy keys. D-25 confirmed mail
// goes to customer + bookings@ + assigned chauffeur. Refuse stays original.
// PayLink envelope. No WhatsApp. No invented CHF.

import type { EmailLocale } from "./lib/types";
import { t } from "./lib/t";
import { LifecycleMail, tripLines } from "./lib/lifecycle-mail";

export type TimeChangeOutcome = "confirmed" | "refused";

export type TimeChangeForEmail = {
  reference: string;
  locale: EmailLocale;
  pickupText: string;
  dropoffText: string;
  scheduledLocal: string;
  outcome: TimeChangeOutcome;
};

export function TimeChangeEmail({ trip }: { trip: TimeChangeForEmail }) {
  const locale = trip.locale;
  const refused = trip.outcome === "refused";
  return (
    <LifecycleMail
      locale={locale}
      preview={t(
        locale,
        refused ? "timeChange.refusedPreheader" : "timeChange.confirmedPreheader",
      )}
      headline={t(
        locale,
        refused ? "timeChange.refusedHeadline" : "timeChange.confirmedHeadline",
      )}
      reference={trip.reference}
      intro={t(locale, refused ? "timeChange.refusedBody" : "timeChange.confirmedBody")}
      pickupText={trip.pickupText}
      dropoffText={trip.dropoffText}
      scheduledLocal={trip.scheduledLocal}
    />
  );
}

export function timeChangePlainText(trip: TimeChangeForEmail): string {
  const locale = trip.locale;
  const refused = trip.outcome === "refused";
  return [
    t(locale, refused ? "timeChange.refusedHeadline" : "timeChange.confirmedHeadline"),
    t(locale, refused ? "timeChange.refusedBody" : "timeChange.confirmedBody"),
    ...tripLines(trip),
  ].join("\n");
}

export function timeChangeSubject(trip: TimeChangeForEmail): string {
  const key =
    trip.outcome === "refused" ? "timeChange.refusedSubject" : "timeChange.confirmedSubject";
  return t(trip.locale, key, { reference: trip.reference });
}

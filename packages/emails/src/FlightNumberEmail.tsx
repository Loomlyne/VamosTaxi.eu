// packages/emails/src/FlightNumberEmail.tsx
//
// D-27: flight number write-through. Mail bookings@ + assigned chauffeur.
// Caller supplies flightNo — never invent a number. PayLink envelope.
// No WhatsApp. No AeroDataBox.

import type { EmailLocale } from "./lib/types";
import { t } from "./lib/t";
import { Fact, LifecycleMail, ltr, tripLines } from "./lib/lifecycle-mail";

export type FlightNumberForEmail = {
  reference: string;
  locale: EmailLocale;
  pickupText: string;
  dropoffText: string;
  scheduledLocal: string;
  flightNo: string;
};

export function FlightNumberEmail({ trip }: { trip: FlightNumberForEmail }) {
  const locale = trip.locale;
  return (
    <LifecycleMail
      locale={locale}
      preview={t(locale, "flightNumber.preheader")}
      headline={t(locale, "flightNumber.headline")}
      reference={trip.reference}
      pickupText={trip.pickupText}
      dropoffText={trip.dropoffText}
      scheduledLocal={trip.scheduledLocal}
    >
      <Fact label={t(locale, "flightNumber.flightLabel")}>{ltr(trip.flightNo)}</Fact>
    </LifecycleMail>
  );
}

export function flightNumberPlainText(trip: FlightNumberForEmail): string {
  const locale = trip.locale;
  return [
    t(locale, "flightNumber.headline"),
    ...tripLines(trip),
    `${t(locale, "flightNumber.flightLabel")} ${trip.flightNo}`,
  ].join("\n");
}

export function flightNumberSubject(trip: FlightNumberForEmail): string {
  return t(trip.locale, "flightNumber.subject", { reference: trip.reference });
}

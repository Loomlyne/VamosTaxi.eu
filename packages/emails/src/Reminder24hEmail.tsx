// packages/emails/src/Reminder24hEmail.tsx
//
// D-29: 24h reminder vs original pickup. Omit chauffeur / vehicle / plate when
// unassigned. Ops unassigned ping is a distinct copy path. No WhatsApp.

import type { EmailLocale } from "./lib/types";
import { t } from "./lib/t";
import { Fact, LifecycleMail, ltr, tripLines } from "./lib/lifecycle-mail";

export type Reminder24hForEmail = {
  reference: string;
  locale: EmailLocale;
  pickupText: string;
  dropoffText: string;
  scheduledLocal: string;
  chauffeurName?: string | null;
  vehicle?: string | null;
  plate?: string | null;
  /** D-29: remind Ops the booking is still unassigned. */
  opsUnassigned?: boolean;
};

function hasDriver(trip: Reminder24hForEmail): boolean {
  return Boolean(trip.chauffeurName || trip.vehicle || trip.plate);
}

export function Reminder24hEmail({ trip }: { trip: Reminder24hForEmail }) {
  const locale = trip.locale;
  const assigned = hasDriver(trip);
  const ops = Boolean(trip.opsUnassigned);
  const headline = ops
    ? t(locale, "reminder24h.opsUnassignedHeadline")
    : t(locale, "reminder24h.headline");
  const preview = ops
    ? t(locale, "reminder24h.opsUnassignedPreheader", { reference: trip.reference })
    : t(locale, "reminder24h.preheader");
  const intro = ops
    ? t(locale, "reminder24h.opsUnassignedBody")
    : assigned
      ? undefined
      : t(locale, "reminder24h.unassigned");

  return (
    <LifecycleMail
      locale={locale}
      preview={preview}
      headline={headline}
      reference={trip.reference}
      intro={intro}
      pickupText={trip.pickupText}
      dropoffText={trip.dropoffText}
      scheduledLocal={trip.scheduledLocal}
    >
      {!ops && trip.chauffeurName ? (
        <Fact label={t(locale, "reminder24h.chauffeurLabel")}>{trip.chauffeurName}</Fact>
      ) : null}
      {!ops && trip.vehicle ? (
        <Fact label={t(locale, "vehicleLabel")}>{trip.vehicle}</Fact>
      ) : null}
      {!ops && trip.plate ? (
        <Fact label={t(locale, "reminder24h.plateLabel")}>{ltr(trip.plate)}</Fact>
      ) : null}
    </LifecycleMail>
  );
}

export function reminder24hPlainText(trip: Reminder24hForEmail): string {
  const locale = trip.locale;
  const ops = Boolean(trip.opsUnassigned);
  const lines = [
    t(locale, ops ? "reminder24h.opsUnassignedHeadline" : "reminder24h.headline"),
    ...tripLines(trip),
  ];
  if (ops) {
    lines.push(t(locale, "reminder24h.opsUnassignedBody"));
    return lines.join("\n");
  }
  if (trip.chauffeurName) {
    lines.push(`${t(locale, "reminder24h.chauffeurLabel")} ${trip.chauffeurName}`);
  }
  if (trip.vehicle) lines.push(`${t(locale, "vehicleLabel")} ${trip.vehicle}`);
  if (trip.plate) lines.push(`${t(locale, "reminder24h.plateLabel")} ${trip.plate}`);
  if (!hasDriver(trip)) lines.push(t(locale, "reminder24h.unassigned"));
  return lines.join("\n");
}

export function reminder24hSubject(trip: Reminder24hForEmail): string {
  const key = trip.opsUnassigned ? "reminder24h.opsUnassignedSubject" : "reminder24h.subject";
  return t(trip.locale, key, { reference: trip.reference });
}

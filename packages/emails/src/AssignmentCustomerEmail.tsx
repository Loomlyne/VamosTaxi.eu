// packages/emails/src/AssignmentCustomerEmail.tsx
//
// D-28: customer assignment mail (name, vehicle, plate) the moment Ops assigns.
// Empty chauffeur fields are omitted (D-29 unassigned reminder path). No WhatsApp.

import type { EmailLocale } from "./lib/types";
import { t } from "./lib/t";
import { Fact, LifecycleMail, ltr, tripLines } from "./lib/lifecycle-mail";

export type AssignmentCustomerForEmail = {
  reference: string;
  locale: EmailLocale;
  pickupText: string;
  dropoffText: string;
  scheduledLocal: string;
  chauffeurName?: string | null;
  vehicle?: string | null;
  plate?: string | null;
};

export function AssignmentCustomerEmail({ trip }: { trip: AssignmentCustomerForEmail }) {
  const locale = trip.locale;
  return (
    <LifecycleMail
      locale={locale}
      preview={t(locale, "assignmentCustomer.preheader", { reference: trip.reference })}
      headline={t(locale, "assignmentCustomer.headline")}
      reference={trip.reference}
      pickupText={trip.pickupText}
      dropoffText={trip.dropoffText}
      scheduledLocal={trip.scheduledLocal}
    >
      {trip.chauffeurName ? (
        <Fact label={t(locale, "assignmentCustomer.chauffeurLabel")}>{trip.chauffeurName}</Fact>
      ) : null}
      {trip.vehicle ? <Fact label={t(locale, "vehicleLabel")}>{trip.vehicle}</Fact> : null}
      {trip.plate ? (
        <Fact label={t(locale, "assignmentCustomer.plateLabel")}>{ltr(trip.plate)}</Fact>
      ) : null}
    </LifecycleMail>
  );
}

export function assignmentCustomerPlainText(trip: AssignmentCustomerForEmail): string {
  const locale = trip.locale;
  const lines = [t(locale, "assignmentCustomer.headline"), ...tripLines(trip)];
  if (trip.chauffeurName) {
    lines.push(`${t(locale, "assignmentCustomer.chauffeurLabel")} ${trip.chauffeurName}`);
  }
  if (trip.vehicle) lines.push(`${t(locale, "vehicleLabel")} ${trip.vehicle}`);
  if (trip.plate) lines.push(`${t(locale, "assignmentCustomer.plateLabel")} ${trip.plate}`);
  return lines.join("\n");
}

export function assignmentCustomerSubject(trip: AssignmentCustomerForEmail): string {
  return t(trip.locale, "assignmentCustomer.subject", { reference: trip.reference });
}

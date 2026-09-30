// packages/emails/src/ChauffeurAssignEmail.tsx
//
// D-51 assign mail. PayLink envelope (logo, yellow bar, grey page). No CHF,
// no driver-app CTA, no WhatsApp.

import type { EmailLocale } from "./lib/types";
import { t } from "./lib/t";
import { LifecycleMail, tripLines } from "./lib/lifecycle-mail";

export type ChauffeurDispatchForEmail = {
  reference: string;
  locale: EmailLocale;
  pickupText: string;
  dropoffText: string;
  scheduledLocal: string;
};

export type ChauffeurDispatchKind = "assign" | "unassign";

function ns(kind: ChauffeurDispatchKind): "chauffeurAssign" | "chauffeurUnassign" {
  return kind === "unassign" ? "chauffeurUnassign" : "chauffeurAssign";
}

export function ChauffeurDispatchEmail({
  trip,
  kind,
}: {
  trip: ChauffeurDispatchForEmail;
  kind: ChauffeurDispatchKind;
}) {
  const locale = trip.locale;
  const prefix = ns(kind);
  return (
    <LifecycleMail
      locale={locale}
      preview={t(locale, `${prefix}.preheader`, { reference: trip.reference })}
      headline={t(locale, `${prefix}.headline`)}
      reference={trip.reference}
      pickupText={trip.pickupText}
      dropoffText={trip.dropoffText}
      scheduledLocal={trip.scheduledLocal}
    />
  );
}

export function ChauffeurAssignEmail({ trip }: { trip: ChauffeurDispatchForEmail }) {
  return <ChauffeurDispatchEmail trip={trip} kind="assign" />;
}

export function chauffeurDispatchPlainText(
  trip: ChauffeurDispatchForEmail,
  kind: ChauffeurDispatchKind,
): string {
  return [t(trip.locale, `${ns(kind)}.headline`), ...tripLines(trip)].join("\n");
}

export function chauffeurDispatchSubject(
  trip: ChauffeurDispatchForEmail,
  kind: ChauffeurDispatchKind,
): string {
  return t(trip.locale, `${ns(kind)}.subject`, { reference: trip.reference });
}

export function chauffeurAssignPlainText(trip: ChauffeurDispatchForEmail): string {
  return chauffeurDispatchPlainText(trip, "assign");
}

export function chauffeurAssignSubject(trip: ChauffeurDispatchForEmail): string {
  return chauffeurDispatchSubject(trip, "assign");
}

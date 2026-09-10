// packages/emails/src/ChauffeurUnassignEmail.tsx
//
// D-51 unassign mail. Same PayLink envelope as assign. No CHF, no driver-app
// CTA, no WhatsApp.

import {
  ChauffeurDispatchEmail,
  chauffeurDispatchPlainText,
  chauffeurDispatchSubject,
  type ChauffeurDispatchForEmail,
} from "./ChauffeurAssignEmail";

export type { ChauffeurDispatchForEmail };

export function ChauffeurUnassignEmail({ trip }: { trip: ChauffeurDispatchForEmail }) {
  return <ChauffeurDispatchEmail trip={trip} kind="unassign" />;
}

export function chauffeurUnassignPlainText(trip: ChauffeurDispatchForEmail): string {
  return chauffeurDispatchPlainText(trip, "unassign");
}

export function chauffeurUnassignSubject(trip: ChauffeurDispatchForEmail): string {
  return chauffeurDispatchSubject(trip, "unassign");
}

// packages/emails/src/CancellationEmail.tsx
//
// D-11 cancel mail. PayLink envelope. No WhatsApp. No invented CHF.
// Phase 31 D-08: one policy line for a paid cancel (full_captured and
// pending_ops render the same signed sentence, W3 of
// .planning/decisions/2026-10-12-refund-wording-signed.md), no amount, never
// Stripe. "none" keeps its own line. The sentence is plain text, not ltr():
// it must wrap and follow the mail's direction.

import type { EmailLocale } from "./lib/types";
import { t } from "./lib/t";
import { Fact, LifecycleMail, tripLines } from "./lib/lifecycle-mail";

export type CancellationRefundLine = "pending_ops" | "full_captured" | "none";

export type CancellationForEmail = {
  reference: string;
  locale: EmailLocale;
  pickupText: string;
  dropoffText: string;
  scheduledLocal: string;
  refundLine: CancellationRefundLine;
  /** D-14: assigned chauffeur on this trip → URGENT ops subject. */
  urgent?: boolean;
};

/** Paid cancel (either window) → the signed policy line; nothing paid → the "none" line. */
function refundKey(line: CancellationRefundLine): string {
  if (line === "pending_ops" || line === "full_captured") return "cancellation.refundPolicy";
  return "cancellation.refundNone";
}

export function CancellationEmail({ trip }: { trip: CancellationForEmail }) {
  const locale = trip.locale;
  return (
    <LifecycleMail
      locale={locale}
      preview={t(locale, "cancellation.preheader")}
      headline={t(locale, "cancellation.headline")}
      reference={trip.reference}
      pickupText={trip.pickupText}
      dropoffText={trip.dropoffText}
      scheduledLocal={trip.scheduledLocal}
    >
      <Fact label={t(locale, "cancellation.refundLabel")}>
        {t(locale, refundKey(trip.refundLine))}
      </Fact>
    </LifecycleMail>
  );
}

export function cancellationPlainText(trip: CancellationForEmail): string {
  const locale = trip.locale;
  return [
    t(locale, "cancellation.headline"),
    ...tripLines(trip),
    t(locale, refundKey(trip.refundLine)),
  ].join("\n");
}

export function cancellationSubject(trip: CancellationForEmail): string {
  const key = trip.urgent ? "cancellation.subjectUrgent" : "cancellation.subject";
  return t(trip.locale, key, { reference: trip.reference });
}

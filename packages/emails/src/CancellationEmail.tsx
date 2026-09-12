// packages/emails/src/CancellationEmail.tsx
//
// D-11 cancel mail. PayLink envelope. Refund line is Pending Ops / full
// captured / none. D-07 payout copy: card issuer timing, no day count.
// No WhatsApp. No invented CHF.

import type { EmailLocale } from "./lib/types";
import { t } from "./lib/t";
import { Fact, LifecycleMail, ltr, tripLines } from "./lib/lifecycle-mail";

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

function refundKey(line: CancellationRefundLine): string {
  if (line === "pending_ops") return "cancellation.refundPendingOps";
  if (line === "full_captured") return "cancellation.refundFullCaptured";
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
        {ltr(t(locale, refundKey(trip.refundLine)))}
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

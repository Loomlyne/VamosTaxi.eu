// apps/web/lib/ops/money-alert-mail.ts
//
// J7 (payments review 2026-10-09, W6-05 / W6-07): the ops mail for a refund Stripe reversed and for a card
// dispute that opened or changed status. It goes through the existing must-fix mail (sendOpsMustFix, the
// info@ inbox, SUPPORT_EMAIL) and carries IDs ONLY (the D-06 rule of the stuck-payment mail): the booking
// reference, the Stripe event id and type, the refund or dispute id. No name, e-mail, card or amount.
//
// Unlike deliverStuckPaymentAlert this one THROWS when the mail did not go out (no key, Resend refused,
// no recipient): the caller keeps the Stripe event open and retries, so the alert is never lost silently.

import { sendOpsMustFix, type OpsMustFixForEmail } from "@vamos/emails/confirmation";
import { SUPPORT_EMAIL } from "../contact-channels";
import type { MoneyAlertInput } from "../checkout/money-events";

export type MoneyAlertKind = "refund-failed" | "dispute";

export async function deliverMoneyAlert(
  env: CloudflareEnv,
  kind: MoneyAlertKind,
  input: MoneyAlertInput,
): Promise<void> {
  const key = env.RESEND_API_KEY ?? "";
  if (!key) throw new Error("RESEND_API_KEY is not bound");
  const payload: OpsMustFixForEmail = {
    locale: "en",
    kind,
    trips: [{ reference: input.reference ?? "", pickupText: "", dropoffText: "", scheduledLocal: "" }],
    detail: { eventId: input.eventId, eventType: input.type, objectId: input.objectId },
  };
  const outcome = await sendOpsMustFix({ RESEND_API_KEY: key }, payload, SUPPORT_EMAIL);
  if (!outcome.ok) throw new Error(outcome.error || "ops mail not sent");
}

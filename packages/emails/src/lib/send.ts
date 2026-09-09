// packages/emails/src/lib/send.ts
//
// Confirmation send only. This package never claims and never settles —
// notification_claim / notification_settle are the Queue consumer's
// (plan 07-07), vamos_system-only. No postgres, no @vamos/db.
//
// The catch below is the other half of claim-then-send: an exception
// escaping here would leave a claimed row with neither sent_at nor
// failed_at (the stuck-row failure the 07-03 sweep exists to clean up).

import { Resend } from "resend";
import { ConfirmationEmail } from "../ConfirmationEmail";
import { PayLinkEmail, payLinkPlainText, payLinkSubject } from "../PayLinkEmail";
import { buildInvite } from "./ics";
import { renderConfirmation } from "./render";
import type { BookingForEmail, PayLinkForEmail, SendOutcome } from "./types";

/**
 * Bump the trailing serial when rendered content changes; bump the date
 * when the template is rewritten. Never send the column's empty default.
 * The claim RPC raises if this fails the version regex.
 */
export const CONFIRMATION_TEMPLATE_VERSION = "confirmation@2026-09-05-1";

/**
 * Worker-secret shape. `RESEND_API_KEY` reaches the Worker via
 * `wrangler secret put`, never `vars`, never `NEXT_PUBLIC_*`.
 * Added to `apps/web/lib/env.d.ts` in plan 07-07, where the Worker reads it
 * for this send path.
 */
export type EmailEnv = {
  RESEND_API_KEY: string;
};

const FROM = "Vamos Taxi <noreply@vamostaxi.site>";

export async function sendConfirmation(
  env: EmailEnv,
  booking: BookingForEmail,
): Promise<SendOutcome> {
  try {
    if (!env.RESEND_API_KEY) {
      return { ok: false, error: "RESEND_API_KEY is not bound" };
    }
    const { text, subject } = await renderConfirmation(booking);
    const invite = buildInvite(booking);
    const resend = new Resend(env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: FROM,
      to: booking.contactEmail,
      subject,
      react: ConfirmationEmail({ booking }),
      text,
      attachments: [
        {
          filename: `${booking.reference}.ics`,
          content: Buffer.from(invite, "utf8").toString("base64"),
        },
      ],
    });
    if (result.error) {
      return { ok: false, error: result.error.message };
    }
    const id = result.data?.id;
    if (!id) {
      return { ok: false, error: "Resend returned no id" };
    }
    return { ok: true, providerMessageId: id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "sendConfirmation failed";
    return { ok: false, error: message };
  }
}

export async function sendPayLink(
  env: EmailEnv,
  link: PayLinkForEmail,
  to: string[],
): Promise<SendOutcome> {
  try {
    if (!env.RESEND_API_KEY) {
      return { ok: false, error: "RESEND_API_KEY is not bound" };
    }
    const unique = [...new Set(to.map((addr) => addr.trim().toLowerCase()).filter(Boolean))];
    if (unique.length === 0) {
      return { ok: false, error: "no pay-link recipients" };
    }
    const resend = new Resend(env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: FROM,
      to: unique,
      subject: payLinkSubject(link),
      react: PayLinkEmail({ link }),
      text: payLinkPlainText(link),
    });
    if (result.error) {
      return { ok: false, error: result.error.message };
    }
    const id = result.data?.id;
    if (!id) {
      return { ok: false, error: "Resend returned no id" };
    }
    return { ok: true, providerMessageId: id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "sendPayLink failed";
    return { ok: false, error: message };
  }
}

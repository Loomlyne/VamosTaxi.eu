// apps/web/lib/checkout/refund-mail-alert.ts
//
// Phase 31: a lost customer refund mail is never silent. When the customer refund mail cannot be claimed
// (refund-mail.ts), info@ (SUPPORT_EMAIL) gets one English alert naming only the booking reference and the
// Stripe refund id. Ids only: never a name, an address or an amount. No database import, so no force-dynamic.

import { sendRefundMailAlert } from "@vamos/emails/confirmation";
import { SUPPORT_EMAIL } from "../contact-channels";

/**
 * Sends the "Refund mail not sent" alert to SUPPORT_EMAIL. The Resend idempotency key
 * `refund-mail-alert:<re_id>` keeps a replayed webhook from alerting twice. Answers whether Resend accepted
 * it; never throws (no key, a refusal or a throw all answer false).
 */
export async function alertRefundMailNotSent(
  env: CloudflareEnv,
  input: { reference: string | null; stripeRefundId: string },
): Promise<boolean> {
  try {
    const outcome = await sendRefundMailAlert(
      { RESEND_API_KEY: env.RESEND_API_KEY ?? "" },
      { reference: input.reference, stripeRefundId: input.stripeRefundId },
      SUPPORT_EMAIL,
      `refund-mail-alert:${input.stripeRefundId}`,
    );
    return outcome.ok;
  } catch {
    return false;
  }
}

// Server retrieves the Checkout Session. Paid is Stripe's word, not the browser's.
// The webhook is still the durable path. This covers a return when the webhook
// has not arrived yet.

import { asSystem } from "../db/identity";
import { BOOKING_REFERENCE_RE } from "./booking-status";
import { handleStripeMessage, type HandleResult } from "./settle";
import { retrieveCheckoutSession, stripeFromEnv } from "./stripe";

const SESSION_ID = /^cs_(?:test|live)_[A-Za-z0-9]+$/;

export function isCheckoutSessionId(value: string): boolean {
  return SESSION_ID.test(value);
}


export async function referenceForCheckoutSession(
  env: CloudflareEnv,
  sessionId: string,
): Promise<string> {
  if (!isCheckoutSessionId(sessionId)) return "";
  try {
    const rows = await asSystem(env, (sql) =>
      sql<{ reference: string | null }[]>`
        select public.checkout_reference_for_session(${sessionId}) as reference
      `,
    );
    const reference = String(rows[0]?.reference ?? "");
    return BOOKING_REFERENCE_RE.test(reference) ? reference : "";
  } catch {
    return "";
  }
}

/**
 * 26.1-16 (D-22): a settle that reports a refunded duplicate is "duplicate",
 * so the return route can tell the payer their charge was reversed.
 */
export function returnSettleOutcome(handled: HandleResult): "paid" | "duplicate" | "failed" {
  if ("retry" in handled) return "failed";
  return handled.settled?.duplicate ? "duplicate" : "paid";
}

export async function settlePaidReturn(
  env: CloudflareEnv,
  sessionId: string,
): Promise<"paid" | "duplicate" | "unpaid" | "failed"> {
  if (!isCheckoutSessionId(sessionId)) return "failed";
  const stripe = stripeFromEnv(env);
  const session = await retrieveCheckoutSession(stripe, sessionId);
  if (session.payment_status !== "paid") return "unpaid";
  const eventId = `return_${session.id}`;
  const created = new Date((session.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString();
  await asSystem(env, async (sql) => {
    await sql`
      select public.stripe_event_record(
        ${eventId},
        ${"checkout.session.completed"},
        ${created}::timestamptz,
        ${session.id},
        ${JSON.stringify({ id: session.id, payment_status: session.payment_status })}::jsonb
      )
    `;
  });
  const handled = await handleStripeMessage(env, {
    eventId,
    type: "checkout.session.completed",
    objectId: session.id,
    stripeCreated: session.created ?? Math.floor(Date.now() / 1000),
  });
  return returnSettleOutcome(handled);
}

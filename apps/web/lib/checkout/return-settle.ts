// Server retrieves the Checkout Session. Paid is Stripe's word, not the browser's.
// The webhook is still the durable path. This covers a return when the webhook
// has not arrived yet.

import { asSystem } from "../db/identity";
import { BOOKING_REFERENCE_RE } from "./booking-status";
import { handleStripeMessage, type HandleResult } from "./settle";
import { recordStripeEvent } from "./stripe-event-record";
import type Stripe from "stripe";
import { localePath } from "./steps";
import { retrieveCheckoutSession, stripeFromEnv } from "./stripe";

const SESSION_ID = /^cs_(?:test|live)_[A-Za-z0-9]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/**
 * 26.3 (D-27): what the return route learned from Stripe. `unknown` means the
 * retrieve itself failed — never read as unpaid or failed.
 */
export type ReturnSession = {
  status: "paid" | "unpaid" | "unknown";
  quoteId: string | null;
  reference: string | null;
  session: Stripe.Checkout.Session | null;
};

/** Retrieves the session once. Never throws: a Stripe error is `unknown`. */
export async function readReturnSession(
  env: CloudflareEnv,
  sessionId: string,
): Promise<ReturnSession> {
  if (!isCheckoutSessionId(sessionId)) {
    return { status: "unknown", quoteId: null, reference: null, session: null };
  }
  try {
    const session = await retrieveCheckoutSession(stripeFromEnv(env), sessionId);
    return sessionFacts(session);
  } catch {
    return { status: "unknown", quoteId: null, reference: null, session: null };
  }
}

/** Paid state, quote id and reference from a retrieved session, each validated. */
export function sessionFacts(session: Stripe.Checkout.Session): ReturnSession {
  const quoteId = String(session.metadata?.booking_id ?? "");
  const reference = String(session.metadata?.booking_reference ?? session.client_reference_id ?? "");
  return {
    status: session.payment_status === "paid" ? "paid" : "unpaid",
    quoteId: UUID_RE.test(quoteId) ? quoteId.toLowerCase() : null,
    reference: BOOKING_REFERENCE_RE.test(reference) ? reference : null,
    session,
  };
}

/** Settles an already-retrieved session (the webhook stays the durable path). */
export async function settlePaidReturn(
  env: CloudflareEnv,
  session: Stripe.Checkout.Session,
): Promise<"paid" | "duplicate" | "unpaid" | "failed"> {
  if (session.payment_status !== "paid") return "unpaid";
  const eventId = `return_${session.id}`;
  const created = session.created ?? Math.floor(Date.now() / 1000);
  await recordStripeEvent(env, {
    id: eventId,
    type: "checkout.session.completed",
    created,
    objectId: session.id,
    payload: { id: session.id, payment_status: session.payment_status },
  });
  const handled = await handleStripeMessage(env, {
    eventId,
    type: "checkout.session.completed",
    objectId: session.id,
    stripeCreated: created,
  });
  return returnSettleOutcome(handled);
}

export type ReturnRedirectDeps = {
  readSession: (sessionId: string) => Promise<ReturnSession>;
  settle: (session: Stripe.Checkout.Session) => Promise<"paid" | "duplicate" | "unpaid" | "failed">;
  lookupReference: (sessionId: string) => Promise<string>;
  /** F6: per-visitor gate, asked before the Stripe read. false = answer pay=unknown, no Stripe call. */
  allowRead?: () => Promise<boolean>;
};

export type ReturnRedirectInput = {
  sessionId: string;
  ref: string;
  locale: string;
};

/**
 * 26.3 (D-27): where the Stripe return lands. Paid is Stripe's word, so a paid
 * session always reaches the confirmation, even when settle or the e-mail
 * throws. Unpaid goes back to the one-page checkout with its quote. There is
 * no failure page after a payment. Every target is a fixed path plus a
 * validated id (no reflected URL).
 */
export async function returnRedirectTarget(
  deps: ReturnRedirectDeps,
  input: ReturnRedirectInput,
): Promise<string> {
  const { sessionId, ref, locale } = input;
  const checkout = localePath(locale, "/checkout");
  if (!isCheckoutSessionId(sessionId)) return checkout;
  if (deps.allowRead && !(await deps.allowRead().catch(() => false))) return `${checkout}?pay=unknown`;
  const read = await deps.readSession(sessionId).catch(
    (): ReturnSession => ({ status: "unknown", quoteId: null, reference: null, session: null }),
  );
  if (read.status === "unknown") return `${checkout}?pay=unknown`;
  if (read.status === "unpaid") {
    return read.quoteId
      ? `${checkout}?resume=${encodeURIComponent(read.quoteId)}&pay=unpaid`
      : `${checkout}?pay=unpaid`;
  }
  let result: "paid" | "duplicate" | "unpaid" | "failed" = "paid";
  try {
    if (read.session) result = await deps.settle(read.session);
  } catch {
    // Settle is retried by the webhook; the payer already paid.
    result = "paid";
  }
  let bookingRef = BOOKING_REFERENCE_RE.test(ref) ? ref : "";
  if (!bookingRef) {
    try {
      bookingRef = await deps.lookupReference(sessionId);
    } catch {
      bookingRef = "";
    }
  }
  if (!BOOKING_REFERENCE_RE.test(bookingRef) && read.reference) bookingRef = read.reference;
  // 26.1-16 (D-22): this payer's charge lost the race and was refunded —
  // the booking is paid by the other payer; the confirmation says so.
  if (result === "duplicate" && BOOKING_REFERENCE_RE.test(bookingRef)) {
    return localePath(locale, `/confirmation/${bookingRef}?charge=refunded`);
  }
  if (BOOKING_REFERENCE_RE.test(bookingRef)) {
    return localePath(locale, `/confirmation/${bookingRef}`);
  }
  return `${localePath(locale, "/confirmation")}?session=${encodeURIComponent(sessionId)}`;
}

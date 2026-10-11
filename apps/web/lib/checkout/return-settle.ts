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
import { log, type LogFields } from "../logger";
import type { PayOutcome } from "./trip-url";

const SESSION_ID = /^cs_(?:test|live)_[A-Za-z0-9]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isCheckoutSessionId(value: string): boolean {
  return SESSION_ID.test(value);
}

/**
 * J5 (W3-02): every failure on the return path is an error-level line, so a broken key, a
 * Stripe outage or a settle bug is visible instead of silently landing on a blank page.
 * Fixed reason plus the error's class only: never the message (Stripe messages can carry a
 * key fragment or an id), never the session id, URL, cookie or any contact data.
 */
export type ReturnFailureReason =
  | "return-retrieve-failed"
  | "return-settle-failed"
  | "return-lookup-failed"
  | "return-rate-limited"
  | "return-deadline"
  | "return-no-env"
  | "return-limiter-missing"
  | "return-unhandled";

export function errorLogFields(err: unknown): LogFields {
  if (!err || typeof err !== "object") return { errorKind: typeof err };
  const e = err as { type?: unknown; code?: unknown; statusCode?: unknown; name?: unknown };
  const text = (v: unknown): string | null => (typeof v === "string" && v.length <= 80 ? v : null);
  return {
    errorName: text(e.name),
    errorType: text(e.type),
    errorCode: text(e.code),
    errorStatus: typeof e.statusCode === "number" ? e.statusCode : null,
  };
}

export function logReturnFailure(reason: ReturnFailureReason, err?: unknown): void {
  log(
    "error",
    "checkout_return",
    { requestId: "return", route: "/api/checkout/return", locale: null },
    { reason, ...(err === undefined ? {} : errorLogFields(err)) },
  );
}

/** J5 (W3-11): thrown when a step of the return route runs past its deadline. */
export class ReturnDeadlineError extends Error {
  constructor(readonly label: string) {
    super(`return deadline: ${label}`);
    this.name = "ReturnDeadlineError";
  }
}

/** Rejects with ReturnDeadlineError when `work` is not done in `ms`; the timer never outlives the work. */
export function withDeadline<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new ReturnDeadlineError(label)), ms);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

/** Stripe read on the return route: no retries and a short timeout; the webhook is the durable path. */
export const RETURN_STRIPE_TIMEOUT_MS = 4_000;
/** Settle on the return route: past this the payer is sent on, the webhook finishes it. */
export const RETURN_SETTLE_DEADLINE_MS = 6_000;
/** The database-only reference lookup. */
export const RETURN_LOOKUP_DEADLINE_MS = 3_000;


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
  } catch (err) {
    logReturnFailure("return-lookup-failed", err);
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

/**
 * Retrieves the session once, with a short deadline and no retries (W3-11). Never throws:
 * a Stripe error is `unknown` and is logged at error level (W3-02).
 */
export async function readReturnSession(
  env: CloudflareEnv,
  sessionId: string,
): Promise<ReturnSession> {
  if (!isCheckoutSessionId(sessionId)) {
    return { status: "unknown", quoteId: null, reference: null, session: null };
  }
  try {
    const session = await retrieveCheckoutSession(stripeFromEnv(env), sessionId, {
      timeout: RETURN_STRIPE_TIMEOUT_MS,
      maxNetworkRetries: 0,
    });
    return sessionFacts(session);
  } catch (err) {
    logReturnFailure("return-retrieve-failed", err);
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
  /** F6: per-visitor gate, asked before the Stripe read. false = no Stripe call, the "checking" page. */
  allowRead?: () => Promise<boolean>;
  /** Error-level log hook (W3-02). Defaults to the structured logger; fixed reasons only, never ids or messages. */
  onFailure?: (reason: ReturnFailureReason, err?: unknown) => void;
};

export type ReturnRedirectInput = {
  sessionId: string;
  locale: string;
};

/** `/checkout` with the outcome the page renders (W3-01): every value the route can emit is a PayOutcome. */
export function checkoutOutcomePath(locale: string, outcome: PayOutcome, quoteId?: string | null): string {
  const checkout = localePath(locale, "/checkout");
  return quoteId
    ? `${checkout}?resume=${encodeURIComponent(quoteId)}&pay=${outcome}`
    : `${checkout}?pay=${outcome}`;
}

/**
 * 26.3 (D-27): where the Stripe return lands. Paid is Stripe's word, so a paid
 * session always reaches the confirmation, even when settle or the e-mail
 * throws. Unpaid goes back to the one-page checkout with its quote.
 *
 * J5 (W3-01): when Stripe cannot be read (outage, refused key, rate limit) the payer may well
 * have paid, so they never land on the empty trip editor. A database-only lookup finds the
 * booking reference (confirmation page, which says "we are checking your payment"); with no
 * reference they reach `/confirmation?session=…`, the same state without one. Every target is
 * a fixed path plus a validated id (no reflected URL). The reference is always server-derived
 * (database, then the session's own metadata): a `ref` query value is not read (W3-10).
 */
export async function returnRedirectTarget(
  deps: ReturnRedirectDeps,
  input: ReturnRedirectInput,
): Promise<string> {
  const { sessionId, locale } = input;
  const checkout = localePath(locale, "/checkout");
  const fail = deps.onFailure ?? logReturnFailure;
  if (!isCheckoutSessionId(sessionId)) return checkout;

  const lookup = async (): Promise<string> => {
    try {
      const found = await deps.lookupReference(sessionId);
      return BOOKING_REFERENCE_RE.test(found) ? found : "";
    } catch (err) {
      fail("return-lookup-failed", err);
      return "";
    }
  };
  const checking = async (): Promise<string> => {
    const reference = await lookup();
    if (reference) return `${localePath(locale, `/confirmation/${reference}`)}?check=1`;
    return `${localePath(locale, "/confirmation")}?session=${encodeURIComponent(sessionId)}`;
  };

  if (deps.allowRead && !(await deps.allowRead().catch(() => false))) {
    fail("return-rate-limited");
    return checking();
  }
  let read: ReturnSession;
  try {
    read = await deps.readSession(sessionId);
  } catch (err) {
    fail("return-retrieve-failed", err);
    read = { status: "unknown", quoteId: null, reference: null, session: null };
  }
  if (read.status === "unknown") return checking();
  if (read.status === "unpaid") return checkoutOutcomePath(locale, "unpaid", read.quoteId);

  let result: "paid" | "duplicate" | "unpaid" | "failed" = "paid";
  try {
    if (read.session) result = await deps.settle(read.session);
  } catch (err) {
    // Settle is retried by the webhook; the payer already paid.
    fail(err instanceof ReturnDeadlineError ? "return-deadline" : "return-settle-failed", err);
    result = "paid";
  }
  if (result === "failed") fail("return-settle-failed");
  let bookingRef = await lookup();
  if (!bookingRef && read.reference) bookingRef = read.reference;
  // 26.1-16 (D-22): this payer's charge lost the race and was refunded —
  // the booking is paid by the other payer; the confirmation says so.
  if (result === "duplicate" && bookingRef) {
    return localePath(locale, `/confirmation/${bookingRef}?charge=refunded`);
  }
  if (bookingRef) return localePath(locale, `/confirmation/${bookingRef}`);
  return `${localePath(locale, "/confirmation")}?session=${encodeURIComponent(sessionId)}`;
}

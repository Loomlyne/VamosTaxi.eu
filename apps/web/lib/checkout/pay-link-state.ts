// apps/web/lib/checkout/pay-link-state.ts
//
// Why a pay link is no longer payable (26.1-15, D-20/D-21/D-22). The open
// route calls resolvePayLinkRefusal after checkout_pay_link_by_hash misses;
// readState wraps public.checkout_pay_link_state. Pure: no env, no Stripe.

import { CHECKOUT_REFUSALS } from "./errors";

/** Stripe Checkout Session id shape. Anything else is ignored, never echoed (T-26.1-48). */
const SESSION_ID_PATTERN = /^cs_(test|live)_[A-Za-z0-9]+$/;

export type PayLinkStateRow = { state: string; reference: string | null };

export type PayLinkRefusalDeps = {
  /** Reads checkout_pay_link_state(token_hash, session_id); null when no row. */
  readState: (sessionId: string | null) => Promise<PayLinkStateRow | null>;
};

type PayLinkRefusalCode = "pay_link_paid" | "pay_link_refunded_duplicate" | "pay_link_expired";

/** The recipient's own session id from the Stripe return, or null when absent or malformed. */
export function payLinkSessionId(value: unknown): string | null {
  return typeof value === "string" && SESSION_ID_PATTERN.test(value) ? value : null;
}

function payLinkRefusal(code: PayLinkRefusalCode, reference?: string): Response {
  const body: { ok: false; code: PayLinkRefusalCode; reference?: string } = { ok: false, code };
  if (reference) body.reference = reference;
  return Response.json(body, {
    status: CHECKOUT_REFUSALS[code].status,
    headers: { "cache-control": "private, no-store" },
  });
}

/**
 * Maps the state read to the open route's refusal:
 * paid → pay_link_paid + reference (D-21); refunded_duplicate for the
 * recipient's own session → pay_link_refunded_duplicate + reference (D-22);
 * everything else (expired, cancelled, revoked, unknown, no row) →
 * pay_link_expired with no reference.
 */
export async function resolvePayLinkRefusal(
  deps: PayLinkRefusalDeps,
  sessionId: string | null,
): Promise<Response> {
  const row = await deps.readState(sessionId);
  const reference = row?.reference ?? null;
  if (row?.state === "paid" && reference) {
    return payLinkRefusal("pay_link_paid", reference);
  }
  if (row?.state === "refunded_duplicate" && reference) {
    return payLinkRefusal("pay_link_refunded_duplicate", reference);
  }
  return payLinkRefusal("pay_link_expired");
}

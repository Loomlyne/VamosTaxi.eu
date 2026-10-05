// apps/web/lib/checkout/lock-expire.ts
//
// POST /api/checkout/lock-expire, as pure logic. The pay-link page calls it when its lock runs out,
// so the Stripe page it opened can no longer take money after that.
//
// Security S8 (2026-10-05): before, the quote id alone expired the payer's open Stripe Checkout
// Session, so anyone who had seen a quote id could cancel someone else's payment page. Now the
// caller must prove it holds that payment, one of:
//   - its vt_manage cookie owns the booking of that quote (the web checkout's own cookie), or
//   - it sends the open Stripe Checkout Session id (`session_id`), which only the page that opened
//     it holds (the pay-link page has no vt_manage cookie: the recipient often is not the booker).
// Anything else is refused before Stripe is called. The call is also rate limited (S12).

import { refuse } from "./errors";
import type { OpenPayment } from "./load-open-payment";
import { payLinkSessionId } from "./pay-link-state";

const QUOTE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LockExpireDeps = {
  /** The read rate limit (S12). False answers 429 before anything is read. */
  allowed: () => Promise<boolean>;
  loadOpenPayment: (quoteId: string) => Promise<OpenPayment | null>;
  /** True when the request's own vt_manage cookie owns this booking. */
  ownsBooking: (bookingId: string) => Promise<boolean>;
  /** False when Stripe must not be called (no key, or the legacy UAE test account). */
  stripeReady: () => boolean;
  expireCheckoutSession: (sessionId: string) => Promise<void>;
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "private, no-store" } });
}

export function lockExpireBody(body: unknown): { quoteId: string; sessionId: string | null } | null {
  if (!body || typeof body !== "object") return null;
  const record = body as { quote_id?: unknown; quoteId?: unknown; session_id?: unknown };
  const raw = record.quote_id ?? record.quoteId;
  if (typeof raw !== "string") return null;
  const quoteId = raw.trim();
  if (!QUOTE_ID.test(quoteId)) return null;
  return { quoteId, sessionId: payLinkSessionId(record.session_id) };
}

export async function runLockExpire(body: unknown, deps: LockExpireDeps): Promise<Response> {
  if (!(await deps.allowed())) {
    return Response.json(
      { ok: false, code: "rate_limited" },
      { status: 429, headers: { "cache-control": "private, no-store", "retry-after": "60" } },
    );
  }
  const parsed = lockExpireBody(body);
  if (!parsed) return refuse("invalid_request");

  let open: OpenPayment | null;
  try {
    open = await deps.loadOpenPayment(parsed.quoteId);
  } catch {
    return json({ ok: false, code: "session_lookup_failed" }, 503);
  }
  if (!open?.stripe_checkout_session_id) return json({ ok: true });

  const sessionMatches = parsed.sessionId !== null && parsed.sessionId === open.stripe_checkout_session_id;
  const owns = sessionMatches ? true : await deps.ownsBooking(open.booking_id).catch(() => false);
  if (!owns) return json({ ok: false, code: "not_owner" }, 403);

  if (!deps.stripeReady()) return json({ ok: false, code: "session_not_expired" }, 503);
  try {
    await deps.expireCheckoutSession(open.stripe_checkout_session_id);
  } catch {
    return json({ ok: false, code: "session_not_expired" }, 503);
  }
  return json({ ok: true });
}

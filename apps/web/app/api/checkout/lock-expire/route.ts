// apps/web/app/api/checkout/lock-expire/route.ts
//
// POST /api/checkout/lock-expire. Expire the stored Checkout Session for a
// quote id. CSRF. Quote id only. No mint. No cancel. No refund.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asCheckout } from "@/lib/db/identity";
import { refuse } from "@/lib/checkout/errors";
import { stripeAccountIsLegacyUaeTest } from "@/lib/checkout/charge-gate";
import { loadOpenPayment } from "@/lib/checkout/load-open-payment";
import { expireCheckoutSession, stripeFromEnv } from "@/lib/checkout/stripe";
import { csrfForbidden } from "@/lib/security/origin";

export const dynamic = "force-dynamic";

const QUOTE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store" },
  });
}

function quoteIdFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as { quote_id?: unknown; quoteId?: unknown };
  const raw = record.quote_id ?? record.quoteId;
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return QUOTE_ID.test(id) ? id : null;
}

export async function POST(request: Request) {
  const blocked = csrfForbidden(request);
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return refuse("invalid_request");
  }
  const quoteId = quoteIdFromBody(body);
  if (!quoteId) return refuse("invalid_request");

  const { env } = getCloudflareContext();
  let sessionId: string | null;
  try {
    const open = await asCheckout(env, null, (sql) => loadOpenPayment(sql, quoteId));
    sessionId = open?.stripe_checkout_session_id ? String(open.stripe_checkout_session_id) : null;
  } catch {
    return json({ ok: false, code: "session_lookup_failed" }, 503);
  }

  if (!sessionId) return json({ ok: true });

  const publishable = env.STRIPE_PUBLISHABLE_KEY || "";
  if (!publishable || stripeAccountIsLegacyUaeTest(publishable)) {
    return json({ ok: false, code: "session_not_expired" }, 503);
  }

  try {
    const stripe = stripeFromEnv(env);
    await expireCheckoutSession(stripe, sessionId);
  } catch {
    return json({ ok: false, code: "session_not_expired" }, 503);
  }

  return json({ ok: true });
}

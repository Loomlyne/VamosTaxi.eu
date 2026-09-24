// apps/web/app/api/checkout/requote/route.ts
//
// POST /api/checkout/requote. Guest cancel by quote id. CSRF, then
// vamos_checkout. Does not mint. ok true only after the stored session
// was expired, or a successful lookup found no session id.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asCheckout } from "@/lib/db/identity";
import { refuse } from "@/lib/checkout/errors";
import { stripeAccountIsLegacyUaeTest } from "@/lib/checkout/charge-gate";
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

function sqlState(err: unknown): string {
  if (!err || typeof err !== "object" || !("code" in err)) return "";
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
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
  const { env } = getCloudflareContext();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return refuse("invalid_request");
  }
  const quoteId = quoteIdFromBody(body);
  if (!quoteId) return refuse("invalid_request");

  const publishable = env.STRIPE_PUBLISHABLE_KEY || "";
  let sessionId: string | null;
  try {
    const open = await asCheckout(env, null, async (sql) => {
      return await sql<{ stripe_checkout_session_id: string | null }[]>`
        select * from public.checkout_open_payment(${quoteId}::uuid)
      `;
    });
    const stored = open[0]?.stripe_checkout_session_id;
    sessionId = stored ? String(stored) : null;
  } catch {
    return json({ ok: false, code: "session_lookup_failed" }, 503);
  }

  if (sessionId) {
    const canExpire = Boolean(publishable) && !stripeAccountIsLegacyUaeTest(publishable);
    if (!canExpire) {
      return json({ ok: false, code: "session_not_expired" }, 503);
    }
    try {
      const stripe = stripeFromEnv(env);
      await expireCheckoutSession(stripe, sessionId);
    } catch {
      return json({ ok: false, code: "session_not_expired" }, 503);
    }
  }

  try {
    await asCheckout(env, null, async (sql) => {
      return await sql`
        select * from public.checkout_requote_cancel(${quoteId}::uuid)
      `;
    });
  } catch (err) {
    // 42883 is undefined_function: the owner has not applied the definer.
    if (sqlState(err) === "42883") {
      return json({ ok: false, code: "requote_not_applied" }, 503);
    }
    if (sqlState(err) === "P0001" || sqlState(err) === "23001") {
      return json({ ok: false, code: "not_cancellable" }, 409);
    }
    throw err;
  }

  return json({ ok: true });
}

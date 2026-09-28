// apps/web/app/api/checkout/requote/route.ts
//
// POST /api/checkout/requote. Guest cancel by quote id. CSRF, then
// vamos_checkout. Does not mint. ok true only after the stored session
// was expired, or a successful lookup found no session id. An open pay-link
// hold (D-20) answers 409 hold_open and touches nothing.

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

  // D-20 (26.1-29): a sent pay link holds the booking for 24 h. While that
  // hold is open, requote leaves the booking and its session alone so the
  // recipient's link keeps working. Judged on the database clock; the hold is
  // never taken from the request. A failed read fails closed.
  let hold: { hold_until: Date | string | null; held: boolean | null } | undefined;
  try {
    const rows = await asCheckout(env, null, async (sql) => {
      return await sql<{ hold_until: Date | string | null; held: boolean | null }[]>`
        select h.hold_until, coalesce(h.hold_until > now(), false) as held
          from (select public.checkout_booking_hold_until(${quoteId}::uuid) as hold_until) as h
      `;
    });
    hold = rows[0];
  } catch {
    return json({ ok: false, code: "hold_lookup_failed" }, 503);
  }
  if (hold?.held === true && hold.hold_until != null) {
    const until = hold.hold_until instanceof Date ? hold.hold_until : new Date(String(hold.hold_until));
    const holdUntil = Number.isFinite(until.getTime()) ? until.toISOString() : null;
    return json({ ok: false, code: "hold_open", hold_until: holdUntil }, 409);
  }

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

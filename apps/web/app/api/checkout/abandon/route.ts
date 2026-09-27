// POST /api/checkout/abandon. Guest drop of an unpaid row with no pay-link.
// CSRF, then vamos_checkout. Does not cancel a sent pay-link or a captured trip.

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

  let gate: { cancellable: boolean; stripe_checkout_session_id: string | null } | null;
  try {
    const rows = await asCheckout(env, null, async (sql) => {
      return await sql<{ cancellable: boolean | null; stripe_checkout_session_id: string | null }[]>`
        select * from public.checkout_abandon_gate(${quoteId}::uuid)
      `;
    });
    const row = rows[0];
    gate = row
      ? {
          cancellable: row.cancellable === true,
          stripe_checkout_session_id: row.stripe_checkout_session_id
            ? String(row.stripe_checkout_session_id)
            : null,
        }
      : null;
  } catch (err) {
    if (sqlState(err) === "42883") {
      return json({ ok: false, code: "abandon_not_applied" }, 503);
    }
    return json({ ok: false, code: "session_lookup_failed" }, 503);
  }

  if (!gate?.cancellable) return json({ ok: true, cancelled: false });

  const sessionId = gate.stripe_checkout_session_id;
  if (sessionId) {
    const publishable = env.STRIPE_PUBLISHABLE_KEY || "";
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
        select * from public.checkout_abandon_unpaid(${quoteId}::uuid)
      `;
    });
  } catch (err) {
    if (sqlState(err) === "42883") {
      return json({ ok: false, code: "abandon_not_applied" }, 503);
    }
    throw err;
  }

  return json({ ok: true, cancelled: true });
}

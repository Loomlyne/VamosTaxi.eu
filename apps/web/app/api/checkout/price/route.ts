// POST /api/checkout/price — server total for class / extras / voucher (D-19, D-35).
// Thin wiring; the rules live in lib/checkout/price-route.ts. Never a document (D-41).

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { wireQuoteAbuse } from "@/lib/abuse/guards";
import { loadCheckoutCatalog } from "@/lib/checkout/checkout-catalog";
import { resolveActorCustomerId } from "@/lib/checkout/actor-customer";
import { priceCheckoutWithDeps } from "@/lib/checkout/price-route";
import { asQuote } from "@/lib/db/identity";
import { evaluateCoupon, loadLaunchFlags } from "@/lib/db/quote";
import { csrfForbidden } from "@/lib/security/origin";
import { lockSecretMissingResponse, lockSecretPresent } from "@/lib/quote/lock-secret";

export const dynamic = "force-dynamic";

const HEADERS = { "content-type": "application/json", "cache-control": "private, no-store" };

export async function POST(request: Request) {
  const blocked = csrfForbidden(request);
  if (blocked) return blocked;
  try {
    const { env } = getCloudflareContext();
    if (!lockSecretPresent(env.QUOTE_LOCK_SECRET, "/api/checkout/price")) return lockSecretMissingResponse();
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, code: "invalid_request" }), { status: 400, headers: HEADERS });
    }
    const nowIso = await asQuote(env, async (sql) => {
      const rows = await sql`select now() as now`;
      const value = rows[0]?.now;
      return value instanceof Date ? value.toISOString() : String(value);
    });
    const abuse = await wireQuoteAbuse(env, request);
    const actor = await resolveActorCustomerId(env, request).catch(() => null);
    const current = env.QUOTE_LOCK_SECRET || "";
    const previous = env.QUOTE_LOCK_SECRET_PREVIOUS;
    const result = await priceCheckoutWithDeps(json, {
      lockSecrets: previous ? { current, previous } : { current },
      nowIso,
      loadCatalog: () => loadCheckoutCatalog(env),
      loadVatBps: async () => (await loadLaunchFlags(env)).vat_rate_bps,
      evaluateCoupon: (code, ids) => evaluateCoupon(env, code, ids),
      actorCustomerId: actor,
      rateLimit: async () => {
        const r = await abuse.rateLimit();
        return r.ok ? { ok: true } : { ok: false };
      },
    });
    return new Response(JSON.stringify(result.body), { status: result.status, headers: HEADERS });
  } catch (err) {
    console.error("checkout_price_unhandled", err instanceof Error ? err.message : String(err));
    return new Response(JSON.stringify({ ok: false, code: "pricing_not_live" }), { status: 500, headers: HEADERS });
  }
}

// apps/web/lib/checkout/intent-limits.ts
//
// POST /api/checkout/intent limits (26.5 D-20, owner decision).
//  (a) 8 Pay presses per 60 s per IP, in the binding INTENT_RATE_LIMITER (its own bucket).
//  (b) 5 Pay presses per price (quote), counted in the database by checkout_note_pay_press;
//      the same idempotency key again is a replay and is not a new press.
// Both answers are 429 { ok:false, code } and come before any Stripe call or booking write.

import { checkWriteRateLimit } from "../abuse/rate-limit";
import { asCheckout } from "../db/identity";
import { log } from "../logger";

export type IntentLimitCode = "rate_limited" | "pay_limit";

export function intentLimitResponse(code: IntentLimitCode): Response {
  return new Response(JSON.stringify({ ok: false, code }), {
    status: 429,
    headers: { "content-type": "application/json", "cache-control": "private, no-store" },
  });
}

/** Per-IP limit. A missing binding (local dev) is logged and allowed; a throwing one refuses. */
export async function intentIpAllowed(
  limiter: RateLimit | undefined,
  ip: string,
  route = "/api/checkout/intent",
): Promise<boolean> {
  if (!limiter) {
    log("error", "checkout_intent", { requestId: "intent", route, locale: null }, { reason: "intent-limiter-missing" });
    return true;
  }
  return (await checkWriteRateLimit({ limiter, kind: "intent", ip })).ok;
}

/** Per-quote cap. `note` is the database call; true = this press may go on. */
export async function payPressAllowed(
  note: (quoteId: string, idempotencyKey: string) => Promise<string | null>,
  quoteId: string,
  idempotencyKey: string,
): Promise<boolean> {
  return (await note(quoteId, idempotencyKey)) !== "limit";
}

export function notePayPressFromEnv(env: CloudflareEnv) {
  return (quoteId: string, idempotencyKey: string) =>
    asCheckout(env, null, async (sql) => {
      const rows = await sql<{ verdict: string | null }[]>`
        select public.checkout_note_pay_press(${quoteId}::uuid, ${idempotencyKey}) as verdict
      `;
      return rows[0]?.verdict ?? null;
    });
}

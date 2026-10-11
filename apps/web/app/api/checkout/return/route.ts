export const dynamic = "force-dynamic";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  RETURN_LOOKUP_DEADLINE_MS,
  RETURN_SETTLE_DEADLINE_MS,
  checkoutOutcomePath,
  isCheckoutSessionId,
  logReturnFailure,
  readReturnSession,
  referenceForCheckoutSession,
  returnRedirectTarget,
  settlePaidReturn,
  withDeadline,
} from "@/lib/checkout/return-settle";
import { localePath } from "@/lib/checkout/steps";
import { checkWriteRateLimit } from "@/lib/abuse/rate-limit";
import { cfConnectingIp } from "@/lib/consent/ip";

const LOCALES: readonly string[] = Object.freeze(["en", "de", "fr", "ar"]);

function redirect(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: { location, "cache-control": "private, no-store" },
  });
}

/**
 * Stripe return (26.3 D-27). Paid → confirmation, always; unpaid → the
 * one-page checkout with its quote; a Stripe read failure → the confirmation
 * ("we are checking your payment") or, with no session to look up, the checkout
 * with `pay=unknown` and a notice. Never a blank page after a payment.
 *
 * J5: every step has a deadline (Stripe read 4 s without retries, settle 6 s, lookup 3 s),
 * so one Stripe outage cannot hold the redirect for half a minute; the webhook is the
 * durable path. Failures are logged at error level (fixed reasons, no ids, no messages).
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session") ?? url.searchParams.get("session_id") ?? "";
  const localeRaw = url.searchParams.get("locale") ?? "en";
  const locale = LOCALES.includes(localeRaw) ? localeRaw : "en";
  let env: CloudflareEnv | null = null;
  try {
    env = getCloudflareContext().env as CloudflareEnv;
  } catch {
    env = null;
  }
  if (!env) {
    logReturnFailure("return-no-env");
    return redirect(checkoutOutcomePath(locale, "unknown"));
  }
  const bound = env;
  // F6: one Stripe read per valid-looking id is a free lookup for anyone; limit per IP (INTENT_RATE_LIMITER,
  // 8 per 60 s, key "return:<ip>"). Stripe redirects once per payment. A refusal skips Stripe and goes to the
  // "we are checking your payment" page.
  const ip = cfConnectingIp(request.headers) ?? "unknown";
  const allowRead = async (): Promise<boolean> => {
    const limiter = bound.INTENT_RATE_LIMITER;
    if (!limiter) {
      logReturnFailure("return-limiter-missing");
      return true;
    }
    return (await checkWriteRateLimit({ limiter, kind: "return", ip })).ok;
  };
  try {
    return redirect(
      await returnRedirectTarget(
        {
          readSession: (id) => readReturnSession(bound, id),
          settle: (session) =>
            withDeadline(settlePaidReturn(bound, session), RETURN_SETTLE_DEADLINE_MS, "settle"),
          lookupReference: (id) =>
            withDeadline(referenceForCheckoutSession(bound, id), RETURN_LOOKUP_DEADLINE_MS, "lookup"),
          allowRead,
        },
        { sessionId, locale },
      ),
    );
  } catch (err) {
    logReturnFailure("return-unhandled", err);
    return redirect(
      isCheckoutSessionId(sessionId)
        ? `${localePath(locale, "/confirmation")}?session=${encodeURIComponent(sessionId)}`
        : checkoutOutcomePath(locale, "unknown"),
    );
  }
}

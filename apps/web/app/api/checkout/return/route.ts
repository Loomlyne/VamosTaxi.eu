export const dynamic = "force-dynamic";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  readReturnSession,
  referenceForCheckoutSession,
  returnRedirectTarget,
  settlePaidReturn,
} from "@/lib/checkout/return-settle";
import { localePath } from "@/lib/checkout/steps";
import { checkWriteRateLimit } from "@/lib/abuse/rate-limit";
import { cfConnectingIp } from "@/lib/consent/ip";
import { log } from "@/lib/logger";

const LOCALES: readonly string[] = Object.freeze(["en", "de", "fr", "ar"]);

function redirect(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: { location, "cache-control": "private, no-store" },
  });
}

/**
 * Stripe return (26.3 D-27). Paid → confirmation, always; unpaid → the
 * one-page checkout with its quote; a Stripe read failure → checkout with
 * `pay=unknown`. Never an error screen after a payment.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const ref = url.searchParams.get("ref") ?? "";
  const sessionId = url.searchParams.get("session") ?? url.searchParams.get("session_id") ?? "";
  const localeRaw = url.searchParams.get("locale") ?? "en";
  const locale = LOCALES.includes(localeRaw) ? localeRaw : "en";
  let env: CloudflareEnv | null = null;
  try {
    env = getCloudflareContext().env as CloudflareEnv;
  } catch {
    env = null;
  }
  if (!env) return redirect(`${localePath(locale, "/checkout")}?pay=unknown`);
  const bound = env;
  // F6: one Stripe read per valid-looking id is a free lookup for anyone; limit per IP (INTENT_RATE_LIMITER,
  // 8 per 60 s, key "return:<ip>"). Stripe redirects once per payment. Refusal is the same soft redirect.
  const ip = cfConnectingIp(request.headers) ?? "unknown";
  const allowRead = async (): Promise<boolean> => {
    const limiter = bound.INTENT_RATE_LIMITER;
    if (!limiter) {
      log("error", "checkout_return", { requestId: "return", route: "/api/checkout/return", locale: null }, { reason: "return-limiter-missing" });
      return true;
    }
    return (await checkWriteRateLimit({ limiter, kind: "return", ip })).ok;
  };
  try {
    return redirect(
      await returnRedirectTarget(
        {
          readSession: (id) => readReturnSession(bound, id),
          settle: (session) => settlePaidReturn(bound, session),
          lookupReference: (id) => referenceForCheckoutSession(bound, id),
          allowRead,
        },
        { sessionId, ref, locale },
      ),
    );
  } catch {
    return redirect(`${localePath(locale, "/checkout")}?pay=unknown`);
  }
}

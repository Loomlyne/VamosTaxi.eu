export const dynamic = "force-dynamic";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  readReturnSession,
  referenceForCheckoutSession,
  returnRedirectTarget,
  settlePaidReturn,
} from "@/lib/checkout/return-settle";
import { localePath } from "@/lib/checkout/steps";

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
  try {
    return redirect(
      await returnRedirectTarget(
        {
          readSession: (id) => readReturnSession(bound, id),
          settle: (session) => settlePaidReturn(bound, session),
          lookupReference: (id) => referenceForCheckoutSession(bound, id),
        },
        { sessionId, ref, locale },
      ),
    );
  } catch {
    return redirect(`${localePath(locale, "/checkout")}?pay=unknown`);
  }
}

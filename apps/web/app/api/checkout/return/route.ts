export const dynamic = "force-dynamic";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { BOOKING_REFERENCE_RE } from "@/lib/checkout/booking-status";
import {
  isCheckoutSessionId,
  referenceForCheckoutSession,
  settlePaidReturn,
} from "@/lib/checkout/return-settle";
import { localePath } from "@/lib/checkout/steps";

const LOCALES = new Set(["en", "de", "fr", "ar"]);

function redirect(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: { location, "cache-control": "private, no-store" },
  });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const ref = url.searchParams.get("ref") ?? "";
  const sessionId = url.searchParams.get("session") ?? url.searchParams.get("session_id") ?? "";
  const localeRaw = url.searchParams.get("locale") ?? "en";
  const locale = LOCALES.has(localeRaw) ? localeRaw : "en";
  const payment = localePath(locale, "/checkout/payment");
  if (!isCheckoutSessionId(sessionId)) return redirect(payment);
  let env: CloudflareEnv | null = null;
  try {
    env = getCloudflareContext().env as CloudflareEnv;
  } catch {
    env = null;
  }
  if (!env) return redirect(`${payment}?pay=failed`);
  try {
    const result = await settlePaidReturn(env, sessionId);
    const bookingRef = BOOKING_REFERENCE_RE.test(ref)
      ? ref
      : await referenceForCheckoutSession(env, sessionId);
    if (result === "paid" && BOOKING_REFERENCE_RE.test(bookingRef)) {
      return redirect(localePath(locale, `/confirmation/${bookingRef}`));
    }
    return redirect(`${payment}?pay=${result}`);
  } catch {
    return redirect(`${payment}?pay=failed`);
  }
}

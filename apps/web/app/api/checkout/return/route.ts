export const dynamic = "force-dynamic";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { BOOKING_REFERENCE_RE } from "@/lib/checkout/booking-status";
import {
  isCheckoutSessionId,
  referenceForCheckoutSession,
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

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const ref = url.searchParams.get("ref") ?? "";
  const sessionId = url.searchParams.get("session") ?? url.searchParams.get("session_id") ?? "";
  const localeRaw = url.searchParams.get("locale") ?? "en";
  const locale = LOCALES.includes(localeRaw) ? localeRaw : "en";
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
    // 26.1-16 (D-22): this payer's charge lost the race and was refunded —
    // the booking is paid by the other payer; the confirmation says so.
    if (result === "duplicate" && BOOKING_REFERENCE_RE.test(bookingRef)) {
      return redirect(localePath(locale, `/confirmation/${bookingRef}?charge=refunded`));
    }
    if (result === "paid" && BOOKING_REFERENCE_RE.test(bookingRef)) {
      return redirect(localePath(locale, `/confirmation/${bookingRef}`));
    }
    return redirect(`${payment}?pay=${result === "duplicate" ? "paid" : result}`);
  } catch {
    return redirect(`${payment}?pay=failed`);
  }
}

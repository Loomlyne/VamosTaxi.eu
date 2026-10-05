// apps/web/app/api/checkout/lock-expire/route.ts
//
// POST /api/checkout/lock-expire. Expire the stored Checkout Session for a
// quote id. CSRF. No mint. No cancel. No refund. Security S8: only a caller that
// holds the payment (its vt_manage cookie owns the booking, or it sends the open
// session id) may expire it; rate limited (S12). Logic: lib/checkout/lock-expire.ts.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { readAllowed } from "@/lib/abuse/read-rate-limit";
import { asCheckout } from "@/lib/db/identity";
import { refuse } from "@/lib/checkout/errors";
import { bookingOwnedByRequest } from "@/lib/checkout/booking-owned";
import { stripeAccountIsLegacyUaeTest } from "@/lib/checkout/charge-gate";
import { loadOpenPayment } from "@/lib/checkout/load-open-payment";
import { runLockExpire } from "@/lib/checkout/lock-expire";
import { expireCheckoutSession, stripeFromEnv } from "@/lib/checkout/stripe";
import { csrfForbidden } from "@/lib/security/origin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const blocked = csrfForbidden(request);
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return refuse("invalid_request");
  }

  const { env } = getCloudflareContext();
  return runLockExpire(body, {
    allowed: () => readAllowed(env.READ_RATE_LIMITER, "lockexpire", request),
    loadOpenPayment: (quoteId) => asCheckout(env, null, (sql) => loadOpenPayment(sql, quoteId)),
    ownsBooking: (bookingId) => bookingOwnedByRequest(env, request, bookingId),
    stripeReady: () => {
      const publishable = env.STRIPE_PUBLISHABLE_KEY || "";
      return Boolean(publishable) && !stripeAccountIsLegacyUaeTest(publishable);
    },
    expireCheckoutSession: async (sessionId) => {
      await expireCheckoutSession(stripeFromEnv(env), sessionId);
    },
  });
}

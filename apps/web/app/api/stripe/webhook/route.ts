// apps/web/app/api/stripe/webhook/route.ts
//
// POST /api/stripe/webhook. D-13 + D-16: this route stays short — verify,
// record, enqueue, 200. Stripe times out a slow endpoint and retries it.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { withRequestContext } from "@/lib/logger";
import { recordStripeEvent } from "@/lib/checkout/stripe-event-record";
import { handleStripeWebhook } from "@/lib/checkout/webhook";
import { verifyStripeEvent } from "@/lib/checkout/webhook-verify";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { env } = getCloudflareContext();
  const emit = withRequestContext({
    requestId: crypto.randomUUID(),
    route: "/api/stripe/webhook",
    locale: null,
  });

  // 1. Raw body first. A Workers body is a single-use stream. request.json()
  //    here, or middleware reading the body upstream, consumes it and leaves
  //    constructEventAsync nothing to verify. middleware.ts matcher already
  //    excludes /api/* so this path is not intercepted.
  const raw = await request.text();

  return handleStripeWebhook(raw, request.headers.get("stripe-signature"), {
    verify: (body, signature) => verifyStripeEvent(env, body, signature),
    record: (event, objectId) =>
      recordStripeEvent(env, {
        id: event.id,
        type: event.type,
        created: event.created,
        objectId,
        payload: event.data.object,
      }),
    enqueue: (message) => env.STRIPE_EVENTS.send(message).then(() => undefined),
    emit,
  });
}

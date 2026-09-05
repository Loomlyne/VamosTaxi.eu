// apps/web/app/api/stripe/webhook/route.ts
//
// POST /api/stripe/webhook. D-13 + D-16: this route stays short — verify,
// record, enqueue, 200. Stripe times out a slow endpoint and retries it.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asSystem } from "@/lib/db/identity";
import { withRequestContext } from "@/lib/logger";
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
    record: async (event, objectId) => {
      const rows = await asSystem(env, async (sql) => {
        return sql`
          select public.stripe_event_record(
            ${event.id},
            ${event.type},
            ${new Date(event.created * 1000).toISOString()}::timestamptz,
            ${objectId},
            ${JSON.stringify(event.data.object)}::jsonb
          ) as inserted
        `;
      });
      return Boolean(rows[0]?.inserted);
    },
    enqueue: (message) => env.STRIPE_EVENTS.send(message).then(() => undefined),
    emit,
  });
}

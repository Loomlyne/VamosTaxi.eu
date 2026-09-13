// apps/web/lib/checkout/webhook.ts
//
// D-13 / D-16: verify, record, enqueue, 200. No state machine. Stripe times
// out a slow endpoint and retries it. Capture lives on the queue consumer
// (settle.ts). This handler never marks paid and never captures.

import type Stripe from "stripe";
import { WebhookVerificationError } from "./webhook-verify";
import type { ScalarValue } from "../logger";

export type StripeQueueMessage = {
  eventId: string;
  type: string;
  objectId: string;
  stripeCreated: number;
};

export type WebhookDeps = {
  verify: (rawBody: string, signatureHeader: string | null) => Promise<Stripe.Event>;
  record: (event: Stripe.Event, objectId: string) => Promise<boolean>;
  enqueue: (message: StripeQueueMessage) => Promise<void>;
  emit: (level: "debug" | "info" | "warn" | "error", type: string, fields?: Record<string, ScalarValue>) => void;
};

function objectIdOf(event: Stripe.Event): string {
  const obj = event.data.object as { id?: unknown };
  return typeof obj?.id === "string" ? obj.id : "";
}

export async function handleStripeWebhook(
  raw: string,
  signature: string | null,
  deps: WebhookDeps,
): Promise<Response> {
  // 2. Verify. Never parse a forged body as trusted.
  let event: Stripe.Event;
  try {
    event = await deps.verify(raw, signature);
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      deps.emit("warn", "stripe_webhook", {
        hasSignature: Boolean(signature),
        bodyLength: raw.length,
      });
      return new Response(null, { status: 400 });
    }
    throw err;
  }

  const objectId = objectIdOf(event);

  // 3. Record insert-first. The return is telemetry, not a gate — enqueue
  //    even when the RPC reports a duplicate. On throw, 500 so Stripe retries.
  try {
    await deps.record(event, objectId);
  } catch {
    return new Response(null, { status: 500 });
  }

  // 4. Enqueue identifiers, not the payload. Divergence from the research
  //    sketch: the payload already lives in stripe_events.payload; a Queue
  //    message carrying it duplicates PII and hits the size limit. The
  //    consumer re-reads what it needs.
  try {
    await deps.enqueue({
      eventId: event.id,
      type: event.type,
      objectId,
      stripeCreated: event.created,
    });
  } catch {
    return new Response(null, { status: 500 });
  }

  return new Response(null, { status: 200 });
}

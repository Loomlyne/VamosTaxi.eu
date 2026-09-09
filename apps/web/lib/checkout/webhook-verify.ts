// apps/web/lib/checkout/webhook-verify.ts
//
// Stripe webhook signature check. Two rules a later refactor must not break:
// 1. The input is the raw request string. JSON.parse + JSON.stringify changes
//    key order and whitespace; the HMAC then fails for every event.
// 2. constructEventAsync + Stripe.createSubtleCryptoProvider() are required on
//    Workers — synchronous constructEvent reaches for Node crypto (STACK.md §3).

import Stripe from "stripe";
import { stripeFromEnv } from "./stripe";

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

export async function verifyStripeEvent(
  env: CloudflareEnv,
  rawBody: string,
  signatureHeader: string | null,
): Promise<Stripe.Event> {
  if (!signatureHeader) {
    throw new WebhookVerificationError("missing stripe-signature");
  }
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new WebhookVerificationError("STRIPE_WEBHOOK_SECRET is not bound");
  }
  const stripe = stripeFromEnv(env);
  const cryptoProvider = Stripe.createSubtleCryptoProvider();
  try {
    return await stripe.webhooks.constructEventAsync(
      rawBody,
      signatureHeader,
      secret,
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    throw new WebhookVerificationError(err instanceof Error ? err.message : "signature verification failed");
  }
}

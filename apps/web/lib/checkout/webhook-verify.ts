// apps/web/lib/checkout/webhook-verify.ts
//
// Stripe webhook signature check. Two rules a later refactor must not break:
// 1. The input is the raw request string. JSON.parse + JSON.stringify changes
//    key order and whitespace; the HMAC then fails for every event.
// 2. constructEventAsync + Stripe.createSubtleCryptoProvider() are required on
//    Workers — synchronous constructEvent reaches for Node crypto (STACK.md §3).

import Stripe from "stripe";
import { stripeFromEnv } from "./stripe";
import { requireStripeSecretMode } from "./stripe-mode";

export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

/**
 * J1 (W1-04): the signature proves the event came from the endpoint that owns the signing
 * secret; it does not prove that endpoint is in the same mode as the secret key the Worker
 * charges with. An event whose `livemode` differs from the key's mode is refused, so a
 * sandbox endpoint can never settle a live booking and a live event can never settle a
 * sandbox one. 400, error-level log: Stripe shows it as a failing delivery.
 */
export class WebhookModeError extends WebhookVerificationError {
  constructor(message: string) {
    super(message);
    this.name = "WebhookModeError";
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
    // Not a bad signature: the Worker is misconfigured. A plain Error answers 500 and logs
    // at error level instead of passing as forged-request noise (J1, W1-15).
    throw new Error("STRIPE_WEBHOOK_SECRET is not bound");
  }
  const keyMode = requireStripeSecretMode(env.STRIPE_SECRET_KEY);
  const stripe = stripeFromEnv(env);
  const cryptoProvider = Stripe.createSubtleCryptoProvider();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signatureHeader,
      secret,
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    throw new WebhookVerificationError(err instanceof Error ? err.message : "signature verification failed");
  }
  if (event.livemode !== (keyMode === "live")) {
    throw new WebhookModeError(
      `event livemode ${String(event.livemode)} does not match the ${keyMode} secret key`,
    );
  }
  return event;
}

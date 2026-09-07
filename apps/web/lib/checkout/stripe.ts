// apps/web/lib/checkout/stripe.ts
//
// The only Stripe client in apps/web (T-07-20). Checkout Sessions, expire,
// retrieve, refund. No PaymentIntent-cancel path. Payment methods are Stripe
// Dashboard + Adaptive Pricing — never a hand-built card/TWINT map (D-09/D-10).

import Stripe from "stripe";
import { CHARGE_CURRENCY, stripeLocale, type CheckoutLocale } from "./currency";

/**
 * Checkout Session `ui_mode`.
 *
 * Research (2026-08-24) named this `custom` (Payment Element on our page, not a
 * Stripe-hosted redirect). Stripe API version 2026-03-25.dahlia renamed that
 * value to `elements` and rejects the legacy strings:
 * https://docs.stripe.com/changelog/dahlia/2026-03-25/updates-available-checkout-session-ui-modes
 * Resolved 2026-09-05 against stripe@22.6.1 (`SessionCreateParams.UiMode`) and
 * that changelog. Product is unchanged: Payment Element on vamostaxi chrome.
 */
export const CHECKOUT_UI_MODE = "elements" as const;

const STRIPE_API_VERSION: Stripe.LatestApiVersion = "2026-08-26.dahlia";

export function missingEnvError(name: string): Error {
  return new Error(`${name} is not bound`);
}

/** Worker-secret Stripe client. Fetch HTTP client — Node http is unavailable on Workers. */
export function stripeFromEnv(env: CloudflareEnv): Stripe {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) {
    throw missingEnvError("STRIPE_SECRET_KEY");
  }
  return new Stripe(key, {
    httpClient: Stripe.createFetchHttpClient(),
    apiVersion: STRIPE_API_VERSION,
    typescript: true,
    maxNetworkRetries: 2,
    timeout: 10_000,
  });
}

/** Publishable key from wrangler `vars` — never a secret, never `pk_live_` here. */
export function stripePublishableKey(env: CloudflareEnv): string {
  const key = env.STRIPE_PUBLISHABLE_KEY;
  if (!key) {
    throw missingEnvError("STRIPE_PUBLISHABLE_KEY");
  }
  return key;
}

export interface CreateCheckoutSessionInput {
  chargedRappen: number;
  bookingId: string;
  bookingReference: string;
  customerEmail: string;
  locale: CheckoutLocale;
  idempotencyKey: string;
  expiresAt: Date;
  /** Required for `ui_mode: elements`. */
  returnUrl: string;
  productName: string;
}

export async function createCheckoutSession(
  stripe: Stripe,
  input: CreateCheckoutSessionInput,
): Promise<Stripe.Checkout.Session> {
  return stripe.checkout.sessions.create(
    {
      mode: "payment",
      ui_mode: CHECKOUT_UI_MODE,
      return_url: input.returnUrl,
      client_reference_id: input.bookingReference,
      customer_email: input.customerEmail,
      locale: stripeLocale(input.locale),
      expires_at: Math.floor(input.expiresAt.getTime() / 1000),
      adaptive_pricing: { enabled: true },
      // Charge is always CHF. Stripe has no Checkout Session presentment pin
      // for EUR/USD/AED — Adaptive Pricing may show another currency; our
      // chrome converts with /api/fx. Do not invent a charge currency.
      // Checkout Sessions have no PaymentIntent `automatic_payment_methods`
      // field. Dashboard-configured methods + Adaptive Pricing are the gate
      // (D-09/D-10). Do not pass `payment_method_types`.
      expand: ["payment_intent"],
      metadata: {
        booking_id: input.bookingId,
        booking_reference: input.bookingReference,
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: CHARGE_CURRENCY,
            unit_amount: input.chargedRappen,
            product_data: { name: input.productName },
          },
        },
      ],
    },
    { idempotencyKey: input.idempotencyKey },
  );
}

export async function expireCheckoutSession(
  stripe: Stripe,
  sessionId: string,
): Promise<Stripe.Checkout.Session> {
  return stripe.checkout.sessions.expire(sessionId);
}

export async function retrieveCheckoutSession(
  stripe: Stripe,
  sessionId: string,
): Promise<Stripe.Checkout.Session> {
  return stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["payment_intent"],
  });
}

export async function createRefund(
  stripe: Stripe,
  input: {
    paymentIntentId: string;
    amountRappen: number;
    idempotencyKey: string;
  },
): Promise<Stripe.Refund> {
  return stripe.refunds.create(
    {
      payment_intent: input.paymentIntentId,
      amount: input.amountRappen,
      reason: "requested_by_customer",
    },
    { idempotencyKey: input.idempotencyKey },
  );
}

/**
 * Adaptive Pricing presentment vs CHF charge, read off the Checkout Session.
 * `fxQuotedAt` is null here — webhook settlement writes the FX quadruple
 * with Stripe's timestamps, not the Worker clock.
 */
export function fxFromSession(session: Stripe.Checkout.Session): {
  chargedCurrency: string;
  fxRate: number | null;
  fxSource: string | null;
  fxQuotedAt: string | null;
  presentmentAmountMinor: number | null;
} {
  const chargedCurrency = (session.currency ?? CHARGE_CURRENCY).toUpperCase();
  const conversion = session.currency_conversion;
  if (!conversion) {
    return {
      chargedCurrency,
      fxRate: null,
      fxSource: null,
      fxQuotedAt: null,
      presentmentAmountMinor: null,
    };
  }
  const rawRate = conversion.fx_rate;
  const rate = typeof rawRate === "number" ? rawRate : rawRate ? Number(rawRate) : null;
  return {
    chargedCurrency,
    fxRate: rate !== null && Number.isFinite(rate) ? rate : null,
    fxSource: "stripe_adaptive_pricing",
    fxQuotedAt: null,
    presentmentAmountMinor:
      typeof conversion.amount_total === "number" ? conversion.amount_total : null,
  };
}

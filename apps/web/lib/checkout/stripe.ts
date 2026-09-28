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
  /** 08-07 extra fare-difference session. Metadata kind=extra, extra_id. */
  extra?: { extraId: string };
}

/**
 * Stripe Checkout Session `expires_at` must be 30 minutes–24 hours from now.
 * The quote lock can be 1440 minutes; clamp only the Stripe clock.
 */
export function stripeSessionExpiresAtUnix(expiresAt: Date, nowMs = Date.now()): number {
  const nowSec = Math.floor(nowMs / 1000);
  const min = nowSec + 30 * 60;
  const max = nowSec + 24 * 60 * 60 - 30;
  const exp = Math.floor(expiresAt.getTime() / 1000);
  return Math.min(max, Math.max(min, exp));
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
      expires_at: stripeSessionExpiresAtUnix(input.expiresAt),
      adaptive_pricing: { enabled: true },
      // Charge is always CHF. Stripe has no Checkout Session presentment pin
      // for EUR/USD/AED — Adaptive Pricing may show another currency; our
      // chrome converts with /api/fx. Do not invent a charge currency.
      // Checkout Sessions have no PaymentIntent `automatic_payment_methods`
      // field. Dashboard-configured methods + Adaptive Pricing are the gate
      // (D-09/D-10). Do not pass `payment_method_types`.
      // Do not exclude paypal, amazon_pay, or twint. Express Checkout can
      // then show Amazon Pay and PayPal. TWINT is not an Express Checkout
      // wallet — Stripe shows it on the Payment Element for a Switzerland
      // customer. The charge is already CHF. Card, Link, and Apple Pay stay.
      // Apple Pay is a wallet, not a type in this list.
      expand: ["payment_intent"],
      metadata: {
        booking_id: input.bookingId,
        booking_reference: input.bookingReference,
        ...(input.extra
          ? { kind: "extra", extra_id: input.extra.extraId }
          : {}),
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
    /** D-05: every app-created refund carries metadata so charge.refunded (26.1-08) can tell app refunds from dashboard refunds. */
    bookingId: string;
    paymentId: number;
    reason: string;
  },
): Promise<Stripe.Refund> {
  return stripe.refunds.create(
    {
      payment_intent: input.paymentIntentId,
      amount: input.amountRappen,
      reason: "requested_by_customer",
      metadata: {
        vamos_source: "app",
        booking_id: input.bookingId,
        payment_id: String(input.paymentId),
        reason: input.reason,
      },
    },
    { idempotencyKey: input.idempotencyKey },
  );
}

/**
 * D-05/X0b: a refund must always target a real PaymentIntent, never a
 * Checkout Session id. `pi_...` is returned as-is with no Stripe call
 * (research threat "stale cs_ misroute" — a stored `cs_...` value must be
 * resolved fresh every time, never cached as a PaymentIntent). `cs_...` is
 * resolved by retrieving the session and reading its expanded
 * `payment_intent`; `null` when the session has none yet. Any other prefix
 * (empty, `ch_...`, garbage) is refused — the caller must not fall back to a
 * Charge-level refund or mint a new PaymentIntent.
 */
export async function resolvePaymentIntentId(
  stripe: Stripe,
  storedId: string,
): Promise<string | null> {
  if (storedId.startsWith("pi_")) return storedId;
  if (!storedId.startsWith("cs_")) return null;
  const session = await retrieveCheckoutSession(stripe, storedId);
  const pi = session.payment_intent;
  if (typeof pi === "string" && pi.length > 0) return pi;
  if (pi && typeof pi === "object" && "id" in pi && typeof pi.id === "string") return pi.id;
  return null;
}

/**
 * 26.1-08 D-07: charge.refunded is re-read from Stripe, never trusted from the
 * event body (T-26.1-26). `refunds` is expanded so every refund on the charge,
 * app-made or dashboard-made, is visible with its metadata.
 */
export async function retrieveCharge(stripe: Stripe, chargeId: string): Promise<Stripe.Charge> {
  return stripe.charges.retrieve(chargeId, { expand: ["refunds"] });
}

/** 26.1-08 D-07: charge.dispute.* is re-read from Stripe for its current status (T-26.1-26). */
export async function retrieveDispute(stripe: Stripe, disputeId: string): Promise<Stripe.Dispute> {
  return stripe.disputes.retrieve(disputeId);
}

/**
 * 26.1-08 D-05/D-07: the Checkout Session that owns a PaymentIntent, so a
 * legacy `booking_payments` row that still stores `cs_...` in
 * `stripe_payment_intent_id` can be matched by `stripe_checkout_session_id`.
 * `null` when Stripe has no session for it.
 */
export async function findSessionIdForPaymentIntent(
  stripe: Stripe,
  paymentIntentId: string,
): Promise<string | null> {
  const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 });
  const first = sessions.data[0];
  return first && typeof first.id === "string" ? first.id : null;
}

/** D-07: expand charge card country + balance_transaction.available_on. Never invent day counts. */
export async function retrieveRefund(stripe: Stripe, refundId: string): Promise<Stripe.Refund> {
  return stripe.refunds.retrieve(refundId, {
    expand: ["charge.payment_method_details", "balance_transaction"],
  });
}

/** Elements sessions often have payment_intent=null until confirm. */
export function checkoutPaymentIntentId(session: Stripe.Checkout.Session): string {
  const pi = session.payment_intent;
  if (typeof pi === "string" && pi.length > 0) return pi;
  if (pi && typeof pi === "object" && "id" in pi && typeof pi.id === "string") return pi.id;
  return session.id;
}

export function sessionIsPayable(
  session: Stripe.Checkout.Session | null,
  chargedRappen: number,
): session is Stripe.Checkout.Session {
  if (!session?.client_secret) return false;
  if (session.status && session.status !== "open") return false;
  if ((session.currency ?? "").toLowerCase() === CHARGE_CURRENCY) {
    const amount = session.amount_subtotal ?? session.amount_total;
    if (typeof amount === "number" && amount !== chargedRappen) return false;
  }
  return true;
}

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

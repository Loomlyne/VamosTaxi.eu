// apps/web/lib/checkout/stripe.ts
//
// The only Stripe client in apps/web (T-07-20). Checkout Sessions, expire,
// retrieve, refund. No PaymentIntent-cancel path. Payment methods are Stripe
// Dashboard + Adaptive Pricing — never a hand-built card/TWINT map (D-09/D-10).

import Stripe from "stripe";
import { CHARGE_CURRENCY, stripeLocale, type CheckoutLocale } from "./currency";

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
  /**
   * Always `hosted_page` (Stripe-hosted page, no card form on our site or the
   * dashboard: D-48). Kept as a required literal so a caller cannot ask for
   * an embedded form.
   */
  uiMode: "hosted_page";
  /** Must carry `session_id={CHECKOUT_SESSION_ID}` unencoded. */
  successUrl: string;
  cancelUrl: string;
  /** Offer TWINT next to card (see `checkoutPaymentMethodTypes`). */
  twint?: boolean;
  productName: string;
  /** Web mode: hash of everything the charge depends on; read back to decide reuse (D-24). */
  selectionFingerprint?: string;
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

/** Stripe's 30-minute floor plus a 60 s skew buffer; web checkout sessions live this long (D-25). */
export const WEB_CHECKOUT_MINUTES = 31;

/**
 * Payment methods on the hosted page: card (Apple Pay and Google Pay come with
 * it) plus TWINT only once `STRIPE_CHECKOUT_TWINT` is "on" (D-20). Default off:
 * TWINT is not activated on the sandbox account, and listing it would make
 * session creation fail for everyone.
 */
export function checkoutPaymentMethodTypes(env: {
  STRIPE_CHECKOUT_TWINT?: string;
}): Array<"card" | "twint"> {
  return env.STRIPE_CHECKOUT_TWINT === "on" ? ["card", "twint"] : ["card"];
}

function assertHttpUrl(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is required for a hosted checkout session`);
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error(`${name} must be http(s)`);
  }
  return value;
}

function isLocaleRefusal(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { type?: unknown; param?: unknown };
  return e.type === "StripeInvalidRequestError" && e.param === "locale";
}

export async function createCheckoutSession(
  stripe: Stripe,
  input: CreateCheckoutSessionInput,
): Promise<Stripe.Checkout.Session> {
  const successUrl = assertHttpUrl("successUrl", input.successUrl);
  const cancelUrl = assertHttpUrl("cancelUrl", input.cancelUrl);
  if (!successUrl.includes("session_id={CHECKOUT_SESSION_ID}")) {
    throw new Error("successUrl must carry session_id={CHECKOUT_SESSION_ID}");
  }
  const modeParams: Pick<
    Stripe.Checkout.SessionCreateParams,
    | "ui_mode"
    | "success_url"
    | "cancel_url"
    | "payment_method_types"
    | "wallet_options"
    | "payment_intent_data"
  > = {
    ui_mode: "hosted_page",
    success_url: successUrl,
    cancel_url: cancelUrl,
    payment_method_types: input.twint ? ["card", "twint"] : ["card"],
    wallet_options: { link: { display: "never" } },
    // The main booking session ties its intent to the quote; an extra-fare
    // session (metadata kind=extra) is settled by session id, not by quote.
    ...(input.extra ? {} : { payment_intent_data: { metadata: { quote_id: input.bookingId } } }),
  };
  const build = (locale: CheckoutLocale): Stripe.Checkout.SessionCreateParams => ({
      mode: "payment",
      ...modeParams,
      client_reference_id: input.bookingReference,
      customer_email: input.customerEmail,
      locale: stripeLocale(locale),
      expires_at: stripeSessionExpiresAtUnix(input.expiresAt),
      adaptive_pricing: { enabled: true },
      // Charge is always CHF. Stripe has no Checkout Session presentment pin
      // for EUR/USD/AED — Adaptive Pricing may show another currency; our
      // chrome converts with /api/fx. Do not invent a charge currency.
      // Hosted sessions pin the method set (card + optional TWINT, Link off).
      // allow_promotion_codes is never set (D-19).
      expand: ["payment_intent"],
      metadata: {
        booking_id: input.bookingId,
        booking_reference: input.bookingReference,
        ...(input.selectionFingerprint ? { selection: input.selectionFingerprint } : {}),
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
  });
  try {
    return await stripe.checkout.sessions.create(build(input.locale), {
      idempotencyKey: input.idempotencyKey,
    });
  } catch (err) {
    // Stripe's Checkout locale enum may lack "ar": retry once with "en", same key.
    if (input.locale === "ar" && isLocaleRefusal(err)) {
      return stripe.checkout.sessions.create(build("en"), {
        idempotencyKey: input.idempotencyKey,
      });
    }
    throw err;
  }
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
    /** null refunds the whole charge (26.3-12: a paid session with no booking, no row to read the amount from). */
    amountRappen: number | null;
    idempotencyKey: string;
    /** Extra metadata keys merged after the D-05 ones (26.3-12 vamos_reason). */
    metadata?: Record<string, string>;
    /** D-05: every app-created refund carries metadata so charge.refunded (26.1-08) can tell app refunds from dashboard refunds. */
    bookingId: string;
    paymentId: number;
    reason: string;
  },
): Promise<Stripe.Refund> {
  return stripe.refunds.create(
    {
      payment_intent: input.paymentIntentId,
      ...(input.amountRappen == null ? {} : { amount: input.amountRappen }),
      // Stripe only accepts duplicate / fraudulent / requested_by_customer here; our own reason lives in metadata.
      reason: "requested_by_customer",
      metadata: {
        vamos_source: "app",
        booking_id: input.bookingId,
        payment_id: String(input.paymentId),
        reason: input.reason,
        ...(input.metadata ?? {}),
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

/** The PaymentIntent id, or the session id while the intent is not created yet. */
export function checkoutPaymentIntentId(session: Stripe.Checkout.Session): string {
  const pi = session.payment_intent;
  if (typeof pi === "string" && pi.length > 0) return pi;
  if (pi && typeof pi === "object" && "id" in pi && typeof pi.id === "string") return pi.id;
  return session.id;
}

/**
 * Hosted sessions: open, has a redirect url, CHF, and the amount still equals
 * what the server computed (T-26.3-06-01).
 */
export function hostedSessionIsPayable(
  session: Stripe.Checkout.Session | null,
  chargedRappen: number,
): session is Stripe.Checkout.Session {
  if (!session?.url) return false;
  if (session.status !== "open") return false;
  if ((session.currency ?? "").toLowerCase() !== CHARGE_CURRENCY) return false;
  const amount = session.amount_total ?? session.amount_subtotal;
  return typeof amount === "number" && amount === chargedRappen;
}

/**
 * The single purge-safety rule (webhook purge, supersede, hourly sweep): a
 * booking's sessions may be treated as dead only when every one is expired and
 * unpaid. Anything open, complete (paid or not yet settled by us), or
 * unreadable keeps the booking alive. An empty list is trivially true.
 */
export async function allSessionsExpiredUnpaid(
  ids: readonly string[],
  retrieve: (id: string) => Promise<Pick<Stripe.Checkout.Session, "status" | "payment_status">>,
): Promise<boolean> {
  for (const id of ids) {
    try {
      const s = await retrieve(id);
      if (s.status !== "expired" || s.payment_status !== "unpaid") return false;
    } catch {
      return false;
    }
  }
  return true;
}

const FX_CHARGED_CURRENCIES = ["EUR", "USD", "AED"];

export function fxFromSession(session: Stripe.Checkout.Session): {
  chargedCurrency: string;
  fxRate: number | null;
  fxSource: string | null;
  fxQuotedAt: string | null;
  presentmentAmountMinor: number | null;
  presentmentCurrency: string | null;
} {
  const chargedCurrency = (session.currency ?? CHARGE_CURRENCY).toUpperCase();
  const none = {
    chargedCurrency,
    fxRate: null,
    fxSource: null,
    fxQuotedAt: null,
    presentmentAmountMinor: null,
    presentmentCurrency: null,
  };
  // booking_payments_fx_complete: the four fx columns (rate, source, quoted_at, presentment
  // amount) are all set or all null. A payment the customer made in another currency must
  // never fail to settle because Stripe omitted one of them, so the rate and the time are
  // derived here when Stripe does not name them, and the group is dropped (currency kept)
  // when a rate cannot be derived at all.
  const quotedAt = new Date((session.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString();
  const rateFrom = (presentmentMinor: number): number | null => {
    const charged = session.amount_total;
    if (typeof charged !== "number" || charged <= 0 || presentmentMinor <= 0) return null;
    const rate = Math.round((presentmentMinor / charged) * 1e8) / 1e8;
    return rate > 0 ? rate : null;
  };

  const pd = session.presentment_details;
  const pdCurrency = pd?.presentment_currency?.toUpperCase() ?? null;
  if (pd && pdCurrency && typeof pd.presentment_amount === "number") {
    if (pdCurrency === chargedCurrency) return none;
    const rate = rateFrom(pd.presentment_amount);
    // booking_payments_currency_allowed + _fx_currency_pair: charged_currency is the currency
    // the customer paid in (only CHF, EUR, USD, AED), and it is CHF exactly when there is no
    // rate. charged_rappen stays the CHF figure. Any other currency keeps CHF and records
    // only the presentment currency.
    if (rate === null || !FX_CHARGED_CURRENCIES.includes(pdCurrency)) return { ...none, presentmentCurrency: pdCurrency };
    return {
      chargedCurrency: pdCurrency,
      fxRate: rate,
      fxSource: "stripe_adaptive_pricing",
      fxQuotedAt: quotedAt,
      presentmentAmountMinor: pd.presentment_amount,
      presentmentCurrency: pdCurrency,
    };
  }
  const conversion = session.currency_conversion;
  if (!conversion) return none;
  const rawRate = conversion.fx_rate;
  const given = typeof rawRate === "number" ? rawRate : rawRate ? Number(rawRate) : null;
  const amount = typeof conversion.amount_total === "number" ? conversion.amount_total : null;
  const rate = given !== null && Number.isFinite(given) && given > 0 ? given : amount !== null ? rateFrom(amount) : null;
  if (rate === null || amount === null || amount <= 0) return none;
  return {
    chargedCurrency,
    fxRate: rate,
    fxSource: "stripe_adaptive_pricing",
    fxQuotedAt: quotedAt,
    presentmentAmountMinor: amount,
    // Legacy currency_conversion names only the source currency; unknown here.
    presentmentCurrency: null,
  };
}

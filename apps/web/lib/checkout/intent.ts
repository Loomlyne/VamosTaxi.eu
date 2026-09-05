// apps/web/lib/checkout/intent.ts
//
// POST /api/checkout/intent orchestrator. The route stays thin: parse, wire
// deps, return the Response. Stripe Checkout Session is created first because
// checkout_create_booking requires stripe_checkout_session_id at insert
// (07-02). A leftover session is expired when the RPC reports replayed=true.

import type Stripe from "stripe";
import { checkIntentAgainstLock, type IntentBody, type IntentRecompute } from "../quote/intent";
import type { QuoteLockPayload } from "../quote/lock";
import type { QuoteErrorCode } from "../quote/errors";
import { refuse, type CheckoutRefusalCode } from "./errors";
import type { CheckoutIntentRequest } from "./intent-schema";
import { manageTokenCookie } from "./manage-token";
import { CHARGE_CURRENCY } from "./currency";

export type CheckoutCreateBookingRow = {
  booking_id: string;
  reference: string;
  snapshot_id: number;
  payment_id: number;
  replayed: boolean;
};

export type CheckoutIntentDeps = {
  lockSecrets: { current: string; previous?: string };
  workerNowIso: string;
  postgresNowIso: string;
  reprice: (payload: QuoteLockPayload) => IntentRecompute;
  verifyTurnstile: (token: string | undefined) => Promise<boolean>;
  mintManageToken: () => Promise<{ raw: string; hash: Uint8Array }>;
  manageLinkMaxAgeSeconds: number;
  createCheckoutSession: (input: {
    chargedRappen: number;
    bookingId: string;
    bookingReference: string;
    customerEmail: string;
    locale: CheckoutIntentRequest["locale"];
    idempotencyKey: string;
    expiresAt: Date;
    returnUrl: string;
    productName: string;
  }) => Promise<Stripe.Checkout.Session>;
  expireCheckoutSession: (sessionId: string) => Promise<void>;
  retrieveCheckoutSession: (sessionId: string) => Promise<Stripe.Checkout.Session>;
  createBooking: (args: {
    quoteId: string;
    idempotencyKey: string;
    contact: CheckoutIntentRequest["contact"];
    locale: CheckoutIntentRequest["locale"];
    displayCurrency: CheckoutIntentRequest["display_currency"];
    snapshot: Record<string, unknown>;
    legs: unknown;
    couponId: number | null;
    couponCode: string | null;
    manageTokenHash: Uint8Array;
    manageTokenExpiresAt: Date;
    stripePaymentIntentId: string;
    stripeCheckoutSessionId: string;
    chargedRappen: number;
    actorCustomerId: string | null;
  }) => Promise<CheckoutCreateBookingRow>;
  publishableKey: string;
  returnUrl: string;
  checkoutWindowMinutes: number;
  actorCustomerId: string | null;
};

function mapQuoteCode(code: QuoteErrorCode): CheckoutRefusalCode {
  switch (code) {
    case "quote_not_found":
      return "quote_not_found";
    case "quote_expired":
      return "quote_expired";
    case "pricing_not_live":
      return "pricing_not_live";
    case "price_changed":
      return "price_changed";
    case "engine_changed":
      return "engine_changed";
    default:
      return "invalid_request";
  }
}

function sqlState(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string") {
    return (err as { code: string }).code;
  }
  return undefined;
}

function paymentIntentId(session: Stripe.Checkout.Session): string {
  const pi = session.payment_intent;
  if (typeof pi === "string" && pi.length > 0) return pi;
  if (pi && typeof pi === "object" && "id" in pi && typeof pi.id === "string") return pi.id;
  return session.id;
}

function snapshotFromLock(
  payload: QuoteLockPayload,
  body: CheckoutIntentRequest,
  chargedRappen: number,
): Record<string, unknown> {
  return {
    vehicle_class_slug: body.vehicle_class,
    rate_version_id: payload.rate_version_id,
    settings_version_id: payload.settings_version_id,
    engine_version: payload.engine_version,
    lock_exp: payload.exp,
    pax: payload.pax,
    bags: payload.bags,
    lines: [],
    policy: {},
    shown_alternatives: payload.class_totals,
    display_currency: body.display_currency,
    source: "web",
    subtotal_rappen: chargedRappen,
    surcharges_rappen: 0,
    discount_rappen: 0,
    total_rappen: chargedRappen,
    distance_km: payload.legs.reduce((sum, leg) => sum + leg.distance_m, 0) / 1000,
    duration_min: Math.round(payload.legs.reduce((sum, leg) => sum + leg.duration_s, 0) / 60),
  };
}

export async function runCheckoutIntent(
  body: CheckoutIntentRequest,
  deps: CheckoutIntentDeps,
): Promise<Response> {
  const turnstileOk = await deps.verifyTurnstile(body.turnstile_token);
  if (!turnstileOk) {
    return refuse("turnstile_failed");
  }

  const intentBody: IntentBody = {
    quote_id: body.quote_id,
    lock: body.lock,
    vehicle_class: body.vehicle_class,
    extras: body.extras,
    coupon: body.coupon,
    idempotency_key: body.idempotency_key,
  };

  const checked = await checkIntentAgainstLock(intentBody, {
    secrets: deps.lockSecrets,
    workerNowIso: deps.workerNowIso,
    postgresNowIso: deps.postgresNowIso,
    recompute: (payload) => {
      const result = deps.reprice(payload);
      if (result instanceof Promise) {
        throw new Error("reprice must be synchronous for checkIntentAgainstLock");
      }
      return result;
    },
  });

  if (!checked.ok) {
    return refuse(mapQuoteCode(checked.code));
  }

  const payload = checked.payload;
  const board = await Promise.resolve(deps.reprice(payload));
  const chosen = board.classes.find((row) => row.slug === body.vehicle_class);
  const chargedRappen = chosen?.total_rappen;
  if (chargedRappen == null) {
    return refuse("pricing_not_live");
  }

  const token = await deps.mintManageToken();
  const expiresAt = new Date(Date.parse(deps.workerNowIso) + deps.checkoutWindowMinutes * 60_000);
  const manageExpiresAt = new Date(
    Math.max(...payload.legs.map((leg) => Date.parse(leg.scheduled_local))) +
      deps.manageLinkMaxAgeSeconds * 1000,
  );

  const session = await deps.createCheckoutSession({
    chargedRappen,
    bookingId: body.quote_id,
    bookingReference: body.idempotency_key,
    customerEmail: body.contact.email,
    locale: body.locale,
    idempotencyKey: body.idempotency_key,
    expiresAt,
    returnUrl: deps.returnUrl,
    productName: "Airport transfer",
  });

  const pi = paymentIntentId(session);
  let row: CheckoutCreateBookingRow;
  try {
    row = await deps.createBooking({
      quoteId: body.quote_id,
      idempotencyKey: body.idempotency_key,
      contact: body.contact,
      locale: body.locale,
      displayCurrency: body.display_currency,
      snapshot: snapshotFromLock(payload, body, chargedRappen),
      legs: payload.legs,
      couponId: null,
      couponCode: body.coupon ?? null,
      manageTokenHash: token.hash,
      manageTokenExpiresAt: manageExpiresAt,
      stripePaymentIntentId: pi,
      stripeCheckoutSessionId: session.id,
      chargedRappen,
      actorCustomerId: deps.actorCustomerId,
    });
  } catch (err) {
    await deps.expireCheckoutSession(session.id).catch(() => undefined);
    const state = sqlState(err);
    if (state === "23505" || state === "23001") return refuse("quote_already_booked");
    if (state === "23P01") return refuse("payment_window_closed");
    if (state === "P0002" || state === "23514") return refuse("coupon_no_longer_valid");
    throw err;
  }

  let payable: Stripe.Checkout.Session = session;
  if (row.replayed) {
    const stored = await deps.retrieveCheckoutSession(session.id).catch(() => null);
    if (!stored || stored.status !== "open" || !stored.client_secret) {
      await deps.expireCheckoutSession(session.id).catch(() => undefined);
      return refuse("payment_window_closed");
    }
    if (stored.id !== session.id) {
      await deps.expireCheckoutSession(session.id).catch(() => undefined);
    }
    payable = stored;
  }

  const clientSecret = payable.client_secret;
  if (!clientSecret) {
    return refuse("invalid_request");
  }

  const response = new Response(
    JSON.stringify({
      reference: row.reference,
      checkout_session_id: payable.id,
      client_secret: clientSecret,
      expires_at: expiresAt.toISOString(),
      currency: CHARGE_CURRENCY.toUpperCase(),
      amount_rappen: chargedRappen,
      publishable_key: deps.publishableKey,
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": manageTokenCookie(token.raw, deps.manageLinkMaxAgeSeconds),
      },
    },
  );
  return response;
}

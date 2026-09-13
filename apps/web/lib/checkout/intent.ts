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
import { extraFaresOn, extraRappenOutsideLock, lockHasExtra, type CheckoutExtraJson } from "./extras-catalog";
import { checkoutLegsFromLock, snapshotFromLock } from "./lock-to-rpc";
import { manageTokenCookie } from "./manage-token";
import { CHARGE_CURRENCY } from "./currency";
import { checkoutPaymentIntentId, sessionIsPayable } from "./stripe";
import { CH_VAT_RATE_BPS, payableWithVatRappen } from "./vat";

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
  attachPayment: (args: {
    quoteId: string;
    stripePaymentIntentId: string;
    stripeCheckoutSessionId: string;
    chargedRappen: number;
  }) => Promise<CheckoutCreateBookingRow>;
  loadOpenPayment: (quoteId: string) => Promise<{
    booking_id: string;
    reference: string;
    stripe_checkout_session_id: string;
  } | null>;
  publishableKey: string;
  returnUrl: string;
  checkoutWindowMinutes: number;
  actorCustomerId: string | null;
  vehicleClassId: string;
  snapshotPolicy: Record<string, unknown>;
  extrasCatalog?: CheckoutExtraJson[];
  /** asQuote loadLaunchFlags. Omitted/throw → fail-closed 81. */
  loadLaunchFlags?: () => Promise<{ vat_rate_bps: number }>;
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

async function sessionWithSecret(
  session: Stripe.Checkout.Session,
  retrieve: CheckoutIntentDeps["retrieveCheckoutSession"],
): Promise<Stripe.Checkout.Session | null> {
  if (session.client_secret) return session;
  const stored = await retrieve(session.id).catch(() => null);
  if (stored?.client_secret) return stored;
  return null;
}

async function payableFromOpen(
  existing: { booking_id: string; reference: string; stripe_checkout_session_id: string } | null,
  deps: CheckoutIntentDeps,
  chargedRappen: number,
): Promise<{
  row: { booking_id: string; reference: string };
  payable: Stripe.Checkout.Session;
} | null> {
  if (!existing) return null;
  const stored = await deps.retrieveCheckoutSession(existing.stripe_checkout_session_id).catch(
    () => null,
  );
  const payable = stored ? await sessionWithSecret(stored, deps.retrieveCheckoutSession) : null;
  if (!sessionIsPayable(payable, chargedRappen)) return null;
  return { row: existing, payable };
}

function utf8Hex(value: string): string {
  return Array.from(new TextEncoder().encode(value), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function vatRateBpsFromFlags(deps: CheckoutIntentDeps): Promise<number> {
  const load = deps.loadLaunchFlags;
  if (typeof load !== "function") return CH_VAT_RATE_BPS;
  try {
    const flags = await load();
    const bps = flags.vat_rate_bps;
    if (typeof bps === "number" && Number.isFinite(bps) && bps >= 0) {
      return Math.trunc(bps);
    }
  } catch {
    // RPC/column missing — fail closed 81
  }
  return CH_VAT_RATE_BPS;
}

function okIntentResponse(
  row: { reference: string; booking_id: string },
  payable: Stripe.Checkout.Session,
  deps: CheckoutIntentDeps,
  chargedRappen: number,
  expiresAt: Date,
  cookie: string | null,
  vatRateBps: number,
): Response {
  const clientSecret = payable.client_secret;
  if (!clientSecret) return refuse("invalid_request");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers["set-cookie"] = cookie;
  return new Response(
    JSON.stringify({
      reference: row.reference,
      booking_id: row.booking_id,
      checkout_session_id: payable.id,
      client_secret: clientSecret,
      client_secret_hex: utf8Hex(clientSecret),
      expires_at: expiresAt.toISOString(),
      currency: CHARGE_CURRENCY.toUpperCase(),
      amount_rappen: chargedRappen,
      vat_rate_bps: vatRateBps,
      publishable_key: deps.publishableKey,
    }),
    { status: 200, headers },
  );
}

export async function runCheckoutIntent(
  body: CheckoutIntentRequest,
  deps: CheckoutIntentDeps,
): Promise<Response> {
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
  const netRappen = chosen?.total_rappen;
  if (netRappen == null) {
    return refuse("pricing_not_live");
  }
  const catalog = deps.extrasCatalog ?? [];
  const extraOn = (code: string) =>
    lockHasExtra(payload.extras, code) || lockHasExtra(body.extras, code);
  const extraFares = extraFaresOn(catalog, extraOn);
  const extraAdd = extraRappenOutsideLock(payload.extras, catalog, extraOn);
  const vatRateBps = await vatRateBpsFromFlags(deps);
  const chargedRappen = payableWithVatRappen(netRappen + extraAdd, vatRateBps);
  if (!deps.vehicleClassId) {
    return refuse("invalid_request");
  }
  if (!deps.snapshotPolicy) {
    return refuse("invalid_request");
  }

  const token = await deps.mintManageToken();
  const expiresAt = new Date(Date.parse(deps.workerNowIso) + deps.checkoutWindowMinutes * 60_000);
  const manageExpiresAt = new Date(
    Math.max(...payload.legs.map((leg) => Date.parse(leg.scheduled_local))) +
      deps.manageLinkMaxAgeSeconds * 1000,
  );

  const existingOpen = await deps.loadOpenPayment(body.quote_id);
  const reused = await payableFromOpen(existingOpen, deps, chargedRappen);
  if (reused) {
    return okIntentResponse(reused.row, reused.payable, deps, chargedRappen, expiresAt, null, vatRateBps);
  }

  const stripeIdempotencyKey = existingOpen
    ? `${body.idempotency_key}:after:${existingOpen.stripe_checkout_session_id}`
    : body.idempotency_key;

  const created = await deps.createCheckoutSession({
    chargedRappen,
    bookingId: body.quote_id,
    bookingReference: body.idempotency_key,
    customerEmail: body.contact.email,
    locale: body.locale,
    idempotencyKey: stripeIdempotencyKey,
    expiresAt,
    returnUrl: deps.returnUrl,
    productName: "Airport transfer",
  });

  let session = await sessionWithSecret(created, deps.retrieveCheckoutSession);
  if (!sessionIsPayable(session, chargedRappen)) {
    await deps.expireCheckoutSession(created.id).catch(() => undefined);
    const retry = await deps.createCheckoutSession({
      chargedRappen,
      bookingId: body.quote_id,
      bookingReference: body.idempotency_key,
      customerEmail: body.contact.email,
      locale: body.locale,
      idempotencyKey: `${body.idempotency_key}:open`,
      expiresAt,
      returnUrl: deps.returnUrl,
      productName: "Airport transfer",
    });
    session = await sessionWithSecret(retry, deps.retrieveCheckoutSession);
    if (!sessionIsPayable(session, chargedRappen)) {
      await deps.expireCheckoutSession(retry.id).catch(() => undefined);
      return refuse("invalid_request");
    }
  }

  const pi = checkoutPaymentIntentId(session);
  let row: CheckoutCreateBookingRow;
  try {
    row = await deps.createBooking({
      quoteId: body.quote_id,
      idempotencyKey: body.idempotency_key,
      contact: body.contact,
      locale: body.locale,
      displayCurrency: body.display_currency,
      snapshot: snapshotFromLock(
        payload,
        body.vehicle_class,
        deps.vehicleClassId,
        chargedRappen,
        deps.snapshotPolicy,
        extraFares,
      ),
      legs: checkoutLegsFromLock(payload, deps.vehicleClassId),
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
    const state = sqlState(err);
    if (state === "23505" || state === "23001") {
      const existing = await deps.loadOpenPayment(body.quote_id);
      const reused = await payableFromOpen(existing, deps, chargedRappen);
      if (reused) {
        if (reused.payable.id !== session.id) {
          await deps.expireCheckoutSession(session.id).catch(() => undefined);
        }
        return okIntentResponse(reused.row, reused.payable, deps, chargedRappen, expiresAt, null, vatRateBps);
      }
      try {
        if (existing && existing.stripe_checkout_session_id !== session.id) {
          await deps.expireCheckoutSession(existing.stripe_checkout_session_id).catch(
            () => undefined,
          );
        }
        row = await deps.attachPayment({
          quoteId: body.quote_id,
          stripePaymentIntentId: pi,
          stripeCheckoutSessionId: session.id,
          chargedRappen,
        });
        return okIntentResponse(row, session, deps, chargedRappen, expiresAt, null, vatRateBps);
      } catch (attachErr) {
        await deps.expireCheckoutSession(session.id).catch(() => undefined);
        const attachState = sqlState(attachErr);
        if (attachState === "23505" || attachState === "23001") {
          return refuse("quote_already_booked");
        }
        if (attachState === "23P01") return refuse("payment_window_closed");
        throw attachErr;
      }
    } else {
      await deps.expireCheckoutSession(session.id).catch(() => undefined);
      if (state === "23P01") return refuse("payment_window_closed");
      if (state === "P0002" || state === "23514") return refuse("coupon_no_longer_valid");
      console.error(
        "checkout_create_booking_failed",
        state ?? "no-sqlstate",
        err instanceof Error ? err.message : String(err),
      );
      return new Response(
        JSON.stringify({
          ok: false,
          error: "checkout_rpc_failed",
          sqlstate: state ?? null,
          detail: err instanceof Error ? err.message : String(err),
        }),
        { status: 500, headers: { "content-type": "application/json" } },
      );
    }
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

  return okIntentResponse(
    row,
    payable,
    deps,
    chargedRappen,
    expiresAt,
    manageTokenCookie(token.raw, deps.manageLinkMaxAgeSeconds),
    vatRateBps,
  );
}

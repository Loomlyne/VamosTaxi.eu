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
import { refusalForMissingClassId, stripeAccountIsLegacyUaeTest } from "./charge-gate";
import { refuse, type CheckoutRefusalCode } from "./errors";
import type { CheckoutIntentRequest } from "./intent-schema";
import { extraFaresOn, extraRappenOutsideLock, lockHasExtra, type CheckoutExtraJson } from "./extras-catalog";
import { checkoutLegsFromLock, snapshotFromLock } from "./lock-to-rpc";
import { manageTokenCookie } from "./manage-token";
import { CHARGE_CURRENCY } from "./currency";
import { stripeCheckoutReturnUrl } from "./return-url";
import { checkoutPaymentIntentId, sessionIsPayable } from "./stripe";
import { CH_VAT_RATE_BPS } from "./vat";
import { payableRappen } from "./payable";
import { percentToHundredths, roundHalfUp } from "../pricing/round";

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
  /** Stores the minted hash on an existing booking. Required on reuse, where createBooking does not run. */
  issueManageToken: (args: {
    bookingId: string;
    hash: Uint8Array;
    expiresAt: Date;
  }) => Promise<void>;
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
  /** D-33: test unpaid never opens Stripe. Omitted → not a test booking. */
  loadQuotePayGate?: (quoteId: string) => Promise<{ is_test: boolean } | null>;
  /**
   * D-11: re-evaluated with the payer's identity at payment, never the
   * quote-time evaluation. Required whenever body.coupon is set — its
   * absence there is `invalid_request`, not a silent skip.
   */
  evaluateCoupon?: (
    code: string,
    ids: { customerId: string | null; contactEmail: string | null },
  ) => Promise<unknown>;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

type CouponEval =
  | { ok: true; couponId: number; percentHundredths: number | null }
  | { ok: false };

/**
 * D-30/D-08a: evaluate_coupon's jsonb — ok:true plus coupon_id always means
 * apply it; percentHundredths is null for an amount-kind coupon or an
 * unparseable percent (payableRappen then leaves extras undiscounted for
 * that coupon rather than guessing).
 */
function couponEvalFromRaw(raw: unknown): CouponEval {
  if (!isRecord(raw) || raw.ok !== true) return { ok: false };
  const idRaw = raw.coupon_id;
  const couponId = typeof idRaw === "number" ? idRaw : Number(idRaw);
  if (!Number.isFinite(couponId)) return { ok: false };
  if (raw.kind === "percent" && typeof raw.percent === "string" && /^\d{1,3}(?:\.\d{1,2})?$/.test(raw.percent)) {
    return { ok: true, couponId, percentHundredths: percentToHundredths(raw.percent) };
  }
  return { ok: true, couponId, percentHundredths: null };
}

/**
 * Inverse of payableRappen's discount: the lock only ever carries the
 * post-coupon class total, so a percent coupon re-evaluated at intent must
 * gross it back up before checkout extras can be discounted too (D-08a).
 * >=100% grossing is skipped — the net is already 0 and any base value
 * maps to the same 0 through payableRappen's own floor.
 */
function grossUpBeforeCouponRappen(postCouponRappen: number, percentHundredths: number): number {
  if (percentHundredths <= 0 || percentHundredths >= 10_000) return postCouponRappen;
  return roundHalfUp(postCouponRappen * 10_000, 10_000 - percentHundredths);
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

function legacyUaeAccountStop(): Response {
  return new Response(JSON.stringify({ ok: false }), {
    status: 503,
    headers: {
      "content-type": "application/json",
      "cache-control": "private, no-store",
    },
  });
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
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "cache-control": "private, no-store",
  };
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

/** Compare flight numbers ignoring case and spacing; blank means none. */
function flightKey(value: string | null): string {
  return (value ?? "").replace(/\s+/g, "").toUpperCase();
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

  // D-08b / T-26.1-91: the airport fee follows the flight number, so a body
  // whose flight number the signed lock never priced must re-price first.
  // Before any Stripe call or booking row.
  if (
    body.flight_no !== undefined &&
    flightKey(body.flight_no) !== flightKey(checked.payload.legs[0]?.flight_no ?? null)
  ) {
    return refuse("price_changed");
  }

  const payGate = await deps.loadQuotePayGate?.(body.quote_id);
  if (payGate?.is_test) {
    return refuse("invalid_request");
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
  // D-38: waiting extra is 0 at pay. extraFaresOn / extraRappenOutsideLock drop it.
  const vatRateBps = await vatRateBpsFromFlags(deps);

  // D-11: re-evaluated with the payer's identity right here — never the
  // quote-time evaluation, and never trusted from the lock's coupon code.
  let couponId: number | null = null;
  let couponPercentHundredths: number | null = null;
  const typedCoupon = body.coupon?.trim();
  if (typedCoupon) {
    if (typeof deps.evaluateCoupon !== "function") {
      return refuse("coupon_no_longer_valid");
    }
    const raw = await deps.evaluateCoupon(typedCoupon, {
      customerId: deps.actorCustomerId,
      contactEmail: body.contact.email,
    });
    const evaluated = couponEvalFromRaw(raw);
    if (!evaluated.ok) {
      return refuse("coupon_no_longer_valid");
    }
    couponId = evaluated.couponId;
    couponPercentHundredths = evaluated.percentHundredths;
  }
  // D-08a: a percent coupon discounts checkout extras too. The lock only
  // carries the post-coupon class total, so it is grossed back up here.
  const preCouponRappen =
    couponPercentHundredths != null
      ? grossUpBeforeCouponRappen(netRappen, couponPercentHundredths)
      : null;
  const chargedRappen = payableRappen({
    classNetRappen: netRappen,
    preCouponRappen,
    extraAddRappen: extraAdd,
    couponPercent: couponPercentHundredths,
    vatRateBps,
  }).chargedRappen;
  if (!deps.vehicleClassId) {
    return refuse(refusalForMissingClassId());
  }
  if (!deps.snapshotPolicy) {
    return refuse("invalid_request");
  }
  if (stripeAccountIsLegacyUaeTest(deps.publishableKey)) {
    return legacyUaeAccountStop();
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
    await deps.issueManageToken({
      bookingId: reused.row.booking_id,
      hash: token.hash,
      expiresAt: manageExpiresAt,
    });
    return okIntentResponse(
      reused.row,
      reused.payable,
      deps,
      chargedRappen,
      expiresAt,
      manageTokenCookie(token.raw, deps.manageLinkMaxAgeSeconds),
      vatRateBps,
    );
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
    returnUrl: stripeCheckoutReturnUrl(new URL(deps.returnUrl).origin, body.locale),
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
      returnUrl: stripeCheckoutReturnUrl(new URL(deps.returnUrl).origin, body.locale),
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
      couponId,
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
        await deps.issueManageToken({
          bookingId: reused.row.booking_id,
          hash: token.hash,
          expiresAt: manageExpiresAt,
        });
        return okIntentResponse(
          reused.row,
          reused.payable,
          deps,
          chargedRappen,
          expiresAt,
          manageTokenCookie(token.raw, deps.manageLinkMaxAgeSeconds),
          vatRateBps,
        );
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
        await deps.issueManageToken({
          bookingId: row.booking_id,
          hash: token.hash,
          expiresAt: manageExpiresAt,
        });
        return okIntentResponse(
          row,
          session,
          deps,
          chargedRappen,
          expiresAt,
          manageTokenCookie(token.raw, deps.manageLinkMaxAgeSeconds),
          vatRateBps,
        );
      } catch (attachErr) {
        await deps.expireCheckoutSession(session.id).catch(() => undefined);
        const attachState = sqlState(attachErr);
        if (attachState === "23505" || attachState === "23001") {
          return refuse("quote_already_booked");
        }
        if (attachState === "23P01") return refuse("payment_window_closed");
        // D-11 race: createBooking's own restrict_violation (23001) is shared
        // by "quote already booked" and tg_coupon_redemption_caps — both
        // raise the same SQLSTATE. attachPayment's independent lookup by
        // quote_id is the tell: a genuine already-booked row is always
        // there for it to find (23505/23001 above). Not found (P0002) with
        // a coupon on this attempt means the whole createBooking transaction
        // rolled back — the cap was hit between evaluate_coupon and the insert.
        if (attachState === "P0002" && couponId != null) {
          return refuse("coupon_no_longer_valid");
        }
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
        }),
        {
          status: 500,
          headers: {
            "content-type": "application/json",
            "cache-control": "private, no-store",
          },
        },
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

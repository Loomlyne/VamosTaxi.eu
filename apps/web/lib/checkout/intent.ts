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
import { refusalForMissingClassId } from "./charge-gate";
import { refuse, type CheckoutRefusalCode } from "./errors";
import type { CheckoutIntentRequest, CheckoutWebIntentRequest } from "./intent-schema";
import { checkoutCharge, type CheckoutChargeCoupon, type ExtraCatalogRow } from "./checkout-charge";
import { buildTripQuery } from "./trip-url";
import { zurichLocalToUtcMs } from "../geo/serviceArea";
import { extraFaresOn, extraRappenOutsideLock, lockHasExtra, type CheckoutExtraJson } from "./extras-catalog";
import { checkoutLegsFromLock, snapshotFromLock } from "./lock-to-rpc";
import { flightKey } from "./flight-no";
import { manageTokenCookie } from "./manage-token";
import { CHARGE_CURRENCY } from "./currency";
import { stripeCheckoutReturnUrl } from "./return-url";
import {
  allSessionsExpiredUnpaid,
  checkoutPaymentIntentId,
  hostedSessionIsPayable,
} from "./stripe";
import { CH_VAT_RATE_BPS } from "./vat";
import enMessages from "../../i18n/messages/en.json";
import deMessages from "../../i18n/messages/de.json";
import frMessages from "../../i18n/messages/fr.json";
import arMessages from "../../i18n/messages/ar.json";
import { payableRappen } from "./payable";
import { percentToHundredths, roundHalfUp } from "../pricing/round";


const PRODUCT_NAMES: Record<string, string> = {
  en: enMessages.checkout.stripeProductName,
  de: deMessages.checkout.stripeProductName,
  fr: frMessages.checkout.stripeProductName,
  ar: arMessages.checkout.stripeProductName,
};

/** The line Stripe's hosted page shows for every ride: neutral, in the checkout locale (D-14). */
export function stripeProductName(locale: string | null | undefined): string {
  return PRODUCT_NAMES[locale ?? "en"] ?? PRODUCT_NAMES.en!;
}

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
  /**
   * D-20/D-21 (26.1-29): the booking's pay-link hold (`bookings.hold_until`),
   * loaded by the route from `checkout_booking_hold_until`. While it is open
   * the traveller's own lock stays payable past `exp`. Omitted → exp only.
   */
  holdUntilIso?: string | null;
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
    productName: string;
    /** 26.3 D-02 / D-48: always Stripe's hosted page. */
    uiMode?: "hosted_page";
    successUrl: string;
    cancelUrl: string;
    twint?: boolean;
    selectionFingerprint?: string;
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
   * quote-time evaluation. Required whenever the verified lock's
   * payload.coupon is set — its absence there is a `coupon_no_longer_valid`
   * refusal, not a silent skip.
   */
  evaluateCoupon?: (
    code: string,
    ids: { customerId: string | null; contactEmail: string | null },
  ) => Promise<unknown>;

  // ---- 26.3: hosted Stripe page. ----
  /** Kept for callers that still pass it; the only mode is "web". */
  mode?: "web";
  /** D-35: the live catalog of tick-box extras (loadCheckoutCatalog). */
  loadCatalog?: () => Promise<ExtraCatalogRow[]>;
  /** The bound Stripe account is the legacy UAE test one: never mint (web mode). */
  legacyUaeAccount?: boolean;
  /** publicSiteOrigin — never taken from request headers (T-26.3-10-04). */
  origin?: string;
  /** checkoutPaymentMethodTypes(env) includes twint. */
  twint?: boolean;
  /** checkout_set_booking_details: company fields, driver note, trip query. */
  setBookingDetails?: (args: {
    bookingId: string;
    companyName: string;
    companyAddress: string;
    companyVat: string;
    driverNote: string;
    tripQuery: string;
  }) => Promise<void>;
  /** checkout_booking_session_ids: every Stripe session of a booking. */
  listSessionIds?: (bookingId: string) => Promise<string[]>;
  /**
   * purge_unpaid_booking(id, reason). The function answers false when the row is
   * not eligible (paid, refunded, pay link sent, …) instead of raising, so false
   * must stop the supersede.
   */
  purgeUnpaid?: (bookingId: string, reason: "superseded") => Promise<boolean | void>;
  /** True only when this request's vt_manage cookie owns that booking. */
  ownsBooking?: (bookingId: string) => Promise<boolean>;
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

// ---------------------------------------------------------------------------
// Mode "web" (26.3): the hosted-page Pay endpoint.
// ---------------------------------------------------------------------------

type WebCoupon = {
  couponId: number;
  charge: CheckoutChargeCoupon;
};

/** evaluate_coupon's jsonb → what checkoutCharge needs. Null = not applicable. */
function webCouponFromRaw(raw: unknown, code: string): WebCoupon | null {
  if (!isRecord(raw) || raw.ok !== true) return null;
  const idRaw = raw.coupon_id;
  const couponId = typeof idRaw === "number" ? idRaw : Number(idRaw);
  if (!Number.isFinite(couponId)) return null;
  if (raw.kind === "percent" && typeof raw.percent === "string" && /^\d{1,3}(?:\.\d{1,2})?$/.test(raw.percent)) {
    return {
      couponId,
      charge: { code, kind: "percent", percentHundredths: percentToHundredths(raw.percent), amountRappen: null },
    };
  }
  const amount = typeof raw.amount_rappen === "number" ? raw.amount_rappen : Number(raw.amount_rappen);
  if (raw.kind === "amount" && Number.isFinite(amount) && amount > 0) {
    return { couponId, charge: { code, kind: "amount", percentHundredths: null, amountRappen: Math.trunc(amount) } };
  }
  // A coupon that is valid but prices nothing here: keep the id, no discount.
  return { couponId, charge: { code, kind: "amount", percentHundredths: null, amountRappen: 0 } };
}

const JSON_HEADERS = { "content-type": "application/json", "cache-control": "private, no-store" };

function rpcFailed(): Response {
  return new Response(JSON.stringify({ ok: false, error: "checkout_rpc_failed" }), {
    status: 500,
    headers: JSON_HEADERS,
  });
}

function okWebResponse(
  row: { reference: string; booking_id: string },
  session: Stripe.Checkout.Session,
  chargedRappen: number,
  fallbackExpiresAt: Date,
  cookie: string,
): Response {
  const url = session.url;
  if (!url) return refuse("invalid_request");
  const expiresAt =
    typeof session.expires_at === "number" && Number.isFinite(session.expires_at)
      ? new Date(session.expires_at * 1000)
      : fallbackExpiresAt;
  return new Response(
    JSON.stringify({
      ok: true,
      reference: row.reference,
      booking_id: row.booking_id,
      url,
      expires_at: expiresAt.toISOString(),
      amount_rappen: chargedRappen,
    }),
    { status: 200, headers: { ...JSON_HEADERS, "set-cookie": cookie } },
  );
}

/**
 * D-24 / D-25 / T-26.3-10-03: replace an unpaid booking. Every Stripe session of
 * it is expired, then every one is read back and must be expired AND unpaid
 * (the same rule as the hourly sweep) before the row is purged. Anything else
 * — a paid or still-settling session, an unreadable one — keeps the booking and
 * refuses the new Pay. Returns a refusal Response, or null when the row is gone.
 */
async function supersedeBooking(
  bookingId: string,
  deps: CheckoutIntentDeps,
): Promise<Response | null> {
  if (!deps.listSessionIds || !deps.purgeUnpaid) return refuse("invalid_request");
  const ids = await deps.listSessionIds(bookingId);
  for (const id of ids) {
    await deps.expireCheckoutSession(id).catch(() => undefined);
  }
  const dead = await allSessionsExpiredUnpaid(ids, deps.retrieveCheckoutSession);
  if (!dead) return refuse("quote_already_booked");
  try {
    const purged = await deps.purgeUnpaid(bookingId, "superseded");
    // purge_unpaid_booking re-checks eligibility; false means not purgeable.
    if (purged === false) return refuse("quote_already_booked");
  } catch {
    return refuse("quote_already_booked");
  }
  return null;
}

/**
 * D-24: deterministic hash of everything the charge and the booking content
 * depend on — quote, class, sorted extra codes with quantities, voucher, rate
 * and settings versions, the charged amount. Stored on the Stripe session
 * (metadata.selection) and compared on Pay again: equal totals do not make two
 * selections the same booking. Contact, company and note are not part of it.
 */
async function selectionFingerprint(parts: {
  quoteId: string;
  vehicleClass: string;
  extraCodes: string[];
  coupon: string | null;
  chargedRappen: number;
  rateVersionId: number | null;
  settingsVersionId: number;
}): Promise<string> {
  const canonical = JSON.stringify({
    q: parts.quoteId,
    c: parts.vehicleClass,
    e: [...parts.extraCodes].sort().map((code) => [code, 1]),
    v: parts.coupon,
    a: parts.chargedRappen,
    r: parts.rateVersionId,
    s: parts.settingsVersionId,
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function amountMatches(session: Stripe.Checkout.Session, chargedRappen: number): boolean {
  if ((session.currency ?? "").toLowerCase() !== CHARGE_CURRENCY) return false;
  const amount = session.amount_total ?? session.amount_subtotal;
  return typeof amount === "number" && amount === chargedRappen;
}

/** Plain boolean (hostedSessionIsPayable is a type guard and narrows the else branch to never). */
function hostedPayable(session: Stripe.Checkout.Session | null, chargedRappen: number): boolean {
  return hostedSessionIsPayable(session, chargedRappen);
}

async function runWebIntent(
  body: CheckoutWebIntentRequest,
  deps: CheckoutIntentDeps,
): Promise<Response> {
  const intentBody: IntentBody = {
    quote_id: body.quote_id,
    lock: body.lock,
    vehicle_class: body.vehicle_class,
    coupon: body.coupon,
    idempotency_key: body.idempotency_key,
  };
  const checked = await checkIntentAgainstLock(intentBody, {
    secrets: deps.lockSecrets,
    workerNowIso: deps.workerNowIso,
    postgresNowIso: deps.postgresNowIso,
    holdUntilIso: deps.holdUntilIso,
    recompute: (payload) => {
      const result = deps.reprice(payload);
      if (result instanceof Promise) {
        throw new Error("reprice must be synchronous for checkIntentAgainstLock");
      }
      return result;
    },
  });
  if (!checked.ok) return refuse(mapQuoteCode(checked.code));
  const payload = checked.payload;

  // D-15 / T-26.3-10-01: when, travellers, bags and flight come from the signed
  // lock. A body that says otherwise needs a fresh quote first.
  const leg = payload.legs[0];
  if (!leg) return refuse("invalid_request");
  if (
    body.trip.when !== leg.scheduled_local.slice(0, 16) ||
    body.trip.pax !== payload.pax ||
    (body.trip.bags ?? 0) !== payload.bags ||
    flightKey(body.trip.flight) !== flightKey(leg.flight_no)
  ) {
    return refuse("price_changed");
  }
  if (body.flight_no !== undefined && flightKey(body.flight_no) !== flightKey(leg.flight_no)) {
    return refuse("price_changed");
  }

  const payGate = await deps.loadQuotePayGate?.(body.quote_id);
  if (payGate?.is_test) return refuse("invalid_request");

  const board = await Promise.resolve(deps.reprice(payload));
  const netRappen = board.classes.find((row) => row.slug === body.vehicle_class)?.total_rappen;
  if (netRappen == null) return refuse("pricing_not_live");

  if (!deps.loadCatalog) return refuse("pricing_not_live");
  let catalog: ExtraCatalogRow[];
  try {
    catalog = await deps.loadCatalog();
  } catch {
    return refuse("pricing_not_live");
  }
  const vatRateBps = await vatRateBpsFromFlags(deps);

  // D-11: the coupon is the verified lock's coupon; the payer's eligibility is
  // re-evaluated here with the payer's identity, never trusted from quote time.
  let couponId: number | null = null;
  let coupon: CheckoutChargeCoupon | null = null;
  let preCouponRappen: number | null = null;
  const lockCoupon = payload.coupon?.trim().toUpperCase() || null;
  const bodyCoupon = body.coupon?.trim().toUpperCase() || null;
  if (bodyCoupon !== null && bodyCoupon !== lockCoupon) return refuse("coupon_no_longer_valid");
  if (lockCoupon) {
    if (typeof deps.evaluateCoupon !== "function") return refuse("coupon_no_longer_valid");
    const raw = await deps.evaluateCoupon(lockCoupon, {
      customerId: deps.actorCustomerId,
      contactEmail: body.contact.email,
    });
    const evaluated = webCouponFromRaw(raw, lockCoupon);
    if (!evaluated) return refuse("coupon_no_longer_valid");
    couponId = evaluated.couponId;
    coupon = evaluated.charge;
    // The lock carries the post-coupon class total; checkoutCharge starts from
    // the pre-coupon fare (plan 26.3-03 decision 4).
    if (coupon.kind === "percent" && coupon.percentHundredths != null) {
      preCouponRappen = grossUpBeforeCouponRappen(netRappen, coupon.percentHundredths);
    } else if (coupon.kind === "amount" && coupon.amountRappen) {
      preCouponRappen = netRappen + coupon.amountRappen;
    }
  }

  // D-19 / D-35: the one charge function, exact extra codes, live catalog.
  // D-38: the waiting extra is 0 at pay (waiting extra is 0 at pay: never a Stripe amount).
  const charge = checkoutCharge({
    classNetRappen: netRappen,
    preCouponRappen,
    extraCodes: body.extra_codes,
    catalog,
    coupon,
    vatRateBps,
    vehicleClassSlug: body.vehicle_class,
  });
  if (!charge.ok) return refuse("price_changed");
  const chargedRappen = charge.chargedRappen;

  if (!deps.vehicleClassId) return refuse(refusalForMissingClassId());
  if (!deps.snapshotPolicy) return refuse("invalid_request");
  if (deps.legacyUaeAccount === true) return legacyUaeAccountStop();
  if (!deps.origin) return refuse("invalid_request");

  // D-36: the pickup wall clock is Europe/Zurich, so the manage link runs 30
  // days after the last leg's Zurich instant.
  let lastLegMs = Number.NEGATIVE_INFINITY;
  for (const l of payload.legs) {
    const ms = zurichLocalToUtcMs(l.scheduled_local);
    if (ms == null) return refuse("invalid_request");
    lastLegMs = Math.max(lastLegMs, ms);
  }
  const manageExpiresAt = new Date(lastLegMs + deps.manageLinkMaxAgeSeconds * 1000);
  const expiresAt = new Date(Date.parse(deps.workerNowIso) + deps.checkoutWindowMinutes * 60_000);
  const token = await deps.mintManageToken();
  const cookie = manageTokenCookie(token.raw, deps.manageLinkMaxAgeSeconds);

  // D-24: the trip (with the picked class and extras) is stored for resume and
  // sent back in the cancel URL. Rebuilt from validated fields; no contact data.
  const tripForUrl = { ...body.trip, class: body.vehicle_class, extras: body.extra_codes, resume: body.quote_id };
  const tripQuery = buildTripQuery(tripForUrl);
  const prefix = body.locale === "en" ? "" : `/${body.locale}`;
  const successUrl = `${deps.origin}/api/checkout/return?locale=${body.locale}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${deps.origin}${prefix}/checkout?${buildTripQuery(tripForUrl, { resume: true })}`;

  const fingerprint = await selectionFingerprint({
    quoteId: body.quote_id,
    vehicleClass: body.vehicle_class,
    extraCodes: body.extra_codes,
    coupon: lockCoupon,
    chargedRappen,
    rateVersionId: payload.rate_version_id,
    settingsVersionId: payload.settings_version_id,
  });
  const sameSelection = (session: Stripe.Checkout.Session) =>
    session.metadata?.selection === fingerprint;

  const openSession = (idempotencyKey: string) =>
    deps.createCheckoutSession({
      chargedRappen,
      bookingId: body.quote_id,
      bookingReference: body.idempotency_key,
      customerEmail: body.contact.email,
      locale: body.locale,
      idempotencyKey,
      expiresAt,
      uiMode: "hosted_page",
      successUrl,
      cancelUrl,
      twint: deps.twint === true,
      selectionFingerprint: fingerprint,
      productName: stripeProductName(body.locale),
    });

  const saveDetails = (bookingId: string) => {
    if (!deps.setBookingDetails) return Promise.resolve();
    return deps.setBookingDetails({
      bookingId,
      companyName: body.company_name.trim(),
      companyAddress: body.company_address.trim(),
      companyVat: body.company_vat.trim(),
      driverNote: body.driver_note.trim(),
      tripQuery,
    });
  };

  // ---- Back-and-Pay-again on the same quote: reuse, re-attach or replace. ----
  let idempotencyKey = body.idempotency_key;
  let attachTo: { booking_id: string; reference: string; stripe_checkout_session_id: string } | null = null;
  let replacedBookingId: string | null = null;
  const existingOpen = await deps.loadOpenPayment(body.quote_id);
  if (existingOpen) {
    const stored = await deps.retrieveCheckoutSession(existingOpen.stripe_checkout_session_id).catch(() => null);
    if (!stored) return refuse("invalid_request");
    if (stored.status === "complete") return refuse("quote_already_booked");
    if (hostedPayable(stored, chargedRappen) && sameSelection(stored)) {
      // D-24: same selection, session still open → same booking, same page.
      await deps.issueManageToken({ bookingId: existingOpen.booking_id, hash: token.hash, expiresAt: manageExpiresAt });
      await saveDetails(existingOpen.booking_id);
      return okWebResponse(existingOpen, stored, chargedRappen, expiresAt, cookie);
    }
    if (stored.status === "expired" && amountMatches(stored, chargedRappen) && sameSelection(stored)) {
      attachTo = existingOpen;
      idempotencyKey = `${body.idempotency_key}:after:${stored.id}`;
    } else {
      // The selection (or the price) changed, or the session carries no
      // fingerprint: one unpaid row at a time.
      const refused = await supersedeBooking(existingOpen.booking_id, deps);
      if (refused) return refused;
      replacedBookingId = existingOpen.booking_id;
      idempotencyKey = `${body.idempotency_key}:after:${existingOpen.booking_id}`;
    }
  }

  // A re-quote after Back mints a new quote_id: `supersedes` names the old
  // BOOKING. Only its owner (vt_manage hash) may replace it; anyone else's id
  // is ignored — nothing is purged and the new booking is simply created.
  if (
    body.supersedes &&
    body.supersedes !== existingOpen?.booking_id &&
    body.supersedes !== replacedBookingId &&
    deps.ownsBooking &&
    (await deps.ownsBooking(body.supersedes))
  ) {
    const refused = await supersedeBooking(body.supersedes, deps);
    if (refused) return refused;
    idempotencyKey = `${body.idempotency_key}:after:${body.supersedes}`;
  }

  const created = await openSession(idempotencyKey);
  if (!hostedPayable(created, chargedRappen)) {
    await deps.expireCheckoutSession(created.id).catch(() => undefined);
    return refuse("invalid_request");
  }
  const pi = checkoutPaymentIntentId(created);

  if (attachTo) {
    try {
      const row = await deps.attachPayment({
        quoteId: body.quote_id,
        stripePaymentIntentId: pi,
        stripeCheckoutSessionId: created.id,
        chargedRappen,
      });
      await deps.issueManageToken({ bookingId: row.booking_id, hash: token.hash, expiresAt: manageExpiresAt });
      await saveDetails(row.booking_id);
      return okWebResponse(row, created, chargedRappen, expiresAt, cookie);
    } catch (err) {
      await deps.expireCheckoutSession(created.id).catch(() => undefined);
      const state = sqlState(err);
      if (state === "23505" || state === "23001") return refuse("quote_already_booked");
      if (state === "23P01") return refuse("payment_window_closed");
      throw err;
    }
  }

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
        [],
        charge.lines,
      ),
      legs: checkoutLegsFromLock(payload, deps.vehicleClassId),
      couponId,
      couponCode: lockCoupon,
      manageTokenHash: token.hash,
      manageTokenExpiresAt: manageExpiresAt,
      stripePaymentIntentId: pi,
      stripeCheckoutSessionId: created.id,
      chargedRappen,
      actorCustomerId: deps.actorCustomerId,
    });
  } catch (err) {
    const state = sqlState(err);
    if (state === "23505" || state === "23001") {
      // Race with a concurrent Pay on the same quote: use theirs if payable.
      const winner = await deps.loadOpenPayment(body.quote_id);
      const stored = winner
        ? await deps.retrieveCheckoutSession(winner.stripe_checkout_session_id).catch(() => null)
        : null;
      await deps.expireCheckoutSession(created.id).catch(() => undefined);
      if (winner && stored && hostedPayable(stored, chargedRappen)) {
        await deps.issueManageToken({ bookingId: winner.booking_id, hash: token.hash, expiresAt: manageExpiresAt });
        await saveDetails(winner.booking_id);
        return okWebResponse(winner, stored, chargedRappen, expiresAt, cookie);
      }
      return refuse("quote_already_booked");
    }
    await deps.expireCheckoutSession(created.id).catch(() => undefined);
    if (state === "23P01") return refuse("payment_window_closed");
    if (state === "P0002" || state === "23514") return refuse("coupon_no_longer_valid");
    console.error(
      "checkout_create_booking_failed",
      state ?? "no-sqlstate",
      err instanceof Error ? err.message : String(err),
    );
    return rpcFailed();
  }

  let payable: Stripe.Checkout.Session = created;
  if (row.replayed) {
    const stored = await deps.retrieveCheckoutSession(created.id).catch(() => null);
    if (!stored || !hostedPayable(stored, chargedRappen)) {
      await deps.expireCheckoutSession(created.id).catch(() => undefined);
      return refuse("payment_window_closed");
    }
    payable = stored;
  }

  try {
    await saveDetails(row.booking_id);
  } catch (err) {
    await deps.expireCheckoutSession(created.id).catch(() => undefined);
    console.error("checkout_set_details_failed", sqlState(err) ?? "no-sqlstate");
    return rpcFailed();
  }
  return okWebResponse(row, payable, chargedRappen, expiresAt, cookie);
}

/** The one intent runner: the hosted-page Pay endpoint (D-48: no client secret, no card form of ours). */
export function runCheckoutIntent(
  body: CheckoutWebIntentRequest,
  deps: CheckoutIntentDeps,
): Promise<Response> {
  return runWebIntent(body, deps);
}

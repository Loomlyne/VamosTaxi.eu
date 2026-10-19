// apps/web/lib/checkout/settle.ts
//
// D-14 / D-15 / D-16: Queue consumer state machine. The browser return URL
// never confirms a booking. D-15 is MEDIUM confidence in the research — both
// candidate events are idempotent against the same dedupe and ordering, so
// being wrong here costs efficiency, not correctness. Corroborated against
// https://docs.stripe.com/checkout/fulfillment (session.completed +
// payment_status === paid is the documented fulfillment signal).
//
// 26.1-05 D-03/D-05/D-18/D-22: a successful charge always ends confirmed or
// refunded, never silently kept. The capture gate (checkout_capture_gate) is
// no longer consulted here — checkout_payment_settle v2 (26.1-02) already
// decides revive vs refund_required for a cancelled/expired/test booking, so
// settlePayment is always called for a succeeded outcome.

export const dynamic = "force-dynamic";

import type Stripe from "stripe";
import { asSystem } from "../db/identity";
import { withRequestContext, type ScalarValue } from "../logger";
import {
  createRefund,
  expireCheckoutSession,
  findSessionIdForPaymentIntent,
  fxFromSession,
  paymentMethodTypeFor,
  retrieveCharge,
  retrieveCheckoutSession,
  retrieveDispute,
  retrieveRefund,
  stripeFromEnv,
} from "./stripe";
import {
  handleChargeRefundedWithDeps,
  handleDisputeWithDeps,
  handleRefundUpdateWithDeps,
  moneyEventKind,
  paymentIntentIdOfCharge,
  paymentIntentIdOfDispute,
  type MoneyEventDeps,
} from "./money-events";
import { stripeAccountIsLegacyUaeTest } from "./charge-gate";
import type { StripeQueueMessage } from "./webhook";
import { purgeDepsFromEnv, purgeOnSessionExpired } from "./purge-unpaid";
import { deliverConfirmation } from "./notify";
import { mailCustomerRefund } from "./refund-mail";
import { provisionCheckoutAccount, provisionDeps } from "./provision-account";
import {
  deliverAmountMismatchAlert,
  deliverDifferenceNotAppliedAlert,
  deliverOverlapMustFix,
  deliverPaidAfterCancelAlert,
  deliverStuckPaymentAlert,
  type StuckPaymentAlertInput,
} from "../ops/must-fix-mail";
import { deliverMoneyAlert } from "../ops/money-alert-mail";
import { pgTextArrayLiteral } from "./pg-array";
import {
  PAID_ERROR_RETRY_SECONDS,
  retryDelayForAttempt,
  retryDelaySeconds,
  settleErrorKind,
  sqlStateOf,
} from "./settle-errors";

/**
 * `delaySeconds` (26.1-08): a retry that must wait, e.g. app_refund_pending, so the retry budget spans minutes.
 * `settled` (26.1-16, D-22): present only when this message settled a duplicate
 * charge and its refund landed, so the return route can tell the payer. Queue
 * callers ignore it.
 */
export type HandleResult =
  | { ack: true; settled?: { duplicate: boolean; revived: boolean } }
  | { retry: true; delaySeconds?: number };

export type SettleRow = {
  booking_id: string;
  reference: string;
  locale: string;
  contact_email: string;
  already_settled: boolean;
  revived: boolean;
  duplicate: boolean;
  refund_required: boolean;
  refund_reason: string | null;
  payment_id: number;
  charged_rappen: number;
  other_open_session_ids: string[];
  /**
   * J3 (W4-07, W5-02): Stripe collected an amount, currency or booking that does not match what this
   * payment expected. The capture is recorded; the booking is NOT confirmed and nothing is refunded.
   * Ops is mailed, then the event is closed.
   */
  amount_mismatch?: boolean;
  /** 26.2 P1, kind=extra only: the paid change was applied (it may have ended before payment). */
  applied?: boolean;
  /** 26.2 P1, kind=extra only: the driver the applied class change took off the trip. */
  unassigned_chauffeur_id?: string | null;
  /** 26.2 P6, kind=extra only: the change request the payment settled (what it changed, for the driver's e-mail). */
  request_id?: string | null;
};

export type CaptureGate = {
  capture: boolean;
  reason?: "cancelled" | "expired" | "is_test";
};

export type CaptureGateRow = {
  status: string;
  is_test: boolean;
  expired: boolean;
};

/**
 * D-23 / D-33: never capture after lock expiry, cancel, or is_test. Paid stays payable.
 * Kept as a pure predicate for its own tests. Nothing in this file calls it any
 * more (26.1-05): `checkout_payment_settle` v2 itself decides revive vs
 * refund_required for a cancelled/expired/test booking (D-03), so the
 * consumer no longer short-circuits before calling `settlePayment`.
 */
export function captureAllowed(row: CaptureGateRow): CaptureGate {
  if (row.is_test) return { capture: false, reason: "is_test" };
  if (row.status === "cancelled") return { capture: false, reason: "cancelled" };
  if (row.expired && (row.status === "pending" || row.status === "quote")) {
    return { capture: false, reason: "expired" };
  }
  return { capture: true };
}

/** D-05: metadata every app-created Stripe refund carries so charge.refunded (26.1-08) can tell app refunds from dashboard refunds. */
export type RefundInput = {
  paymentIntentId: string;
  /** null refunds the whole charge. */
  amountRappen: number | null;
  idempotencyKey: string;
  metadata?: Record<string, string>;
  bookingId: string;
  paymentId: number;
  reason: string;
};

export type RecordDuplicateRefundInput = {
  paymentId: number;
  stripeRefundId: string;
  refundRappen: number;
  reason: string;
};

export type SettleDeps = MoneyEventDeps & {
  begin: (
    eventId: string,
    objectIds: string[],
    stripeCreated: Date,
  ) => Promise<{ should_process: boolean; reason: string }>;
  retrieveSession: (sessionId: string) => Promise<Stripe.Checkout.Session>;
  settlePayment: (input: {
    eventId: string;
    sessionId: string | null;
    paymentIntentId: string | null;
    outcome: "succeeded" | "failed" | "canceled";
    session: Stripe.Checkout.Session | null;
  }) => Promise<SettleRow>;
  eventSettle: (eventId: string, error: string | null) => Promise<void>;
  /**
   * J2 (W4-09): close an event that needs no further work (no_request, no_payment, booking_missing,
   * refund_required_no_payment_intent ...): processed_at is set and the reason stays in last_error, so
   * the unprocessed sweep never re-enqueues it and it stays findable.
   */
  eventClose: (eventId: string, reason: string) => Promise<void>;
  deliverConfirmation: (row: SettleRow) => Promise<void>;
  /** 26.5-05: account from the checkout choice; a failure never changes the settle result. */
  provisionAccount?: (row: SettleRow) => Promise<unknown>;
  /** 26.2 P1: the difference of a change was paid: confirmation again, driver taken off told. */
  afterExtraApplied?: (row: SettleRow) => Promise<void>;
  /**
   * 261002 settle safety: a difference was paid and recorded but the change was NOT applied (the trip
   * was cancelled, a newer change replaced it, or it no longer fits). Mails info@ (T1); best effort,
   * a failure never turns into a retry.
   */
  alertDifferenceNotApplied?: (row: SettleRow) => Promise<void>;
  /** D-22: Stripe-first refund for a settle branch that captured money but must not confirm the trip. */
  refund: (input: RefundInput) => Promise<{ id: string }>;
  /** Records the refund decision (idempotent on stripeRefundId) after `refund` succeeds. */
  recordDuplicateRefund: (input: RecordDuplicateRefundInput) => Promise<void>;
  /** D-22/D-25a: a payment landed on a booking that cannot run; the charge was refunded. Rejects when the mail did not go out (W4-02). */
  alertPaidAfterCancel: (bookingKey: string) => Promise<void>;
  /** J3 (W4-07): the amount Stripe collected does not match; ops decides. Rejects when the mail did not go out. */
  alertAmountMismatch?: (input: StuckPaymentAlertInput) => Promise<void>;
  /** No PaymentIntent to refund. A human must look. Rejects when the mail did not go out (W4-02): the caller then retries, never reads it as sent. */
  alertStuckPayment: (input: StuckPaymentAlertInput) => Promise<void>;
  /** D-21/D-22: expire the booking's other open Checkout Sessions after a succeeded settle. */
  expireSession: (sessionId: string) => Promise<void>;
  /** D-25/D-45: after an expired session is recorded, delete the booking if every session of it is expired and unpaid. Never throws. */
  purgeOnSessionExpired: (sessionId: string, bookingId: string) => Promise<boolean>;
  emit: (level: "debug" | "info" | "warn" | "error", type: string, fields?: Record<string, ScalarValue>) => void;
};

export { pgTextArrayLiteral };

function paymentIntentIdOf(session: Stripe.Checkout.Session | null): string | null {
  if (!session) return null;
  const pi = session.payment_intent;
  if (typeof pi === "string") return pi;
  if (pi && typeof pi === "object" && "id" in pi) return String(pi.id);
  return null;
}

function outcomeFor(
  type: string,
  session: Stripe.Checkout.Session | null,
): "succeeded" | "failed" | "canceled" | "charge_refunded" | "dispute" | "refund_update" | "ignore" {
  // 26.1-08 D-07: "charge.refunded" and "charge.dispute.created|updated|closed"
  // reach the DB through money-events.ts instead of being ignored.
  const money = moneyEventKind(type);
  if (money) return money;
  if (type === "checkout.session.completed") {
    // D-15: payment_status, not payment_intent.succeeded. One path covers an
    // instant card charge and a delayed TWINT redirect.
    return session?.payment_status === "paid" ? "succeeded" : "failed";
  }
  if (type === "checkout.session.expired" || type === "checkout.session.async_payment_failed") {
    return "failed";
  }
  if (type === "payment_intent.canceled") {
    return "canceled";
  }
  return "ignore";
}

/**
 * J2 (W4-04): the object id of a charge event is a charge id, whatever its prefix: `ch_` (card) or
 * `py_` (a payment that is not a card charge, for example TWINT). A dispute id is `du_` (older) or
 * `dp_`. The re-read from Stripe is chosen by the event TYPE and the id shape is only checked, so an
 * id of another shape is an error that retries and alerts, never a quiet "processed".
 */
const CHARGE_ID = /^(?:ch|py)_[A-Za-z0-9_]+$/;
const DISPUTE_ID = /^(?:du|dp)_[A-Za-z0-9_]+$/;

/**
 * J3 (W4-07, W5-02): what Stripe says it collected, in the shape `checkout_payment_settle` compares with the
 * payment row. Stripe keeps the Checkout Session and its PaymentIntent in the integration currency (CHF)
 * even when Adaptive Pricing shows the customer EUR, USD or AED (the presented amount only rides in
 * `presentment_details`, which `fxFromSession` maps to the FX columns), so a legitimate presentment is
 * never a mismatch. A session made before 2025-03-31 under the old Adaptive Pricing shape
 * (`currency_conversion`) carries the customer's currency in `currency` and `amount_total`; there the
 * creation currency and total of `currency_conversion` are the charge, and the PaymentIntent is not read.
 * The PaymentIntent's `amount_received` is read only from an expanded, succeeded PaymentIntent in the
 * session's own currency (a method still processing reports 0). A value that cannot be read is null: the
 * database skips that check.
 */
export function chargeFactsFromSession(session: Stripe.Checkout.Session | null): {
  amountTotalMinor: number | null;
  currency: string | null;
  amountReceivedMinor: number | null;
  metadataBookingId: string | null;
} {
  if (!session) return { amountTotalMinor: null, currency: null, amountReceivedMinor: null, metadataBookingId: null };
  const conversion = session.currency_conversion ?? null;
  const currencyRaw = conversion?.source_currency ?? session.currency ?? null;
  const total = conversion ? conversion.amount_total : session.amount_total;
  const pi = session.payment_intent;
  const received =
    !conversion &&
    pi &&
    typeof pi === "object" &&
    pi.status === "succeeded" &&
    typeof pi.amount_received === "number" &&
    typeof pi.currency === "string" &&
    pi.currency.toLowerCase() === (session.currency ?? "").toLowerCase()
      ? pi.amount_received
      : null;
  const bookingId = session.metadata?.booking_id;
  return {
    amountTotalMinor: typeof total === "number" && Number.isFinite(total) ? total : null,
    currency: typeof currencyRaw === "string" && currencyRaw ? currencyRaw.toUpperCase() : null,
    amountReceivedMinor: received,
    metadataBookingId: typeof bookingId === "string" && bookingId ? bookingId : null,
  };
}

/** Error-level log fields for a caught error: SQLSTATE and class, or the error's name. Never the message (it may carry values). */
function errorFields(err: unknown): Record<string, ScalarValue> {
  const state = sqlStateOf(err);
  if (state) return { sqlstate: state, sqlstateClass: state.slice(0, 2) };
  return { errorName: err instanceof Error ? err.name : typeof err };
}

/** Reasons a succeeded settle can carry that must never confirm the trip (D-22/D-03b). */
const PAID_AFTER_CANCEL_REASONS: readonly string[] = Object.freeze([
  "paid_after_cancel",
  "test_booking",
  "requote_superseded",
]);

/** A session younger than this may simply be ahead of its intent transaction (P0002 = not committed yet). */
const MISSING_BOOKING_MIN_AGE_SECONDS = 600;

/**
 * Research Pitfall 7: money arrived for a quote whose booking (payment row) no longer
 * exists. Refund the whole charge and alert a human.
 *
 * J2 (W4-02, W4-03): `refunded` only when the refund succeeded (or there is no PaymentIntent to
 * refund) AND the stuck-payment mail went out. A refund that Stripe refused, or a mail that did not
 * go out, is `retry`: the event stays open (the stable idempotency key makes the refund safe to
 * repeat) and the queue, then the dead-letter alert and the unprocessed sweep, take over.
 * `not-applicable` is not provably this case: not a paid main session, or a session so young that
 * the intent transaction may still commit (P0002 = not committed yet): the caller retries.
 */
async function refundPaidSessionWithoutBooking(
  message: StripeQueueMessage,
  session: Stripe.Checkout.Session | null,
  piId: string | null,
  outcome: string,
  deps: SettleDeps,
): Promise<"refunded" | "retry" | "not-applicable"> {
  if (outcome !== "succeeded" || !session || session.payment_status !== "paid") return "not-applicable";
  if (session.metadata?.kind === "extra") return "not-applicable";
  // An unknown age is treated as young: retry, never refund on a guess.
  const ageSeconds = typeof session.created === "number" ? Date.now() / 1000 - session.created : 0;
  if (ageSeconds < MISSING_BOOKING_MIN_AGE_SECONDS) return "not-applicable";
  const quoteId = session.metadata?.booking_id ?? "";
  deps.emit("error", "paid_session_without_booking", { eventId: message.eventId, objectId: message.objectId });
  if (piId) {
    try {
      await deps.refund({
        paymentIntentId: piId,
        amountRappen: null,
        idempotencyKey: `refund:missing-booking:${session.id}`,
        bookingId: quoteId,
        paymentId: 0,
        reason: "booking_missing",
        metadata: { vamos_reason: "booking_missing" },
      });
    } catch (err) {
      deps.emit("error", "refund_failed", { eventId: message.eventId, reason: "booking_missing", ...errorFields(err) });
      return "retry";
    }
  }
  try {
    await deps.alertStuckPayment({
      eventId: message.eventId,
      type: message.type,
      objectId: message.objectId,
      reference: null,
    });
  } catch (err) {
    deps.emit("error", "stuck_payment_alert_failed", { eventId: message.eventId, ...errorFields(err) });
    return "retry";
  }
  return "refunded";
}

export async function handleStripeMessageWithDeps(
  message: StripeQueueMessage,
  deps: SettleDeps,
): Promise<HandleResult> {
  // J2 (W4-14): a body without an object id (a poison message) is handled below as an unknown id,
  // not as a TypeError thrown from the consumer.
  const objectId = typeof message.objectId === "string" ? message.objectId : "";
  let session: Stripe.Checkout.Session | null = null;
  if (objectId.startsWith("cs_")) {
    try {
      session = await deps.retrieveSession(objectId);
    } catch (err) {
      deps.emit("warn", "stripe_read_failed", { eventId: message.eventId, kind: "session", ...errorFields(err) });
      return { retry: true };
    }
  }

  // 26.1-08: re-read the charge / dispute from Stripe before begin() so its
  // pi_ joins the ordering window (research Pitfall 3) and the handler never
  // trusts the event body (T-26.1-26).
  const money = moneyEventKind(message.type);
  let charge: Stripe.Charge | null = null;
  let dispute: Stripe.Dispute | null = null;
  // J2 (W4-04): chosen by the event type; ch_ and py_ charges, du_ and dp_ disputes. Any other shape
  // is an error that is written on the event, logged at error level and retried until the dead-letter
  // alert fires. It is never stamped processed.
  if (money === "charge_refunded" || money === "dispute") {
    const known = money === "charge_refunded" ? CHARGE_ID.test(objectId) : DISPUTE_ID.test(objectId);
    if (!known) {
      deps.emit("error", "stripe_event_unknown_object_id", {
        eventId: message.eventId,
        eventType: message.type,
        idPrefix: objectId.slice(0, 3),
      });
      try {
        await deps.eventSettle(message.eventId, "unknown_object_id");
      } catch {
        // Best effort: the retry below is the real handling.
      }
      return { retry: true };
    }
    try {
      if (money === "charge_refunded") charge = await deps.retrieveCharge(objectId);
      else dispute = await deps.retrieveDispute(objectId);
    } catch (err) {
      deps.emit("warn", "stripe_read_failed", { eventId: message.eventId, kind: money, ...errorFields(err) });
      return { retry: true };
    }
  }

  const piId =
    paymentIntentIdOf(session) ??
    paymentIntentIdOfCharge(charge) ??
    paymentIntentIdOfDispute(dispute) ??
    (objectId.startsWith("pi_") ? objectId : null);
  // The two ids describe one payment. A window spanning only one of them lets
  // a payment_intent.canceled slip past a checkout.session.completed (plan 07-03).
  const objectIds = [objectId, piId].filter((id): id is string => Boolean(id));

  let admission: { should_process: boolean; reason: string };
  try {
    admission = await deps.begin(
      message.eventId,
      objectIds,
      new Date(message.stripeCreated * 1000),
    );
  } catch (err) {
    deps.emit("warn", "stripe_event_begin_failed", { eventId: message.eventId, ...errorFields(err) });
    if (sqlStateOf(err) === "P0002") return { retry: true };
    // 261002 settle safety: begin() decides nothing about the money. Whatever it threw (a deadlock,
    // a dropped connection, a permission error), the event is tried again, never recorded as
    // failed and acknowledged: Stripe may have captured the payment this event reports.
    return { retry: true, delaySeconds: settleErrorKind(err) === "transient" ? retryDelaySeconds(err) : 60 };
  }

  if (!admission.should_process) {
    deps.emit("info", "stripe_event", { reason: admission.reason, eventId: message.eventId });
    // 261005 review follow-up (U15, the other arrival order): the return route stamps its own event
    // with the session's `created`, always older than the webhook's. When the webhook settled first,
    // begin() answers `superseded` for the return event: the payment is already decided, there is
    // nothing left to settle, so this event is closed here. Left open, its stripe_events row stayed
    // unprocessed for good. Only `superseded`: `already_processed` is already stamped, and a paid
    // error never reaches this branch (it returns above or below as a retry).
    if (admission.reason === "superseded") {
      try {
        await deps.eventSettle(message.eventId, null);
      } catch {
        // begin() answers superseded again on the retry, which stamps then.
        return { retry: true };
      }
    }
    return { ack: true };
  }

  const outcome = outcomeFor(message.type, session);
  if (outcome === "charge_refunded" && charge) {
    return handleChargeRefundedWithDeps(message, charge, deps);
  }
  if (outcome === "dispute" && dispute) {
    return handleDisputeWithDeps(message, dispute, deps);
  }
  // J7 W6-05: refund.failed / refund.updated / charge.refund.updated re-read the refund themselves.
  if (outcome === "refund_update") {
    return handleRefundUpdateWithDeps(message, deps);
  }
  if (outcome === "charge_refunded" || outcome === "dispute") {
    // J2 (W4-04): the object was not read above. Never stamp this as processed.
    deps.emit("error", "stripe_event_money_object_missing", { eventId: message.eventId, eventType: message.type });
    return { retry: true };
  }
  if (outcome === "ignore") {
    await deps.eventSettle(message.eventId, null);
    return { ack: true };
  }

  let row: SettleRow;
  try {
    row = await deps.settlePayment({
      eventId: message.eventId,
      sessionId: objectId.startsWith("cs_") ? objectId : session?.id ?? null,
      paymentIntentId: piId,
      outcome,
      session,
    });
  } catch (err) {
    const state = sqlStateOf(err);
    if (state === "P0002") {
      // 261002 settle safety: an unpaid difference page that belongs to no request (a replaced
      // page's expired event). Nothing was charged and there is nothing to record: close the event
      // quietly instead of retrying into a stuck-payment mail.
      if (session?.metadata?.kind === "extra" && outcome !== "succeeded") {
        try {
          await deps.eventClose(message.eventId, "no_request");
        } catch {
          return { retry: true };
        }
        return { ack: true };
      }
      // 261005 money hardening (U15): an expired checkout page that has no payment row. Stripe never
      // charges an expired page, so nothing was captured and there is nothing to record. Before, it
      // was retried nine times into a false "payment event is stuck" mail (22 live rows of 7-12 Sept:
      // pages opened by a second Pay press without a row of their own, or with no booking on live).
      // Today it happens when the intent expires its own page after the database refused the
      // booking. Close it quietly.
      // The same holds for the intent behind that page: Stripe cancels it when the page expires, and a
      // canceled intent never captured money (Stripe refuses to cancel after capture). A declined card
      // leaves no payment row either, so this event used to retry nine times into the same false mail.
      const canceledNothingCaptured = message.type === "payment_intent.canceled";
      if (
        canceledNothingCaptured ||
        (message.type === "checkout.session.expired" && session && session.payment_status !== "paid")
      ) {
        try {
          await deps.eventClose(message.eventId, "no_payment");
        } catch {
          return { retry: true };
        }
        return { ack: true };
      }
      const refunded = await refundPaidSessionWithoutBooking(message, session, piId, outcome, deps);
      if (refunded === "refunded") {
        try {
          await deps.eventClose(message.eventId, "booking_missing");
        } catch {
          return { retry: true };
        }
        return { ack: true };
      }
      return { retry: true };
    }
    // 261002 settle safety. Transient (deadlock, lost connection, timeout, no SQLSTATE at all): retry
    // after a delay, never record the event as failed. Permanent with money captured (outcome
    // "succeeded"): record it, but never acknowledge: retry slowly until the dead-letter queue mails
    // info@ (the stuck-payment mail). Permanent with nothing captured (expired or failed page): the
    // same input fails the same way, record and acknowledge as before.
    if (settleErrorKind(err) === "transient") {
      deps.emit("warn", "settle_transient_error", { eventId: message.eventId, ...errorFields(err) });
      return { retry: true, delaySeconds: retryDelaySeconds(err) };
    }
    if (outcome === "succeeded") {
      deps.emit("error", "settle_failed_paid", { eventId: message.eventId, ...errorFields(err) });
      try {
        await deps.eventSettle(message.eventId, state ?? "settle_failed");
      } catch {
        // Best effort: the retry below is the real handling.
      }
      return { retry: true, delaySeconds: PAID_ERROR_RETRY_SECONDS };
    }
    // Nothing was captured and the same input fails the same way: closed with the SQLSTATE as its
    // reason (J2, W4-09: processed, so the sweep never re-enqueues it, and still findable).
    deps.emit("error", "settle_failed_unpaid", { eventId: message.eventId, ...errorFields(err) });
    try {
      await deps.eventClose(message.eventId, state ?? "settle_failed");
    } catch {
      return { retry: true };
    }
    return { ack: true };
  }

  if (outcome === "failed" && message.type === "checkout.session.expired" && session) {
    // 26.3 D-25 / D-45: the payment row is marked. A booking with no pay link and no paid
    // session is deleted, silently. A pay-link booking stays on its 24 h cancel path.
    try {
      await deps.purgeOnSessionExpired(session.id, row.booking_id);
    } catch {
      deps.emit("warn", "purge_on_expired_failed", { eventId: message.eventId });
    }
  }

  let duplicateRefunded = false;
  if (outcome === "succeeded") {
    const extra = session?.metadata?.kind === "extra";

    if (row.amount_mismatch === true) {
      // J3 (W4-07, W5-02): Stripe collected an amount, currency or booking that does not match what this
      // payment expected. The settle recorded the capture and left the booking alone: it is not confirmed,
      // not revived and nothing is refunded. Ops is mailed (ids only) and only then is the event closed; a
      // mail that did not go out keeps the event open and retries (the settle answers the same again).
      deps.emit("error", "amount_mismatch", { eventId: message.eventId, bookingId: row.booking_id });
      try {
        await (deps.alertAmountMismatch ?? deps.alertStuckPayment)({
          eventId: message.eventId,
          type: message.type,
          objectId: message.objectId,
          reference: row.reference ?? null,
        });
      } catch (err) {
        deps.emit("error", "amount_mismatch_alert_failed", { eventId: message.eventId, ...errorFields(err) });
        return { retry: true };
      }
      try {
        await deps.eventClose(message.eventId, "amount_mismatch");
      } catch {
        return { retry: true };
      }
    } else if (row.refund_required) {
      const reason = row.refund_reason ?? "unknown";
      if (!piId) {
        // No PaymentIntent to refund. A human must resolve the money by hand: the stuck-payment mail
        // must have gone out before the event is closed (W4-02). A mail that did not go out retries.
        deps.emit("error", "refund_required_no_payment_intent", {
          eventId: message.eventId,
          bookingId: row.booking_id,
          reason,
        });
        try {
          await deps.alertStuckPayment({
            eventId: message.eventId,
            type: message.type,
            objectId: message.objectId,
            reference: row.reference ?? null,
          });
        } catch (err) {
          deps.emit("error", "stuck_payment_alert_failed", { eventId: message.eventId, ...errorFields(err) });
          return { retry: true };
        }
        try {
          await deps.eventClose(message.eventId, "refund_required_no_payment_intent");
        } catch {
          return { retry: true };
        }
      } else {
        // J2 (W4-03): the settle left this event OPEN (marker refund_required:<reason>). It is stamped
        // processed only after the Stripe refund and its record both succeeded. A refund that fails is
        // retried by the queue (stable idempotency key, so a repeat never refunds twice), then by the
        // dead-letter alert and the unprocessed sweep.
        const idempotencyKey = `refund:${row.booking_id}:${row.payment_id}:${reason}`;
        try {
          const refund = await deps.refund({
            paymentIntentId: piId,
            amountRappen: row.charged_rappen,
            idempotencyKey,
            bookingId: row.booking_id,
            paymentId: row.payment_id,
            reason,
          });
          await deps.recordDuplicateRefund({
            paymentId: row.payment_id,
            stripeRefundId: refund.id,
            refundRappen: row.charged_rappen,
            reason,
          });
        } catch (err) {
          deps.emit("error", "refund_failed", {
            eventId: message.eventId,
            bookingId: row.booking_id,
            reason,
            ...errorFields(err),
          });
          return { retry: true };
        }
        duplicateRefunded = row.duplicate;
        if (PAID_AFTER_CANCEL_REASONS.includes(reason)) {
          try {
            await deps.alertPaidAfterCancel(row.booking_id);
          } catch (err) {
            // The refund itself landed; the mail is information for ops. Logged at error level, never silent.
            deps.emit("error", "paid_after_cancel_alert_failed", {
              eventId: message.eventId,
              bookingId: row.booking_id,
              ...errorFields(err),
            });
          }
        }
        try {
          await deps.eventSettle(message.eventId, null);
        } catch {
          // The refund is recorded; the retry reaches the already-settled branch and closes the event.
          return { retry: true };
        }
      }
    } else if (!row.already_settled && !extra) {
      // 26.3 (D-27): the payment is settled. A mail failure never turns that
      // into a retry or a failure page; the hourly sweep resends it.
      try {
        await deps.deliverConfirmation(row);
      } catch {
        deps.emit("error", "confirmation_mail_failed", { bookingId: row.booking_id });
      }
      try {
        const outcome = await deps.provisionAccount?.(row);
        if (outcome === "failed") deps.emit("error", "account_provision_failed", { bookingId: row.booking_id });
      } catch {
        deps.emit("error", "account_provision_failed", { bookingId: row.booking_id });
      }
    } else if (!row.already_settled && extra && row.applied === true) {
      // 26.2 P1 (D6, D7): the paid change is applied; the mails never turn the settle into a retry.
      try {
        await deps.afterExtraApplied?.(row);
      } catch {
        deps.emit("error", "change_mail_failed", { bookingId: row.booking_id });
      }
    } else if (!row.already_settled && extra) {
      // 261002 settle safety: the difference is paid and recorded (it shows as Refund due) but the
      // change was not applied: the trip was cancelled, a newer change replaced it, or it no longer
      // fits. Tell info@; the alert never turns the settle into a retry.
      try {
        await deps.alertDifferenceNotApplied?.(row);
      } catch {
        deps.emit("error", "difference_not_applied_alert_failed", { bookingId: row.booking_id });
      }
    }

    // D-21/D-22: whoever settled first must expire every other still-open
    // Checkout Session on this booking, so a second payer sees "already
    // paid" instead of being charged and refunded.
    for (const sessionId of row.other_open_session_ids) {
      try {
        await deps.expireSession(sessionId);
      } catch {
        deps.emit("warn", "expire_session_failed", {
          eventId: message.eventId,
          bookingId: row.booking_id,
          sessionId,
        });
      }
    }

  }

  // 26.1-16 (D-22): only a duplicate whose refund landed is reported, so the
  // return route never tells a payer "refunded" before the money moved.
  if (duplicateRefunded) {
    return { ack: true, settled: { duplicate: true, revived: row.revived } };
  }
  return { ack: true };
}

/**
 * Quick 260929-mbp: store how the customer paid so the manage page can say so. Runs after the
 * settlement committed and never throws: a Stripe or database failure leaves the method null
 * and the page then reads "Paid online".
 */
async function recordPaymentMethod(env: CloudflareEnv, stripe: Stripe, paymentIntentId: string): Promise<void> {
  try {
    const method = await paymentMethodTypeFor(stripe, paymentIntentId);
    if (!method) return;
    await asSystem(env, async (sql) => {
      await sql`select public.checkout_payment_method_record(${paymentIntentId}, ${method})`;
    });
  } catch {
    // Best-effort by design.
  }
}

export async function handleStripeMessage(
  env: CloudflareEnv,
  message: StripeQueueMessage,
): Promise<HandleResult> {
  const stripe = stripeFromEnv(env);
  const emit = withRequestContext({
    requestId: message.eventId,
    route: "queue:stripe-events",
    locale: null,
  });

  return handleStripeMessageWithDeps(message, {
    begin: async (eventId, objectIds, stripeCreated) => {
      const rows = await asSystem(env, async (sql) => {
        return sql`
          select * from public.stripe_event_begin(
            ${eventId},
            ${pgTextArrayLiteral(objectIds)}::text[],
            ${stripeCreated.toISOString()}::timestamptz
          )
        `;
      });
      const row = rows[0];
      return {
        should_process: Boolean(row?.should_process),
        reason: String(row?.reason ?? "ok"),
      };
    },
    retrieveSession: (id) => retrieveCheckoutSession(stripe, id),
    settlePayment: async (input) => {
      const fx = input.session ? fxFromSession(input.session) : {
        chargedCurrency: "CHF",
        fxRate: null,
        fxSource: null,
        fxQuotedAt: null,
        presentmentAmountMinor: null,
        presentmentCurrency: null,
      };
      const extra = input.session?.metadata?.kind === "extra";
      // J3: what Stripe collected, compared with the payment row by the settle function (W4-07, W5-02).
      const facts = chargeFactsFromSession(input.outcome === "succeeded" ? input.session : null);
      try {
        const rows = await asSystem(env, async (sql) => {
          if (extra) {
            return sql`
              select * from public.checkout_extra_payment_settle(
                ${input.eventId},
                ${input.sessionId},
                ${input.paymentIntentId},
                ${input.outcome},
                ${fx.chargedCurrency},
                ${fx.fxRate},
                ${fx.fxSource},
                ${fx.fxQuotedAt}::timestamptz,
                ${fx.presentmentAmountMinor},
                ${facts.amountTotalMinor},
                ${facts.currency},
                ${facts.amountReceivedMinor},
                ${facts.metadataBookingId}
              )
            `;
          }
          return sql`
            select * from public.checkout_payment_settle(
              ${input.eventId},
              ${input.sessionId},
              ${input.paymentIntentId},
              ${input.outcome},
              ${fx.chargedCurrency},
              ${fx.fxRate},
              ${fx.fxSource},
              ${fx.fxQuotedAt}::timestamptz,
              ${fx.presentmentAmountMinor},
              ${fx.presentmentCurrency},
              ${facts.amountTotalMinor},
              ${facts.currency},
              ${facts.amountReceivedMinor},
              ${facts.metadataBookingId}
            )
          `;
        });
        const row = rows[0];
        if (!row) throw new Error(extra ? "checkout_extra_payment_settle returned no row" : "checkout_payment_settle returned no row");
        if (!extra && input.outcome === "succeeded") {
          await recordPaymentMethod(env, stripe, input.paymentIntentId ?? "");
        }
        return {
          booking_id: String(row.booking_id),
          reference: String(row.reference),
          locale: String(row.locale),
          contact_email: String(row.contact_email),
          already_settled: Boolean(row.already_settled),
          revived: Boolean(row.revived),
          duplicate: Boolean(row.duplicate),
          refund_required: Boolean(row.refund_required),
          refund_reason: row.refund_reason == null ? null : String(row.refund_reason),
          payment_id: row.payment_id == null ? 0 : Number(row.payment_id),
          charged_rappen: row.charged_rappen == null ? 0 : Number(row.charged_rappen),
          other_open_session_ids: Array.isArray(row.other_open_session_ids)
            ? row.other_open_session_ids.map((id: unknown) => String(id))
            : [],
          applied: row.applied === true,
          unassigned_chauffeur_id: row.unassigned_chauffeur_id ? String(row.unassigned_chauffeur_id) : null,
          request_id: row.request_id ? String(row.request_id) : null,
          amount_mismatch: row.amount_mismatch === true,
        };
      } catch (err) {
        if (extra && sqlStateOf(err) === "23P01") {
          const bookingId = String(input.session?.metadata?.booking_id ?? "");
          if (bookingId) {
            try {
              await deliverOverlapMustFix(env, bookingId);
            } catch (mailErr) {
              // Extra settle rolled back. Trip is not auto-cancelled. The settle is retried by the queue; a
              // mail that did not go out is logged at error level (W4-02), never silent.
              emit("error", "overlap_must_fix_alert_failed", { eventId: input.eventId, ...errorFields(mailErr) });
            }
          }
        }
        throw err;
      }
    },
    eventSettle: async (eventId, error) => {
      await asSystem(env, async (sql) => {
        await sql`select public.stripe_event_settle(${eventId}, ${error})`;
      });
    },
    eventClose: async (eventId, reason) => {
      await asSystem(env, async (sql) => {
        await sql`select public.stripe_event_close(${eventId}, ${reason})`;
      });
    },
    deliverConfirmation: (row) => deliverConfirmation(env, row),
    // 26.2 P1: loaded on use, so the webhook path loads the class-change mails only when needed.
    afterExtraApplied: async (row) => {
      const { afterExtraSettled } = await import("../ops/booking-change");
      await afterExtraSettled(env, row);
    },
    alertDifferenceNotApplied: (row) => deliverDifferenceNotAppliedAlert(env, row.booking_id),
    provisionAccount: (row) => provisionCheckoutAccount(row, provisionDeps(env, emit)),
    refund: async (input) => {
      const refund = await createRefund(stripe, {
        paymentIntentId: input.paymentIntentId,
        amountRappen: input.amountRappen,
        idempotencyKey: input.idempotencyKey,
        bookingId: input.bookingId,
        paymentId: input.paymentId,
        reason: input.reason,
      });
      return { id: refund.id };
    },
    recordDuplicateRefund: async (input) => {
      await asSystem(env, async (sql) => {
        await sql`
          select public.checkout_duplicate_refund_record(
            ${input.paymentId},
            ${input.stripeRefundId},
            ${input.refundRappen},
            ${input.reason}
          )
        `;
      });
    },
    alertPaidAfterCancel: (bookingKey) => deliverPaidAfterCancelAlert(env, bookingKey),
    alertAmountMismatch: (input) => deliverAmountMismatchAlert(env, input),
    alertStuckPayment: (input) => deliverStuckPaymentAlert(env, input),
    purgeOnSessionExpired: (sessionId, bookingId) =>
      purgeOnSessionExpired(purgeDepsFromEnv(env), sessionId, bookingId),
    expireSession: async (sessionId) => {
      const publishable = env.STRIPE_PUBLISHABLE_KEY || "";
      if (!publishable || stripeAccountIsLegacyUaeTest(publishable)) return;
      await expireCheckoutSession(stripe, sessionId);
    },
    retrieveCharge: (id) => retrieveCharge(stripe, id),
    retrieveDispute: (id) => retrieveDispute(stripe, id),
    findSessionIdForPaymentIntent: (paymentIntentId) => findSessionIdForPaymentIntent(stripe, paymentIntentId),
    recordChargeRefund: async (input) => {
      const rows = await asSystem(env, async (sql) => {
        return sql`
          select * from public.stripe_charge_refunded_record(
            ${input.paymentIntentId},
            ${input.sessionId},
            ${input.stripeRefundId},
            ${input.refundRappen},
            ${input.created.toISOString()}::timestamptz,
            ${input.appSource}
          )
        `;
      });
      return {
        outcome: String(rows[0]?.outcome ?? "unknown"),
        bookingId: rows[0]?.booking_id ? String(rows[0].booking_id) : null,
      };
    },
    mailCustomerRefund: (input) => mailCustomerRefund(env, input),
    upsertDispute: async (input) => {
      const rows = await asSystem(env, async (sql) => {
        return sql`
          select * from public.stripe_dispute_upsert(
            ${input.stripeDisputeId},
            ${input.paymentIntentId},
            ${input.sessionId},
            ${input.status},
            ${input.reason},
            ${input.amountRappen},
            ${input.stripeCreated.toISOString()}::timestamptz
          )
        `;
      });
      const row = rows[0];
      return {
        reference: row?.reference == null ? null : String(row.reference),
        status: String(row?.status ?? input.status),
        alertPending: row?.alert_pending === true,
      };
    },
    // J7 W6-07: mail ops about the dispute status, then record that the mail went out. Throws when it did not.
    alertDispute: async (input) => {
      await deliverMoneyAlert(env, "dispute", input);
      await asSystem(env, async (sql) => {
        await sql`select public.stripe_dispute_alerted(${input.objectId}, ${input.status ?? ""})`;
      });
    },
    // J7 W6-05: a recorded refund that Stripe later failed or canceled.
    retrieveRefund: (id) => retrieveRefund(stripe, id),
    recordRefundFailure: async (input) => {
      const rows = await asSystem(env, async (sql) => {
        return sql`
          select * from public.stripe_refund_failed_record(
            ${input.stripeRefundId},
            ${input.status},
            ${input.failureReason},
            ${input.appSource},
            ${input.created.toISOString()}::timestamptz
          )
        `;
      });
      const row = rows[0];
      return {
        outcome: String(row?.outcome ?? "unknown"),
        reference: row?.reference == null ? null : String(row.reference),
        alertPending: row?.alert_pending === true,
      };
    },
    alertRefundFailed: async (input) => {
      await deliverMoneyAlert(env, "refund-failed", input);
      await asSystem(env, async (sql) => {
        await sql`select public.stripe_refund_failure_alerted(${input.objectId})`;
      });
    },
    emit,
  });
}

/** The calls the worker needs from a Cloudflare Queues `Message`. */
export type QueueMessageControl = {
  ack: () => void;
  retry: (options?: { delaySeconds?: number }) => void;
  /** Cloudflare's delivery count: 1 on the first delivery. */
  attempts?: number;
};

/**
 * Applies a HandleResult to a queue message (worker.ts). A retry carrying `delaySeconds`
 * (app_refund_pending, 26.1-08; a database hiccup, 261002) is passed through so the retry budget spans
 * minutes before any dead-letter. J2 (W4-06): a retry that names no delay gets the escalating delay of
 * `retryDelayForAttempt(message.attempts)`, never an immediate redelivery, so eight retries span about
 * 27 minutes (long enough for the 10-minute "paid session without a booking" refund rule), not seconds.
 */
export function applyHandleResult(message: QueueMessageControl, result: HandleResult): "acked" | "retry" {
  if ("retry" in result && result.retry) {
    message.retry({
      delaySeconds: typeof result.delaySeconds === "number" ? result.delaySeconds : retryDelayForAttempt(message.attempts),
    });
    return "retry";
  }
  message.ack();
  return "acked";
}

// apps/web/lib/checkout/money-events.ts
//
// 26.1-08 D-07: charge.refunded and charge.dispute.* reach the database.
// Stripe stays the source of truth -- the consumer re-reads the charge or
// dispute from Stripe (T-26.1-26) and only mirrors facts Stripe already
// decided into booking_refunds / booking_disputes.
//
// An app-created refund (26.1-05: metadata.vamos_source = "app") is never
// recorded here. stripe_charge_refunded_record refuses it with
// P0002 app_refund_pending until the app's own recorder has written the row,
// then treats it as a no-op -- so booking effects apply exactly once in
// either arrival order. The retry is delayed so the queue's retry budget
// spans minutes, not seconds, before a dead-letter (26.1-03 alert).
//
// 261005 money hardening (U4): a refund or a dispute is money Stripe already moved, so a
// database error here follows the settle rule of 261002 (settle-errors.ts). A hiccup (deadlock,
// serialization, lock or statement timeout, a lost connection, no SQLSTATE at all) is retried
// after a short delay and never written on the event. A real refusal (P0001, 22xxx, 23xxx …) is
// written on the event with its SQLSTATE and the event is still retried slowly, so after the
// queue's last try the dead-letter queue mails info@ ("A Stripe payment event is stuck").
// Neither is ever acknowledged.
//
// J7 (payments review 2026-10-09):
//   W6-05  refund.failed / refund.updated / charge.refund.updated: a refund Stripe accepted that later turns
//          failed or canceled is reversed in the database (stripe_refund_failed_record), the intent of an
//          app refund is reopened for Retry, and ops is mailed. A succeeded refund event runs the
//          charge.refunded path on its charge (a dashboard refund that was pending when first seen).
//   W6-07  a dispute that is new or moved to another status mails ops (ids only) before the event is closed;
//          a failed mail keeps the event open (retry), a sent one is never repeated (stripe_dispute_alerted).
//   W6-19  a non-CHF succeeded refund no longer skips the CHF refunds of the same charge: the CHF ones are
//          recorded, then the event goes to the slow retry that ends in the dead-letter mail.

import type Stripe from "stripe";
import type { ScalarValue } from "../logger";
import type { StuckPaymentAlertInput } from "../ops/must-fix-mail";
import type { HandleResult } from "./settle";
import { PAID_ERROR_RETRY_SECONDS, retryDelaySeconds, settleErrorKind } from "./settle-errors";
import type { StripeQueueMessage } from "./webhook";

/** Seconds a charge.refunded waits before retrying while the app's own refund row has not landed yet. */
export const APP_REFUND_PENDING_DELAY_SECONDS = 30;

const DISPUTE_EVENT_TYPES: readonly string[] = Object.freeze([
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
]);

export type ChargeRefundInput = {
  paymentIntentId: string | null;
  sessionId: string | null;
  stripeRefundId: string;
  refundRappen: number;
  created: Date;
  /** metadata.vamos_source === "app" (26.1-05). */
  appSource: boolean;
};

export type DisputeInput = {
  stripeDisputeId: string;
  paymentIntentId: string | null;
  sessionId: string | null;
  status: string;
  reason: string | null;
  /** null when the dispute is not in CHF -- never stored as rappen. */
  amountRappen: number | null;
  /** The event's own Stripe timestamp; an older one never overwrites a newer status (T-26.1-29). */
  stripeCreated: Date;
};

/** J7 W6-05: a recorded refund that Stripe now reports failed or canceled. */
export type RefundFailureInput = {
  stripeRefundId: string;
  status: "failed" | "canceled";
  failureReason: string | null;
  created: Date;
  /** metadata.vamos_source === "app": the app's own row may not have landed yet (app_refund_pending). */
  appSource: boolean;
};

export type RefundFailureResult = {
  /** reversed | already | unknown */
  outcome: string;
  reference: string | null;
  /** true until the ops mail for this reversal went out. */
  alertPending: boolean;
};

export type DisputeUpsertResult = {
  reference: string | null;
  status: string;
  /** true while the stored status is not the one ops was last mailed about. */
  alertPending: boolean;
};

/** What an ops money alert carries: ids and the booking reference only (D-06), never a name, e-mail or amount. */
export type MoneyAlertInput = {
  eventId: string;
  type: string;
  /** The Stripe object the alert is about: the re_ refund or du_ dispute id. */
  objectId: string;
  reference: string | null;
  /** The dispute status the mail is about (dispute alerts only). */
  status?: string;
};

export type MoneyEventDeps = {
  retrieveCharge: (chargeId: string) => Promise<Stripe.Charge>;
  retrieveDispute: (disputeId: string) => Promise<Stripe.Dispute>;
  /** J7 W6-05: re-read a refund from Stripe (its current status, never the event body). */
  retrieveRefund?: (refundId: string) => Promise<Stripe.Refund>;
  /** J7 W6-05: public.stripe_refund_failed_record. */
  recordRefundFailure?: (input: RefundFailureInput) => Promise<RefundFailureResult>;
  /** J7 W6-05: mail ops that a refund was reversed, then record the mail. Throws when the mail did not go out. */
  alertRefundFailed?: (input: MoneyAlertInput) => Promise<void>;
  /** J7 W6-07: mail ops about a dispute status, then record the mail. Throws when the mail did not go out. */
  alertDispute?: (input: MoneyAlertInput) => Promise<void>;
  findSessionIdForPaymentIntent: (paymentIntentId: string) => Promise<string | null>;
  /** public.stripe_charge_refunded_record -- idempotent on stripeRefundId. */
  recordChargeRefund: (input: ChargeRefundInput) => Promise<{ outcome: string }>;
  /** public.stripe_dispute_upsert -- one row per stripeDisputeId. */
  upsertDispute: (input: DisputeInput) => Promise<DisputeUpsertResult | void>;
  eventSettle: (eventId: string, error: string | null) => Promise<void>;
  /** J2 (W4-09): closes an event that needs no further work: processed_at set, the reason kept in last_error. */
  eventClose: (eventId: string, reason: string) => Promise<void>;
  /** J2 (W4-02): mails a human; rejects when the mail did not go out. */
  alertStuckPayment: (input: StuckPaymentAlertInput) => Promise<void>;
  emit: (level: "debug" | "info" | "warn" | "error", type: string, fields?: Record<string, ScalarValue>) => void;
};

/**
 * J7 W6-05: the event types whose object is a Refund (`re_...`). The Stripe webhook endpoint must be
 * subscribed to them: refund.failed, refund.updated and charge.refund.updated (the same status change can
 * arrive under more than one of them; the handling is idempotent).
 */
export const REFUND_EVENT_TYPES: readonly string[] = Object.freeze([
  "refund.failed",
  "refund.updated",
  "charge.refund.updated",
]);

/** Which money event a Stripe event type is, or null when it is not one this module handles. */
export function moneyEventKind(type: string): "charge_refunded" | "dispute" | "refund_update" | null {
  if (type === "charge.refunded") return "charge_refunded";
  if (DISPUTE_EVENT_TYPES.includes(type)) return "dispute";
  if (REFUND_EVENT_TYPES.includes(type)) return "refund_update";
  return null;
}

function idOf(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (value && typeof value === "object" && "id" in value && typeof (value as { id: unknown }).id === "string") {
    return (value as { id: string }).id;
  }
  return null;
}

/** The charge's PaymentIntent id (string or expanded), or null. */
export function paymentIntentIdOfCharge(charge: Stripe.Charge | null): string | null {
  return charge ? idOf(charge.payment_intent) : null;
}

/** The dispute's PaymentIntent id (string or expanded), or null. */
export function paymentIntentIdOfDispute(dispute: Stripe.Dispute | null): string | null {
  return dispute ? idOf(dispute.payment_intent) : null;
}

function sqlState(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string") {
    return (err as { code: string }).code;
  }
  return undefined;
}

function isAppRefundPending(err: unknown): boolean {
  return sqlState(err) === "P0002" && err instanceof Error && err.message.includes("app_refund_pending");
}

/**
 * A database error while recording money Stripe already moved (U4, the settle rule of 261002).
 * Transient: retried after `retryDelaySeconds` (5 s for contention, 60 s otherwise); the event is
 * not written. Permanent: the SQLSTATE is written on the event (best effort) and the event is
 * retried every PAID_ERROR_RETRY_SECONDS until the dead-letter queue mails info@. Never acknowledged.
 */
async function retryMoneyError(
  eventId: string,
  err: unknown,
  fallback: string,
  deps: MoneyEventDeps,
): Promise<HandleResult> {
  if (settleErrorKind(err) === "transient") {
    return { retry: true, delaySeconds: retryDelaySeconds(err) };
  }
  try {
    await deps.eventSettle(eventId, sqlState(err) ?? fallback);
  } catch {
    // Best effort: the retry below is the real handling.
  }
  return { retry: true, delaySeconds: PAID_ERROR_RETRY_SECONDS };
}

/**
 * charge.refunded (D-07): records every succeeded refund on the (already
 * re-retrieved) charge. Dashboard refunds land as reason `stripe_dashboard`;
 * app refunds wait for the app's own row. A pending refund retries until
 * Stripe settles it; failed/canceled refunds are never recorded.
 */
export async function handleChargeRefundedWithDeps(
  message: StripeQueueMessage,
  charge: Stripe.Charge,
  deps: MoneyEventDeps,
): Promise<HandleResult> {
  const paymentIntentId = paymentIntentIdOfCharge(charge);
  const refunds = charge.refunds?.data ?? [];
  if (charge.refunds?.has_more) {
    // retrieveCharge pages through every refund; a list still cut short here must not be
    // acknowledged with refunds unrecorded (26.2 audit U11-3). Retry keeps the event open.
    deps.emit("warn", "charge_refunds_truncated", { eventId: message.eventId, chargeId: charge.id });
    return { retry: true };
  }

  // J7 W6-19: a non-CHF refund can never be recorded (the books are CHF), but it must not take the CHF
  // refunds of the same charge down with it: they are recorded below, the event is then handed to the
  // slow retry that ends in the dead-letter mail (ids only) so a person looks at the odd one.
  const nonChf = refunds.some((refund) => refund.status === "succeeded" && refund.currency !== "chf");
  if (nonChf) {
    deps.emit("error", "charge_refund_non_chf", { eventId: message.eventId, chargeId: charge.id });
  }

  let sessionId: string | null = null;
  if (paymentIntentId && refunds.some((refund) => refund.status === "succeeded")) {
    try {
      sessionId = await deps.findSessionIdForPaymentIntent(paymentIntentId);
    } catch {
      return { retry: true };
    }
  }

  let pending = false;
  for (const refund of refunds) {
    if (refund.status === "pending") {
      pending = true;
      continue;
    }
    if (refund.status !== "succeeded") continue;
    if (refund.currency !== "chf") continue;
    try {
      const { outcome } = await deps.recordChargeRefund({
        paymentIntentId,
        sessionId,
        stripeRefundId: refund.id,
        refundRappen: refund.amount,
        created: new Date(refund.created * 1000),
        appSource: refund.metadata?.vamos_source === "app",
      });
      deps.emit("info", "charge_refund_recorded", {
        eventId: message.eventId,
        refundId: refund.id,
        outcome,
      });
    } catch (err) {
      if (isAppRefundPending(err)) {
        return { retry: true, delaySeconds: APP_REFUND_PENDING_DELAY_SECONDS };
      }
      // P0002 payment_not_found: the payment row may not be committed yet.
      // Retry; if it never resolves the DLQ consumer alerts (26.1-03).
      if (sqlState(err) === "P0002") return { retry: true };
      return retryMoneyError(message.eventId, err, "charge_refund_failed", deps);
    }
  }

  if (nonChf) {
    // J2 (W4-02, W4-09) after J7 (W6-19): the CHF refunds on this charge are already recorded above.
    // Mail ops before the event is closed. A mail that failed retries and does not close. The close
    // keeps the reason and sets processed_at, so the hourly sweep does not re-enqueue it. The retry
    // still runs once: a closed event answers already processed.
    try {
      await deps.alertStuckPayment({
        eventId: message.eventId,
        type: message.type,
        objectId: message.objectId,
        reference: null,
      });
    } catch {
      deps.emit("error", "stuck_payment_alert_failed", { eventId: message.eventId });
      return { retry: true };
    }
    try {
      await deps.eventClose(message.eventId, "non_chf_refund");
    } catch {
      return { retry: true };
    }
    return { retry: true, delaySeconds: PAID_ERROR_RETRY_SECONDS };
  }

  if (pending) {
    return { retry: true, delaySeconds: APP_REFUND_PENDING_DELAY_SECONDS };
  }

  try {
    await deps.eventSettle(message.eventId, null);
  } catch {
    return { retry: true };
  }
  return { ack: true };
}

/**
 * refund.failed | refund.updated | charge.refund.updated (J7 W6-05). The event only names a refund (`re_`);
 * its current state is re-read from Stripe. failed / canceled: the refund the database recorded did not
 * move the money, so it is reversed (stripe_refund_failed_record) and ops is mailed. succeeded: the
 * refund's charge goes through the charge.refunded path (records a dashboard refund that was still pending
 * when charge.refunded came; an app refund is already there). Anything else (pending, requires_action):
 * nothing to do yet, a later event carries the final state.
 */
export async function handleRefundUpdateWithDeps(
  message: StripeQueueMessage,
  deps: MoneyEventDeps,
): Promise<HandleResult> {
  const { retrieveRefund, recordRefundFailure } = deps;
  if (!message.objectId.startsWith("re_") || !retrieveRefund || !recordRefundFailure) {
    // Not a refund object, or a caller that has no refund wiring: nothing was mirrored, say so on the event.
    try {
      await deps.eventSettle(message.eventId, null);
    } catch {
      return { retry: true };
    }
    return { ack: true };
  }

  let refund: Stripe.Refund;
  try {
    refund = await retrieveRefund(message.objectId);
  } catch {
    return { retry: true };
  }

  if (refund.status === "succeeded") {
    const chargeId = idOf(refund.charge);
    if (!chargeId) {
      deps.emit("warn", "refund_event_without_charge", { eventId: message.eventId, refundId: refund.id });
      try {
        await deps.eventSettle(message.eventId, null);
      } catch {
        return { retry: true };
      }
      return { ack: true };
    }
    let charge: Stripe.Charge;
    try {
      charge = await deps.retrieveCharge(chargeId);
    } catch {
      return { retry: true };
    }
    return handleChargeRefundedWithDeps(message, charge, deps);
  }

  if (refund.status !== "failed" && refund.status !== "canceled") {
    try {
      await deps.eventSettle(message.eventId, null);
    } catch {
      return { retry: true };
    }
    return { ack: true };
  }

  let result: RefundFailureResult;
  try {
    result = await recordRefundFailure({
      stripeRefundId: refund.id,
      status: refund.status,
      failureReason: refund.failure_reason ? String(refund.failure_reason) : null,
      created: new Date(message.stripeCreated * 1000),
      appSource: refund.metadata?.vamos_source === "app",
    });
  } catch (err) {
    if (isAppRefundPending(err)) {
      return { retry: true, delaySeconds: APP_REFUND_PENDING_DELAY_SECONDS };
    }
    if (sqlState(err) === "P0002") return { retry: true };
    return retryMoneyError(message.eventId, err, "refund_failure_failed", deps);
  }

  deps.emit(result.outcome === "reversed" ? "error" : "info", "refund_failure_recorded", {
    eventId: message.eventId,
    refundId: refund.id,
    outcome: result.outcome,
  });

  if (result.alertPending && deps.alertRefundFailed) {
    try {
      await deps.alertRefundFailed({
        eventId: message.eventId,
        type: message.type,
        objectId: refund.id,
        reference: result.reference,
      });
    } catch {
      // The reversal is written; the mail is not. Keep the event open so the mail is tried again.
      deps.emit("error", "refund_failed_alert_failed", { eventId: message.eventId, refundId: refund.id });
      try {
        await deps.eventSettle(message.eventId, "refund_failed_alert_failed");
      } catch {
        // Best effort: the retry below is the real handling.
      }
      return { retry: true, delaySeconds: PAID_ERROR_RETRY_SECONDS };
    }
  }

  try {
    await deps.eventSettle(message.eventId, null);
  } catch {
    return { retry: true };
  }
  return { ack: true };
}

/**
 * charge.dispute.created|updated|closed (D-07): upserts Stripe's current
 * dispute status against the exact payment row, keyed to the event's own
 * timestamp so an out-of-order older event never overwrites a newer one.
 */
export async function handleDisputeWithDeps(
  message: StripeQueueMessage,
  dispute: Stripe.Dispute,
  deps: MoneyEventDeps,
): Promise<HandleResult> {
  const paymentIntentId = paymentIntentIdOfDispute(dispute);

  let sessionId: string | null = null;
  if (paymentIntentId) {
    try {
      sessionId = await deps.findSessionIdForPaymentIntent(paymentIntentId);
    } catch {
      return { retry: true };
    }
  }

  let stored: DisputeUpsertResult | void;
  try {
    stored = await deps.upsertDispute({
      stripeDisputeId: dispute.id,
      paymentIntentId,
      sessionId,
      status: String(dispute.status),
      reason: dispute.reason ? String(dispute.reason) : null,
      amountRappen: dispute.currency === "chf" ? dispute.amount : null,
      stripeCreated: new Date(message.stripeCreated * 1000),
    });
  } catch (err) {
    if (sqlState(err) === "P0002") return { retry: true };
    return retryMoneyError(message.eventId, err, "dispute_upsert_failed", deps);
  }

  deps.emit("info", "dispute_recorded", {
    eventId: message.eventId,
    disputeId: dispute.id,
    status: String(dispute.status),
  });

  // J7 W6-07: a dispute that is new or moved to another status mails ops (ids only), once per status.
  if (stored && stored.alertPending && deps.alertDispute) {
    try {
      await deps.alertDispute({
        eventId: message.eventId,
        type: message.type,
        objectId: dispute.id,
        reference: stored.reference,
        status: stored.status,
      });
    } catch {
      // The row is written; the mail is not. Keep the event open so the mail is tried again.
      deps.emit("error", "dispute_alert_failed", { eventId: message.eventId, disputeId: dispute.id });
      try {
        await deps.eventSettle(message.eventId, "dispute_alert_failed");
      } catch {
        // Best effort: the retry below is the real handling.
      }
      return { retry: true, delaySeconds: PAID_ERROR_RETRY_SECONDS };
    }
  }

  try {
    await deps.eventSettle(message.eventId, null);
  } catch {
    return { retry: true };
  }
  return { ack: true };
}

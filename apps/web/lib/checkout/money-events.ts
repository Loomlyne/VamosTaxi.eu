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

import type Stripe from "stripe";
import type { ScalarValue } from "../logger";
import type { HandleResult } from "./settle";
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

export type MoneyEventDeps = {
  retrieveCharge: (chargeId: string) => Promise<Stripe.Charge>;
  retrieveDispute: (disputeId: string) => Promise<Stripe.Dispute>;
  findSessionIdForPaymentIntent: (paymentIntentId: string) => Promise<string | null>;
  /** public.stripe_charge_refunded_record -- idempotent on stripeRefundId. */
  recordChargeRefund: (input: ChargeRefundInput) => Promise<{ outcome: string }>;
  /** public.stripe_dispute_upsert -- one row per stripeDisputeId. */
  upsertDispute: (input: DisputeInput) => Promise<void>;
  eventSettle: (eventId: string, error: string | null) => Promise<void>;
  emit: (level: "debug" | "info" | "warn" | "error", type: string, fields?: Record<string, ScalarValue>) => void;
};

/** Which money event a Stripe event type is, or null when it is not one this module handles. */
export function moneyEventKind(type: string): "charge_refunded" | "dispute" | null {
  if (type === "charge.refunded") return "charge_refunded";
  if (DISPUTE_EVENT_TYPES.includes(type)) return "dispute";
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

/** Permanent SQL failure: stamp the event with its state and ack. A settle failure itself retries. */
async function settleWithError(
  eventId: string,
  err: unknown,
  fallback: string,
  deps: MoneyEventDeps,
): Promise<HandleResult> {
  try {
    await deps.eventSettle(eventId, sqlState(err) ?? fallback);
  } catch {
    return { retry: true };
  }
  return { ack: true };
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
    deps.emit("warn", "charge_refunds_truncated", { eventId: message.eventId, chargeId: charge.id });
  }

  if (refunds.some((refund) => refund.status === "succeeded" && refund.currency !== "chf")) {
    deps.emit("error", "charge_refund_non_chf", { eventId: message.eventId, chargeId: charge.id });
    return settleWithError(message.eventId, null, "non_chf_refund", deps);
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
      return settleWithError(message.eventId, err, "charge_refund_failed", deps);
    }
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

  try {
    await deps.upsertDispute({
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
    return settleWithError(message.eventId, err, "dispute_upsert_failed", deps);
  }

  deps.emit("info", "dispute_recorded", {
    eventId: message.eventId,
    disputeId: dispute.id,
    status: String(dispute.status),
  });

  try {
    await deps.eventSettle(message.eventId, null);
  } catch {
    return { retry: true };
  }
  return { ack: true };
}

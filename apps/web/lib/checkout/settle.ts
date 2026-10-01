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
  stripeFromEnv,
} from "./stripe";
import {
  handleChargeRefundedWithDeps,
  handleDisputeWithDeps,
  moneyEventKind,
  paymentIntentIdOfCharge,
  paymentIntentIdOfDispute,
  type MoneyEventDeps,
} from "./money-events";
import { stripeAccountIsLegacyUaeTest } from "./charge-gate";
import type { StripeQueueMessage } from "./webhook";
import { purgeDepsFromEnv, purgeOnSessionExpired } from "./purge-unpaid";
import { deliverConfirmation } from "./notify";
import { provisionCheckoutAccount, provisionDeps } from "./provision-account";
import {
  deliverOverlapMustFix,
  deliverPaidAfterCancelAlert,
  deliverStuckPaymentAlert,
  type StuckPaymentAlertInput,
} from "../ops/must-fix-mail";

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
  /** 26.2 P1, kind=extra only: the paid change was applied (it may have ended before payment). */
  applied?: boolean;
  /** 26.2 P1, kind=extra only: the driver the applied class change took off the trip. */
  unassigned_chauffeur_id?: string | null;
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
  deliverConfirmation: (row: SettleRow) => Promise<void>;
  /** 26.5-05: account from the checkout choice; a failure never changes the settle result. */
  provisionAccount?: (row: SettleRow) => Promise<unknown>;
  /** 26.2 P1: the difference of a change was paid: confirmation again, driver taken off told. */
  afterExtraApplied?: (row: SettleRow) => Promise<void>;
  /** D-22: Stripe-first refund for a settle branch that captured money but must not confirm the trip. */
  refund: (input: RefundInput) => Promise<{ id: string }>;
  /** Records the refund decision (idempotent on stripeRefundId) after `refund` succeeds. */
  recordDuplicateRefund: (input: RecordDuplicateRefundInput) => Promise<void>;
  /** D-22/D-25a: a payment landed on a booking that cannot run; the charge was refunded. */
  alertPaidAfterCancel: (bookingKey: string) => Promise<void>;
  /** No PaymentIntent to refund, or the refund call itself threw. A human must look. */
  alertStuckPayment: (input: StuckPaymentAlertInput) => Promise<void>;
  /** D-21/D-22: expire the booking's other open Checkout Sessions after a succeeded settle. */
  expireSession: (sessionId: string) => Promise<void>;
  /** D-25/D-45: after an expired session is recorded, delete the booking if every session of it is expired and unpaid. Never throws. */
  purgeOnSessionExpired: (sessionId: string, bookingId: string) => Promise<boolean>;
  emit: (level: "debug" | "info" | "warn" | "error", type: string, fields?: Record<string, ScalarValue>) => void;
};

function sqlState(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string") {
    return (err as { code: string }).code;
  }
  return undefined;
}

/** Postgres `text[]` literal. A 1-element JS array binds as a scalar; `::text[]` then throws 22P02. */
export function pgTextArrayLiteral(values: string[]): string {
  return `{${values.map((value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
}

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
): "succeeded" | "failed" | "canceled" | "charge_refunded" | "dispute" | "ignore" {
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
 * exists. Refund the whole charge, alert a human, and let the caller ack. Returns false
 * (caller retries) when this is not provably that case: not a paid main session, no
 * PaymentIntent, or a session so young the intent transaction may still commit.
 */
async function refundPaidSessionWithoutBooking(
  message: StripeQueueMessage,
  session: Stripe.Checkout.Session | null,
  piId: string | null,
  outcome: string,
  deps: SettleDeps,
): Promise<boolean> {
  if (outcome !== "succeeded" || !session || session.payment_status !== "paid") return false;
  if (session.metadata?.kind === "extra") return false;
  // An unknown age is treated as young: retry, never refund on a guess.
  const ageSeconds = typeof session.created === "number" ? Date.now() / 1000 - session.created : 0;
  if (ageSeconds < MISSING_BOOKING_MIN_AGE_SECONDS) return false;
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
    } catch {
      deps.emit("error", "refund_failed", { eventId: message.eventId, reason: "booking_missing" });
    }
  }
  try {
    await deps.alertStuckPayment({
      eventId: message.eventId,
      type: message.type,
      objectId: message.objectId,
      reference: null,
    });
  } catch {
    // Best-effort alert.
  }
  // Refund failed or no PaymentIntent: the alert is the handoff to a human; never loop on it.
  return true;
}

export async function handleStripeMessageWithDeps(
  message: StripeQueueMessage,
  deps: SettleDeps,
): Promise<HandleResult> {
  let session: Stripe.Checkout.Session | null = null;
  if (message.objectId.startsWith("cs_")) {
    try {
      session = await deps.retrieveSession(message.objectId);
    } catch {
      return { retry: true };
    }
  }

  // 26.1-08: re-read the charge / dispute from Stripe before begin() so its
  // pi_ joins the ordering window (research Pitfall 3) and the handler never
  // trusts the event body (T-26.1-26).
  const money = moneyEventKind(message.type);
  let charge: Stripe.Charge | null = null;
  let dispute: Stripe.Dispute | null = null;
  if (money === "charge_refunded" && message.objectId.startsWith("ch_")) {
    try {
      charge = await deps.retrieveCharge(message.objectId);
    } catch {
      return { retry: true };
    }
  }
  if (money === "dispute" && message.objectId.startsWith("du_")) {
    try {
      dispute = await deps.retrieveDispute(message.objectId);
    } catch {
      return { retry: true };
    }
  }

  const piId =
    paymentIntentIdOf(session) ??
    paymentIntentIdOfCharge(charge) ??
    paymentIntentIdOfDispute(dispute) ??
    (message.objectId.startsWith("pi_") ? message.objectId : null);
  // The two ids describe one payment. A window spanning only one of them lets
  // a payment_intent.canceled slip past a checkout.session.completed (plan 07-03).
  const objectIds = [message.objectId, piId].filter((id): id is string => Boolean(id));

  let admission: { should_process: boolean; reason: string };
  try {
    admission = await deps.begin(
      message.eventId,
      objectIds,
      new Date(message.stripeCreated * 1000),
    );
  } catch (err) {
    if (sqlState(err) === "P0002") return { retry: true };
    try {
      await deps.eventSettle(message.eventId, sqlState(err) ?? "begin_failed");
    } catch {
      return { retry: true };
    }
    return { ack: true };
  }

  if (!admission.should_process) {
    deps.emit("info", "stripe_event", { reason: admission.reason, eventId: message.eventId });
    return { ack: true };
  }

  const outcome = outcomeFor(message.type, session);
  if (outcome === "charge_refunded" && charge) {
    return handleChargeRefundedWithDeps(message, charge, deps);
  }
  if (outcome === "dispute" && dispute) {
    return handleDisputeWithDeps(message, dispute, deps);
  }
  if (outcome === "ignore" || outcome === "charge_refunded" || outcome === "dispute") {
    await deps.eventSettle(message.eventId, null);
    return { ack: true };
  }

  let row: SettleRow;
  try {
    row = await deps.settlePayment({
      eventId: message.eventId,
      sessionId: message.objectId.startsWith("cs_") ? message.objectId : session?.id ?? null,
      paymentIntentId: piId,
      outcome,
      session,
    });
  } catch (err) {
    const state = sqlState(err);
    if (state === "P0002") {
      const refunded = await refundPaidSessionWithoutBooking(message, session, piId, outcome, deps);
      if (refunded) {
        try {
          await deps.eventSettle(message.eventId, "booking_missing");
        } catch {
          return { retry: true };
        }
        return { ack: true };
      }
      return { retry: true };
    }
    // retryable vs permanent: P0002 is the intent transaction not committed
    // yet. 23505 from booking_payments_one_success reproduces forever.
    try {
      await deps.eventSettle(message.eventId, state ?? "settle_failed");
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

    if (row.refund_required) {
      const reason = row.refund_reason ?? "unknown";
      if (!piId) {
        // No PaymentIntent to refund. The settle row already stamped
        // processed_at — this is never retried into itself. A human must
        // resolve the money manually.
        deps.emit("warn", "refund_required_no_payment_intent", {
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
        } catch {
          // Best-effort alert. The settle outcome itself already landed.
        }
      } else {
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
          duplicateRefunded = row.duplicate;
          if (PAID_AFTER_CANCEL_REASONS.includes(reason)) {
            try {
              await deps.alertPaidAfterCancel(row.booking_id);
            } catch {
              // Best-effort alert. The refund itself already landed.
            }
          }
        } catch (err) {
          deps.emit("error", "refund_failed", {
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
          } catch {
            // Best-effort alert.
          }
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
                ${fx.presentmentAmountMinor}
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
              ${fx.presentmentCurrency}
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
        };
      } catch (err) {
        if (extra && sqlState(err) === "23P01") {
          const bookingId = String(input.session?.metadata?.booking_id ?? "");
          if (bookingId) {
            try {
              await deliverOverlapMustFix(env, bookingId);
            } catch {
              // Extra settle rolled back. Trip is not auto-cancelled. Mail is best-effort.
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
    deliverConfirmation: (row) => deliverConfirmation(env, row),
    // 26.2 P1: loaded on use, so the webhook path loads the class-change mails only when needed.
    afterExtraApplied: async (row) => {
      const { afterExtraSettled } = await import("../ops/booking-change");
      await afterExtraSettled(env, row);
    },
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
      return { outcome: String(rows[0]?.outcome ?? "unknown") };
    },
    upsertDispute: async (input) => {
      await asSystem(env, async (sql) => {
        await sql`
          select public.stripe_dispute_upsert(
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
    },
    emit,
  });
}

/** The two calls the worker needs from a Cloudflare Queues `Message`. */
export type QueueMessageControl = {
  ack: () => void;
  retry: (options?: { delaySeconds?: number }) => void;
};

/**
 * Applies a HandleResult to a queue message (worker.ts). A retry carrying
 * `delaySeconds` (app_refund_pending, 26.1-08) is passed through so the
 * retry budget spans minutes before any dead-letter; a plain retry keeps the
 * queue's default backoff.
 */
export function applyHandleResult(message: QueueMessageControl, result: HandleResult): "acked" | "retry" {
  if ("retry" in result && result.retry) {
    if (typeof result.delaySeconds === "number") {
      message.retry({ delaySeconds: result.delaySeconds });
    } else {
      message.retry();
    }
    return "retry";
  }
  message.ack();
  return "acked";
}

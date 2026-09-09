// apps/web/lib/checkout/settle.ts
//
// D-14 / D-15 / D-16: Queue consumer state machine. The browser return URL
// never confirms a booking. D-15 is MEDIUM confidence in the research — both
// candidate events are idempotent against the same dedupe and ordering, so
// being wrong here costs efficiency, not correctness. Corroborated against
// https://docs.stripe.com/checkout/fulfillment (session.completed +
// payment_status === paid is the documented fulfillment signal).

export const dynamic = "force-dynamic";

import type Stripe from "stripe";
import { asSystem } from "../db/identity";
import { withRequestContext, type ScalarValue } from "../logger";
import {
  fxFromSession,
  retrieveCheckoutSession,
  stripeFromEnv,
} from "./stripe";
import type { StripeQueueMessage } from "./webhook";
import { deliverConfirmation } from "./notify";

export type HandleResult = { ack: true } | { retry: true };

export type SettleRow = {
  booking_id: string;
  reference: string;
  locale: string;
  contact_email: string;
  already_settled: boolean;
};

export type SettleDeps = {
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
): "succeeded" | "failed" | "canceled" | "ignore" {
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

  const piId = paymentIntentIdOf(session) ?? (message.objectId.startsWith("pi_") ? message.objectId : null);
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
  if (outcome === "ignore") {
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
    if (state === "P0002") return { retry: true };
    // retryable vs permanent: P0002 is the intent transaction not committed
    // yet. 23505 from booking_payments_one_success reproduces forever.
    try {
      await deps.eventSettle(message.eventId, state ?? "settle_failed");
    } catch {
      return { retry: true };
    }
    return { ack: true };
  }

  if (outcome === "succeeded" && !row.already_settled) {
    await deps.deliverConfirmation(row);
  }

  return { ack: true };
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
      };
      const rows = await asSystem(env, async (sql) => {
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
            ${fx.presentmentAmountMinor}
          )
        `;
      });
      const row = rows[0];
      if (!row) throw new Error("checkout_payment_settle returned no row");
      return {
        booking_id: String(row.booking_id),
        reference: String(row.reference),
        locale: String(row.locale),
        contact_email: String(row.contact_email),
        already_settled: Boolean(row.already_settled),
      };
    },
    eventSettle: async (eventId, error) => {
      await asSystem(env, async (sql) => {
        await sql`select public.stripe_event_settle(${eventId}, ${error})`;
      });
    },
    deliverConfirmation: (row) => deliverConfirmation(env, row),
    emit,
  });
}

// apps/web/lib/checkout/dlq.ts
//
// D-06: dead-letter consumer for `vamos-stripe-events-{env}-dlq`. A message lands here only
// after `settle.ts`'s consumer has retried it 8 times (wrangler.jsonc `max_retries: 8`). This
// handler never calls `settlePayment`, `begin`, or Stripe — it resolves a reference
// best-effort, alerts a human once, and always acks (T-26.1-10: a DLQ message is never
// retried into itself; there is no `dead_letter_queue` configured on this consumer).

import { asSystem } from "../db/identity";
import { withRequestContext, type ScalarValue } from "../logger";
import { deliverStuckPaymentAlert } from "../ops/must-fix-mail";
import type { StripeQueueMessage } from "./webhook";

export type DlqAlertInput = {
  eventId: string;
  type: string;
  objectId: string;
  reference: string | null;
};

export type DlqDeps = {
  lookupReference: (sessionId: string) => Promise<string | null>;
  alert: (input: DlqAlertInput) => Promise<void>;
  emit: (level: "debug" | "info" | "warn" | "error", type: string, fields?: Record<string, ScalarValue>) => void;
};

export async function handleDlqMessageWithDeps(
  message: StripeQueueMessage,
  deps: DlqDeps,
): Promise<{ ack: true }> {
  let reference: string | null = null;
  if (message.objectId.startsWith("cs_")) {
    try {
      reference = await deps.lookupReference(message.objectId);
    } catch {
      // Best-effort. A failed lookup still alerts — with no reference — rather than
      // dropping the alert entirely.
      reference = null;
    }
  }

  try {
    await deps.alert({
      eventId: message.eventId,
      type: message.type,
      objectId: message.objectId,
      reference,
    });
  } catch {
    // The alert is best-effort (T-26.1-11: stripe_events keeps attempts/last_error for
    // audit). Never retry a DLQ message on account of the alert failing — that would be
    // the exact loop T-26.1-10 exists to prevent.
    deps.emit("error", "dlq_alert_failed", {
      eventId: message.eventId,
      objectId: message.objectId,
    });
  }

  return { ack: true };
}

export async function handleDlqMessage(
  env: CloudflareEnv,
  message: StripeQueueMessage,
): Promise<{ ack: true }> {
  const emit = withRequestContext({
    requestId: message.eventId,
    route: "queue:dlq",
    locale: null,
  });

  return handleDlqMessageWithDeps(message, {
    lookupReference: async (sessionId) => {
      const rows = await asSystem(env, async (sql) => {
        return sql<{ reference: string | null }[]>`
          select public.checkout_reference_for_session(${sessionId}) as reference
        `;
      });
      return rows[0]?.reference ?? null;
    },
    alert: (input) => deliverStuckPaymentAlert(env, input),
    emit,
  });
}

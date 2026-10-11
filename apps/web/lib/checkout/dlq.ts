// apps/web/lib/checkout/dlq.ts
//
// D-06: dead-letter consumer for `vamos-stripe-events-{env}-dlq`. A message lands here only
// after `settle.ts`'s consumer has retried it 8 times (wrangler.jsonc `max_retries: 8`). This
// handler never calls `settlePayment`, `begin`, or Stripe — it resolves a reference
// best-effort and alerts a human.
//
// J2 (W4-02): the alert result is checked. A mail that did not go out is NOT acked: the message is
// retried later (DLQ_RETRY_DELAY_SECONDS, up to DLQ_MAX_ATTEMPTS deliveries, wrangler.jsonc sets the
// same `max_retries` on this consumer) and every failure is an error-level log. There is no further
// queue (T-26.1-10: a DLQ message is never retried into itself, no `dead_letter_queue` on this
// consumer), so after the last attempt it is acked with an error log and the durable second line takes
// over: the event is still unprocessed in stripe_events, the hourly sweep re-enqueues it, and an event
// that never settles is mailed again as "abandoned" until the mail goes out.

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

/** Deliveries of one DLQ message before it is acked without its alert (the sweep is the second line). */
export const DLQ_MAX_ATTEMPTS = 5;

/** Seconds before a DLQ message whose alert did not go out is delivered again. */
export const DLQ_RETRY_DELAY_SECONDS = 600;

export type DlqResult = { ack: true } | { retry: true; delaySeconds: number };

export type DlqDeps = {
  lookupReference: (sessionId: string) => Promise<string | null>;
  alert: (input: DlqAlertInput) => Promise<void>;
  emit: (level: "debug" | "info" | "warn" | "error", type: string, fields?: Record<string, ScalarValue>) => void;
};

export async function handleDlqMessageWithDeps(
  message: StripeQueueMessage,
  deps: DlqDeps,
  attempts = 1,
): Promise<DlqResult> {
  // A poison body (no ids) still alerts, with what it has.
  const eventId = typeof message?.eventId === "string" ? message.eventId : "";
  const type = typeof message?.type === "string" ? message.type : "";
  const objectId = typeof message?.objectId === "string" ? message.objectId : "";

  let reference: string | null = null;
  if (objectId.startsWith("cs_")) {
    try {
      reference = await deps.lookupReference(objectId);
    } catch {
      // Best-effort. A failed lookup still alerts — with no reference — rather than
      // dropping the alert entirely.
      reference = null;
    }
  }

  try {
    await deps.alert({ eventId, type, objectId, reference });
  } catch {
    // The mail did not go out (no key, Resend refused it, a thrown error). stripe_events keeps
    // attempts/last_error for audit (T-26.1-11).
    deps.emit("error", "dlq_alert_failed", { eventId, objectId, attempts });
    if (attempts < DLQ_MAX_ATTEMPTS) {
      return { retry: true, delaySeconds: DLQ_RETRY_DELAY_SECONDS };
    }
    deps.emit("error", "dlq_alert_gave_up", { eventId, objectId, attempts });
  }

  return { ack: true };
}

export async function handleDlqMessage(
  env: CloudflareEnv,
  message: StripeQueueMessage,
  attempts = 1,
): Promise<DlqResult> {
  const emit = withRequestContext({
    requestId: typeof message?.eventId === "string" && message.eventId ? message.eventId : "dlq",
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
  }, attempts);
}

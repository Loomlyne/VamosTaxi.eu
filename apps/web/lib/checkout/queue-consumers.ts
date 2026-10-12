// apps/web/lib/checkout/queue-consumers.ts
//
// The two queue consumers of worker.ts, as functions that take their I/O, so that what happens to a
// message when the handler throws, or when the stuck-payment alert did not go out, is tested without a
// Worker runtime.
//
// J2: W4-14 (a thrown handler is logged at error level with the message id, the event type and the
// SQLSTATE class, never the body or any address; a message that can be neither retried nor acked is
// rethrown, never treated as done), W1-14 / W4-06 (a thrown handler retries after a delay, never at once),
// W4-02 (a DLQ alert that did not go out is not acked).

import type { ScalarValue } from "../logger";
import { DLQ_MAX_ATTEMPTS, DLQ_RETRY_DELAY_SECONDS, type DlqResult } from "./dlq";
import { applyHandleResult, type HandleResult, type QueueMessageControl } from "./settle";
import { retryDelayForAttempt, sqlStateOf } from "./settle-errors";
import type { StripeQueueMessage } from "./webhook";

type Emit = (level: "debug" | "info" | "warn" | "error", type: string, fields?: Record<string, ScalarValue>) => void;

export type ConsumerMessage = QueueMessageControl & { id: string; body: unknown };

/** Log fields for a caught error: SQLSTATE and its class, or the error's name. Never the message text. */
export function caughtFields(err: unknown): Record<string, string> {
  const state = sqlStateOf(err);
  if (state) return { sqlstate: state, sqlstateClass: state.slice(0, 2) };
  return { errorName: err instanceof Error ? err.name : typeof err };
}

/**
 * One Stripe-event message. `run` is `handleStripeMessage` bound to the env. Returns what was done.
 * Throws only when the message could be neither retried nor acked (Cloudflare then redelivers it).
 */
export async function consumeStripeEventMessage(
  message: ConsumerMessage,
  batchSize: number,
  run: (body: StripeQueueMessage) => Promise<HandleResult>,
  emit: Emit,
): Promise<"acked" | "retry"> {
  const body = message.body as StripeQueueMessage;
  let ackOutcome: "acked" | "retry" | "ack-failed" = "acked";
  try {
    ackOutcome = applyHandleResult(message, await run(body));
  } catch (err) {
    // W4-14: the message id, the event type and the SQLSTATE class (or the error's name). No body, no text.
    emit("error", "queue_handler_threw", {
      messageId: message.id,
      eventType: typeof body?.type === "string" ? body.type : "",
      ...caughtFields(err),
    });
    try {
      // W1-14, W4-06: a thrown handler waits before the next delivery; it never retries at once.
      message.retry({ delaySeconds: retryDelayForAttempt(message.attempts) });
      ackOutcome = "retry";
    } catch {
      ackOutcome = "ack-failed";
    }
  }
  emit(ackOutcome === "ack-failed" ? "error" : "info", "queue", { messageId: message.id, batchSize, ackOutcome });
  if (ackOutcome === "ack-failed") {
    throw new Error("queue message could be neither acked nor retried");
  }
  return ackOutcome;
}

/**
 * One dead-letter message. `run` is `handleDlqMessage` bound to the env. An alert that did not go out
 * is retried later (up to DLQ_MAX_ATTEMPTS deliveries) and is an error-level log every time; after the
 * last delivery the message is acked, because no further queue exists, and the unprocessed-event sweep
 * is the durable second line.
 */
export async function consumeDlqMessage(
  message: ConsumerMessage,
  batchSize: number,
  run: (body: StripeQueueMessage, attempts: number) => Promise<DlqResult>,
  emit: Emit,
): Promise<"acked" | "retry"> {
  const attempts = typeof message.attempts === "number" && message.attempts >= 1 ? message.attempts : 1;
  let outcome: "acked" | "retry" = "acked";
  try {
    const result = await run(message.body as StripeQueueMessage, attempts);
    if ("retry" in result) {
      message.retry({ delaySeconds: result.delaySeconds });
      outcome = "retry";
    } else {
      message.ack();
    }
  } catch (err) {
    emit("error", "dlq_handle_failed", { messageId: message.id, ...caughtFields(err) });
    if (attempts < DLQ_MAX_ATTEMPTS) {
      message.retry({ delaySeconds: DLQ_RETRY_DELAY_SECONDS });
      outcome = "retry";
    } else {
      message.ack();
    }
  }
  emit("info", "dlq", { messageId: message.id, batchSize, outcome });
  return outcome;
}

// apps/web/lib/translate/queue-consumer.ts
//
// Phase 32 plan 05: the consumer of `vamos-translate-<env>` and its `-dlq`. worker.ts routes every
// batch whose queue name starts with "vamos-translate" here BEFORE its Stripe branches (the Stripe DLQ
// branch would mail info@, the Stripe loop would parse the body as a Stripe event). worker.ts itself
// cannot be loaded by vitest, so all logic lives here.
//
//   main queue: parse (ids only) -> handle -> ack; a transient failure or a store error -> retry with
//               retryDelayForAttempt(attempts); a body that does not parse -> ack + `translate_bad_job`.
//   DLQ:        mark the message/note failed (dashboard: "Translation not available"), review/extra
//               ack only; every message is acked, nothing is retried, nothing is mailed (T-32-23).
//
// Logs: message id, job kind, reason code, SQLSTATE class, counts. Never a body or any text (T-32-22).

import { caughtFields, type ConsumerMessage } from "../checkout/queue-consumers";
import { retryDelayForAttempt } from "../checkout/settle-errors";
import { parseTranslateJob } from "./jobs-contract";
import {
  handleDeadTranslateJob,
  handleTranslateJob,
  TranslateRetryError,
  TranslateStoreError,
  type Emit,
  type TranslateStore,
} from "./jobs";
import type { AiLike } from "./translate";

export type TranslateConsumerDeps = {
  ai: AiLike | null | undefined;
  store: TranslateStore;
  /** A logger bound to one message (worker.ts: withRequestContext per message id). */
  emitFor: (messageId: string) => Emit;
};

export type TranslateBatch = { queue: string; messages: readonly ConsumerMessage[] };

function failureFields(err: unknown): Record<string, string> {
  if (err instanceof TranslateRetryError) return { reason: err.reason };
  if (err instanceof TranslateStoreError) {
    return err.sqlstate ? { reason: "store", sqlstate: err.sqlstate, sqlstateClass: err.sqlstate.slice(0, 2) } : { reason: "store" };
  }
  return { reason: "threw", ...caughtFields(err) };
}

async function consumeOne(message: ConsumerMessage, batchSize: number, deps: TranslateConsumerDeps): Promise<void> {
  const emit = deps.emitFor(message.id);
  const job = parseTranslateJob(message.body);
  if (!job) {
    // Unknown kind, an extra key such as `text`, a bad id: dropped. The body is never logged.
    emit("warn", "translate_bad_job", { messageId: message.id });
    message.ack();
    return;
  }
  let outcome: "acked" | "retry" | "ack-failed" = "acked";
  let result = "";
  let handled = false;
  try {
    result = await handleTranslateJob({ ai: deps.ai, store: deps.store, emit }, job);
    handled = true;
  } catch (err) {
    const fields = failureFields(err);
    emit(err instanceof TranslateRetryError ? "warn" : "error", "translate_job_retry", {
      messageId: message.id,
      kind: job.kind,
      attempts: typeof message.attempts === "number" ? message.attempts : 1,
      ...fields,
    });
    try {
      message.retry({ delaySeconds: retryDelayForAttempt(message.attempts) });
      outcome = "retry";
    } catch {
      outcome = "ack-failed";
    }
  }
  if (handled) {
    try {
      message.ack();
    } catch {
      outcome = "ack-failed";
    }
  }
  emit(outcome === "ack-failed" ? "error" : "info", "translate_queue", {
    messageId: message.id,
    kind: job.kind,
    result,
    batchSize,
    ackOutcome: outcome,
  });
  if (outcome === "ack-failed") {
    throw new Error("translate queue message could be neither acked nor retried");
  }
}

async function consumeDead(message: ConsumerMessage, batchSize: number, deps: TranslateConsumerDeps): Promise<void> {
  const emit = deps.emitFor(message.id);
  const job = parseTranslateJob(message.body);
  if (!job) {
    emit("warn", "translate_bad_job", { messageId: message.id });
    message.ack();
    return;
  }
  let result: "marked" | "acked" | "error" = "acked";
  try {
    result = await handleDeadTranslateJob({ ai: deps.ai, store: deps.store, emit }, job);
  } catch (err) {
    // Still acked: the dead-letter queue is the end of the line, and the nightly sweep is the
    // second line (a message with no rows at all is re-enqueued after 24 hours).
    result = "error";
    emit("error", "translate_dlq_failed", { messageId: message.id, kind: job.kind, ...failureFields(err) });
  }
  message.ack();
  emit("info", "translate_dlq", { messageId: message.id, kind: job.kind, result, batchSize });
}

/** Consumes one batch of the translate queue or its dead-letter queue. */
export async function consumeTranslateBatch(batch: TranslateBatch, deps: TranslateConsumerDeps): Promise<void> {
  const dead = batch.queue.endsWith("-dlq");
  for (const message of batch.messages) {
    if (dead) await consumeDead(message, batch.messages.length, deps);
    else await consumeOne(message, batch.messages.length, deps);
  }
}

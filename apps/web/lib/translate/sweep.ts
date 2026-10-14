// apps/web/lib/translate/sweep.ts
//
// Phase 32 plan 05: the nightly translate sweep, run from worker.ts in the `0 3 * * *` block. It puts
// back on the translate queue, by id only:
//   - what is still untranslated (system_translation_backlog: support messages, booking notes, reviews
//     without a language; failed items after 24 hours, fewer than 10 attempts),
//   - every extra with a missing German, French or Arabic name (one `extra` job per code),
//   - the public-safe cache rows the machine wrote under an older prompt_version (F-06), so a house-rule
//     bump re-translates them. A human row is never re-queued (F-05): the definer never lists one, and
//     this file filters again.
// Counts only in the result and the logs. Never throws; never mails (the owner's mail-on-failure
// automation is a proposal, not built).

import type { ScalarValue } from "../logger";
import { withRequestContext } from "../logger";
import { caughtFields } from "../checkout/queue-consumers";
import { sendTranslateJob, type TranslateJob } from "./jobs-contract";
import { PROMPT_VERSION } from "./model";
import * as db from "./store";
import type { BacklogRow, ExtraLabelMissingRow, StaleTranslationRow } from "./store";

/** Rows read per source per night. */
export const SWEEP_LIMIT = 100;

type Emit = (level: "debug" | "info" | "warn" | "error", type: string, fields?: Record<string, ScalarValue>) => void;

export type SweepDeps = {
  hasQueue: boolean;
  backlog(limit: number): Promise<BacklogRow[]>;
  extrasMissing(): Promise<ExtraLabelMissingRow[]>;
  stale(promptVersion: number, limit: number): Promise<StaleTranslationRow[]>;
  /** sendTranslateJob: true when the job was sent. Never throws. */
  enqueue(job: TranslateJob): Promise<boolean>;
  emit: Emit;
};

export type SweepResult = { enqueued: number; failed: number; skipped?: true };

function backlogJob(row: BacklogRow): TranslateJob | null {
  switch (row.kind) {
    case "support":
      return { v: 1, kind: "support", messageId: row.id };
    case "note":
      return { v: 1, kind: "note", bookingId: row.id };
    case "review":
      return { v: 1, kind: "review", reviewId: row.id };
    default:
      return null;
  }
}

/** The sweep with its I/O injected (tested without a Worker or a database). */
export async function runTranslateSweepWithDeps(deps: SweepDeps): Promise<SweepResult> {
  const { emit } = deps;
  if (!deps.hasQueue) {
    emit("warn", "translate_sweep_no_queue", {});
    return { enqueued: 0, failed: 0, skipped: true };
  }
  let enqueued = 0;
  let failed = 0;

  async function read<T>(step: string, fn: () => Promise<T[]>): Promise<T[]> {
    try {
      return await fn();
    } catch (err) {
      failed += 1;
      emit("error", "translate_sweep_read_failed", { step, ...caughtFields(err) });
      return [];
    }
  }

  const jobs: TranslateJob[] = [];
  for (const row of await read("backlog", () => deps.backlog(SWEEP_LIMIT))) {
    const job = backlogJob(row);
    if (job) jobs.push(job);
  }
  const codes: string[] = [];
  for (const row of await read("extras", () => deps.extrasMissing())) {
    if (!codes.includes(row.code)) codes.push(row.code);
  }
  for (const code of codes) jobs.push({ v: 1, kind: "extra", code });
  for (const row of await read("stale", () => deps.stale(PROMPT_VERSION, SWEEP_LIMIT))) {
    // F-05: a human row is never re-queued, whatever the reader returned.
    if (row.origin !== "machine") continue;
    if (typeof row.prompt_version !== "number" || row.prompt_version >= PROMPT_VERSION) continue;
    jobs.push({ v: 1, kind: "cache", translationId: row.id });
  }

  for (const job of jobs) {
    if (await deps.enqueue(job)) enqueued += 1;
    else failed += 1;
  }
  return { enqueued, failed };
}

/** The 03:00 run: bound to the Worker env. Returns counts; never throws. */
export async function runTranslateSweep(env: CloudflareEnv): Promise<SweepResult> {
  const emit = withRequestContext({
    requestId: crypto.randomUUID(),
    route: "scheduled:translate-sweep",
    locale: null,
  });
  return runTranslateSweepWithDeps({
    hasQueue: Boolean(env.TRANSLATE_QUEUE),
    backlog: (limit) => db.translationBacklog(env, limit),
    extrasMissing: () => db.extraLabelsMissing(env),
    stale: (promptVersion, limit) => db.staleMachineTranslations(env, promptVersion, limit),
    enqueue: (job) => sendTranslateJob(env, job),
    emit,
  });
}

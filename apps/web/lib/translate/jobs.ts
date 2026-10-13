// apps/web/lib/translate/jobs.ts
//
// Phase 32 plan 05: what one translate queue job does. A job carries ids only (jobs-contract.ts); the
// text is read from Postgres here, at run time, through the plan-02 definer wrappers (store.ts), so no
// customer text ever sits in queue storage (T-32-21).
//
// Outcomes:
//   - transient model failure (timeout, model_error) -> throws TranslateRetryError; the consumer
//     retries with backoff, and after max_retries the message lands on the quiet DLQ;
//   - a store error -> logged (SQLSTATE class only) and rethrown, so the consumer retries;
//   - final model failure (guard, parse, refusal, finish, too_long, empty) -> rejected/failed rows are
//     written and the job is done (the dashboard shows "Translation not available", never blank);
//   - no_binding -> nothing is written; the nightly sweep picks the row up later.
//
// Logs carry ids, kinds, reason codes, language codes and counts, never text (T-32-22).
// postgres.js begin() rethrows a caught error after the callback, so store errors are caught around the
// wrapper call here, never inside an asSystem callback.

import type { ScalarValue } from "../logger";
import { caughtFields } from "../checkout/queue-consumers";
import * as db from "./store";
import type {
  BookingNoteSourceRow,
  ExtraLabelMissingRow,
  PutMachineRow,
  ReviewLanguageSourceRow,
  StaleTranslationSourceRow,
  SupportSourceRow,
  TranslationRowsInput,
} from "./store";
import type { TranslateJob } from "./jobs-contract";
import { isLang, LANGS, PROMPT_VERSION, type Lang } from "./model";
import { translateText, translateUnknown, type AiLike, type TranslateFailReason } from "./translate";

export type Emit = (level: "debug" | "info" | "warn" | "error", type: string, fields?: Record<string, ScalarValue>) => void;

/** The plan-02 store wrappers, already bound to the Worker env (see bindTranslateStore). */
export type TranslateStore = {
  supportTranslationSource(messageId: string): Promise<SupportSourceRow | null>;
  supportFormMessageId(submissionId: string): Promise<string | null>;
  putSupportTranslation(
    messageId: string,
    detected: string | null,
    rows: TranslationRowsInput,
    promptVersion: number,
  ): Promise<number>;
  failSupportTranslation(messageId: string): Promise<void>;
  bookingNoteSource(bookingId: string): Promise<BookingNoteSourceRow | null>;
  putBookingNoteTranslation(
    bookingId: string,
    detected: string | null,
    noteHash: string,
    rows: TranslationRowsInput,
    promptVersion: number,
  ): Promise<number>;
  failBookingNoteTranslation(bookingId: string, noteHash: string): Promise<void>;
  reviewLanguageSource(reviewId: string): Promise<ReviewLanguageSourceRow | null>;
  setReviewLanguage(reviewId: string, lang: string): Promise<void>;
  extraLabelsMissing(): Promise<ExtraLabelMissingRow[]>;
  fillExtraLabel(code: string, labels: Partial<Record<"de" | "fr" | "ar", string>>): Promise<number>;
  staleTranslationSource(translationId: string, promptVersion: number): Promise<StaleTranslationSourceRow | null>;
  putMachineTranslation(args: {
    hash: string;
    sourceLang: string;
    targetLang: Lang;
    sourceText: string;
    text: string;
    context: "review";
    promptVersion: number;
  }): Promise<PutMachineRow | null>;
};

export type JobDeps = { ai: AiLike | null | undefined; store: TranslateStore; emit: Emit };

/** What a handled job did. A thrown error means "retry later". */
export type JobOutcome = "done" | "rejected" | "failed" | "skipped" | "no_binding";

/** A transient model failure: the consumer retries the message with backoff. */
export class TranslateRetryError extends Error {
  readonly reason: "timeout" | "model_error";
  constructor(reason: "timeout" | "model_error") {
    super(`translate ${reason}`);
    this.name = "TranslateRetryError";
    this.reason = reason;
  }
}

/** A store call failed (already logged with its SQLSTATE). The consumer retries. */
export class TranslateStoreError extends Error {
  readonly step: string;
  readonly sqlstate: string | undefined;
  constructor(step: string, fields: Record<string, string>) {
    super(`translate store ${step}`);
    this.name = "TranslateStoreError";
    this.step = step;
    this.sqlstate = fields.sqlstate;
  }
}

const TRANSIENT: readonly TranslateFailReason[] = Object.freeze(["timeout", "model_error"]);
const ISO_639_1 = /^[a-z]{2}$/;
const EXTRA_TARGETS: readonly ("de" | "fr" | "ar")[] = Object.freeze(["de", "fr", "ar"]);

/** Binds the plan-02 wrappers to `env` (Worker side only). */
export function bindTranslateStore(env: CloudflareEnv): TranslateStore {
  return {
    supportTranslationSource: (messageId) => db.supportTranslationSource(env, messageId),
    supportFormMessageId: (submissionId) => db.supportFormMessageId(env, submissionId),
    putSupportTranslation: (messageId, detected, rows, pv) => db.putSupportTranslation(env, messageId, detected, rows, pv),
    failSupportTranslation: (messageId) => db.failSupportTranslation(env, messageId),
    bookingNoteSource: (bookingId) => db.bookingNoteSource(env, bookingId),
    putBookingNoteTranslation: (bookingId, detected, noteHash, rows, pv) =>
      db.putBookingNoteTranslation(env, bookingId, detected, noteHash, rows, pv),
    failBookingNoteTranslation: (bookingId, noteHash) => db.failBookingNoteTranslation(env, bookingId, noteHash),
    reviewLanguageSource: (reviewId) => db.reviewLanguageSource(env, reviewId),
    setReviewLanguage: (reviewId, lang) => db.setReviewLanguage(env, reviewId, lang),
    extraLabelsMissing: () => db.extraLabelsMissing(env),
    fillExtraLabel: (code, labels) => db.fillExtraLabel(env, code, labels),
    staleTranslationSource: (translationId, pv) => db.staleTranslationSource(env, translationId, pv),
    putMachineTranslation: (args) => db.putMachineTranslation(env, args),
  };
}

/**
 * Runs one store call. On error: logs the step with the SQLSTATE class (or the error's name), never the
 * message text, and throws TranslateStoreError.
 */
export async function storeStep<T>(emit: Emit, kind: string, step: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const fields = caughtFields(err);
    emit("error", "translate_store_failed", { kind, step, ...fields });
    throw new TranslateStoreError(step, fields);
  }
}

function isTransient(reason: TranslateFailReason): reason is "timeout" | "model_error" {
  return TRANSIENT.includes(reason);
}

/** Per-language rows for the definer: done for each accepted language, rejected for each guard reject. */
function rowsOf(out: Partial<Record<Lang, string>>, rejected: readonly Lang[]): TranslationRowsInput {
  const rows: TranslationRowsInput = {};
  for (const lang of LANGS) {
    const text = out[lang];
    if (typeof text === "string") rows[lang] = { body: text, status: "done" };
    else if (rejected.includes(lang)) rows[lang] = { body: null, status: "rejected" };
  }
  return rows;
}

function rejectedRows(detected: string | null): TranslationRowsInput {
  const rows: TranslationRowsInput = {};
  for (const lang of LANGS) if (lang !== detected) rows[lang] = { body: null, status: "rejected" };
  return rows;
}

type CustomerText = { text: string; fallbackLang?: string };

/**
 * Detects and translates one customer text into all four languages, then writes it through `put`, or
 * marks it failed through `fail`. Shared by support messages and booking notes.
 */
async function translateCustomerText(
  deps: JobDeps,
  kind: TranslateJob["kind"],
  src: CustomerText,
  put: (detected: string | null, rows: TranslationRowsInput) => Promise<number>,
  fail: () => Promise<void>,
): Promise<JobOutcome> {
  const { emit } = deps;
  const res = await translateUnknown(deps.ai, { text: src.text, to: [...LANGS], fallbackLang: src.fallbackLang });
  if (!res.ok) {
    if (res.reason === "no_binding") {
      emit("info", "translate_job", { kind, outcome: "no_binding" });
      return "no_binding";
    }
    if (isTransient(res.reason)) throw new TranslateRetryError(res.reason);
    if (res.reason === "guard") {
      // Every target failed the guard: rejected rows, the detected language kept. No retry storm.
      const n = await storeStep(emit, kind, "put", () => put(res.lang, rejectedRows(res.lang)));
      emit("warn", "translate_job", { kind, outcome: "rejected", reason: res.reason, lang: res.lang, written: n });
      return "rejected";
    }
    await storeStep(emit, kind, "fail", fail);
    emit("warn", "translate_job", { kind, outcome: "failed", reason: res.reason });
    return "failed";
  }
  const n = await storeStep(emit, kind, "put", () => put(res.lang, rowsOf(res.out, res.rejected)));
  emit("info", "translate_job", {
    kind,
    outcome: "done",
    lang: res.lang,
    written: n,
    rejected: res.rejected.length,
  });
  return "done";
}

async function supportJob(deps: JobDeps, kind: "support" | "support-form", messageId: string): Promise<JobOutcome> {
  const { store, emit } = deps;
  const src = await storeStep(emit, kind, "supportTranslationSource", () => store.supportTranslationSource(messageId));
  if (!src || (src.direction !== "inbound_form" && src.direction !== "inbound_email") || !src.body_text.trim()) {
    emit("info", "translate_job", { kind, outcome: "skipped" });
    return "skipped";
  }
  if (src.detected_lang) {
    // Already handled (a duplicate delivery or an earlier run).
    emit("info", "translate_job", { kind, outcome: "skipped", lang: src.detected_lang });
    return "skipped";
  }
  return translateCustomerText(
    deps,
    kind,
    { text: src.body_text, fallbackLang: src.form_locale },
    (detected, rows) => store.putSupportTranslation(messageId, detected, rows, PROMPT_VERSION),
    () => store.failSupportTranslation(messageId),
  );
}

async function noteJob(deps: JobDeps, bookingId: string): Promise<JobOutcome> {
  const { store, emit } = deps;
  const src = await storeStep(emit, "note", "bookingNoteSource", () => store.bookingNoteSource(bookingId));
  if (!src || !src.note.trim()) {
    emit("info", "translate_job", { kind: "note", outcome: "skipped" });
    return "skipped";
  }
  return translateCustomerText(
    deps,
    "note",
    { text: src.note },
    (detected, rows) => store.putBookingNoteTranslation(bookingId, detected, src.note_hash, rows, PROMPT_VERSION),
    () => store.failBookingNoteTranslation(bookingId, src.note_hash),
  );
}

async function reviewJob(deps: JobDeps, reviewId: string): Promise<JobOutcome> {
  const { store, emit } = deps;
  const src = await storeStep(emit, "review", "reviewLanguageSource", () => store.reviewLanguageSource(reviewId));
  if (!src || !src.published || src.language || !src.body.trim()) {
    emit("info", "translate_job", { kind: "review", outcome: "skipped" });
    return "skipped";
  }
  // Detect only: no target language.
  const res = await translateUnknown(deps.ai, { text: src.body, to: [] });
  if (!res.ok) {
    if (res.reason === "no_binding") {
      emit("info", "translate_job", { kind: "review", outcome: "no_binding" });
      return "no_binding";
    }
    if (isTransient(res.reason)) throw new TranslateRetryError(res.reason);
    emit("warn", "translate_job", { kind: "review", outcome: "failed", reason: res.reason });
    return "failed";
  }
  if (!ISO_639_1.test(res.lang)) {
    emit("warn", "translate_job", { kind: "review", outcome: "failed", reason: "undetermined" });
    return "failed";
  }
  await storeStep(emit, "review", "setReviewLanguage", () => store.setReviewLanguage(reviewId, res.lang));
  emit("info", "translate_job", { kind: "review", outcome: "done", lang: res.lang });
  return "done";
}

async function extraJob(deps: JobDeps, code: string): Promise<JobOutcome> {
  const { store, emit } = deps;
  const missing = await storeStep(emit, "extra", "extraLabelsMissing", () => store.extraLabelsMissing());
  const row = missing.find((r) => r.code === code);
  if (!row || !row.label_en.trim()) {
    emit("info", "translate_job", { kind: "extra", outcome: "skipped" });
    return "skipped";
  }
  // The definer writes a language only when it is empty or machine-written (D-02: his names win).
  const res = await translateText(deps.ai, { text: row.label_en, from: "en", to: [...EXTRA_TARGETS] });
  if (!res.ok) {
    if (res.reason === "no_binding") {
      emit("info", "translate_job", { kind: "extra", outcome: "no_binding" });
      return "no_binding";
    }
    if (isTransient(res.reason)) throw new TranslateRetryError(res.reason);
    emit("warn", "translate_job", { kind: "extra", outcome: "failed", reason: res.reason });
    return "failed";
  }
  const labels: Partial<Record<"de" | "fr" | "ar", string>> = {};
  for (const lang of EXTRA_TARGETS) {
    const text = res.out[lang];
    if (typeof text === "string" && text.trim()) labels[lang] = text;
  }
  const n = await storeStep(emit, "extra", "fillExtraLabel", () => store.fillExtraLabel(code, labels));
  emit("info", "translate_job", { kind: "extra", outcome: "done", written: n, rejected: res.rejected.length });
  return "done";
}

/**
 * A public-safe review cache row written under an older prompt_version (F-06). The definer returns the
 * source only while the row is still machine and older than PROMPT_VERSION, so a human row is never
 * touched; the put itself also never overwrites a human row. A rejected re-translation writes nothing:
 * the earlier text stays served.
 */
async function cacheJob(deps: JobDeps, translationId: string): Promise<JobOutcome> {
  const { store, emit } = deps;
  const src = await storeStep(emit, "cache", "staleTranslationSource", () =>
    store.staleTranslationSource(translationId, PROMPT_VERSION),
  );
  if (!src || !isLang(src.target_lang) || !src.source_text.trim()) {
    emit("info", "translate_job", { kind: "cache", outcome: "skipped" });
    return "skipped";
  }
  const target = src.target_lang;
  const res = isLang(src.source_lang)
    ? await translateText(deps.ai, { text: src.source_text, from: src.source_lang, to: [target] })
    : await translateUnknown(deps.ai, { text: src.source_text, to: [target], fallbackLang: src.source_lang });
  if (!res.ok) {
    if (res.reason === "no_binding") {
      emit("info", "translate_job", { kind: "cache", outcome: "no_binding" });
      return "no_binding";
    }
    if (isTransient(res.reason)) throw new TranslateRetryError(res.reason);
    emit("warn", "translate_job", { kind: "cache", outcome: "failed", reason: res.reason, lang: target });
    return "failed";
  }
  const text = res.out[target];
  if (typeof text !== "string" || !text.trim()) {
    emit("warn", "translate_job", { kind: "cache", outcome: "failed", reason: "missing", lang: target });
    return "failed";
  }
  await storeStep(emit, "cache", "putMachineTranslation", () =>
    store.putMachineTranslation({
      hash: src.source_hash,
      sourceLang: src.source_lang,
      targetLang: target,
      sourceText: src.source_text,
      text,
      context: "review",
      promptVersion: PROMPT_VERSION,
    }),
  );
  emit("info", "translate_job", { kind: "cache", outcome: "done", lang: target });
  return "done";
}

/** Runs one parsed translate job. Throws only when the message should be retried. */
export async function handleTranslateJob(deps: JobDeps, job: TranslateJob): Promise<JobOutcome> {
  switch (job.kind) {
    case "support":
      return supportJob(deps, "support", job.messageId);
    case "support-form": {
      const id = await storeStep(deps.emit, job.kind, "supportFormMessageId", () =>
        deps.store.supportFormMessageId(job.submissionId),
      );
      if (!id) {
        deps.emit("info", "translate_job", { kind: job.kind, outcome: "skipped" });
        return "skipped";
      }
      return supportJob(deps, "support-form", id);
    }
    case "note":
      return noteJob(deps, job.bookingId);
    case "review":
      return reviewJob(deps, job.reviewId);
    case "extra":
      return extraJob(deps, job.code);
    case "cache":
      return cacheJob(deps, job.translationId);
  }
}

/**
 * The final give-up after max_retries (the dead-letter queue). Marks what the dashboard reads as
 * "Translation not available"; never retries, never mails. Review, extra and cache jobs write nothing
 * (the nightly sweep tries them again). Throws on a store error; the consumer logs it and acks anyway.
 */
export async function handleDeadTranslateJob(deps: JobDeps, job: TranslateJob): Promise<"marked" | "acked"> {
  const { store, emit } = deps;
  switch (job.kind) {
    case "support":
      await storeStep(emit, job.kind, "failSupportTranslation", () => store.failSupportTranslation(job.messageId));
      return "marked";
    case "support-form": {
      const id = await storeStep(emit, job.kind, "supportFormMessageId", () => store.supportFormMessageId(job.submissionId));
      if (!id) return "acked";
      await storeStep(emit, job.kind, "failSupportTranslation", () => store.failSupportTranslation(id));
      return "marked";
    }
    case "note": {
      const src = await storeStep(emit, job.kind, "bookingNoteSource", () => store.bookingNoteSource(job.bookingId));
      if (!src || !src.note.trim()) return "acked";
      await storeStep(emit, job.kind, "failBookingNoteTranslation", () =>
        store.failBookingNoteTranslation(job.bookingId, src.note_hash),
      );
      return "marked";
    }
    case "review":
    case "extra":
    case "cache":
      return "acked";
  }
}

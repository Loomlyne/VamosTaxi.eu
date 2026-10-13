// apps/web/lib/translate/store.ts
//
// Phase 32 plan 02: the Worker's only door onto the translation tables. One narrow wrapper per
// SECURITY DEFINER function from 20261012260000 .. 20261012290000; no raw table SQL anywhere here.
//
//   publicSql (vamos_public, cached path): readCachedTranslation, reviewTranslationSource.
//   asSystem  (vamos_system, definer-only): everything else.
//
// Rules this file keeps (memory + plan):
// - vamos_system has no table grant on these tables: every statement is `select * from public.<fn>(...)`.
// - The Worker pg client has no array types: a JSON argument goes as `sql.json(obj)`, never text[].
// - postgres.js `begin()` rethrows a caught error after the callback, so nothing here catches inside an
//   asSystem callback; callers wrap the call in their own try/catch.
// - No client at module scope, no module-level Set (scripts/check-db-access-fences.mjs).
// - Customer text (support messages, booking notes) goes only to the staff-only tables, never to
//   public.translations (RESEARCH pitfall 3).

export const dynamic = "force-dynamic";

import { asSystem } from "@/lib/db/identity";
import { publicSql } from "@/lib/db/public";
import type { Lang } from "./model";

/** A cached review translation (translation_read). */
export type CachedTranslationRow = {
  translated_text: string | null;
  status: "pending" | "done" | "rejected" | "failed";
  attempts: number;
  updated_at: string;
};

/** The stored row after a machine put: a human row comes back unchanged (origin 'human'). */
export type PutMachineRow = {
  translated_text: string | null;
  origin: "machine" | "human";
  status: "pending" | "done" | "rejected" | "failed";
};

export type ReviewSourceRow = { body: string; language: string | null };
export type ReviewLanguageSourceRow = { body: string; language: string | null; published: boolean };
export type SupportSourceRow = {
  body_text: string;
  direction: "inbound_form" | "outbound_staff" | "inbound_email";
  form_locale: string;
  detected_lang: string | null;
};
export type BookingNoteSourceRow = { note: string; note_hash: string };
export type BacklogRow = { kind: "support" | "note" | "review"; id: string };
export type ExtraLabelMissingRow = { code: string; label_en: string };

/** One target language of a customer-text translation. `body` is null for a rejected answer. */
export type TranslationRowInput = { body: string | null; status: "done" | "rejected" };

/** Per-language results; the definer ignores keys outside en/de/fr/ar. */
export type TranslationRowsInput = Partial<Record<Lang, TranslationRowInput>>;

/** Adds the house-rule version to every entry, the shape the definer reads (`prompt_version`). */
function withPromptVersion(rows: TranslationRowsInput, promptVersion: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [lang, row] of Object.entries(rows)) {
    if (!row) continue;
    out[lang] = { body: row.body, status: row.status, prompt_version: promptVersion };
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Public (vamos_public, cached path)
// ---------------------------------------------------------------------------------------------

/** Cached translation of one public review text (hash from `sourceHash`), or null on a miss. */
export async function readCachedTranslation(
  env: CloudflareEnv,
  hash: string,
  lang: Lang,
): Promise<CachedTranslationRow | null> {
  const sql = publicSql(env);
  const rows = await sql<CachedTranslationRow[]>`select * from public.translation_read(${hash}, ${lang})`;
  return rows[0] ?? null;
}

/** Body and language of the published review behind an opaque ref, or null (unpublished/unknown). */
export async function reviewTranslationSource(env: CloudflareEnv, ref: string): Promise<ReviewSourceRow | null> {
  const sql = publicSql(env);
  const rows = await sql<ReviewSourceRow[]>`select * from public.review_translation_source(${ref})`;
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------------------------
// Public-safe cache writers (vamos_system)
// ---------------------------------------------------------------------------------------------

/** Stores a machine translation; a human row is never overwritten (the returned row is the stored one). */
export const putMachineTranslation = async (
  env: CloudflareEnv,
  args: {
    hash: string;
    sourceLang: string;
    targetLang: Lang;
    sourceText: string;
    text: string;
    context: "review";
    promptVersion: number;
  },
): Promise<PutMachineRow | null> =>
  (
    await asSystem(env, (sql) =>
      sql<PutMachineRow[]>`select * from public.system_translation_put_machine(
        ${args.hash}, ${args.sourceLang}, ${args.targetLang}, ${args.sourceText}, ${args.text},
        ${args.context}, ${args.promptVersion}::int)`,
    )
  )[0] ?? null;

/** Records a rejected or failed attempt (reason code only); never touches a human or done row. */
export const markTranslation = (
  env: CloudflareEnv,
  args: {
    hash: string;
    targetLang: Lang;
    sourceLang: string;
    sourceText: string;
    context: "review";
    status: "rejected" | "failed";
    reason: string;
  },
): Promise<void> =>
  asSystem(env, async (sql) => {
    await sql`select * from public.system_translation_mark(
      ${args.hash}, ${args.targetLang}, ${args.sourceLang}, ${args.sourceText}, ${args.context},
      ${args.status}, ${args.reason})`;
  });

// ---------------------------------------------------------------------------------------------
// Customer support messages (staff-only tables, vamos_system)
// ---------------------------------------------------------------------------------------------

export const supportTranslationSource = async (
  env: CloudflareEnv,
  messageId: string,
): Promise<SupportSourceRow | null> =>
  (
    await asSystem(env, (sql) =>
      sql<SupportSourceRow[]>`select * from public.system_support_translation_source(${messageId}::uuid)`,
    )
  )[0] ?? null;

/** The inbound_form message of a contact submission (the support-form job kind). */
export const supportFormMessageId = async (env: CloudflareEnv, submissionId: string): Promise<string | null> =>
  (
    await asSystem(env, (sql) =>
      sql<{ id: string | null }[]>`select * from public.system_support_form_message_id(${submissionId}::uuid) as id`,
    )
  )[0]?.id ?? null;

/** Stores the detected language and the per-language results; returns the number of rows written. */
export const putSupportTranslation = async (
  env: CloudflareEnv,
  messageId: string,
  detected: string | null,
  rows: TranslationRowsInput,
  promptVersion: number,
): Promise<number> =>
  (
    await asSystem(env, (sql) =>
      sql<{ n: number }[]>`select * from public.system_support_translation_put(
        ${messageId}::uuid, ${detected}, ${sql.json(withPromptVersion(rows, promptVersion) as Parameters<typeof sql.json>[0])}) as n`,
    )
  )[0]?.n ?? 0;

/** DLQ path: marks all four targets failed unless a done row exists. */
export const failSupportTranslation = (env: CloudflareEnv, messageId: string): Promise<void> =>
  asSystem(env, async (sql) => {
    await sql`select * from public.system_support_translation_fail(${messageId}::uuid)`;
  });

// ---------------------------------------------------------------------------------------------
// Booking notes (staff-only table, vamos_system; D-12: stored, no screen yet)
// ---------------------------------------------------------------------------------------------

export const bookingNoteSource = async (env: CloudflareEnv, bookingId: string): Promise<BookingNoteSourceRow | null> =>
  (
    await asSystem(env, (sql) =>
      sql<BookingNoteSourceRow[]>`select * from public.system_booking_note_source(${bookingId}::uuid)`,
    )
  )[0] ?? null;

/** Stores the results for the note with `noteHash`; a stale hash writes nothing (returns 0). */
export const putBookingNoteTranslation = async (
  env: CloudflareEnv,
  bookingId: string,
  detected: string | null,
  noteHash: string,
  rows: TranslationRowsInput,
  promptVersion: number,
): Promise<number> =>
  (
    await asSystem(env, (sql) =>
      sql<{ n: number }[]>`select * from public.system_booking_note_translation_put(
        ${bookingId}::uuid, ${detected}, ${noteHash},
        ${sql.json(withPromptVersion(rows, promptVersion) as Parameters<typeof sql.json>[0])}) as n`,
    )
  )[0]?.n ?? 0;

/** DLQ path for note jobs: four targets failed for that hash; a stale hash or a done row: no write. */
export const failBookingNoteTranslation = (env: CloudflareEnv, bookingId: string, noteHash: string): Promise<void> =>
  asSystem(env, async (sql) => {
    await sql`select * from public.system_booking_note_translation_fail(${bookingId}::uuid, ${noteHash})`;
  });

// ---------------------------------------------------------------------------------------------
// Nightly backlog and reviews (vamos_system)
// ---------------------------------------------------------------------------------------------

/** Ids still needing a job (support messages, booking notes, reviews without a language). Max 200. */
export const translationBacklog = async (env: CloudflareEnv, limit: number): Promise<BacklogRow[]> =>
  [
    ...(await asSystem(env, (sql) =>
      sql<BacklogRow[]>`select * from public.system_translation_backlog(${limit}::int)`,
    )),
  ];

export const reviewLanguageSource = async (
  env: CloudflareEnv,
  reviewId: string,
): Promise<ReviewLanguageSourceRow | null> =>
  (
    await asSystem(env, (sql) =>
      sql<ReviewLanguageSourceRow[]>`select * from public.system_review_language_source(${reviewId}::uuid)`,
    )
  )[0] ?? null;

/** Stores a review's detected ISO 639-1 language. */
export const setReviewLanguage = (env: CloudflareEnv, reviewId: string, lang: string): Promise<void> =>
  asSystem(env, async (sql) => {
    await sql`select * from public.system_review_language_set(${reviewId}::uuid, ${lang})`;
  });

// ---------------------------------------------------------------------------------------------
// Extras (D-02: his typed names win)
// ---------------------------------------------------------------------------------------------

export const extraLabelsMissing = async (env: CloudflareEnv): Promise<ExtraLabelMissingRow[]> =>
  [
    ...(await asSystem(env, (sql) =>
      sql<ExtraLabelMissingRow[]>`select * from public.system_extra_labels_missing()`,
    )),
  ];

/** Fills de/fr/ar names that are empty or machine-written; returns how many languages were written. */
export const fillExtraLabel = async (
  env: CloudflareEnv,
  code: string,
  labels: Partial<Record<"de" | "fr" | "ar", string>>,
): Promise<number> =>
  (
    await asSystem(env, (sql) =>
      sql<{ n: number }[]>`select * from public.system_extra_label_fill(${code}, ${sql.json(labels as Parameters<typeof sql.json>[0])}) as n`,
    )
  )[0]?.n ?? 0;

// ---------------------------------------------------------------------------------------------
// House-rule bump (plan 32-05, F-06): machine cache rows written under an older prompt_version
// ---------------------------------------------------------------------------------------------

export type StaleTranslationRow = { id: string; origin: "machine" | "human"; prompt_version: number | null };
export type StaleTranslationSourceRow = {
  source_hash: string;
  source_lang: string;
  target_lang: string;
  source_text: string;
  context: "review";
};

/** Ids of machine rows older than `promptVersion` (human rows are never listed). Max 200. */
export const staleMachineTranslations = async (
  env: CloudflareEnv,
  promptVersion: number,
  limit: number,
): Promise<StaleTranslationRow[]> =>
  (
    await asSystem(env, (sql) =>
      sql<StaleTranslationRow[]>`select * from public.system_translation_stale(${promptVersion}::int, ${limit}::int)`,
    )
  ).map((r) => ({ id: String(r.id), origin: r.origin, prompt_version: r.prompt_version }));

/** Source of one stale machine row, or null when it is human, current or gone. */
export const staleTranslationSource = async (
  env: CloudflareEnv,
  translationId: string,
  promptVersion: number,
): Promise<StaleTranslationSourceRow | null> =>
  (
    await asSystem(env, (sql) =>
      sql<StaleTranslationSourceRow[]>`select * from public.system_translation_stale_source(${translationId}::bigint, ${promptVersion}::int)`,
    )
  )[0] ?? null;

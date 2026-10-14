// apps/web/lib/translate/jobs-contract.ts
//
// Phase 32: the translate queue message. Privacy rule: customer text never rides on a queue. A job
// names the row to translate by id and nothing else; the consumer reads the text from Postgres. The
// parser accepts only the exact key set of each kind, so a producer that tried to attach `text` (or
// anything else) gets `null` and the message is dropped.
//
// This file is never loaded by the catalog fill runner (plan 32-09), so it may import the logger.

import { log } from "../logger";

/** One translate job. Ids only (T-32-03). */
export type TranslateJob =
  | { v: 1; kind: "support"; messageId: string }
  | { v: 1; kind: "support-form"; submissionId: string }
  | { v: 1; kind: "note"; bookingId: string }
  | { v: 1; kind: "review"; reviewId: string }
  | { v: 1; kind: "extra"; code: string }
  // Plan 32-05: a public-safe review cache row written under an older prompt_version (F-06).
  | { v: 1; kind: "cache"; translationId: string };

export type TranslateJobKind = TranslateJob["kind"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXTRA_CODE = /^[a-z0-9_]{1,40}$/;
/** `public.translations.id` (bigint identity) as a decimal string. */
const TRANSLATION_ID = /^[1-9][0-9]{0,17}$/;

/** The one id field each kind carries, and the rule its value must match. */
const ID_FIELD: Record<TranslateJobKind, { key: string; re: RegExp }> = {
  support: { key: "messageId", re: UUID },
  "support-form": { key: "submissionId", re: UUID },
  note: { key: "bookingId", re: UUID },
  review: { key: "reviewId", re: UUID },
  extra: { key: "code", re: EXTRA_CODE },
  cache: { key: "translationId", re: TRANSLATION_ID },
};

function isKind(x: unknown): x is TranslateJobKind {
  return typeof x === "string" && Object.prototype.hasOwnProperty.call(ID_FIELD, x);
}

/**
 * Parses a queue body into a job. Strict: a plain object, `v === 1`, a known kind, exactly the keys
 * `v`, `kind` and that kind's id field, and an id matching its rule (uuid, `^[a-z0-9_]{1,40}$` for an
 * extra code, a positive decimal integer for a cache row). Anything else returns `null`.
 */
export function parseTranslateJob(body: unknown): TranslateJob | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const proto = Object.getPrototypeOf(body);
  if (proto !== Object.prototype && proto !== null) return null;
  const rec = body as Record<string, unknown>;
  if (rec.v !== 1 || !isKind(rec.kind)) return null;
  const field = ID_FIELD[rec.kind];
  const keys = Object.keys(rec);
  if (keys.length !== 3 || !keys.includes("v") || !keys.includes("kind") || !keys.includes(field.key)) {
    return null;
  }
  const id = rec[field.key];
  if (typeof id !== "string" || !field.re.test(id)) return null;
  // Rebuild, so the returned object holds exactly the contract's keys.
  return { v: 1, kind: rec.kind, [field.key]: id } as TranslateJob;
}

function logEnqueue(reason: "no_queue" | "send_failed" | "invalid_job", kind: string | null): void {
  log(
    "warn",
    "translate_enqueue",
    { requestId: "translate-enqueue", route: "translate:enqueue", locale: null },
    { reason, kind },
  );
}

/**
 * Sends one job to `TRANSLATE_QUEUE`. Never throws. Returns `false` (and logs a reason code with the
 * job kind, never an id or any text) when the binding is missing, the job does not pass
 * `parseTranslateJob`, or `send` fails; the nightly sweep then picks the row up.
 */
export async function sendTranslateJob(
  env: Pick<CloudflareEnv, "TRANSLATE_QUEUE">,
  job: TranslateJob,
): Promise<boolean> {
  const clean = parseTranslateJob(job);
  if (!clean) {
    logEnqueue("invalid_job", null);
    return false;
  }
  const queue = env.TRANSLATE_QUEUE;
  if (!queue) {
    logEnqueue("no_queue", clean.kind);
    return false;
  }
  try {
    await queue.send(clean);
    return true;
  } catch {
    logEnqueue("send_failed", clean.kind);
    return false;
  }
}

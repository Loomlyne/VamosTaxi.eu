// apps/web/lib/translate/model.ts
//
// Phase 32 (D-03): the one place the translator's model id lives. Every caller (extras, customer
// messages, replies, review taps, the catalog fill) goes through `translate.ts`, which calls the Worker
// `AI` binding directly with this id. D-04: there is no AI Gateway route and no gateway constant.
//
// Runtime note (plan 32-09): this file is loaded by plain Node with type stripping, so it uses only
// erasable TypeScript and no path alias.

/** Workers AI model used for every machine translation (Gemma 4, thinking off in the call). */
export const TRANSLATE_MODEL = "@cf/google/gemma-4-26b-a4b-it";

/**
 * House-rule version of the system prompt. Stored with every cached translation, so a bump makes the
 * nightly sweep re-translate machine rows (human rows are never touched).
 */
export const PROMPT_VERSION = 1;

/** The four site languages. */
export const LANGS = ["en", "de", "fr", "ar"] as const;

export type Lang = (typeof LANGS)[number];

/** True when `x` is one of the four site languages. */
export function isLang(x: unknown): x is Lang {
  return typeof x === "string" && (LANGS as readonly string[]).includes(x);
}

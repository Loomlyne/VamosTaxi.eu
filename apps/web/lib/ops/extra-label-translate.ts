// apps/web/lib/ops/extra-label-translate.ts
//
// D-44 on the shared translator (Phase 32, D-03): an extra's English name is translated into de/fr/ar by
// the one Gemma engine (`translateText`) when the owner saves it. Staff edits always win (D-02): a
// language the owner typed is never overwritten by a later translation. Translation failure never blocks
// the save (F-07); the languages that failed stay empty and the nightly fill (`system_extra_label_fill`)
// completes them. No mark is shown on Pricing (D-10).

import { translateText } from "../translate/translate";
import type { AiLike } from "../translate/translate";

export type { AiLike };

export type ExtraLang = "de" | "fr" | "ar";
export const EXTRA_LANGS: readonly ExtraLang[] = ["de", "fr", "ar"];

export const MAX_LABEL = 80;
/** One call returns every missing language; the save waits at most this long. */
const TRANSLATE_TIMEOUT_MS = 10_000;

function clean(text: string): string {
  return text.trim().slice(0, MAX_LABEL).trim();
}

/**
 * Translate an English extra name into `langs` with one engine call. A language that fails (model down,
 * timeout, guard reject) is absent from the result. No throw. Reason codes only in the log.
 */
async function translateExtraName(
  ai: AiLike | null | undefined,
  en: string,
  langs: readonly ExtraLang[],
): Promise<Partial<Record<ExtraLang, string>>> {
  const text = en.trim().slice(0, MAX_LABEL);
  if (!ai || !text || langs.length === 0) return {};
  const out: Partial<Record<ExtraLang, string>> = {};
  try {
    const res = await translateText(ai, { text, from: "en", to: [...langs], timeoutMs: TRANSLATE_TIMEOUT_MS });
    if (!res.ok) {
      console.error("extra_label_translate", res.reason);
      return out;
    }
    for (const lang of langs) {
      const value = res.out[lang];
      if (typeof value === "string" && clean(value)) out[lang] = clean(value);
    }
  } catch {
    console.error("extra_label_translate", "model_error");
  }
  return out;
}

export type ExtraLabelRow = {
  en: string;
  de: string | null;
  fr: string | null;
  ar: string | null;
  machineLangs: ExtraLang[];
};

export type ExtraLabelInput = {
  en: string;
  labels?: Partial<Record<ExtraLang, unknown>>;
};

function staffText(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_LABEL) : "";
}

/**
 * Decide the stored labels. A value the staff typed that differs from what is stored is a staff
 * value (not machine). Machine values are re-translated only when the English name changed or when
 * they are missing. Staff-edited languages are kept.
 */
export async function planExtraLabels(
  ai: AiLike | null | undefined,
  existing: ExtraLabelRow | null,
  input: ExtraLabelInput,
): Promise<ExtraLabelRow> {
  const en = input.en.trim().slice(0, MAX_LABEL);
  const renamed = !existing || existing.en !== en;
  const next: ExtraLabelRow = { en, de: null, fr: null, ar: null, machineLangs: [] };
  const needs: ExtraLang[] = [];
  for (const lang of EXTRA_LANGS) {
    const provided = staffText(input.labels?.[lang]);
    const stored = existing?.[lang] ?? null;
    const storedMachine = existing?.machineLangs.includes(lang) ?? false;
    if (provided && provided !== stored) {
      next[lang] = provided; // staff edit
    } else if (stored && (!storedMachine || !renamed)) {
      next[lang] = stored;
      if (storedMachine) next.machineLangs.push(lang);
    } else {
      needs.push(lang);
    }
  }
  if (needs.length) {
    const tr = await translateExtraName(ai, en, needs);
    for (const lang of needs) {
      const value = tr[lang];
      if (value) {
        next[lang] = value;
        next.machineLangs.push(lang);
      }
    }
  }
  return next;
}

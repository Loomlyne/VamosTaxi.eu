// apps/web/lib/ops/extra-label-translate.ts
//
// D-44: an extra's English name is machine-translated into de/fr/ar with the Cloudflare Workers AI
// binding when the owner saves it. Staff edits always win: a language the owner typed is never
// overwritten by a later translation. Translation failure never blocks the save.

export type ExtraLang = "de" | "fr" | "ar";
export const EXTRA_LANGS: readonly ExtraLang[] = ["de", "fr", "ar"];

/** Minimal shape of the Workers AI binding we use (the real `Ai` type satisfies it). */
export type AiLike = { run: (model: string, input: Record<string, unknown>) => Promise<unknown> };

export const TRANSLATE_MODEL = "@cf/meta/m2m100-1.2b";
export const MAX_LABEL = 80;

const TARGET_NAME: Record<ExtraLang, string> = { de: "german", fr: "french", ar: "arabic" };

function clean(text: string, lang: ExtraLang): string {
  let out = text.trim();
  if (lang === "de") out = out.replace(/ß/g, "ss");
  return out.slice(0, MAX_LABEL).trim();
}

/** Translate an English extra name. A language that fails is absent from the result. No throw. */
export async function translateExtraName(
  ai: AiLike | null | undefined,
  en: string,
): Promise<Partial<Record<ExtraLang, string>>> {
  const text = en.trim().slice(0, MAX_LABEL);
  if (!ai || !text) return {};
  const out: Partial<Record<ExtraLang, string>> = {};
  await Promise.all(
    EXTRA_LANGS.map(async (lang) => {
      try {
        const res = (await ai.run(TRANSLATE_MODEL, {
          text,
          source_lang: "english",
          target_lang: TARGET_NAME[lang],
        })) as { translated_text?: unknown } | null;
        const value = typeof res?.translated_text === "string" ? clean(res.translated_text, lang) : "";
        if (value) out[lang] = value;
      } catch {
        console.error("extra_label_translate", lang);
      }
    }),
  );
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
    const tr = await translateExtraName(ai, en);
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

// packages/emails/src/lib/chauffeur-locale.ts
//
// D-51: first of de, fr, ar, en present in chauffeurs.languages, else en.

import type { EmailLocale } from "./types";

const EMAIL_LOCALES: readonly EmailLocale[] = ["de", "fr", "ar", "en"];

export function chauffeurEmailLocale(
  languages: readonly string[] | null | undefined,
): EmailLocale {
  const set = new Set(
    (languages ?? []).map((code) => code.trim().toLowerCase()).filter(Boolean),
  );
  for (const locale of EMAIL_LOCALES) {
    if (set.has(locale)) return locale;
  }
  return "en";
}

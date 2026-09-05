// packages/emails/src/lib/t.ts
//
// Tiny dotted-key lookup over the four message files. No i18n library.

import type { EmailLocale } from "./types";
import en from "../messages/en.json";
import de from "../messages/de.json";
import fr from "../messages/fr.json";
import ar from "../messages/ar.json";

const TABLES: Record<EmailLocale, Record<string, unknown>> = { en, de, fr, ar };

function flatten(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(out, flatten(value as Record<string, unknown>, path));
    } else if (typeof value === "string") {
      out[path] = value;
    }
  }
  return out;
}

const FLAT: Record<EmailLocale, Record<string, string>> = {
  en: flatten(en),
  de: flatten(de),
  fr: flatten(fr),
  ar: flatten(ar),
};

export function t(
  locale: EmailLocale,
  key: string,
  vars: Record<string, string | number> = {},
): string {
  const table = FLAT[locale] ?? FLAT.en;
  let value = table[key] ?? FLAT.en[key];
  if (value == null) return `{${key}}`;
  for (const [name, replacement] of Object.entries(vars)) {
    value = value.replaceAll(`{${name}}`, String(replacement));
  }
  return value;
}

/** Keys missing from any locale relative to English. Empty list = i18n:check. */
export function coverage(): string[] {
  const enKeys = Object.keys(FLAT.en).sort();
  const missing: string[] = [];
  for (const locale of ["de", "fr", "ar"] as const) {
    const keys = new Set(Object.keys(FLAT[locale]));
    for (const key of enKeys) {
      if (!keys.has(key)) missing.push(`${locale}:${key}`);
    }
    for (const key of keys) {
      if (!FLAT.en[key]) missing.push(`${locale}:extra:${key}`);
    }
  }
  return missing;
}

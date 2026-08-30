import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LOCALES = ["en", "de", "fr", "ar"] as const;
export type EmailLocale = (typeof LOCALES)[number];

type Catalog = Record<string, Record<string, string>>;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../apps/web/i18n/messages");

const catalogs: Record<EmailLocale, Catalog> = {
  en: JSON.parse(readFileSync(resolve(ROOT, "en.json"), "utf8")) as Catalog,
  de: JSON.parse(readFileSync(resolve(ROOT, "de.json"), "utf8")) as Catalog,
  fr: JSON.parse(readFileSync(resolve(ROOT, "fr.json"), "utf8")) as Catalog,
  ar: JSON.parse(readFileSync(resolve(ROOT, "ar.json"), "utf8")) as Catalog,
};

export function t(locale: EmailLocale, ns: string, key: string, params: Record<string, string> = {}): string {
  const raw = catalogs[locale]?.[ns]?.[key] ?? catalogs.en[ns]?.[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (_, name: string) => params[name] ?? "");
}

export function isEmailLocale(value: string): value is EmailLocale {
  return (LOCALES as readonly string[]).includes(value);
}

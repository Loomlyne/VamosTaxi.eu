// Legal pages must not name Vercel (the site runs on Cloudflare) and must not repeat a word
// ("10 years years", "30 days days"). Owner decision 2026-09-30, .planning/decisions/2026-09-30-legal-pages.md #4.
//
// Covers both surfaces: the live mocks (app/pages/*.dc.html, translated by app/vamos-i18n-dict.js)
// and the Next.js pages (apps/web/app/[locale]/*/page.tsx, translated by i18n/messages/*.json).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const PAGES = ["imprint", "privacy", "terms", "cancellation", "cookies"] as const;
const LOCALES = ["en", "de", "fr", "ar"] as const;

const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

/** Visible copy of a mock: markup, scripts, styles and comments removed. */
function mockText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;|&amp;/g, " ");
}

/** Dictionary entries (English key and its de/fr/ar values) from app/vamos-i18n-dict.js. */
function loadDict(): Record<string, Record<string, string>> {
  const sandbox: { window: Record<string, unknown>; document: object } = { window: {}, document: {} };
  vm.runInNewContext(read("app/vamos-i18n-dict.js"), sandbox);
  const i18n = sandbox.window.VamosI18n as { strings: Record<string, Record<string, string>> };
  return i18n.strings;
}

/** Message keys a Next.js legal page renders, e.g. t("…") / tLegal("…"), resolved per namespace. */
function pageMessages(page: string): string[] {
  const src = read(`apps/web/app/[locale]/${page}/page.tsx`);
  const bindings = new Map<string, string>();
  for (const m of src.matchAll(/const (\w+) = await getTranslations\((?:\{[^}]*namespace: )?"(\w+)"/g)) {
    if (m[1] && m[2]) bindings.set(m[1], m[2]);
  }
  const out: string[] = [];
  for (const locale of LOCALES) {
    const messages = JSON.parse(read(`apps/web/i18n/messages/${locale}.json`)) as Record<string, Record<string, string>>;
    for (const m of src.matchAll(/\b(\w+)\("([a-z0-9-]+)"\)/g)) {
      const ns = m[1] ? bindings.get(m[1]) : undefined;
      const value = ns && m[2] ? messages[ns]?.[m[2]] : undefined;
      if (typeof value === "string") out.push(value);
    }
    for (const m of src.matchAll(/(?:titleKey|standfirstKey|kickerKey)[:=]\s*"(\w+)\.([a-z0-9-]+)"/g)) {
      const value = m[1] && m[2] ? messages[m[1]]?.[m[2]] : undefined;
      if (typeof value === "string") out.push(value);
    }
  }
  // Literal JSX copy (processor names, addresses, adviser notes).
  out.push(src.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/\/\/.*$/gm, " "));
  return out;
}

// Case-sensitive, so "Sie sie" (German: you … it) passes. French and German reflexive pronouns
// repeat legitimately ("nous nous appuyons", "vous vous connectez").
const DOUBLED = /(?<![\p{L}\p{N}])([\p{L}]{2,})[ \t]+\1(?![\p{L}\p{N}])/gu;
const GRAMMATICAL_REPEATS = new Set(["nous", "vous"]);

function offences(texts: string[]): string[] {
  const found: string[] = [];
  for (const text of texts) {
    if (/vercel/i.test(text)) found.push(`names Vercel: ${text.trim().slice(0, 120)}`);
    for (const d of text.matchAll(DOUBLED)) {
      if (!GRAMMATICAL_REPEATS.has(d[1] ?? "")) found.push(`doubled word "${d[0]}": ${text.trim().slice(0, 120)}`);
    }
  }
  return found;
}

describe("legal text hygiene", () => {
  const dict = loadDict();

  for (const page of PAGES) {
    it(`${page}: the live mock names no Vercel and repeats no word, in all four languages`, () => {
      const text = mockText(read(`app/pages/${page}.dc.html`));
      const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const translated = lines.flatMap((l) => {
        const entry = dict[l];
        return entry ? [entry.de, entry.fr, entry.ar].filter((v): v is string => typeof v === "string") : [];
      });
      expect(offences([...lines, ...translated])).toEqual([]);
    });

    it(`${page}: the Next.js page names no Vercel and repeats no word, in all four languages`, () => {
      expect(offences(pageMessages(page))).toEqual([]);
    });
  }

  it("catches the two defects the owner reported", () => {
    expect(offences(["start and destination — 10 years years, because"])).toHaveLength(1);
    expect(offences(["Vercel · Website hosting"])).toHaveLength(1);
    expect(offences(["We answer within 30 days; in complex cases up to 60 days more."])).toEqual([]);
  });
});

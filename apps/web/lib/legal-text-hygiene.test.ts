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

// A phrase of two or more words that comes back within a few words, e.g. "up to 24 hours
// before pickup (72 hours for 8+ seats) before pickup" (control session, 2026-09-30).
// Only phrases of real words count: each word 3+ letters, 9+ letters together, so parallel
// grammar ("we do not buy … we do not build", "à la … à la") passes.
const PHRASE_GAP = 8;
// Reviewed repeats that are deliberate. Each needs a reason; add one only after reading the sentence.
const REVIEWED_REPEATS: Record<string, string> = {
  "the difference": "cancellation §03: \"refund the difference — never more than the difference\", deliberate emphasis",
  "die Differenz": "same sentence in German",
  "innerhalb von": "German no-show rule: \"innerhalb von 30 Minuten … am Flughafen innerhalb von 60 Minuten\", two separate limits",
  "nicht wegen": "terms §04 in German: the fixed price does not move \"nicht wegen … nicht wegen …\", a deliberate list",
  "القابلة للطي": "terms §07 in Arabic: foldable bicycles, foldable wheelchairs — two different items",
};

function repeatedPhrase(text: string): string | null {
  for (const sentence of text.split(/(?<=[.!?:;])\s+/)) {
    const words = sentence.match(/[\p{L}\p{M}\p{N}+'’-]+/gu) ?? [];
    for (let i = 0; i + 1 < words.length; i++) {
      const a = words[i] ?? "";
      const b = words[i + 1] ?? "";
      const letters = (w: string) => (w.match(/\p{L}/gu) ?? []).length;
      if (letters(a) < 3 || letters(b) < 3 || letters(a) + letters(b) < 9) continue;
      for (let j = i + 2; j + 1 < words.length && j <= i + 2 + PHRASE_GAP; j++) {
        if (words[j] === a && words[j + 1] === b && !REVIEWED_REPEATS[`${a} ${b}`]) return `${a} ${b}`;
      }
    }
  }
  return null;
}

function offences(texts: string[], { phrases = true }: { phrases?: boolean } = {}): string[] {
  const found: string[] = [];
  for (const text of texts) {
    if (/vercel/i.test(text)) found.push(`names Vercel: ${text.trim().slice(0, 120)}`);
    const phrase = phrases ? repeatedPhrase(text) : null;
    if (phrase) found.push(`repeated phrase "${phrase}": ${text.trim().slice(0, 120)}`);
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
      const texts = pageMessages(page);
      const source = texts.pop() ?? "";
      expect([...offences(texts), ...offences([source], { phrases: false })]).toEqual([]);
    });
  }

  it("catches the two defects the owner reported", () => {
    expect(offences(["start and destination — 10 years years, because"])).toHaveLength(1);
    expect(offences(["Vercel · Website hosting"])).toHaveLength(1);
    expect(offences(["We answer within 30 days; in complex cases up to 60 days more."])).toEqual([]);
    expect(
      offences(["can be changed up to 24 hours before pickup (72 hours for 8+ seats) before pickup, free of charge."]),
    ).toHaveLength(1);
  });
});

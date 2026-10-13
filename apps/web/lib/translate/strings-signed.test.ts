// apps/web/lib/translate/strings-signed.test.ts
//
// Phase 32 (plan 32-04): the signed strings of .planning/phases/32-auto-translate/32-STRINGS.md resolve, character
// for character, through the real app/vamos-i18n-dict.js + app/vamos-locale.js. The signed file is parsed at test time,
// so the test and the signed text cannot drift.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../../..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const LANGS = ["de", "fr", "ar"] as const;

type Pattern = { re: RegExp; de: string; fr: string; ar: string };
type Locale = { t: (s: string, lang?: string) => string };
type Win = Record<string, unknown> & {
  VamosLocale?: Locale;
  VamosI18n?: { strings: Record<string, Record<string, string>>; patterns: Pattern[] };
};

/** A page stub just wide enough for the two runtime scripts to boot; nothing else is faked. */
function loadRuntime(): Win {
  const store: Record<string, string> = {};
  const el = () => ({
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    style: { removeProperty() {}, setProperty() {} },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild() {}, querySelectorAll: () => [], querySelector: () => null, addEventListener() {},
  });
  const document = {
    documentElement: el(), head: el(), body: el(), readyState: "complete", cookie: "",
    addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, createElement: el,
    createTreeWalker: () => ({ nextNode: () => null }), getElementById: () => null,
  };
  const localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = String(v); },
    removeItem: (k: string) => { delete store[k]; },
  };
  const win: Win = {
    document, localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    location: { pathname: "/", search: "", hostname: "localhost" }, navigator: { language: "en" },
    matchMedia: () => ({ matches: false, addEventListener() {} }), setTimeout, clearTimeout,
    CustomEvent: class { type: string; detail: unknown; constructor(t: string, o?: { detail?: unknown }) { this.type = t; this.detail = o?.detail; } },
    MutationObserver: class { observe() {} disconnect() {} }, NodeFilter: { SHOW_TEXT: 4 },
    fetch: () => Promise.reject(new Error("offline")),
  };
  win.window = win;
  const names = ["window", "document", "localStorage", "navigator", "location", "CustomEvent", "MutationObserver", "NodeFilter", "fetch"];
  for (const file of ["vamos-i18n-dict.js", "vamos-locale.js"]) {
    new Function(...names, read(`app/${file}`))(...names.map((n) => win[n]));
  }
  return win;
}

const win = loadRuntime();
const locale = win.VamosLocale!;
const strings = win.VamosI18n!.strings;
const patterns = win.VamosI18n!.patterns;

type Row = { key: string; en: string; de: string; fr: string; ar: string };

/** Every row of the signed tables (key | English | German | French | Arabic). */
function signedRows(): Row[] {
  const rows: Row[] = [];
  for (const line of read(".planning/phases/32-auto-translate/32-STRINGS.md").split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.slice(1, line.lastIndexOf("|")).split("|").map((c) => c.trim());
    if (cells.length !== 5 || cells[0] === "Key" || /^-+$/.test(cells[0]!)) continue;
    rows.push({ key: cells[0]!, en: cells[1]!, de: cells[2]!, fr: cells[3]!, ar: cells[4]! });
  }
  return rows;
}

const rows = signedRows();
const PATTERN_ROW = (r: Row) => r.en.includes("%s");
/** English keys the plan adds (the pattern row and the existing "Try again" are not new dictionary rows). */
const newKeys = rows.filter((r) => !PATTERN_ROW(r) && !r.key.includes("(existing)")).map((r) => r.en);

describe("signed phase 32 strings", () => {
  it("parses the signed file", () => {
    expect(rows.length).toBeGreaterThanOrEqual(15);
    expect(rows.some(PATTERN_ROW)).toBe(true);
  });

  for (const lang of LANGS) {
    it(`every signed string resolves in ${lang} with the signed characters`, () => {
      for (const r of rows) {
        if (PATTERN_ROW(r)) {
          // Language name stays outside the lookup: a dictionary pattern with $1.
          expect(locale.t(r.en.replace("%s", "Deutsch"), lang)).toBe(r[lang].replace("%s", "Deutsch"));
        } else {
          expect(strings[r.en]?.[lang], r.en).toBe(r[lang]);
        }
      }
    });
  }

  it("places the Translated from pattern before the Saved on pattern", () => {
    const idx = (needle: string) => patterns.findIndex((p) => p.re.source.includes(needle));
    expect(idx("Translated from")).toBeGreaterThanOrEqual(0);
    expect(idx("Translated from")).toBeLessThan(idx("Saved on"));
  });

  it("uses no German eszett, vendor, model or machine word in the new strings", () => {
    const values = [
      ...newKeys.flatMap((k) => [k, ...LANGS.map((l) => strings[k]![l]!)]),
      ...rows.flatMap((r) => [r.en, r.de, r.fr, r.ar]),
    ];
    for (const v of values) {
      expect(v, v).not.toMatch(/ß/);
      expect(v, v).not.toMatch(/gemma|google|cloudflare|workers|openai|machine/i);
    }
  });

  it("shares no de, fr or ar translation between different English keys among the new entries", () => {
    for (const lang of LANGS) {
      for (const k of newKeys) {
        const value = strings[k]![lang]!;
        const clash = Object.keys(strings).filter((other) => other !== k && strings[other]?.[lang] === value);
        expect(clash, `${lang}: "${k}" shares its text with ${clash.join(" | ")}`).toEqual([]);
      }
    }
  });
});

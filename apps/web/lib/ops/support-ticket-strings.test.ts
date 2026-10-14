// apps/web/lib/ops/support-ticket-strings.test.ts
//
// Phase 32 plan 10: the page `T` tables (en/de/fr/ar) of OpsSupportTicket.dc.html equal section B of the
// signed 32-STRINGS.md character for character. The signed file is parsed at test time, so the page and
// the file cannot drift apart without this test failing.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const page = readFileSync(join(repoRoot, "app/ops/OpsSupportTicket.dc.html"), "utf8");
const signed = readFileSync(join(repoRoot, ".planning/phases/32-auto-translate/32-STRINGS.md"), "utf8");

const LANGS = ["en", "de", "fr", "ar"] as const;
type Lang = (typeof LANGS)[number];

/** `const T = { … };` cut out by a brace scan that skips quoted strings. */
function tableLiteral(src: string): string {
  const start = src.indexOf("const T = {");
  if (start < 0) throw new Error("const T = { not found");
  const open = src.indexOf("{", start);
  let depth = 0;
  let quote = "";
  for (let i = open; i < src.length; i += 1) {
    const ch = src.charAt(i);
    if (quote) {
      if (ch === "\\") i += 1;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") quote = ch;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  throw new Error("const T literal is not balanced");
}

type Row = { key: string } & Record<Lang, string>;

/** Section B of 32-STRINGS.md: header and separator rows skipped, stops at the next `##`. */
function sectionB(md: string): Row[] {
  const lines = md.split("\n");
  const from = lines.findIndex((l) => l.startsWith("## B."));
  if (from < 0) throw new Error("section B not found");
  const rows: Row[] = [];
  for (let i = from + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.startsWith("##")) break;
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 5) continue;
    if (cells[0] === "Key" || /^-+$/.test(cells[0] ?? "")) continue;
    const key = (cells[0] ?? "").split(/\s+/)[0] ?? "";
    rows.push({ key, en: cells[1] ?? "", de: cells[2] ?? "", fr: cells[3] ?? "", ar: cells[4] ?? "" });
  }
  return rows;
}

const T = vm.runInNewContext("(" + tableLiteral(page) + ")") as Record<Lang, Record<string, string>>;
const rows = sectionB(signed);

describe("OpsSupportTicket page T tables equal 32-STRINGS.md section B", () => {
  it("parses the whole signed table", () => {
    expect(rows.map((r) => r.key)).toEqual([
      "answer", "translatedFrom", "translatedNoLang", "translating", "trNotAvailable", "replyLabel", "replyPh",
      "replyHint", "replyHintSame", "replyHintRaw", "replyUntranslated", "replyReady", "mailTooLong",
    ]);
  });

  for (const lang of LANGS) {
    it(`${lang}: every section B key is on the page, character for character`, () => {
      for (const row of rows) {
        expect(T[lang]?.[row.key], `${lang}.${row.key}`).toBe(row[lang]);
      }
    });

    it(`${lang}: the retired read-only hint is gone`, () => {
      expect(Object.keys(T[lang] ?? {})).not.toContain("mailHint");
    });
  }

  it("names no vendor and no machine mark in any visible table", () => {
    for (const lang of LANGS) {
      const text = Object.values(T[lang] ?? {}).join("\n");
      expect(text, lang).not.toMatch(/gemma|google|cloudflare|machine|maschinell|automatique|آلي/i);
    }
  });
});

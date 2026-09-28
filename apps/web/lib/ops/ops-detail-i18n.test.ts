// apps/web/lib/ops/ops-detail-i18n.test.ts
//
// Phase 26.1-VERIFICATION gap 2 (success criterion 9, four-language law):
// the ops booking detail T table must carry every en key in de, fr and ar.
// A missing key silently falls back to English via
// `Object.assign({}, T.en, T[lang])` in OpsDetail.dc.html. No Hyperdrive, no
// DOM — reads the DC source and parses the object-literal keys statically
// (does not eval the file).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

const dc = read("app/ops/OpsDetail.dc.html");

type Lang = "en" | "de" | "fr" | "ar";
const LANGS: Lang[] = ["en", "de", "fr", "ar"];

// The four language blocks are meta-labelled by their own `lang: {` opener
// (e.g. "\n  de: {"). Excluding those four labels from the extracted key set
// matters: naively slicing each block starts right at its own opener line,
// so a block's own label ("en", "de", "fr", "ar") would otherwise parse as
// a false first "key" of that block.
const META = new Set<string>(LANGS);

function tBlocks(src: string): Record<Lang, string> {
  const start = src.indexOf("const T = {");
  const end = src.indexOf("class Component extends DCLogic", start);
  const body = src.slice(start, end);
  const at = (lang: string) => body.search(new RegExp(`\\n\\s{2}${lang}: \\{`));
  const [en, de, fr, ar] = LANGS.map(at);
  return {
    en: body.slice(en, de),
    de: body.slice(de, fr),
    fr: body.slice(fr, ar),
    ar: body.slice(ar),
  };
}

// Matches `key:'value'` object-literal entries. Every T value in this file
// is a plain quoted string (no arrow functions, no template literals) —
// confirmed by grep before writing this test.
function keysOf(block: string): Set<string> {
  const re = /(?:^|[\s,{])([A-Za-z_][A-Za-z0-9_]*):'/g;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    const key = m[1];
    if (key !== undefined && !META.has(key)) out.add(key);
  }
  return out;
}

function valueOf(block: string, key: string): string | undefined {
  const m = block.match(new RegExp(`(?:^|[\\s,{])${key}:'((?:[^'\\\\]|\\\\.)*)'`));
  return m?.[1];
}

const blocks = tBlocks(dc);
const keys: Record<Lang, Set<string>> = {
  en: keysOf(blocks.en),
  de: keysOf(blocks.de),
  fr: keysOf(blocks.fr),
  ar: keysOf(blocks.ar),
};

describe("OpsDetail T table stays in parity across en, de, fr, ar (26.1-VERIFICATION gap 2)", () => {
  it.each(["de", "fr", "ar"] as const)("%s carries every key present in en", (lang) => {
    const missing = [...keys.en].filter((k) => !keys[lang].has(k));
    expect(missing, `${lang} is missing: ${missing.join(", ")}`).toEqual([]);
  });

  it("no language declares a key that en lacks", () => {
    for (const lang of ["de", "fr", "ar"] as const) {
      const extra = [...keys[lang]].filter((k) => !keys.en.has(k));
      expect(extra, `${lang} has keys en lacks: ${extra.join(", ")}`).toEqual([]);
    }
  });

  it("German values never use ß (Swiss German spelling uses ss)", () => {
    const offending: string[] = [];
    for (const key of keys.de) {
      const value = valueOf(blocks.de, key) ?? "";
      if (value.includes("ß")) offending.push(key);
    }
    expect(offending, `German keys containing ß: ${offending.join(", ")}`).toEqual([]);
  });
});

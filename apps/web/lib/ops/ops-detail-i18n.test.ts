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

/** Index just past the string literal (', " or `) that opens at `i`. */
function skipString(src: string, i: number): number {
  const quote = src[i];
  let j = i + 1;
  while (j < src.length) {
    const c = src[j];
    if (c === "\\") {
      j += 2;
      continue;
    }
    if (c === quote) return j + 1;
    if (quote === "`" && c === "$" && src[j + 1] === "{") {
      // Template substitution: skip to its matching brace, stepping over nested strings.
      let depth = 1;
      j += 2;
      while (j < src.length && depth > 0) {
        const d = src[j];
        if (d === "'" || d === '"' || d === "`") {
          j = skipString(src, j);
          continue;
        }
        if (d === "{") depth += 1;
        else if (d === "}") depth -= 1;
        j += 1;
      }
      continue;
    }
    j += 1;
  }
  return j;
}

// Collects the property names of the first object literal in `block` (depth 1),
// whatever their value form: single- or double-quoted string, template literal,
// arrow or `function` value, or method shorthand. It walks the source instead of
// pattern-matching `key:'`, so string contents ("a: 'b'") and nested objects
// inside function bodies are never read as keys. Quoted keys count too.
function keysOf(block: string): Set<string> {
  const out = new Set<string>();
  let depth = 0;
  let expectKey = false;
  let i = 0;
  const addIfKey = (key: string, after: number) => {
    if (expectKey && depth === 1 && /^\s*[:(]/.test(block.slice(after, after + 64)) && !META.has(key)) {
      out.add(key);
    }
  };
  while (i < block.length) {
    const c = block[i] as string;
    if (c === "/" && block[i + 1] === "/") {
      const nl = block.indexOf("\n", i);
      i = nl === -1 ? block.length : nl;
      continue;
    }
    if (c === "/" && block[i + 1] === "*") {
      const close = block.indexOf("*/", i + 2);
      i = close === -1 ? block.length : close + 2;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      const end = skipString(block, i);
      if (c !== "`") addIfKey(block.slice(i + 1, end - 1), end);
      expectKey = false;
      i = end;
      continue;
    }
    if (c === "{" || c === "(" || c === "[") {
      depth += 1;
      expectKey = depth === 1 && c === "{";
      i += 1;
      continue;
    }
    if (c === "}" || c === ")" || c === "]") {
      depth -= 1;
      if (depth <= 0) break; // the first object literal is closed
      expectKey = false;
      i += 1;
      continue;
    }
    if (c === ",") {
      expectKey = depth === 1;
      i += 1;
      continue;
    }
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    const id = /^[A-Za-z_$][\w$]*/.exec(block.slice(i, i + 128));
    if (id) {
      addIfKey(id[0], i + id[0].length);
      expectKey = false;
      i += id[0].length;
      continue;
    }
    expectKey = false;
    i += 1;
  }
  return out;
}

function valueOf(block: string, key: string): string | undefined {
  const m = block.match(new RegExp(`(?:^|[\\s,{])${key}\\s*:\\s*(['"\`])((?:(?!\\1)[^\\\\]|\\\\.)*)\\1`));
  return m?.[2];
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

  it("extracts keys whose values are double-quoted, template or function valued", () => {
    const fixture = [
      "  en: {",
      "    plain:'Plain', dq:\"Double: 'x', y:'z'\", tpl:`Template ${1 + 1} ${'a:b'}`,",
      "    arrow:(n) => n + ' min', bare: n => n,",
      "    fn:function (n) { return { inner:'x' }; }, method(n) { return n; },",
      "    'quoted':'Q', // note:'comment'",
      "    last : \"Last\"",
      "  },",
      "  de: { other:'no' },",
    ].join("\n");
    expect([...keysOf(fixture)].sort()).toEqual(
      ["arrow", "bare", "dq", "fn", "last", "method", "plain", "quoted", "tpl"].sort(),
    );
    expect(valueOf(fixture, "dq")).toBe("Double: 'x', y:'z'");
    expect(valueOf(fixture, "last")).toBe("Last");
    // The real table still parses: every block yields its keys.
    for (const lang of LANGS) expect(keys[lang].size).toBeGreaterThan(100);
  });
});

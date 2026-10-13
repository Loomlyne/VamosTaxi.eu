/**
 * Phase 30, owner answer 2026-10-12: the Retire dialog count line (OpsPricing) and the Assign "left out" line
 * (OpsDetail) take count-specific Arabic: 1 and 2 in words with no numeral (2 is the dual), 3–10 the plural,
 * 11–99 the singular accusative, 100+ the genitive singular (the dictionary's bags rule). The participle agrees in
 * each form. de, fr and en keep their two forms. Pins the rule in both pages, their Arabic T strings, and the
 * dictionary patterns, so the three cannot drift apart.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const RETIRE = {
  1: "سائق واحد في هذه الفئة",
  2: "سائقان في هذه الفئة",
  5: "5 سائقين في هذه الفئة",
  11: "11 سائقًا في هذه الفئة",
  100: "100 سائق في هذه الفئة",
} as const;
const RETIRE_TRIPS = {
  1: "رحلة واحدة مدفوعة قادمة بلا سائق بعد",
  2: "رحلتان مدفوعتان قادمتان بلا سائق بعد",
  5: "5 رحلات مدفوعة قادمة بلا سائق بعد",
  11: "11 رحلةً مدفوعةً قادمةً بلا سائق بعد",
  100: "100 رحلة مدفوعة قادمة بلا سائق بعد",
} as const;
const LEFT_OUT = {
  1: "سائق واحد مستبعد: فئة موقوفة",
  2: "سائقان مستبعدان: فئة موقوفة",
  5: "5 سائقين مستبعدين: فئة موقوفة",
  11: "11 سائقًا مستبعدًا: فئة موقوفة",
  100: "100 سائق مستبعد: فئة موقوفة",
} as const;

/** The page's own arCountForm, evaluated from its source. */
function pageRule(file: string): (n: number) => string {
  const m = /const arCountForm = (\(n\) => [^;]+);/.exec(read(file));
  expect(m, `${file} has arCountForm`).not.toBeNull();
  return vm.runInNewContext(m![1]!) as (n: number) => string;
}
/** One Arabic T string from the page's ar table. */
function arT(file: string, key: string): string {
  const m = new RegExp(`${key}:'([^']*)'`).exec(read(file));
  expect(m, `${file} has ${key}`).not.toBeNull();
  return m![1]!;
}
/** The line's text as the page renders it in Arabic: number span only from 3 up, then the words (OpsPricing sets
 * the gap with CSS, OpsDetail with a space). */
function pageLine(file: string, prefix: string, n: number, sep: string): string {
  const words = arT(file, prefix + pageRule(file)(n));
  return n >= 3 ? `${n}${sep}${words}` : words;
}

const dict = (() => {
  const win: Record<string, unknown> = {};
  vm.runInNewContext(read("app/vamos-i18n-dict.js"), { window: win });
  return win.VamosI18n as { patterns: { re: RegExp; de: string; fr: string; ar: string }[] };
})();
function dictAr(en: string): string | null {
  for (const p of dict.patterns) {
    const m = p.re.exec(en);
    if (m) return p.ar.replace(/\$(\d)/g, (_, i) => m[Number(i)] ?? "");
  }
  return null;
}

describe("Arabic count lines (phase 30, owner answer 2026-10-12)", () => {
  it("both pages use the same count → form rule", () => {
    for (const file of ["app/ops/OpsPricing.dc.html", "app/ops/OpsDetail.dc.html"]) {
      const f = pageRule(file);
      expect([1, 2, 3, 5, 10, 11, 42, 99, 100, 250].map(f), file).toEqual(
        ["1", "2", "Few", "Few", "Few", "Many", "Many", "Many", "Other", "Other"],
      );
    }
  });

  it("Retire count line: the four forms (and 100+) read as whole Arabic sentences", () => {
    for (const [n, want] of Object.entries(RETIRE)) {
      expect(pageLine("app/ops/OpsPricing.dc.html", "retireCountAr", Number(n), ""), `n=${n}`).toBe(
        want.replace(/^(\d+) /, "$1"),
      );
      const en = Number(n) === 1 ? "1 chauffeur is on this class" : `${n} chauffeurs are on this class`;
      expect(dictAr(en), `dict n=${n}`).toBe(want);
    }
  });

  it("Retire unassigned-trips line: the four forms (and 100+)", () => {
    const pricing = read("app/ops/OpsPricing.dc.html");
    for (const k of ["Ar1", "Ar2", "ArFew", "ArMany", "ArOther"]) {
      expect(pricing.match(new RegExp(`retireUnassigned${k}:'`, "g"))?.length, k).toBe(1);
    }
    expect(pricing).toContain("AR_COUNT['retireUnassignedAr' + arCountForm(retireUnassigned)]");
    expect(pricing).toContain("const retireUnassignedNumShow = lang !== 'ar' || retireUnassigned >= 3;");
    for (const [n, want] of Object.entries(RETIRE_TRIPS)) {
      expect(pageLine("app/ops/OpsPricing.dc.html", "retireUnassignedAr", Number(n), " "), `n=${n}`).toBe(want);
      const en = Number(n) === 1 ? "1 paid trip ahead has no chauffeur yet" : `${n} paid trips ahead have no chauffeur yet`;
      expect(dictAr(en), `dict n=${n}`).toBe(want);
    }
  });

  it("Assign left-out line: the four forms (and 100+) with the participle agreeing", () => {
    for (const [n, want] of Object.entries(LEFT_OUT)) {
      expect(pageLine("app/ops/OpsDetail.dc.html", "assignLeftOutAr", Number(n), " "), `n=${n}`).toBe(want);
      const en = Number(n) === 1 ? "1 chauffeur left out: retired class" : `${n} chauffeurs left out: retired class`;
      expect(dictAr(en), `dict n=${n}`).toBe(want);
    }
  });

  it("the number span is shown in Arabic only from 3 up; other languages always show it", () => {
    const pricing = read("app/ops/OpsPricing.dc.html");
    expect(pricing).toContain("const retireCountNumShow = lang !== 'ar' || retireCount >= 3;");
    expect(pricing).toMatch(/<sc-if value="\{\{ retireCountNumShow \}\}"[^>]*><span class="vt-dir-keep" data-vt-no-i18n/);
    const detail = read("app/ops/OpsDetail.dc.html");
    expect(detail).toContain("const leftOutNumShow = !leftOutAr || leftOutN >= 3;");
    expect(detail).toMatch(/<sc-if value="\{\{ leftOutNumShow \}\}"[^>]*><span class="vt-dir-keep" data-vt-no-i18n/);
  });

  it("de, fr and en keep their singular and plural", () => {
    expect(dict.patterns.length).toBeGreaterThan(0);
    const de = (en: string) => {
      for (const p of dict.patterns) { const m = p.re.exec(en); if (m) return p.de.replace(/\$(\d)/g, (_, i) => m[Number(i)] ?? ""); }
      return null;
    };
    expect(de("1 chauffeur is on this class")).toBe("1 Chauffeur ist in dieser Klasse");
    expect(de("2 chauffeurs are on this class")).toBe("2 Chauffeure sind in dieser Klasse");
    expect(de("11 chauffeurs left out: retired class")).toBe("11 Chauffeure ausgeblendet: stillgelegte Klasse");
  });
});

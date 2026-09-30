// The owner's three Meta texts must stay byte-equal to .planning/decisions/2026-09-30-meta-wording.md
// in the mock (app/vamos-meta-texts.js) and in the Next messages (apps/web/i18n/messages/*.json).
// Canonical form: **x** -> [b]x[/b], `x` -> [code]x[/code]. Strict equality, no trimming.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

const LANGS = ["en", "de", "fr", "ar"] as const;
const SECTIONS = [
  { head: "## 1. Cookie banner", mock: "banner", next: ["cookies", "meta-banner"] },
  { head: "## 2. Cookies page, the Meta row", mock: "cookiesRow", next: ["cookies", "meta-row"] },
  { head: "## 3. Privacy page, the Meta line", mock: "privacyLine", next: ["legal", "meta-privacy-line"] },
] as const;

const decision = read(".planning/decisions/2026-09-30-meta-wording.md");

function sectionText(n: number, lang: string): string {
  const start = decision.indexOf(SECTIONS[n].head);
  const end = n < 2 ? decision.indexOf(SECTIONS[n + 1].head) : decision.length;
  const m = decision.slice(start, end).match(new RegExp(`^\\| ${lang} \\| (.+) \\|$`, "m"));
  if (!m) throw new Error(`no ${lang} row in ${SECTIONS[n].head}`);
  return m[1];
}

const fromMarkdown = (t: string) => t.replace(/\*\*(.+?)\*\*/g, "[b]$1[/b]").replace(/`(.+?)`/g, "[code]$1[/code]");
const fromHtml = (t: string) => t.replace(/<b>(.*?)<\/b>/g, "[b]$1[/b]").replace(/<code>(.*?)<\/code>/g, "[code]$1[/code]");
type Seg = string | { b: string } | { code: string };
const fromSegments = (s: Seg[]) =>
  s.map((x) => (typeof x === "string" ? x : "b" in x ? `[b]${x.b}[/b]` : `[code]${x.code}[/code]`)).join("");

function loadMock(): { texts: Record<string, Record<string, Seg[]>>; segments: (k: string, l: string) => Seg[] } {
  const win: Record<string, unknown> = {};
  vm.runInNewContext(read("app/vamos-meta-texts.js"), { window: win });
  return win.VamosMetaTexts as never;
}

describe("owner Meta texts", () => {
  it("the decision file holds 3 sections x 4 languages", () => {
    for (let n = 0; n < 3; n++) for (const l of LANGS) expect(sectionText(n, l).length).toBeGreaterThan(20);
  });

  describe("mock source", () => {
    const mock = loadMock() as unknown as Record<string, Record<string, Seg[]>> & {
      segments: (k: string, l: string) => Seg[];
    };
    SECTIONS.forEach((s, n) =>
      LANGS.forEach((l) =>
        it(`${s.mock} ${l} equals the decision file`, () => {
          expect(fromSegments(mock[s.mock][l])).toBe(fromMarkdown(sectionText(n, l)));
        }),
      ),
    );
    it("segments() falls back to English", () => {
      expect(mock.segments("banner", "xx")).toBe(mock.banner.en);
    });
  });

  describe("Next messages", () => {
    SECTIONS.forEach((s, n) =>
      LANGS.forEach((l) =>
        it(`${s.next.join(".")} ${l} equals the decision file`, () => {
          const msgs = JSON.parse(read(`apps/web/i18n/messages/${l}.json`));
          expect(fromHtml(msgs[s.next[0]][s.next[1]])).toBe(fromMarkdown(sectionText(n, l)));
        }),
      ),
    );
  });

  it("no key of the mock dictionary is a fragment of an owner text", () => {
    const src = read("app/vamos-i18n-dict.js");
    const keys = [...src.matchAll(/^\s*'((?:[^'\\]|\\.)+)'\s*:\s*\{/gm)].map((m) => m[1].replace(/\\'/g, "'"));
    expect(keys.length).toBeGreaterThan(100);
    const plain = SECTIONS.flatMap((_, n) => LANGS.map((l) => sectionText(n, l).replace(/\*\*|`/g, "")));
    // 'Cookie preferences' is the existing label of the banner link, not a piece of an owner sentence.
    const LABELS = new Set(["Cookie preferences"]);
    const offenders = keys.filter((k) => k.length >= 12 && !LABELS.has(k) && plain.some((p) => p.includes(k)));
    expect(offenders).toEqual([]);
  });
});

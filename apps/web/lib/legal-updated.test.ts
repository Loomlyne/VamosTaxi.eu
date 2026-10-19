// "Last updated" of the legal pages (owner, 2026-10-05, replacing owner decision 14 of 2026-09-30):
// each page shows the day its own text last changed, one line per page in app/vamos-legal-updated.js.
// The date is a display date. The consent version (CONSENT_POLICY_VERSION) is a separate constant
// that stays put, so no visitor is asked for consent again because a legal text changed.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { LEGAL_UPDATED_PAGES, parseLegalUpdated, type LegalUpdatedPage } from "./legal-updated-dates";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

const LANGS = ["en", "de", "fr", "ar"] as const;
const INTL_LOCALE: Record<(typeof LANGS)[number], string> = { en: "en-GB", de: "de-CH", fr: "fr-CH", ar: "ar-u-nu-latn" };
const written = (iso: string, lang: (typeof LANGS)[number]) =>
  new Intl.DateTimeFormat(INTL_LOCALE[lang], { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );

/** Runs the mock helper the way a page does and returns what it puts on window. */
function loadMockHelper() {
  const win: { VamosLegalUpdated?: { iso(page: string): string; label(page: string, lang: string): string } } = {};
  vm.runInNewContext(read("app/vamos-legal-updated.js"), { window: win });
  return win.VamosLegalUpdated!;
}

describe("legal pages Last updated: each page its own day", () => {
  const src = read("app/vamos-legal-updated.js");

  it("has one UPDATED block with a valid ISO date for each of the five legal pages and nothing else", () => {
    expect(src.match(/var UPDATED = \{/g)).toHaveLength(1);
    const dates = parseLegalUpdated(src);
    expect(Object.keys(dates).sort()).toEqual([...LEGAL_UPDATED_PAGES].sort());
  });

  it("no shared ship-day constant and no consent label is left in the display module", () => {
    expect(src).not.toMatch(/var LEGAL_UPDATED\b|var CONSENT_UPDATED\b|consentLabel|consentIso/);
  });

  it("each page's own day: cookies and privacy 2026-10-19 (Meta and Google removed), the rest 2026-10-05", () => {
    // A page's text change moves that page's date and this line together.
    expect(parseLegalUpdated(src)).toEqual({
      cancellation: "2026-10-05",
      cookies: "2026-10-19",
      imprint: "2026-10-05",
      privacy: "2026-10-19",
      terms: "2026-10-05",
    });
  });

  it("the mock helper answers each page's own date in en, de, fr and ar", () => {
    const helper = loadMockHelper();
    const dates = parseLegalUpdated(src);
    for (const page of LEGAL_UPDATED_PAGES) {
      expect(helper.iso(page)).toBe(dates[page]);
      for (const lang of LANGS) {
        const label = helper.label(page, lang);
        expect(label, `${page} ${lang}`).toBe(written(dates[page], lang));
        expect(label).toContain("2026");
      }
    }
    // Two pages with two days print two different dates, so one page cannot borrow another's.
    expect(helper.label("cookies", "en")).not.toBe(helper.label("imprint", "en"));
    expect(helper.label("cookies", "ar")).not.toBe(helper.label("terms", "ar"));
    // A page with no date prints none.
    expect(helper.iso("nonexistent")).toBe("");
    expect(helper.label("nonexistent", "en")).toBe("");
  });

  for (const page of LEGAL_UPDATED_PAGES) {
    it(`${page}: the mock reads its own date through the helper, the Next.js page asks for its date`, () => {
      const mock = read(`app/pages/${page}.dc.html`);
      expect(mock).toContain('<script src="../vamos-legal-updated.js"></script>');
      expect(mock).toContain("{{ updatedLabel }}");
      expect(mock).not.toMatch(/\b\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December) 20\d\d\b/);
      expect(mock).not.toContain("consentLabel");
      const asked = [...mock.matchAll(/VamosLegalUpdated\s*\.\s*label\(\s*'(\w+)'|legalDate\.label\(\s*'(\w+)'/g)].map((m) => m[1] ?? m[2]);
      expect(asked, `${page} mock asks for exactly its own page`).toEqual([page]);
      expect(read(`apps/web/app/[locale]/${page}/page.tsx`)).toMatch(/\n\s+dated\n/);
    });
  }

  it("the Next.js build reads the same block, and LegalPage picks the page's own date", () => {
    const cfg = read("apps/web/next.config.ts");
    expect(cfg).toContain("../../app/vamos-legal-updated.js");
    expect(cfg).toContain("parseLegalUpdated(src)");
    expect(cfg).toContain("LEGAL_UPDATED_BY_PAGE");
    expect(cfg).not.toMatch(/LEGAL_UPDATED_ISO|CONSENT_UPDATED_ISO/);
    const page = read("apps/web/components/legal/LegalPage.tsx");
    expect(page).toContain("process.env.LEGAL_UPDATED_BY_PAGE");
    expect(page).toMatch(/\)\[page\]/);
    expect(page).not.toMatch(/shipDated|consentDated|LEGAL_UPDATED_ISO|CONSENT_UPDATED_ISO/);
  });

  it("the Next.js pages and the mocks print the same date for every page", () => {
    // next.config.ts hands exactly this map to LegalPage; the mocks get the same days from the helper.
    const helper = loadMockHelper();
    const map: Record<LegalUpdatedPage, string> = parseLegalUpdated(src);
    for (const page of LEGAL_UPDATED_PAGES) expect(map[page]).toBe(helper.iso(page));
  });
});

describe("consent version is its own constant", () => {
  it("CONSENT_POLICY_VERSION is set once, in policy.ts (no other test pins its value)", () => {
    const policy = read("apps/web/lib/consent/policy.ts");
    const matches = [...policy.matchAll(/export const CONSENT_POLICY_VERSION\s*=\s*"(\d{4}-\d{2}-\d{2})"/g)];
    expect(matches).toHaveLength(1);
  });

  it("no legal date is derived from the consent version, and the consent version is not derived from a date", () => {
    const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const display = code(read("app/vamos-legal-updated.js"));
    const policy = code(read("apps/web/lib/consent/policy.ts"));
    expect(display).not.toMatch(/CONSENT_POLICY_VERSION|VamosConsent|policy_version/);
    expect(policy).not.toMatch(/vamos-legal-updated|LEGAL_UPDATED|UPDATED\[/);
  });
});

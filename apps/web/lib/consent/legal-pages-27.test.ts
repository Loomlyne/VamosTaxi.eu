// Source pins for the cookies and privacy mocks (27-09): D-14, D-16a, D-29, D-30, D-31.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");
const cookies = read("app/pages/cookies.dc.html");
const privacy = read("app/pages/privacy.dc.html");
const dict = read("app/vamos-i18n-dict.js");

describe("cookies mock (27-09)", () => {
  it("D-16a: no Reset button, no reset line, no reset handler", () => {
    expect(cookies).not.toContain("Reset my choice");
    expect(cookies).not.toContain("Resetting clears");
    expect(cookies).not.toContain("resetConsent");
  });

  it("the current-choice panel reads the server record, not localStorage or a poll", () => {
    expect(cookies).toContain("VamosConsent.state()");
    expect(cookies).toContain("VamosConsent.onChange");
    expect(cookies).not.toContain("localStorage");
    expect(cookies).not.toContain("setInterval");
    expect(cookies).toContain("Change preferences");
  });

  it("D-29: no lead sentence, caption Marketing, one row with the section 2 text", () => {
    expect(cookies).not.toContain("Nothing in this category is running today");
    expect(cookies).toContain("<caption>Marketing</caption>");
    expect(cookies).toContain("this.segs('cookiesRow')");
    expect(cookies).toContain("VamosMetaTexts.segments(key, this.state.lang)");
    const row = cookies.match(/<tr data-cookies-row="1">[\s\S]*?<\/tr>/)?.[0] ?? "";
    expect(row).toContain('colspan="4"');
    expect(row).toContain('data-vt-no-i18n="1"');
    expect(row).not.toContain("data-l=");
    expect(row).not.toContain("data-tok");
  });

  it("D-30: necessary row name and duration, purpose and provider unchanged", () => {
    expect(cookies.split("consent_subject · vamosCookieConsent")).toHaveLength(2);
    const row = cookies.match(/<tr><td data-l="Name"><span class="vt-dir-keep"[^>]*>consent_subject[\s\S]*?<\/tr>/)?.[0] ?? "";
    expect(row).toContain("Records which categories you allowed, so we can prove it and stop asking");
    expect(row).toContain('<td data-l="Provider">Vamos Taxi</td>');
    expect(row).toContain('<td data-l="Duration">1 year</td>');
    expect(dict).toMatch(/'1 year': \{ de: '1 Jahr', fr: '1 an', ar: 'سنة واحدة' \}/);
  });
});

describe("privacy mock (27-09)", () => {
  it("D-14: section 04 ends with the section 3 text, inside data-vt-no-i18n", () => {
    expect(privacy).toContain("this.segs('privacyLine'");
    expect(privacy).toContain("VamosMetaTexts.segments(key, lang)");
    const sec = privacy.match(/<section id="processors">[\s\S]*?<\/section>/)?.[0] ?? "";
    expect(sec).toMatch(/<p data-vt-no-i18n="1" data-privacy-line="1">[\s\S]*<strong[\s\S]*<\/p>\s*<\/section>$/);
    expect(sec.match(/<p data-vt-no-i18n="1" data-privacy-line="1">[\s\S]*<\/p>/)?.[0]).not.toContain("data-tok");
  });

  it("D-31: privacy uses consentLabel", () => {
    expect(privacy).toContain("consentLabel(lang)");
  });
});

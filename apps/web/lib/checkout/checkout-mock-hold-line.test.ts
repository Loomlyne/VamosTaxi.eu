// apps/web/lib/checkout/checkout-mock-hold-line.test.ts
//
// Quick 261015-6om (decision 2026-10-13 item 17, D2; signed as shown 2026-10-15): the design-parity twin of
// checkout, app/pages/checkout.dc.html, carries the hold line under the Pay button and before the terms
// line. The mock reads no settings row, so the hours are a labelled gap (Law 04): a data-tok pill inside
// a no-translate, keep-LTR span. Muted body-xs text from tokens; no new colour, no glow, logical layout.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(__dirname, "../../../..");
const SRC = readFileSync(join(repoRoot, "app/pages/checkout.dc.html"), "utf8");
const LINE =
  '<p data-co-hold-note="1" style="font-family:var(--vt-font-body);font-size:var(--vt-body-xs);color:var(--vt-text-muted);margin:16px 0 0">' +
  '{{ tHoldPre }}<span class="vt-dir-keep" data-vt-no-i18n="1"><span data-tok>price-valid hours</span></span>{{ tHoldPost }}</p>';

describe("checkout.dc.html: the hold line", () => {
  it("sits right after the Pay button block and before the terms line", () => {
    const pay = SRC.indexOf('onClick="{{ pay }}"');
    const line = SRC.indexOf(LINE);
    const terms = SRC.indexOf("{{ tTerms }}");
    expect(pay).toBeGreaterThan(0);
    expect(line).toBeGreaterThan(pay);
    expect(terms).toBeGreaterThan(line);
    expect(SRC.slice(pay, line)).toMatch(/^onClick="\{\{ pay \}\}" hint-size="100%,54px">\{\{ tPayLabel \}\}<\/x-import>\n<\/div>\n$/);
  });

  it("uses tokens only: no new colour, no shadow, no tinted yellow, no physical sides", () => {
    expect(LINE).not.toMatch(/#[0-9a-f]{3,6}|shadow|yellow|left|right/i);
  });

  it("en and de fragments match the Next message wording; renderVals passes them", () => {
    expect(SRC).toContain("holdPre:'This price is held for ', holdPost:' hours.',");
    expect(SRC).toContain("holdPre:'Dieser Preis gilt ', holdPost:' Stunden.',");
    expect(SRC).toContain("tHoldPre: t.holdPre, tHoldPost: t.holdPost,");
    expect(SRC).not.toContain("ß");
  });

  it("the dict carries the pill-free fragments for fr and ar (the page has no fr/ar table)", () => {
    const dict = readFileSync(join(repoRoot, "app/vamos-i18n-dict.js"), "utf8");
    expect(dict).toContain("'This price is held for': { de: 'Dieser Preis gilt', fr: 'Ce prix est maintenu', ar: '");
    expect(dict).toContain("'hours.': { de: 'Stunden.', fr: 'heures.', ar: 'ساعة.' },");
  });
});

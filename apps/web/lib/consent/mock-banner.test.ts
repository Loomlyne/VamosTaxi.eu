// Source pins for the two mock cookie banners (27-06). The mocks are not typed, so the
// promises they make to the consent record are pinned on the source text.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

const PAGES = read("app/pages/CookieBanner.dc.html");
const HOME = read("app/home/CookieBanner.dc.html");
const BOTH: [string, string][] = [
  ["pages", PAGES],
  ["home", HOME],
];

/** The text of a class-field handler from its `name = ` up to the next class member. */
function handler(src: string, name: string): string {
  const start = src.indexOf(`  ${name} = `);
  expect(start, `${name} handler exists`).toBeGreaterThan(-1);
  const rest = src.slice(start + 4);
  const next = rest.search(/\n {2}[A-Za-z_]+(\(| = )/);
  return next === -1 ? rest : rest.slice(0, next);
}

describe("mock cookie banners", () => {
  it("(a) home is the pages banner apart from the cookie policy link path", () => {
    expect(HOME.replace(/\.\.\/pages\/cookies\.dc\.html/g, "cookies.dc.html")).toBe(PAGES);
    expect(HOME).toContain('href="../pages/cookies.dc.html"');
  });

  it.each(BOTH)("(b) %s: no brown yellow, no physical insets, no inline body padding", (_n, src) => {
    expect(src).not.toMatch(/yellow-7/);
    expect(src).not.toMatch(/margin-left/);
    expect(src).not.toMatch(/paddingBottom/);
    const bannerRules = src.match(/\[data-ck-banner\]\{[^}]*\}/g) ?? [];
    expect(bannerRules.length).toBeGreaterThan(0);
    for (const r of bannerRules) expect(r).not.toMatch(/(^|[{;\s])(left|right|bottom):/);
  });

  it.each(BOTH)("(c) %s: Law 01 lines present", (_n, src) => {
    expect(src).toContain("--vt-shadow-accent:none");
    expect(src).toContain(".vt-input--focus{box-shadow:none}");
  });

  it.each(BOTH)("(d) %s: the footer event only opens the sheet", (_n, src) => {
    expect(src).toContain("window.addEventListener('vamos:cookie-prefs', this.openPrefs)");
    const body = handler(src, "openPrefs");
    expect(body).not.toMatch(/save\(|VamosConsent/);
  });

  it.each(BOTH)("(e) %s: Necessary only never waits on Turnstile", (_n, src) => {
    const body = handler(src, "rejectAll");
    expect(body.toLowerCase()).not.toContain("turnstile");
    expect(body).toContain("this.submit(false,");
  });

  it.each(BOTH)("(f) %s: visibility is decided by the server, not by localStorage", (_n, src) => {
    expect(src).not.toMatch(/localStorage/);
    expect(src).toContain("VamosConsent.state()");
    expect(src).toContain("mode: 'unknown'");
  });

  it.each(BOTH)("(g) %s: three writes with the three methods", (_n, src) => {
    const calls = src.match(/VamosConsent\.save\('([a-z_]+)'/g) ?? [];
    expect(calls.map((c) => c.match(/'([a-z_]+)'/)![1]).sort()).toEqual(
      ["accept_all", "reject_all", "settings_change"].sort(),
    );
  });

  it.each(BOTH)("(h) %s: nothing to Meta", (_n, src) => {
    // Built from parts so the legal-gate scan of product files does not find the needles here.
    const needles = ["fbev" + "ents", "facebook" + ".net", "connect." + "facebook", "15955969" + "72063765"];
    for (const needle of needles) expect(src).not.toContain(needle);
  });

  it.each(BOTH)("(i) %s: the six review states are reachable", (_n, src) => {
    const props = src.match(/data-props="([^"]*)"/)![1]!.replace(/&quot;/g, '"');
    const options: string[] = JSON.parse(props).startState.options;
    for (const s of ["banner", "busy", "turnstile", "error-save", "error-check", "prefs", "prefs-saved", "hidden"]) {
      expect(options).toContain(s);
      expect(src.split(`'${s}'`).length - 1).toBeGreaterThanOrEqual(1);
    }
    expect(src).toContain("ck-gallery=1");
  });

  it.each(BOTH)("(j) %s: owner texts come from VamosMetaTexts, the old copy is gone", (_n, src) => {
    expect(src).toContain("VamosMetaTexts.segments");
    expect(src).toContain("../vamos-meta-texts.js");
    expect(src).toContain("../vamos-consent.js");
    expect(src).not.toContain("Strictly necessary cookies keep the booking flow working");
    expect(src).not.toContain("Nothing in this category is running today");
    expect(src).not.toContain("data-lenis-prevent");
  });
});

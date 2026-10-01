// D-14 / D-14a pins for the public DC mocks and the shared dictionary.
// D-14: the line-up is Economy, Business, Van luxury; First is dropped.
// D-14a (owner, 2026-09-28): class names are product names and stay Latin in
// every language, Arabic included (ADR-012, "product names never vary").

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

const PAGES = ["app/home/home.dc.html", "app/pages/manage-booking.dc.html", "app/pages/booking-detail.dc.html"];

describe("public mocks carry the D-14 line-up", () => {
  it("no page names First", () => {
    for (const rel of PAGES) {
      const html = read(rel);
      expect(html, rel).not.toMatch(/'First'|"First"/);
      expect(html, rel).not.toMatch(/exFirst|t\.first\b|first:\s*'/);
    }
  });

  // 26.2 P6 (owner, D9): the customer's change view no longer offers a class (it was never sent).
  it("manage-booking and booking-detail offer no class choice at all", () => {
    for (const rel of PAGES.slice(1)) {
      const html = read(rel);
      expect(html, rel).not.toMatch(/const CLASSES = \[/);
      expect(html, rel).not.toMatch(/vehicle: 'saden'/);
      expect(html, rel).not.toMatch(/id: 'first'/);
    }
  });

  it("home labels the three classes in Latin in all four languages (D-14a)", () => {
    const html = read("app/home/home.dc.html");
    const rows = html.match(/economy:'[^']*', business:'[^']*', van:'[^']*'/g) ?? [];
    expect(rows).toHaveLength(4);
    for (const row of rows) expect(row).toBe("economy:'Economy', business:'Business', van:'Van luxury'");
  });
});

describe("dictionary keeps class names Latin (D-14a)", () => {
  const dict = read("app/vamos-i18n-dict.js");

  it("Economy, Business and Van luxury equal the English in de, fr and ar", () => {
    for (const name of ["Economy", "Business", "Van luxury"]) {
      const entries = dict.match(new RegExp(`^\\s*'${name}': \\{[^\\n]*\\},?$`, "gm")) ?? [];
      expect(entries.length, name).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry).toContain(`de: '${name}'`);
        expect(entry).toContain(`fr: '${name}'`);
        expect(entry).toContain(`ar: '${name}'`);
      }
    }
  });

  it("no Arabic transliteration of the class names is left", () => {
    const ar = read("apps/web/i18n/messages/ar.json");
    for (const src of [dict, ar]) {
      expect(src).not.toMatch(/إيكونومي|اكونومي|بيزنس|بزنس|لاكشري/);
    }
  });

  it("First has no dictionary entry", () => {
    expect(dict).not.toMatch(/^\s*'First': \{/m);
  });
});

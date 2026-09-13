// apps/web/lib/ops/ops-pricing-vat-field.test.ts
//
// Wave 0 (11-01): dual OpsPricing.dc.html VAT field (D-16 D-22).
// readFileSync BOTH copies: VAT 8.1, vat_rate_bps, T.en/de/fr/ar labels,
// byte equality. Stays red until 11-09. Do not edit the DC mocks here.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");
const repoRoot = join(webRoot, "../..");

const CANONICAL = join(repoRoot, "app/ops/OpsPricing.dc.html");
const PUBLIC_COPY = join(webRoot, "public/app/ops/OpsPricing.dc.html");

const LANGS = ["en", "de", "fr", "ar"] as const;

function langBlock(src: string, lang: string): string {
  const start = src.indexOf(`\n  ${lang}: {`);
  if (start < 0) throw new Error(`T.${lang} not found`);
  const open = src.indexOf("{", start);
  let end = src.length;
  for (const other of LANGS) {
    if (other === lang) continue;
    const idx = src.indexOf(`\n  ${other}: {`, open);
    if (idx > open && idx < end) end = idx;
  }
  const closeT = src.indexOf("\n};", open);
  if (closeT > open && closeT < end) end = closeT;
  return src.slice(open, end);
}

describe("OpsPricing VAT field dual copy (D-16 D-22)", () => {
  it("both OpsPricing.dc.html copies exist and are byte-equal", () => {
    expect(existsSync(CANONICAL)).toBe(true);
    expect(existsSync(PUBLIC_COPY)).toBe(true);
    expect(readFileSync(PUBLIC_COPY, "utf8")).toBe(readFileSync(CANONICAL, "utf8"));
  });

  it("shows VAT 8.1 from 81 bps and persists vat_rate_bps", () => {
    const html = readFileSync(CANONICAL, "utf8");
    expect(html).toMatch(/VAT 8\.1|8\.1/);
    expect(html).toContain("vat_rate_bps");
    expect(html).not.toMatch(/7\.7/);
  });

  it("T.en T.de T.fr T.ar each have VAT label, suffix, and error", () => {
    const html = readFileSync(CANONICAL, "utf8");
    for (const lang of LANGS) {
      const block = langBlock(html, lang);
      expect(block.length, `T.${lang}`).toBeGreaterThan(0);
      expect(block, `T.${lang} vatLabel`).toMatch(/vatLabel\s*:/);
      expect(block, `T.${lang} vatSuffix`).toMatch(/vatSuffix\s*:/);
      expect(block, `T.${lang} vatError`).toMatch(/vatError\s*:/);
    }
  });
});

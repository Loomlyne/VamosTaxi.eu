// apps/web/lib/ops/ops-pricing-264.test.ts
//
// Phase 26.4 plan 02: D-16 pricing copy (4 languages) and D-14 dead city-price
// save path removed. Stored city_price_rappen values are never touched.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");
const repoRoot = join(webRoot, "../..");
const read = (p: string) => readFileSync(p, "utf8");
const dc = read(join(repoRoot, "app/ops/OpsPricing.dc.html"));

describe("D-16 emptyRoutesBody copy", () => {
  it("says one row covers both directions in en, de, fr, ar", () => {
    expect(dc).toContain("One row covers A to B and B to A.");
    expect(dc).toContain("Eine Zeile gilt für A nach B und B nach A.");
    expect(dc).toContain("Une ligne vaut pour A vers B et B vers A.");
    expect(dc).toContain("صفّ واحد يغطي من أ إلى ب ومن ب إلى أ.");
  });
  it("drops the contradictory separate-rows sentences", () => {
    expect(dc).not.toContain("separate rows");
    expect(dc).not.toContain("sind getrennte Zeilen");
    expect(dc).not.toContain("sont des lignes séparées");
    expect(dc).not.toContain("صفّان منفصلان");
  });
  it("uses no eszett in the page", () => {
    expect(dc).not.toContain("ß");
  });
});

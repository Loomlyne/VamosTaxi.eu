// apps/web/lib/ops/ops-pricing-source.test.ts
//
// Wave 0 (18-01) + 18-06: dual OpsPricing / OpsSidebar / ops.dc.html /
// vamos-ops-data.js source-read (D-27 D-28 D-31 D-05 D-09 D-10).
// Five tabs, Publish fare book, Discard draft, no /coupons, no charcoal
// placeholder, no minFare, no EUR keys in the DC, clone + overlap/region
// warnings, draft APIs, dual-copy equality.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");
const repoRoot = join(webRoot, "../..");

const PRICING_CANONICAL = join(repoRoot, "app/ops/OpsPricing.dc.html");
const PRICING_PUBLIC = join(webRoot, "public/app/ops/OpsPricing.dc.html");
const SIDEBAR_CANONICAL = join(repoRoot, "app/ops/OpsSidebar.dc.html");
const SIDEBAR_PUBLIC = join(webRoot, "public/app/ops/OpsSidebar.dc.html");
const OPS_CANONICAL = join(repoRoot, "app/ops/ops.dc.html");
const OPS_PUBLIC = join(webRoot, "public/app/ops/ops.dc.html");
const DATA_CANONICAL = join(repoRoot, "app/vamos-ops-data.js");
const DATA_PUBLIC = join(webRoot, "public/app/vamos-ops-data.js");

const FIVE_TABS = [
  "Fixed routes",
  "Distance rules",
  "Surcharges & extras",
  "Coupons",
  "History",
] as const;

const LANGS = ["en", "de", "fr", "ar"] as const;

function byteEqual(a: string, b: string) {
  expect(existsSync(a)).toBe(true);
  expect(existsSync(b)).toBe(true);
  expect(readFileSync(b, "utf8")).toBe(readFileSync(a, "utf8"));
}

describe("OpsPricing source of truth dual copy (D-27 D-28 D-31)", () => {
  it("both OpsPricing.dc.html copies exist and are byte-equal", () => {
    byteEqual(PRICING_CANONICAL, PRICING_PUBLIC);
  });

  it("both OpsSidebar.dc.html copies exist and are byte-equal", () => {
    byteEqual(SIDEBAR_CANONICAL, SIDEBAR_PUBLIC);
  });

  it("ops.dc.html and vamos-ops-data.js dual copies are byte-equal", () => {
    byteEqual(OPS_CANONICAL, OPS_PUBLIC);
    byteEqual(DATA_CANONICAL, DATA_PUBLIC);
  });

  it("names five UI-SPEC tabs and header Publish fare book / Discard draft", () => {
    const html = readFileSync(PRICING_CANONICAL, "utf8");
    for (const label of FIVE_TABS) {
      expect(html, label).toContain(label);
    }
    expect(html).toContain("Publish fare book");
    expect(html).toContain("Discard draft");
  });

  it("D-31: no charcoal placeholder note and no minFare / Minimum fare field", () => {
    const html = readFileSync(PRICING_CANONICAL, "utf8");
    expect(html).not.toMatch(/Every figure here is a placeholder/i);
    expect(html).not.toMatch(/\bminFare\b/);
    expect(html).not.toMatch(/Minimum fare/);
  });

  it("D-28: OpsSidebar has no href /coupons", () => {
    const html = readFileSync(SIDEBAR_CANONICAL, "utf8");
    expect(html).not.toMatch(/href:\s*['"]\/coupons['"]/);
    expect(html).not.toMatch(/href=['"]\/coupons['"]/);
  });

  it("ops.dc.html has no '/coupons' route and dispatcher /pricing is not found", () => {
    const html = readFileSync(OPS_CANONICAL, "utf8");
    expect(html).not.toMatch(/path === ['"]\/coupons['"]/);
    expect(html).not.toMatch(/coupons:\s*['"]\/coupons['"]/);
    expect(html).not.toMatch(/name="OpsCoupons"/);
    expect(html).toMatch(/pricingDenied/);
    expect(html).toMatch(/isNotFound/);
  });

  it("four-language T blocks, Clone into draft, overlap/region Publish warnings, CHF only", () => {
    const html = readFileSync(PRICING_CANONICAL, "utf8");
    for (const lang of LANGS) {
      expect(html, `T.${lang}`).toMatch(new RegExp(`\\n  ${lang}: \\{`));
    }
    expect(html).toContain("Clone into draft");
    expect(html).toMatch(/overlap/i);
    expect(html).toMatch(/region/i);
    expect(html).not.toMatch(/\bEUR\b/);
    expect(html).not.toMatch(/\bUSD\b/);
    expect(html).not.toMatch(/PATCH['"],\s*['"]\/api\/staff\/settings/);
  });

  it("vamos-ops-data.js wires draft publish/discard/preview/clone and never preferDraft", () => {
    const src = readFileSync(DATA_CANONICAL, "utf8");
    expect(src).toMatch(/cloneIntoDraft/);
    expect(src).toMatch(/rate-versions\/.*\/clone/);
    expect(src).toMatch(/rate-versions\/.*\/publish/);
    expect(src).toMatch(/rate-versions\/.*\/discard/);
    expect(src).toMatch(/rate-book\/preview/);
    expect(src).toMatch(/rate-book\/test-unpaid/);
    expect(src).not.toMatch(/preferDraft\s*[:=]\s*true/);
    expect(src).not.toMatch(/createCheckoutSession/);
    expect(src).not.toMatch(/sk_live_/);
  });
});

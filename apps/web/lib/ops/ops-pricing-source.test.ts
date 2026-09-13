// apps/web/lib/ops/ops-pricing-source.test.ts
//
// Wave 0 (18-01): dual OpsPricing + OpsSidebar source-read (D-27 D-28 D-31).
// readFileSync BOTH copies: five tabs, Publish fare book, no /coupons,
// no charcoal placeholder, no minFare. Stays red until 18-06. Do not edit the DC mocks here.

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

const FIVE_TABS = [
  "Fixed routes",
  "Distance rules",
  "Surcharges & extras",
  "Coupons",
  "History",
] as const;

describe("OpsPricing source of truth dual copy (D-27 D-28 D-31)", () => {
  it("both OpsPricing.dc.html copies exist and are byte-equal", () => {
    expect(existsSync(PRICING_CANONICAL)).toBe(true);
    expect(existsSync(PRICING_PUBLIC)).toBe(true);
    expect(readFileSync(PRICING_PUBLIC, "utf8")).toBe(
      readFileSync(PRICING_CANONICAL, "utf8"),
    );
  });

  it("both OpsSidebar.dc.html copies exist and are byte-equal", () => {
    expect(existsSync(SIDEBAR_CANONICAL)).toBe(true);
    expect(existsSync(SIDEBAR_PUBLIC)).toBe(true);
    expect(readFileSync(SIDEBAR_PUBLIC, "utf8")).toBe(
      readFileSync(SIDEBAR_CANONICAL, "utf8"),
    );
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
});

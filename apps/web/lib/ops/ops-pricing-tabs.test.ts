// apps/web/lib/ops/ops-pricing-tabs.test.ts
//
// Wave 0 (18-01): OpsPricing four tabs, no History, no Preview, no region
// table (D-11 D-12 D-17 D-25). Dual-DC byte-equal. May stay red until 18-03.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");
const repoRoot = join(webRoot, "../..");

const CANONICAL = join(repoRoot, "app/ops/OpsPricing.dc.html");
const PUBLIC_COPY = join(webRoot, "public/app/ops/OpsPricing.dc.html");

function paneKeys(html: string): string[] {
  const start = html.indexOf("const PANES = [");
  expect(start).toBeGreaterThanOrEqual(0);
  const open = html.indexOf("[", start);
  const close = html.indexOf("];", open);
  const body = html.slice(open, close);
  return [...body.matchAll(/key:'(\w+)'/g)].map((m) => m[1]!);
}

describe("OpsPricing tabs (D-11 D-12 D-17 D-25)", () => {
  it("both OpsPricing.dc.html copies exist and are byte-equal", () => {
    expect(existsSync(CANONICAL)).toBe(true);
    expect(existsSync(PUBLIC_COPY)).toBe(true);
    expect(readFileSync(PUBLIC_COPY, "utf8")).toBe(
      readFileSync(CANONICAL, "utf8"),
    );
  });

  it("PANES has exactly four keys: routes, distance, surcharges, coupons", () => {
    const keys = paneKeys(readFileSync(CANONICAL, "utf8"));
    expect(keys).toEqual(["routes", "distance", "surcharges", "coupons"]);
  });

  it("does not contain History / Preview / region / night-weekend-holiday kinds", () => {
    const html = readFileSync(CANONICAL, "utf8");
    expect(html).not.toContain("tabHistory");
    expect(html).not.toContain("runPreview");
    expect(html).not.toContain("testUnpaid");
    expect(html).not.toContain("regionRows");
    expect(html).not.toContain("saveRegion");
    expect(html).not.toMatch(/kind:\s*['"]night['"]/);
    expect(html).not.toMatch(/kind:\s*['"]weekend['"]/);
    expect(html).not.toMatch(/kind:\s*['"]holiday['"]/);
    expect(html).toContain("Save VAT");
    expect(html).toContain("Draft — not public until Publish");
    expect(html).toContain("Live book");
    expect(html).toContain("Fix this");
    expect(html).toContain("place to place");
    expect(html).toContain("canton to canton");
    expect(html).toContain("photoKind:'class'");
    expect(html).toContain("SURCHARGE_TYPES");
    expect(html).not.toContain("ruleRows");
  });
});

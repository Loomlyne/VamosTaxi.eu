// apps/web/lib/pricing/public-live-book-board.test.ts
//
// Wave 0 (18-01): public / checkout / quote offer lists must not hardcode a
// four-class ladder (D-29 D-31). Stays red until 18-02 kills the catalogs.
// Do not invent CHF. Do not Publish.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readCheckoutPageSource } from "../../tests/support/checkout-sources";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");
const repoRoot = join(webRoot, "../..");

function repo(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

function web(rel: string): string {
  return readFileSync(join(webRoot, rel), "utf8");
}

describe("public live-book board catalogs (D-29 D-31)", () => {
  it("home.dc.html does not keep VEHICLE_CLASSES = [ as the offer list", () => {
    const src = repo("app/home/home.dc.html");
    expect(src).not.toMatch(/VEHICLE_CLASSES\s*=\s*\[/);
  });

  it("BookingBoard.tsx does not keep a four-tuple offer catalog", () => {
    const src = web("components/home/BookingBoard.tsx");
    expect(src).not.toMatch(/VEHICLE_CLASSES\s*=\s*\[/);
    expect(src).not.toMatch(
      /CLASS_SLUGS\s*=\s*\[\s*"economy"\s*,\s*"business"\s*,\s*"first"\s*,\s*"van"\s*\]/,
    );
  });

  it("the checkout page files do not keep CLASS_SLUGS four-tuple", () => {
    const src = readCheckoutPageSource();
    expect(src).not.toMatch(
      /CLASS_SLUGS\s*=\s*\[\s*"economy"\s*,\s*"business"\s*,\s*"first"\s*,\s*"van"\s*\]/,
    );
  });

  it("intent.ts does not close IntentVehicleClass to the four-tuple", () => {
    const src = web("lib/quote/intent.ts");
    expect(src).not.toMatch(
      /IntentVehicleClass\s*=\s*"economy"\s*\|\s*"business"\s*\|\s*"first"\s*\|\s*"van"/,
    );
  });

  it("quote/schema.ts does not close VEHICLE_CLASS_VALUES to economy/business/van", () => {
    const src = web("lib/quote/schema.ts");
    expect(src).not.toMatch(
      /VEHICLE_CLASS_VALUES\s*=\s*\[\s*"economy"\s*,\s*"business"\s*,\s*"van"\s*\]/,
    );
  });

  it("rate-book route does not keep KNOWN_CLASS_SLUGS four-tuple", () => {
    const src = web("app/[locale]/(ops)/api/staff/rate-book/route.ts");
    expect(src).not.toMatch(
      /KNOWN_CLASS_SLUGS\s*=\s*\[\s*"economy"\s*,\s*"business"\s*,\s*"first"\s*,\s*"van"\s*\]/,
    );
  });

  it("GET /api/quote paints the live book and never a draft", () => {
    const src = web("app/api/quote/route.ts");
    expect(src).toMatch(/export async function GET/);
    expect(src).toContain("liveBookBoard");
    expect(src).toContain("publicCatalogRoutes");
    expect(src).toContain("preferDraft: false");
    expect(src).not.toMatch(/preferDraft:\s*true/);
  });
});

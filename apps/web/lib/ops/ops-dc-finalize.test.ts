// apps/web/lib/ops/ops-dc-finalize.test.ts
//
// Fingerprints for the 10 #settings comments + 06-12 leftover. No Hyperdrive.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");
const repoRoot = join(webRoot, "../..");

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

describe("Phase 6 finalize — four classes and staff hash", () => {
  it("uses Economy, Business, First, Van everywhere", () => {
    const data = read("app/vamos-ops-data.js");
    expect(data).toMatch(
      /VEHICLE_CLASSES = \["Economy", "Business", "First", "Van"\]/,
    );
    const rateBook = readFileSync(
      join(webRoot, "app/[locale]/(ops)/api/staff/rate-book/route.ts"),
      "utf8",
    );
    expect(rateBook).toMatch(
      /CLASS_KEYS = \["economy", "business", "first", "van"\]/,
    );
    const fleet = read("app/ops/OpsFleet.dc.html");
    expect(fleet).toMatch(/'Economy', 'Business', 'First', 'Van'/);
  });

  it("Staff rail goes to #staff and hides company save on that pane", () => {
    const sidebar = read("app/ops/OpsSidebar.dc.html");
    const settings = read("app/ops/OpsSettings.dc.html");
    expect(sidebar).toMatch(/href:'#staff'/);
    expect(settings).toMatch(/location\.hash = '#staff'/);
    expect(settings).toMatch(/actionsShow: pane === 'staff' \? 'none' : 'flex'/);
  });

  it("fleet photo is a chooser, chauffeur association, nested add-chauffeur", () => {
    const fleet = read("app/ops/OpsFleet.dc.html");
    const table = read("app/ops/OpsTable.dc.html");
    expect(fleet).toMatch(/choosePhoto/);
    expect(fleet).toMatch(/fChauffeurs/);
    expect(fleet).toMatch(/chauffeurIds|nested-title|on-nested-save/);
    expect(table).toMatch(/nestedOpen|nested-title|\[data-vt-photo\]/);
  });

  it("pricing distance rules and surcharge codes are structured", () => {
    const pricing = read("app/ops/OpsPricing.dc.html");
    expect(pricing).toMatch(/distanceRows|SURCHARGE_CODES/);
    expect(pricing).toMatch(/night|weekend|holiday/);
  });

  it("dates are a calendar editor and currency labels stay ISO", () => {
    const table = read("app/ops/OpsTable.dc.html");
    const brand = read("app/ops/BrandSelect.dc.html");
    expect(table).toMatch(/f\.editor === 'date'/);
    expect(table).toMatch(/type="date"/);
    expect(brand).toMatch(/isoCur|data-vt-no-i18n/);
  });

  it("ops login does not treat a failed invite claim as a bad password", () => {
    const auth = read("app/ops/AuthForm.dc.html");
    expect(auth).toMatch(/try \{ await this\.claimOpsInvite\(\); \} catch \(e\) \{\}/);
    expect(auth).toMatch(/location\.replace\('\/'\);/);
    expect(auth).not.toMatch(
      /if \(await this\.claimOpsInvite\(\)\) \{ location\.replace\('\/'\); return; \}/,
    );
  });

  it("syncs ops sibling .dc twins so Cloudflare html_handling cannot serve stale objects", () => {
    const sync = read("scripts/sync-dc-mock-to-public.mjs");
    expect(sync).toMatch(/name\.endsWith\("\.dc\.html"\)/);
    expect(sync).toMatch(/name\.slice\(0, -5\)/);
  });
});

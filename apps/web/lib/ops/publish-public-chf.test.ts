// apps/web/lib/ops/publish-public-chf.test.ts
//
// Wave 0 (11-01): Publish-as-flip source proof (D-18).
// Staff POST /api/staff/rate-versions/:id/publish is the DC path.
// Both publish paths UPDATE settings.public_chf = true in the same asStaff
// transaction as status='live'. PRICING_PREVIEW must not set public_chf.
// public_chf = true assertions stay red until 11-04.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");
const repoRoot = join(webRoot, "../..");

function webSource(rel: string): string {
  return readFileSync(join(webRoot, rel), "utf8");
}

function repoSource(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

const PUBLISH_ROUTE =
  "app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route.ts";
const PUBLISH_ACTIONS = "app/[locale]/(ops)/ops/pricing/actions.ts";
const PUBLISH_REEXPORT = "app/api/staff/rate-versions/[id]/publish/route.ts";

describe("Publish-as-flip public_chf (D-18)", () => {
  it("staff POST route the DC calls requires withAdmin and asStaff", () => {
    const publish = webSource(PUBLISH_ROUTE);
    expect(publish).toMatch(/withAdmin/);
    expect(publish).toMatch(/asStaff/);
    expect(publish).toMatch(/export async function POST/);
    expect(webSource(PUBLISH_REEXPORT)).toMatch(
      /\[locale\]\/\(ops\)\/api\/staff\/rate-versions\/\[id\]\/publish\/route/,
    );
  });

  it("publishRateVersion requires requireAdminClaims and asStaff", () => {
    const actions = webSource(PUBLISH_ACTIONS);
    expect(actions).toMatch(/export async function publishRateVersion/);
    expect(actions).toMatch(/requireAdminClaims/);
    expect(actions).toMatch(/asStaff/);
  });

  it("DC OpsPricing still POSTs /api/staff/rate-versions/:id/publish", () => {
    const html = repoSource("app/ops/OpsPricing.dc.html");
    expect(html).toMatch(
      /\/api\/staff\/rate-versions\/'\s*\+\s*id\s*\+\s*'\/publish/,
    );
  });

  it("staff POST updates public_chf = true in the same asStaff tx as status live", () => {
    const publish = webSource(PUBLISH_ROUTE);
    expect(publish).toMatch(/status = 'live'/);
    expect(publish).toMatch(
      /asStaff\([\s\S]*status = 'live'[\s\S]*public\.settings[\s\S]*public_chf\s*=\s*true/,
    );
    expect(publish).not.toMatch(/PRICING_PREVIEW/);
  });

  it("publishRateVersion updates public_chf = true in the same asStaff tx as status live", () => {
    const actions = webSource(PUBLISH_ACTIONS);
    expect(actions).toMatch(/status = 'live'/);
    expect(actions).toMatch(
      /asStaff\([\s\S]*status = 'live'[\s\S]*public\.settings[\s\S]*public_chf\s*=\s*true/,
    );
    expect(actions).not.toMatch(/PRICING_PREVIEW/);
  });

  it("PRICING_PREVIEW string is absent from the public_chf UPDATE", () => {
    const publish = webSource(PUBLISH_ROUTE);
    const actions = webSource(PUBLISH_ACTIONS);
    const publicChfUpdate =
      /update[\s\S]{0,120}public\.settings[\s\S]{0,120}public_chf\s*=\s*true/;
    expect(publish).toMatch(publicChfUpdate);
    expect(actions).toMatch(publicChfUpdate);
    const publishUpdate = publish.match(publicChfUpdate)?.[0] ?? "";
    const actionsUpdate = actions.match(publicChfUpdate)?.[0] ?? "";
    expect(publishUpdate).not.toMatch(/PRICING_PREVIEW/);
    expect(actionsUpdate).not.toMatch(/PRICING_PREVIEW/);
  });
});

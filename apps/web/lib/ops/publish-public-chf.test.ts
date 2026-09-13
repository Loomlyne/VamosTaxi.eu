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

  it("D-03: same asStaff tx applies vat_rate_bps from the rate_versions row", () => {
    const publish = webSource(PUBLISH_ROUTE);
    expect(publish).toMatch(
      /asStaff\([\s\S]*public_chf\s*=\s*true[\s\S]*vat_rate_bps/,
    );
    expect(publish).toMatch(/vat_rate_bps = coalesce\(/);
    expect(publish).not.toMatch(/PRICING_PREVIEW/);
  });

  it("D-06: forkLiveRateVersion runs in the same tx after public_chf", () => {
    const publish = webSource(PUBLISH_ROUTE);
    expect(publish).toMatch(/forkLiveRateVersion/);
    expect(publish).toMatch(
      /asStaff\([\s\S]*public_chf\s*=\s*true[\s\S]*forkLiveRateVersion/,
    );
    expect(publish).not.toMatch(/function unpublish/i);
    expect(publish).not.toMatch(/export async function DELETE/);
    expect(publish).not.toMatch(/set\s+status\s*=\s*'draft'/i);
  });

  it("D-09: fork copies hide, classed bands, rules, coupons, and draft VAT/lock", () => {
    const fork = webSource("lib/ops/rate-book.ts");
    expect(fork).toMatch(/export async function forkLiveRateVersion/);
    expect(fork).toMatch(/hide_from_public/);
    expect(fork).toMatch(/vehicle_class_id, from_km, to_km, per_km_rappen/);
    expect(fork).toMatch(/rate_version_rules/);
    expect(fork).toMatch(/insert into public\.coupons/);
    expect(fork).toMatch(
      /vat_rate_bps, quote_lock_minutes, service_area_geojson/,
    );
    expect(fork).toMatch(/free_wait_minutes, max_extra_stops/);
    expect(fork.match(/export async function fork/g)?.length).toBe(1);
  });

  it("dual-mount publish route remains export { POST }", () => {
    const reexport = webSource(PUBLISH_REEXPORT);
    expect(reexport).toMatch(/export const dynamic = "force-dynamic"/);
    expect(reexport).toMatch(/export \{ POST \}/);
    expect(reexport).not.toMatch(/export async function POST/);
  });

  it("D-07: Publish is withAdmin, not withStaff", () => {
    const publish = webSource(PUBLISH_ROUTE);
    expect(publish).toMatch(/withAdmin/);
    expect(publish).not.toMatch(/withStaff/);
    expect(publish).toMatch(/jsonFail\("incomplete", 409, gaps\)/);
  });

  it("D-07: last-write-wins returns not-draft with the gaps envelope", () => {
    const publish = webSource(PUBLISH_ROUTE);
    expect(publish).toMatch(/not-draft/);
    expect(publish).toMatch(
      /if \(classified\.kind === "frozen"\) return "not-draft";/,
    );
    expect(publish).toMatch(
      /classified\.kind === "frozen"[\s\S]*if \(gaps\.length > 0\) return "incomplete"/,
    );
    expect(publish).toMatch(/ok: false, code, gaps/);
    expect(publish).toMatch(/row\.status !== "draft"/);
  });

  it("D-09: no unpublish and no DELETE of history rows", () => {
    const publish = webSource(PUBLISH_ROUTE);
    expect(publish).not.toMatch(/function unpublish/i);
    expect(publish).not.toMatch(/export async function DELETE/);
    expect(publish).not.toMatch(/delete from public\.rate_versions/i);
    expect(publish).not.toMatch(/set\s+status\s*=\s*'draft'/i);
  });
});

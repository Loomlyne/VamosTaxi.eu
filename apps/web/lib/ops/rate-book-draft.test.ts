// apps/web/lib/ops/rate-book-draft.test.ts
//
// 18-05 Task 1: overlay Save is draft-only (D-01 D-04 D-18 D-20).
// Source-read: withAdmin, CHF only, kind band accepted, quote-lock hours×60.
// Do not write public_chf. Do not call Stripe.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");

function webSource(rel: string): string {
  return readFileSync(join(webRoot, rel), "utf8");
}

const ROUTE = "app/[locale]/(ops)/api/staff/rate-book/route.ts";
const REEXPORT = "app/api/staff/rate-book/route.ts";

describe("rate-book overlay Save is draft (D-01 D-04 D-18 D-20)", () => {
  it("PUT and DELETE stay withAdmin so dispatcher cannot mutate (D-07)", () => {
    const src = webSource(ROUTE);
    expect(src).toMatch(/export const PUT = withAdmin/);
    expect(src).toMatch(/export const DELETE = withAdmin/);
    expect(src).toMatch(/export const GET = withStaff/);
    expect(src).toMatch(/resolveWritableVersionId/);
  });

  it("moneyFromRappen is CHF only — no EUR / USD / AED keys (D-18)", () => {
    const src = webSource(ROUTE);
    expect(src).toMatch(/function moneyFromRappen\(rappen: number \| null\): \{ CHF: string \}/);
    expect(src).not.toMatch(/\bEUR\b/);
    expect(src).not.toMatch(/\bUSD\b/);
    expect(src).not.toMatch(/\bAED\b/);
  });

  it("accepts kind band, rule, coupon on the writable draft; rejects region (D-17)", () => {
    const src = webSource(ROUTE);
    expect(src).toMatch(
      /\["route", "distance", "band", "surcharge", "rule", "coupon"\]/,
    );
    expect(src).not.toMatch(/kind === "region"/);
    expect(src).toMatch(/if \(kind === "band"\)/);
    expect(src).toMatch(/insert into public\.distance_bands/);
    expect(src).not.toMatch(/insert into public\.region_premiums/);
    expect(src).toMatch(/insert into public\.rate_version_rules/);
  });

  it("converts quote-lock hours to minutes at the staff boundary (D-20)", () => {
    const src = webSource(ROUTE);
    expect(src).toMatch(/function quoteLockMinutesFromHours/);
    expect(src).toMatch(/return n \* 60;/);
    expect(src).toMatch(/set quote_lock_minutes = \$\{lockMinutes\}/);
    expect(src).toMatch(/set quote_lock_minutes = \$\{minutes\}/);
  });

  it("blocks Save route without Mapbox From and To (D-17)", () => {
    const src = webSource(ROUTE);
    expect(src).toMatch(/if \(!hasMapboxFromTo\(recBody\)\) return jsonErr\("mapbox", 400\)/);
  });

  it("hydrates bands, rules, region premiums and zones on GET payload", () => {
    const src = webSource(ROUTE);
    expect(src).toMatch(/bands: mockBands\(book\)/);
    expect(src).toMatch(/regionPremiums: mockRegionPremiums\(book, zones\)/);
    expect(src).toMatch(/rules: mockRules\(book\)/);
    expect(src).toMatch(/zones: mockZones\(zones\)/);
    expect(src).toMatch(/ruleId: row.ruleId == null \? "" : String\(row.ruleId\)/);
  });

  it("deletes every class row on a From/To pair, not only the grouped id", () => {
    const src = webSource(ROUTE);
    expect(src).toMatch(/\(origin_zone_id, dest_zone_id\) in \(/);
    expect(src).toMatch(/select origin_zone_id, dest_zone_id/);
  });

  it("writes surcharge without requiring a rules-table row (D-34)", () => {
    const src = webSource(ROUTE);
    expect(src).toMatch(/ruleId: optionalId\(body\.ruleId \?\? body\.rule_id\)/);
    expect(src).not.toMatch(/if \(parsed\.ruleId == null\) return jsonErr\("invalid", 400\)/);
    expect(src).toMatch(/rule_id = \$\{parsed\.ruleId\}/);
  });

  it("dual-mount re-exports GET PUT DELETE", () => {
    const reexport = webSource(REEXPORT);
    expect(reexport).toMatch(/export const dynamic = "force-dynamic"/);
    expect(reexport).toMatch(/export \{ GET, PUT, DELETE \}/);
  });

  it("does not write public_chf or call Stripe", () => {
    const src = webSource(ROUTE);
    expect(src).not.toMatch(/public_chf/);
    expect(src).not.toMatch(/stripe/i);
    expect(src).not.toMatch(/from "postgres"/);
  });
});

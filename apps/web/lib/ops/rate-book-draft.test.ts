// apps/web/lib/ops/rate-book-draft.test.ts
//
// 18-05 Task 1: overlay Save is draft-only (D-01 D-04 D-18 D-20).
// Source-read: withAdmin, CHF only, kind band refused, quote-lock whole hours×60 on the draft only.
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

  it("accepts kind rule (book setting) and coupon on the writable draft; rejects band and region", () => {
    const src = webSource(ROUTE);
    expect(src).toMatch(/\["route", "distance", "surcharge", "rule", "coupon"\]/);
    expect(src).not.toMatch(/kind === "region"/);
    expect(src).not.toMatch(/kind === "band"/);
    // Decision 2026-10-13 items 10, 13: no km band, region % or Rules-list table is touched.
    expect(src).not.toMatch(/distance_bands|region_premiums|rate_version_rules|rule_id/);
    expect(src).toMatch(/if \(kind === "coupon"\)/);
    expect(src).toMatch(/couponInputFromDc\(recBody\)/);
    expect(src).toMatch(/insertCoupon\(env, claims, parsed, versionId\)/);
    expect(src).toMatch(/if \(err instanceof CouponInputError\) return jsonErr\(err\.key, 400\)/);
  });

  it("quote lock: whole hours to minutes, one writer, draft only (decision 2026-10-13 item 13; 24 h cap signed 2026-10-15)", () => {
    const src = webSource(ROUTE);
    expect(src).toMatch(/import \{ quoteLockMinutesFromWholeHours \} from "@\/lib\/ops\/quote-lock-hours";/);
    const helper = webSource("lib/ops/quote-lock-hours.ts");
    expect(helper).toMatch(/export function quoteLockMinutesFromWholeHours/);
    expect(helper).toMatch(/const minutes = n \* 60;/);
    expect(helper).toMatch(/export const QUOTE_LOCK_MAX_MINUTES = 1440;/);
    expect(helper).toMatch(/return quoteLockMinutesWithinCap\(minutes\) \? minutes : null;/);
    expect(src.match(/set quote_lock_minutes = /g)?.length).toBe(1);
    expect(src).toMatch(
      /set quote_lock_minutes = \$\{setting\.minutes\}\s+where id = \$\{versionId\} and status = 'draft'/,
    );
    expect(src).not.toMatch(/function quoteLockMinutesFromHours|function minutesFromHours/);
  });

  it("blocks Save route without Mapbox From and To (D-17)", () => {
    const src = webSource(ROUTE);
    expect(src).toMatch(/if \(!hasMapboxFromTo\(recBody\)\) return jsonErr\("mapbox", 400\)/);
    expect(src).toMatch(/ensureMapboxZone/);
    expect(src).toMatch(/insert into public\.service_zones/);
  });

  it("GET payload: zones and a never-empty quoteLockHours; no bands, region premiums, rules, ruleId, cityPairId", () => {
    const src = webSource(ROUTE);
    expect(src).toMatch(/zones: mockZones\(zones\)/);
    expect(src).toMatch(
      /quoteLockHours: String\(\(book\.quoteLockMinutes \?\? QUOTE_LOCK_MINUTES\) \/ 60\)/,
    );
    expect(src).not.toMatch(/mockBands|mockRegionPremiums|mockRules|regionPremiums|ruleId|cityPair/);
  });

  it("deletes every class row on a From/To pair, not only the grouped id", () => {
    const src = webSource(ROUTE);
    expect(src).toMatch(/\(origin_zone_id, dest_zone_id\) in \(/);
    expect(src).toMatch(/select origin_zone_id, dest_zone_id/);
  });

  it("writes surcharge without any rules-table link (D-34; rule_id dropped 2026-10-13 item 13)", () => {
    const src = webSource(ROUTE);
    expect(src).not.toMatch(/ruleId|rule_id/);
    expect(src).toMatch(/predicate, quantity_source\n/);
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

  it("D-15: CHF 0 start fare parses through rappen helper, not as a gap", () => {
    const src = webSource(ROUTE);
    expect(src).toMatch(/from "@\/lib\/ops\/rappen"/);
    expect(src).not.toMatch(/if \(value === 0\) return null/);
    expect(src).not.toMatch(/n === 0\) return null/);
  });

  it("edits a class already on the draft by vehicleClassId when the row id is from the previous book", () => {
    const src = webSource(ROUTE);
    expect(src).toMatch(/function findExistingDistanceRate/);
    expect(src).toMatch(/findExistingDistanceRate\(book, id, parsed\.vehicleClassId\)/);
    expect(src).toMatch(/planVehicleClassWrite/);
    expect(src).toMatch(/insert into public\.vehicle_classes \(\s*id, slug, passenger_capacity/);
  });

  it("does not UPDATE a photo-minted class id that is not in vehicle_classes", () => {
    const src = webSource(ROUTE);
    expect(src).toMatch(/classPlan\.mode === "insert"/);
    expect(src).toMatch(/fk-missing/);
    expect(src).not.toMatch(/if \(!vehicleClassId && slug\)/);
  });

  it("distance Save returns the full book so a forked class id cannot duplicate the Distance row", () => {
    const src = webSource(ROUTE);
    expect(src).toMatch(/const payload = bookPayload\(next, zones\);\s*return jsonOk\(payload\);/);
    expect(src).not.toMatch(/payload\.rates\.find\(\(row\) => row\.vehicleClassId === vehicleClassId\)/);
  });

  it("writes VAT onto the draft rate_versions row, not as a rules insert (D-12)", () => {
    const src = webSource(ROUTE);
    expect(src).toMatch(/if \(ruleKind === "vat"\)/);
    expect(src).toMatch(/set vat_rate_bps = \$\{setting\.bps\}/);
    expect(src).toMatch(/where id = \$\{versionId\} and status = 'draft'/);
  });

  it("Fixed route prices are the rated class slugs, not a hardcoded four-ladder", () => {
    const src = webSource(ROUTE);
    expect(src).toMatch(/\.\.\.prices,/);
    expect(src).not.toMatch(/economy: moneyFromRappen\(byClass\.get\("economy"\)/);
    expect(src).toMatch(/distanceRates\.some\(\(row\) => row\.vehicleClassId === c\.id\)/);
  });

  it("class reorder writes sort_order only and does not flip active or hide_from_public", () => {
    const src = webSource(ROUTE);
    const start = src.indexOf("function persistClassOrder");
    const end = src.indexOf("export const PUT", start);
    const fn = src.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(fn).toContain("set sort_order");
    expect(fn).not.toContain("set active");
    expect(fn).not.toContain("hide_from_public");
    expect(src).toContain('kind === "distance" && recBody.reorder === true');
  });
});

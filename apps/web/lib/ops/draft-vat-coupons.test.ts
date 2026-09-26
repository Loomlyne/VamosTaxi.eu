// apps/web/lib/ops/draft-vat-coupons.test.ts
//
// 18-05 Task 2: VAT PATCH is not live; coupons/classes wait for Publish.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { couponInputFromDc } from "./coupons";
import { CH_VAT_RATE_BPS } from "../checkout/vat";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");

function webSource(rel: string): string {
  return readFileSync(join(webRoot, rel), "utf8");
}

describe("settings PATCH does not write vat_rate_bps (D-03)", () => {
  it("omits vat_rate_bps from the settings UPDATE", () => {
    const src = webSource("app/[locale]/(ops)/api/staff/settings/route.ts");
    expect(src).toMatch(/update public\.settings set/);
    expect(src).not.toMatch(/vat_rate_bps = \$\{parsed\.vat_rate_bps\}/);
    expect(src).toMatch(/vatRateBps: settings\.vat_rate_bps/);
    expect(src).toMatch(/vat_rate_bps: current\.vat_rate_bps/);
  });

  it("vat.ts fallback stays 81", () => {
    expect(CH_VAT_RATE_BPS).toBe(81);
    const vat = webSource("lib/checkout/vat.ts");
    expect(vat).toMatch(/export const CH_VAT_RATE_BPS = 81/);
  });
});

describe("coupons wait for Publish (D-34)", () => {
  it("couponInputFromDc can produce amountRappen other than null", () => {
    const input = couponInputFromDc({ code: "OFF10", kind: "amount", value: "10" });
    expect(input.amountRappen).toBe(1000);
    expect(input.amountRappen).not.toBeNull();
  });

  it("POST is withAdmin and insert carries rate_version_id", () => {
    const route = webSource("app/[locale]/(ops)/api/staff/coupons/route.ts");
    expect(route).toMatch(/export const POST = withAdmin/);
    expect(route).toMatch(/insertCoupon/);
    expect(route).toMatch(/resolveWritableDraftId/);
    const lib = webSource("lib/ops/coupons.ts");
    expect(lib).toMatch(/rate_version_id/);
  });

  it("staff can list captured coupon uses from /api/staff/coupons/redemptions", () => {
    const locale = webSource("app/[locale]/(ops)/api/staff/coupons/redemptions/route.ts");
    const reexport = webSource("app/api/staff/coupons/redemptions/route.ts");
    expect(locale).toMatch(/export const GET = withStaff/);
    expect(locale).toMatch(/loadCouponRedemptions/);
    expect(reexport).toMatch(/export \{ GET \}/);
    const lib = webSource("lib/ops/coupons.ts");
    expect(lib).toMatch(/from public\.coupon_redemptions r/);
    expect(lib).toMatch(/p\.captured_at is not null/);
    expect(lib).toMatch(/r\.released_at is null/);
    expect(lib).toMatch(/b\.contact_email/);
    expect(lib).toMatch(/c\.email::text/);
    expect(lib).toMatch(/s\.subtotal_rappen/);
    expect(lib).toMatch(/s\.total_rappen/);
    expect(locale).toMatch(/beforeRappen/);
    expect(reexport).toMatch(/beforeRappen/);
  });
});

describe("vehicle-classes POST on the draft (D-19)", () => {
  it("locale route and app/api/staff re-export both include POST", () => {
    const locale = webSource("app/[locale]/(ops)/api/staff/vehicle-classes/route.ts");
    const reexport = webSource("app/api/staff/vehicle-classes/route.ts");
    expect(locale).toMatch(/export const POST = withAdmin/);
    expect(locale).toMatch(/insertVehicleClassOnDraft/);
    expect(locale).toMatch(/in-use/);
    expect(reexport).toMatch(/export \{ GET, PATCH, POST, DELETE \}/);
  });
});

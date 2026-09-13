// apps/web/lib/ops/phone-booking.test.ts
//
// 08-06: public pay URL + file proofs. No Hyperdrive.
// Do not import app/api/**/route.ts.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PUBLIC_SITE_ORIGIN,
  clientSecretHex,
  emailLocale,
  payLinkVehicleSlug,
  publicPayUrl,
} from "./phone-booking-map";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

describe("publicPayUrl", () => {
  it("is vamostaxi.site, never dashboard", () => {
    expect(PUBLIC_SITE_ORIGIN).toBe("https://vamostaxi.site");
    expect(publicPayUrl("en", "tok")).toBe("https://vamostaxi.site/checkout/pay/tok");
    expect(publicPayUrl("de", "tok")).toBe("https://vamostaxi.site/de/checkout/pay/tok");
    expect(publicPayUrl("en", "tok")).not.toMatch(/dashboard/);
  });
});

describe("payLinkVehicleSlug", () => {
  it("maps known classes and defaults to economy", () => {
    expect(payLinkVehicleSlug("Business")).toBe("business");
    expect(payLinkVehicleSlug("VAN")).toBe("van");
    expect(payLinkVehicleSlug("nope")).toBe("economy");
  });
});

describe("clientSecretHex / emailLocale", () => {
  it("hex-encodes UTF-8 and clamps locale", () => {
    expect(clientSecretHex("ab")).toBe("6162");
    expect(emailLocale("de")).toBe("de");
    expect(emailLocale("xx")).toBe("en");
  });
});

describe("08-06 phone booking file proofs", () => {
  it("New trip is /bookings/new quote-first, no cash/PayPal/hourly", () => {
    const shell = read("app/ops/ops.dc.html");
    expect(shell).toMatch(/\/bookings\/new/);
    expect(shell).toMatch(/isNewTrip/);
    expect(shell).toMatch(/route: 'newTrip'/);
    const board = read("app/ops/OpsBoard.dc.html");
    expect(board).toMatch(/\/bookings\/new/);
    expect(board).not.toMatch(/addTick: \(s\.addTick \|\| 0\) \+ 1/);
    const form = read("app/ops/OpsNewTrip.dc.html");
    expect(form).toMatch(/\/api\/quote/);
    expect(form).toMatch(/\/api\/checkout\/intent/);
    expect(form).not.toMatch(/paypal/i);
    expect(form).not.toMatch(/hourly/i);
    expect(form).not.toMatch(/cash to driver/i);
    expect(form).not.toMatch(/mode: 'return'/);
    expect(form).not.toMatch(/location\.hash/);
    const data = read("app/vamos-ops-data.js");
    expect(data).not.toMatch(/function emptyBookings/);
  });

  it("staff pay-link reuses sendPayLink + existing session, asCheckout, public origin", () => {
    const src = read("apps/web/lib/ops/phone-booking.ts");
    expect(src).toMatch(/sendPayLink/);
    expect(src).toMatch(/asCheckout/);
    expect(src).toMatch(/setPayLink/);
    expect(src).toMatch(/vamostaxi\.site/);
    expect(src).not.toMatch(/createCheckoutSession/);
    expect(src).not.toMatch(/asStaff/);
    expect(src).not.toMatch(/:6543/);
    expect(src).toMatch(/is_test/);
    expect(src).toMatch(/is-test/);
    const ops = read("apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/pay-link/route.ts");
    const pub = read("apps/web/app/api/staff/bookings/[id]/pay-link/route.ts");
    expect(ops).toMatch(/withStaff/);
    expect(ops).toMatch(/staffPayLink/);
    expect(pub).toMatch(/export \{ POST \}/);
    const detail = read("app/ops/OpsDetail.dc.html");
    expect(detail).toMatch(/\/pay-link/);
    expect(detail).toMatch(/Take card/);
    expect(detail).toMatch(/js\.stripe\.com\/v3/);
  });

  it("i18n dict has New trip in four languages", () => {
    const dict = read("app/vamos-i18n-dict.js");
    expect(dict).toMatch(/'New trip':/);
    expect(dict).toMatch(/'Send pay-link':/);
    expect(dict).toMatch(/'Take card':/);
  });
});

describe("D-25 phone booking + snapshot CHF", () => {
  it("OpsNewTrip quotes then posts checkout intent; public preferDraft stays false", () => {
    const form = read("app/ops/OpsNewTrip.dc.html");
    expect(form).toMatch(/\/api\/quote/);
    expect(form).toMatch(/\/api\/checkout\/intent/);
    const engine = read("apps/web/lib/quote/engine.ts");
    expect(engine).toMatch(
      /preferDraft\s*=\s*dashboardHost\s*&&\s*env\.PRICING_PREVIEW\s*===\s*"true"/,
    );
    expect(engine).toMatch(/pricing_live/);
    expect(engine).toMatch(/public_chf/);
  });

  it("ops detail shows snapshot totalRappen and has no dispatcher amount override", () => {
    const detail = read("app/ops/OpsDetail.dc.html");
    expect(detail).toMatch(/totalRappen/);
    expect(detail).not.toMatch(/amount_rappen\s*=/);
    expect(detail).not.toMatch(/chargedRappen\s*=/);
    const map = read("apps/web/lib/ops/bookings-map.ts");
    expect(map).toMatch(/snapshot_total_rappen/);
    expect(map).not.toMatch(/paid \? rappen\(row\.charged_rappen\) : 0/);
  });
});

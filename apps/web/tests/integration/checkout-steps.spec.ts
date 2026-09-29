// apps/web/tests/integration/checkout-steps.spec.ts
//
// Source contract for D-29 / D-30 / D-31: the three old step URLs still exist
// only to forward to the one-page checkout, and home hands the trip over in the
// URL. Does not spawn Next, Docker, or Supabase — file bytes only.

import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { WEB_ROOT } from "../support/server-harness";

const REPO = join(WEB_ROOT, "..", "..");

test.describe("checkout step URLs @checkout-steps", () => {
  test("the three old step routes forward to the one page and are not DC mocks", () => {
    for (const step of ["trip", "details", "payment"]) {
      const file = join(WEB_ROOT, `app/[locale]/checkout/${step}/page.tsx`);
      expect(existsSync(file)).toBe(true);
      const src = readFileSync(file, "utf8");
      expect(src).toContain("redirect(checkoutForwardPath(");
    }

    const mw = readFileSync(join(WEB_ROOT, "middleware.ts"), "utf8");
    const block = /const DC_PAGES: Record<string, string> = \{([\s\S]*?)\};/.exec(mw);
    expect(block?.[1]).toBeTruthy();
    expect(block![1]).not.toMatch(/["']\/checkout/);
    expect(mw).toContain('"/confirmation"');
  });

  test("home hands the trip to /checkout in the URL and never prices", () => {
    const home = readFileSync(join(REPO, "app/home/home.dc.html"), "utf8");
    expect(home).toContain("location.assign(prefix + '/checkout?'");
    expect(home).not.toContain("fetch('/api/quote'");
    expect(home).not.toContain("confirmation.dc.html");
  });

  test("the old multi-step client and its routes are gone", () => {
    for (const rel of [
      "app/[locale]/checkout/CheckoutClient.tsx",
      "app/[locale]/checkout/PaymentPanel.tsx",
      "lib/checkout/vamos-trip.ts",
      "app/api/checkout/abandon/route.ts",
      "app/api/checkout/requote/route.ts",
    ]) {
      expect(existsSync(join(WEB_ROOT, rel)), rel).toBe(false);
    }
  });
});

// apps/web/tests/integration/checkout-steps.spec.ts
//
// Plan 07-12. Source contract for D-29 / D-30. Does not spawn Next, Docker,
// or Supabase — file bytes only.

import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { WEB_ROOT } from "../support/server-harness";

const REPO = join(WEB_ROOT, "..", "..");

test.describe("checkout step URLs @checkout-steps", () => {
  test("three Next routes exist and are not DC mocks", () => {
    const trip = join(WEB_ROOT, "app/[locale]/checkout/trip/page.tsx");
    const details = join(WEB_ROOT, "app/[locale]/checkout/details/page.tsx");
    const payment = join(WEB_ROOT, "app/[locale]/checkout/payment/page.tsx");
    expect(existsSync(trip)).toBe(true);
    expect(existsSync(details)).toBe(true);
    expect(existsSync(payment)).toBe(true);
    expect(readFileSync(trip, "utf8")).toContain('step="trip"');
    expect(readFileSync(details, "utf8")).toContain('step="details"');
    expect(readFileSync(payment, "utf8")).toContain('step="payment"');

    const mw = readFileSync(join(WEB_ROOT, "middleware.ts"), "utf8");
    const block = /const DC_PAGES: Record<string, string> = \{([\s\S]*?)\};/.exec(mw);
    expect(block?.[1]).toBeTruthy();
    expect(block![1]).not.toMatch(/["']\/checkout/);
    expect(mw).toContain('"/confirmation"');
  });

  test("Home Continue lands on /checkout/trip after a real quote lock", () => {
    const home = readFileSync(join(REPO, "app/home/home.dc.html"), "utf8");
    expect(home).toContain("fetch('/api/quote'");
    expect(home).toContain("/checkout/trip");
    expect(home).not.toContain("confirmation.dc.html");
    const pick = /pick\(id\) \{[\s\S]*?badgeEl\(code, glyph\)/.exec(home);
    expect(pick?.[0]).toBeTruthy();
    expect(pick![0]).toContain("s.quote.lock");
    expect(pick![0]).toContain("s.quote.quote_id");
    expect(pick![0]).toContain("location.href = prefix + '/checkout/trip'");
    expect(pick![0]).not.toMatch(/location\.href = ['"]\/checkout['"]/);
  });

  test("StepIndicator can link the three checkout URLs", () => {
    const src = readFileSync(join(WEB_ROOT, "components/navigation/StepIndicator.tsx"), "utf8");
    expect(src).toContain("href?: string");
    const client = readFileSync(join(WEB_ROOT, "app/[locale]/checkout/CheckoutClient.tsx"), "utf8");
    expect(client).toContain('checkoutStepPath("trip")');
    expect(client).toContain('checkoutStepPath("details")');
    expect(client).toContain('checkoutStepPath("payment")');
    expect(client).not.toMatch(/checkoutStepQuote|PayPal|paypal|cash|hourly/);
  });
});

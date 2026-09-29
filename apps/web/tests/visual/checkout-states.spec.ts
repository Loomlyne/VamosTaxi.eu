// apps/web/tests/visual/checkout-states.spec.ts
//
// Plan 26.3-19, Task 1. Reviewer gallery (@component): every state of PayBar, DisclosureRow
// and ExtraRow side by side, at the project viewport (1440 and 390 are the reviewer sizes)
// in English and Arabic. The page is generated in this Node process by mountPort from a
// test-only component (tests/support/CheckoutStatesGallery.tsx); it is never a Worker route.

import { test, expect, type Page } from "../support/test";
import { mountPort } from "../support/mock-harness";
import { waitForMockReady } from "../support/mock-harness";

const GALLERY = "apps/web/tests/support/CheckoutStatesGallery.tsx";

async function box(page: Page, selector: string) {
  const b = await page.locator(selector).first().boundingBox();
  if (!b) throw new Error(`no box for ${selector}`);
  return b;
}

for (const lang of ["en", "ar"] as const) {
  test(`checkout parts gallery, every state (${lang}) @component`, async ({ page }, testInfo) => {
    const url = await mountPort(GALLERY, { lang });
    await page.goto(url);
    await waitForMockReady(page);

    // Default, disabled, loading, error, no-class and updating bars all render.
    for (const key of ["idle", "disabled", "loading", "error", "no-class", "updating"]) {
      await expect(page.locator(`[data-gallery-bar="${key}"] [data-co-pay-bar="bar"]`)).toHaveCount(1);
    }
    await expect(page.locator('[data-gallery-bar="error"] .vt-alert--danger')).toHaveCount(1);
    await expect(page.locator('[data-gallery-bar="loading"] .vt-copay__spin')).toHaveCount(1);
    await expect(page.locator('[data-gallery-bar="disabled"] [data-co-pay]')).toBeDisabled();
    await expect(page.locator('[data-gallery-bar="loading"] [data-co-pay]')).toBeDisabled();
    await expect(page.locator('[data-gallery-bar="idle"] [data-co-pay]')).toBeEnabled();
    await expect(page.locator('[data-gallery-bar="no-class"] [data-co-total-note]')).toHaveCount(1);

    // One polite live region per bar.
    await expect(page.locator('[data-gallery-bar="idle"] [aria-live="polite"]')).toHaveCount(1);

    // 54px PAY (bar and rail), 44px disclosure and extra rows.
    expect((await box(page, '[data-gallery-bar="idle"] [data-co-pay]')).height).toBeCloseTo(54, 0);
    expect((await box(page, '[data-gallery-rail="idle"] [data-co-pay]')).height).toBeCloseTo(54, 0);
    expect((await box(page, ".vt-codisc__head")).height).toBeGreaterThanOrEqual(44);
    expect((await box(page, ".vt-coextra")).height).toBeGreaterThanOrEqual(44);

    // Rail: block PAY spans the rail; reassurance shows.
    const rail = await box(page, '[data-gallery-rail="idle"] .vt-copay');
    const railPay = await box(page, '[data-gallery-rail="idle"] [data-co-pay]');
    expect(railPay.width).toBeGreaterThan(rail.width - 4);
    await expect(page.locator('[data-gallery-rail="idle"] .vt-copay__reassure')).toHaveCount(1);

    // Disclosure: collapsed is aria-expanded=false with a hidden panel, open is true with a visible one.
    await expect(page.locator("#g-company-button")).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#g-company-panel")).toBeHidden();
    await expect(page.locator("#g-note-button")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("[data-gallery-open-panel]")).toBeVisible();

    // The chevron of the open row is turned half a circle.
    const turn = await page.locator("#g-note-button .vt-codisc__chevron").evaluate((el) => getComputedStyle(el).transform);
    expect(turn).toMatch(/matrix\(-1, .*0, -1/);

    // Extras: four states, amount at the inline end (right in LTR, left in RTL).
    for (const state of ["unchecked", "checked", "updating", "disabled"]) {
      await expect(page.locator(`[data-co-extra][data-state="${state}"]`)).toHaveCount(1);
    }
    const row = await box(page, '[data-co-extra="child-seat"]');
    const amount = await box(page, '[data-co-extra="child-seat"] [data-co-extra-amount]');
    if (lang === "ar") expect(amount.x).toBeLessThan(row.x + row.width / 2);
    else expect(amount.x).toBeGreaterThan(row.x + row.width / 2);

    // No sideways scroll and no glow: shadows are neutral tokens only.
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    const width = page.viewportSize()!.width;
    expect(scrollW).toBeLessThanOrEqual(width);
    const glow = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[data-gallery] *")).filter((el) => {
        const s = getComputedStyle(el).boxShadow;
        return s !== "none" && /253,\s*194,\s*11/.test(s);
      }).length,
    );
    expect(glow).toBe(0);

    await testInfo.attach(`gallery-${lang}-${width}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  });
}

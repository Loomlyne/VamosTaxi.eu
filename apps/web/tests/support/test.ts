/**
 * Shared Playwright test export (26.0 D-06).
 *
 * SiteHeader.css switches the open-menu scrim alpha on `prefers-reduced-transparency`.
 * GitHub's macOS runner reports `reduce`, the owner's Mac reports `no-preference`, so the
 * darwin baselines only match here when the feature is pinned. Playwright has no option for
 * it, so it goes through CDP. Every spec imports { test, expect } from this file, and any
 * spec that calls page.emulateMedia must use the `emulateMedia` exported here instead
 * (Playwright's own call resets the CDP features). Pages made with browser.newContext()
 * must call pinReducedTransparency(page).
 */
import { test as base, type CDPSession, type Page } from "@playwright/test";

export * from "@playwright/test";

const sessions = new WeakMap<Page, CDPSession>();

type Feature = { name: string; value: string };

async function sendFeatures(page: Page, features: Feature[]): Promise<void> {
  let cdp = sessions.get(page);
  if (!cdp) {
    cdp = await page.context().newCDPSession(page);
    sessions.set(page, cdp);
  }
  await cdp.send("Emulation.setEmulatedMedia", { features });
}

/** Pins `prefers-reduced-transparency: reduce` on the page. */
export async function pinReducedTransparency(page: Page): Promise<void> {
  await sendFeatures(page, [{ name: "prefers-reduced-transparency", value: "reduce" }]);
}

/** page.emulateMedia plus a re-pin, keeping reduced motion if it was asked for. */
export async function emulateMedia(
  page: Page,
  options: Parameters<Page["emulateMedia"]>[0],
): Promise<void> {
  await page.emulateMedia(options);
  const features: Feature[] = [{ name: "prefers-reduced-transparency", value: "reduce" }];
  if (options?.reducedMotion) {
    features.push({ name: "prefers-reduced-motion", value: options.reducedMotion });
  }
  await sendFeatures(page, features);
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await pinReducedTransparency(page);
    await use(page);
  },
});

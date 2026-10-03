// 261003 contact button (owner-signed direction B): the states gallery of
// app/pages/ContactButton.dc.html (?cb-gallery=1), offline through the mock harness.
// The live float on the same page is hidden by the config's stylePath; the gallery cells
// carry no [data-contact-btn], so every state shows in the picture.
import { test, expect, type Page } from "../support/test";
import { serveMock, waitForMockReady } from "../support/mock-harness";

type Loc = { VamosLocale: { setLang(v: string): void; coverage(root: Element, l: string): unknown } };

async function openGallery(page: Page) {
  const url = await serveMock("app/pages/ContactButton.dc.html");
  await page.goto(`${url}?cb-gallery=1`);
  await waitForMockReady(page);
  await expect(page.locator("[data-cb-gal]")).toBeVisible();
  await expect(page.locator("[data-cb-gal] a[data-crow]")).toHaveCount(13);
}

for (const lang of ["en", "de", "fr", "ar"] as const) {
  test(`contact button states in ${lang} @component`, async ({ page }) => {
    await openGallery(page);
    await page.evaluate((l) => (window as unknown as Loc).VamosLocale.setLang(l), lang);
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    await page.waitForTimeout(350);

    const w = await page.evaluate(() => ({ sw: document.scrollingElement!.scrollWidth, iw: window.innerWidth }));
    expect(w.sw).toBeLessThanOrEqual(w.iw);

    const missing = await page.evaluate(
      (l) => (window as unknown as Loc).VamosLocale.coverage(document.querySelector("[data-cb-gal]")!, l),
      lang === "en" ? "de" : lang,
    );
    expect(missing).toMatchObject({ count: 0, strings: [], attrs: [] });

    await expect(page.locator("[data-cb-gal]")).toHaveScreenshot(`contact-button-states-${lang}.png`);
  });
}

test("every trigger is 54px tall and the rows are 60px (64px in the sheet) @component", async ({ page }) => {
  await openGallery(page);
  for (const sel of ["[data-cb-gal] [data-cb-pill]", "[data-cb-gal] button[data-cb-disc]", "[data-cb-gal] [data-cb-dock]"]) {
    const n = await page.locator(sel).count();
    expect(n, sel).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const box = await page.locator(sel).nth(i).boundingBox();
      expect(Math.round(box!.height), `${sel} ${i}`).toBe(54);
    }
  }
  const card = await page.locator('[data-cb-gal] [data-cb-panel] a[data-crow]').first().boundingBox();
  const sheet = await page.locator('[data-cb-gal] [data-cb-sheet] a[data-crow]').first().boundingBox();
  expect(Math.round(card!.height)).toBe(60);
  expect(Math.round(sheet!.height)).toBe(64);
});

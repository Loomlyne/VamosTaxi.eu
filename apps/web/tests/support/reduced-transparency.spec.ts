import { test, expect, emulateMedia, pinReducedTransparency } from "./test";

const RT = "(prefers-reduced-transparency: reduce)";
const RM = "(prefers-reduced-motion: reduce)";

test.describe("prefers-reduced-transparency pin (D-06)", () => {
  test.beforeEach(({ browserName }, testInfo) => {
    test.skip(testInfo.project.name !== "component-1440", browserName);
  });

  test("a fresh page fixture reports reduce before and after goto", async ({ page }) => {
    await page.setContent("<p>x</p>");
    expect(await page.evaluate((q) => matchMedia(q).matches, RT)).toBe(true);
    await page.goto("data:text/html,<p>y</p>");
    expect(await page.evaluate((q) => matchMedia(q).matches, RT)).toBe(true);
  });

  test("emulateMedia keeps both the motion and the transparency feature", async ({ page }) => {
    await page.setContent("<p>x</p>");
    await emulateMedia(page, { reducedMotion: "reduce" });
    expect(await page.evaluate((q) => matchMedia(q).matches, RM)).toBe(true);
    expect(await page.evaluate((q) => matchMedia(q).matches, RT)).toBe(true);
  });

  test("a page from browser.newContext() is pinned by pinReducedTransparency", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await pinReducedTransparency(page);
    await page.setContent("<p>x</p>");
    expect(await page.evaluate((q) => matchMedia(q).matches, RT)).toBe(true);
    await context.close();
  });
});

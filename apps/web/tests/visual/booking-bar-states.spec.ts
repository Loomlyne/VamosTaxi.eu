import { test, expect, type Page } from "../support/test";
import { serveMock, waitForMockReady } from "../support/mock-harness";

// Phase 26.4 plan 04 — the BookingBar states gallery renders every state in en/de/fr/ar
// at each component width: bars 54px tall, nothing scrolls sideways, every string
// resolves in the dictionary, the trailing icons mirror in Arabic, a click calls onOpen.

type Loc = { VamosLocale: { setLang(v: string): void; coverage(root: Element, l: string): unknown } };

async function openGallery(page: Page) {
  const url = await serveMock("app/home/BookingBarStates.dc.html");
  await page.goto(url);
  await waitForMockReady(page);
  const accept = page.getByRole("button", { name: /Accept all/i });
  if (await accept.isVisible().catch(() => false)) await accept.click();
  await expect(page.locator("[data-bb]").first()).toBeVisible();
}

for (const lang of ["en", "de", "fr", "ar"] as const) {
  test.describe(`BookingBar states in ${lang} @component`, () => {
    test(`every bar is 54px, fits the viewport and resolves in ${lang} @component`, async ({ page }) => {
      await openGallery(page);
      await page.evaluate((l) => (window as unknown as Loc).VamosLocale.setLang(l), lang);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      if (lang === "ar") await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await page.waitForTimeout(250);

      const bars = page.locator("[data-bb]");
      expect(await bars.count()).toBeGreaterThanOrEqual(14);
      const n = await bars.count();
      for (let i = 0; i < n; i++) {
        const box = await bars.nth(i).boundingBox();
        expect(box, `bar ${i} visible`).not.toBeNull();
        expect(Math.abs(box!.height - 54), `bar ${i} height`).toBeLessThanOrEqual(1);
      }

      const w = await page.evaluate(() => ({ sw: document.scrollingElement!.scrollWidth, iw: window.innerWidth }));
      expect(w.sw).toBeLessThanOrEqual(w.iw);

      const missing = await page.evaluate(
        (l) => (window as unknown as Loc).VamosLocale.coverage(document.querySelector("[data-bs-grid]")!, l),
        lang === "en" ? "de" : lang,
      );
      expect(missing).toMatchObject({ count: 0, strings: [], attrs: [] });
    });

    test(`trailing icons mirror only in Arabic and a click calls onOpen (${lang}) @component`, async ({ page }) => {
      await openGallery(page);
      await page.evaluate((l) => (window as unknown as Loc).VamosLocale.setLang(l), lang);
      await page.waitForTimeout(250);

      // The glyph is mirrored once, by laws.css (03), never by the bar: multiply the sign of
      // the x-scale (matrix(a, b, c, d, tx, ty)) of the icon and every ancestor.
      const xScale = await page
        .locator("[data-bb]")
        .first()
        .locator('[data-bb-mirror] [style*=".svg"]')
        .first()
        .evaluate((icon) => {
          let product = 1;
          for (let n: Element | null = icon; n; n = n.parentElement) {
            const a = Number(/^matrix\(([-\d.e]+),/.exec(getComputedStyle(n).transform)?.[1] ?? "1");
            if (a < 0) product = -product;
          }
          return product;
        });
      expect(xScale).toBe(lang === "ar" ? -1 : 1);

      const before = Number(await page.locator("[data-bs-opens]").innerText());
      await page.locator("[data-bb]").first().click();
      await expect(page.locator("[data-bs-opens]")).toHaveText(String(before + 1));
    });
  });
}

test("keyboard: Enter and Space open, aria-expanded mirrors the prop, names follow the spec @component", async ({ page }) => {
  await openGallery(page);
  const bars = page.locator("[data-bb]");
  await bars.nth(0).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  await expect(page.locator("[data-bs-opens]")).toHaveText("2");
  await expect(bars.nth(0)).toHaveAttribute("aria-haspopup", "dialog");
  await expect(bars.nth(0)).toHaveAttribute("aria-expanded", "false");
  await expect(bars.nth(11)).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Book a transfer" }).first()).toBeVisible();
  const filled = bars.nth(3);
  const name = await filled.evaluate((el) => (el as HTMLElement).getAttribute("aria-labelledby"));
  expect(name).toBeTruthy();
  await expect(page.getByRole("button", { name: /^Edit trip: .*Zurich Airport.*Bahnhofstrasse 1.*2 passengers.*3 bags/ }).first()).toBeVisible();
});

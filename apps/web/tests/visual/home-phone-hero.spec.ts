import { test, expect, type Page } from "@playwright/test";
import { serveMock, waitForMockReady } from "../support/mock-harness";

// Quick 260930-phm (owner, 2026-09-30). Phone and tablet (<=1080): the Trustpilot figures sit as one row inside the
// white card under the booking bar; the menu is a full page under the dark header bar; the page ground is charcoal
// so the browser's own bars are not white. Laptop (>=1081) is unchanged.

type Locale = { setLang(v: string): void; coverage(root: Element, l?: string): { count: number; strings: string[]; attrs: string[] } };
const width = (page: Page) => page.viewportSize()!.width;

async function openHome(page: Page, reviews: number) {
  await page.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true,"suggestions":[],"classes":[]}' }));
  await page.goto(await serveMock("app/home/home.dc.html"));
  await waitForMockReady(page);
  const accept = page.getByRole("button", { name: /Accept all/i });
  if (await accept.isVisible().catch(() => false)) await accept.click();
  await page.evaluate((n) => {
    const w = window as unknown as { VamosReviews: { published: () => unknown[] } };
    // FIXTURE rows: n five-star Trustpilot reviews. The page only ever shows what the store publishes.
    const rows = Array.from({ length: n }, (_, i) => ({ id: "r" + i, rating: 5, published: true, source: "trustpilot", url: "https://www.trustpilot.com/review/fixture.example" }));
    w.VamosReviews.published = () => rows;
    window.dispatchEvent(new Event("vamos:reviews"));
    window.dispatchEvent(new Event("resize"));
  }, reviews);
  await page.waitForTimeout(400);
}

test.describe("Phone home: Trustpilot row, full-page menu, dark ground @component", () => {
  test("published reviews show as one row inside the bar card; the big block and the check lines are gone", async ({ page }) => {
    test.skip(width(page) > 1080, "tablet and phone only");
    await openHome(page, 5);
    const row = page.locator("[data-bar-wrap] [data-bar-trust]");
    await expect(row).toBeVisible();
    await expect(row.locator("[data-bt-score]")).toHaveText("5.0");
    await expect(row.locator("[data-bt-count]")).toHaveText("5 reviews");
    await expect(row.locator("[data-bt-stars] img")).toHaveCount(5);
    await expect(row).toHaveAttribute("href", "https://www.trustpilot.com/review/fixture.example");
    await expect(page.locator("[data-trust]")).toBeHidden();
    await expect(page.locator("[data-bar-notes]")).toBeHidden();
    const g = await page.evaluate(() => {
      const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      const card = r("[data-bar-wrap]"), t = r("[data-bar-trust]"), bar = r("[data-bar-wrap] [data-bb]");
      return { h: t.height, inside: t.left >= card.left - 1 && t.right <= card.right + 1 && t.bottom <= card.bottom + 1, below: t.top >= bar.bottom - 1, over: document.documentElement.scrollWidth - document.documentElement.clientWidth, count: r("[data-bt-count]").right <= r("[data-bt-go]").left + 1 };
    });
    expect(g.h).toBeGreaterThanOrEqual(44);
    expect(g.inside).toBe(true);
    expect(g.below).toBe(true);
    expect(g.count).toBe(true);
    expect(g.over).toBeLessThanOrEqual(0);
  });

  for (const lang of ["de", "fr", "ar"] as const) {
    test(`the row reads in ${lang}, nothing left in English, no sideways scroll`, async ({ page }) => {
      test.skip(width(page) > 1080, "tablet and phone only");
      await openHome(page, 5);
      await page.evaluate((l) => (window as unknown as { VamosLocale: Locale }).VamosLocale.setLang(l), lang);
      await page.waitForTimeout(400);
      const cov = await page.evaluate((l) => (window as unknown as { VamosLocale: Locale }).VamosLocale.coverage(document.querySelector("[data-bar-wrap]")!, l), lang);
      expect(cov).toMatchObject({ count: 0, strings: [], attrs: [] });
      await expect(page.locator("[data-bar-trust] [data-bt-count]")).not.toHaveText("5 reviews");
      if (lang === "ar") await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });
  }

  test("no published review: no row and no figure; the three check lines show in readable text", async ({ page }) => {
    test.skip(width(page) > 1080, "tablet and phone only");
    await openHome(page, 0);
    await expect(page.locator("[data-bar-trust]")).toHaveCount(0);
    await expect(page.locator("[data-bar-notes]")).toBeVisible();
    await expect(page.locator("[data-bar-note]")).toHaveCount(3);
    // on the white card the text must not be the light inverse colour it used to be
    const c = await page.locator("[data-bar-note]").first().evaluate((el) => getComputedStyle(el).color);
    const [r, g, b] = c.match(/\d+/g)!.map(Number);
    expect(r! + g! + b!).toBeLessThan(400);
  });

  test("the menu is a full page under the dark header bar and closes again", async ({ page }) => {
    test.skip(width(page) > 1080, "tablet and phone only");
    await openHome(page, 5);
    const btn = page.locator("[data-hd-menu-btn]");
    await btn.click();
    const sheet = page.locator("[data-hd-sheet]");
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(500);
    const g = await page.evaluate(() => {
      const s = document.querySelector("[data-hd-sheet]")!.getBoundingClientRect();
      const brand = document.querySelector("[data-hd-brand]")!.getBoundingClientRect();
      const b = document.querySelector("[data-hd-menu-btn]")!.getBoundingClientRect();
      const at = (x: number, y: number) => document.elementFromPoint(x, y);
      return { left: s.left, right: s.right, top: s.top, bottom: s.bottom, iw: window.innerWidth, ih: window.innerHeight, brandAbove: brand.bottom <= s.top + 1, btnAbove: b.bottom <= s.top + 1, brandOnTop: !!at(brand.left + 8, brand.top + brand.height / 2)?.closest("[data-hd-brand]"), midIsSheet: !!at(window.innerWidth / 2, window.innerHeight - 40)?.closest("[data-hd-sheet]") };
    });
    expect(g.left).toBeLessThanOrEqual(1);
    expect(g.right).toBeGreaterThanOrEqual(g.iw - 1);
    expect(g.bottom).toBeGreaterThanOrEqual(g.ih - 1);
    expect(g.brandAbove).toBe(true);
    expect(g.btnAbove).toBe(true);
    expect(g.brandOnTop).toBe(true);
    expect(g.midIsSheet).toBe(true);
    await expect(sheet.getByRole("link", { name: /Sign in/ })).toBeVisible();
    await btn.click();
    await expect(sheet).toHaveCount(0);
  });

  test("page ground: charcoal on phone and tablet, unchanged on laptop; the hero content still ends inside the screen", async ({ page }) => {
    await openHome(page, 5);
    const bg = await page.evaluate(() => ({ html: getComputedStyle(document.documentElement).backgroundColor, body: getComputedStyle(document.body).backgroundColor }));
    if (width(page) > 1080) {
      expect(bg.body).toBe("rgb(246, 246, 246)");
      await expect(page.locator("[data-bar-trust]")).toBeHidden();
      return;
    }
    expect(bg.html).toBe("rgb(30, 31, 31)");
    expect(bg.body).toBe("rgb(30, 31, 31)");
    const g = await page.evaluate(() => ({ hero: document.querySelector("[data-hero]")!.getBoundingClientRect().height, cardBottom: document.querySelector("[data-bar-wrap]")!.getBoundingClientRect().bottom, ih: window.innerHeight }));
    expect(g.hero).toBeGreaterThanOrEqual(g.ih - 1);
    expect(g.cardBottom).toBeLessThanOrEqual(g.ih);
  });
});

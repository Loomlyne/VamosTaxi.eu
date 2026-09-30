import { test, expect, webkit, chromium, devices, type Page, type Browser } from "../support/test";
import { serveMock, waitForMockReady } from "../support/mock-harness";

// Quick 260930-bp2 item 4. The phone booking page (BookingSheet) owns one history entry while open and walks
// back over it when it closes (history.go(-1) + a pending-pop marker).
//  (a) close with the X, press Back within a second -> the browser goes to the page before the home page
//      (what Back does after any normal close), in WebKit and Chromium.
//  (b) close, reopen after 0 / 100 / 300 ms, press Back -> the sheet closes and the visitor stays on the home
//      page, every run (10 runs each).

const API = (r: any) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true,"suggestions":[],"classes":[]}' });
const ENGINES = ["chromium", "webkit"] as const;

// TRAVERSE: the delay (ms) before a history.go() takes effect. Safari's traversal is slower than a desktop
// engine's, which is what opens the window in which the sheet's own pop is still pending.
async function launch(engine: (typeof ENGINES)[number], traverse = 0): Promise<{ br: Browser; page: Page }> {
  const br = engine === "webkit" ? await webkit.launch() : await chromium.launch();
  const ctx = await br.newContext({ ...(engine === "webkit" ? devices["iPhone 14"] : { hasTouch: true, isMobile: true }), viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("vamosCookieConsent", JSON.stringify({ necessary: true, functional: false, analytics: false, marketing: false, v: 1, ts: "2026-01-01T00:00:00Z" })); } catch {} });
  // The target entry is fixed when go() is called and reached ms later, as a slow browser does; a pushState in
  // between does not move the target. (Navigation API where the engine has it, else plain delay.)
  if (traverse) await ctx.addInitScript((ms) => {
    const g = History.prototype.go; const nav = (window as any).navigation;
    History.prototype.go = function (n?: number) {
      const target = nav && nav.entries ? nav.entries()[nav.currentEntry.index + (n || 0)] : null;
      setTimeout(() => { if (target) nav.traverseTo(target.key); else g.call(this, n); }, ms);
    };
  }, traverse);
  const page = await ctx.newPage();
  await page.route("**/api/**", API);
  return { br, page };
}

async function openHomeAfterPrev(page: Page) {
  const prev = await serveMock("app/pages/faq.dc.html");
  const home = await serveMock("app/home/home.dc.html");
  await page.goto(prev);
  await waitForMockReady(page);
  await page.goto(home);
  await waitForMockReady(page);
  await page.waitForTimeout(500);
  return { prev, home };
}
const openSheet = async (page: Page) => {
  await page.locator("[data-bar-wrap] [data-bb]").click();
  await expect(page.locator("[data-bs]")).toBeVisible();
};
const closeX = (page: Page) => page.locator("[data-bs] [data-bs-head] button").last().click();

test.describe("Phone booking page and the browser Back button @component", () => {
  test.beforeEach(({}, ti) => test.skip(ti.project.name !== "component-390", "phone width, own browsers"));

  for (const engine of ENGINES) {
    for (const [wait, traverse] of [[0, 0], [300, 0], [700, 0], [100, 600], [500, 600]]) {
      test(`${engine}: (a) close with X, Back ${wait} ms later (traversal ${traverse} ms) -> previous page`, async () => {
        test.setTimeout(90_000);
        const { br, page } = await launch(engine, traverse);
        try {
          const { prev, home } = await openHomeAfterPrev(page);
          for (let run = 0; run < 3; run++) {
            await page.goto(home);
            await waitForMockReady(page);
            await page.waitForTimeout(400);
            await openSheet(page);
            await closeX(page);
            await expect(page.locator("[data-bs]")).toHaveCount(0);
            if (wait) await page.waitForTimeout(wait);
            await page.evaluate(() => history.back());
            await expect.poll(() => page.url(), { timeout: 4000, message: `run ${run}: Back ${wait} ms after X` }).toBe(prev);
          }
        } finally { await br.close(); }
      });
    }

    for (const [gap, traverse] of [[0, 0], [100, 0], [300, 0], [0, 600], [100, 600], [300, 600]]) {
      test(`${engine}: (b) close with X, reopen after ${gap} ms (traversal ${traverse} ms), Back closes it (x10)`, async () => {
        test.setTimeout(180_000);
        const { br, page } = await launch(engine, traverse);
        try {
          const { home } = await openHomeAfterPrev(page);
          const fails: string[] = [];
          for (let run = 0; run < 10; run++) {
            await page.locator("[data-bar-wrap] [data-bb]").click();
            await expect(page.locator("[data-bs]")).toBeVisible();
            await closeX(page);
            await expect(page.locator("[data-bs]")).toHaveCount(0);
            if (gap) await page.waitForTimeout(gap);
            await page.locator("[data-bar-wrap] [data-bb]").click();
            await expect(page.locator("[data-bs]")).toBeVisible();
            await page.waitForTimeout(1100); // a person needs about a second to reach for Back
            await page.evaluate(() => history.back());
            const closed = await expect(page.locator("[data-bs]")).toHaveCount(0, { timeout: 2500 }).then(() => true, () => false);
            await page.waitForTimeout(400);
            if (!closed) fails.push(`run ${run}: sheet still open after Back`);
            else if (page.url() !== home) fails.push(`run ${run}: left the home page (${page.url()})`);
            if (!closed) { await closeX(page).catch(() => {}); await page.waitForTimeout(1000); }
            if (page.url() !== home) { await page.goto(home); await waitForMockReady(page); await page.waitForTimeout(400); }
          }
          expect(fails, fails.join("; ")).toEqual([]);
        } finally { await br.close(); }
      });
    }
  }
});

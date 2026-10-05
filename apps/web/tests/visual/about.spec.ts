import { test, expect } from "../support/test";
import { testPort } from "../support/port";
import { spawn, type ChildProcess } from "node:child_process";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";

const PORTS: Record<string, number> = {
  "component-1440": testPort(4150),
  "component-1024": testPort(4151),
  "component-768": testPort(4152),
  "component-390": testPort(4153),
};

let devServer: ChildProcess | null = null;
let baseURL = "";

test.describe("About page @component", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(90_000);
    const port = PORTS[testInfo.project.name] ?? testPort(4159);
    baseURL = `http://localhost:${port}`;
    devServer = spawn(NEXT_BIN, ["dev", "-p", String(port)], {
      cwd: WEB_ROOT,
      stdio: "ignore",
      detached: true,
    });
    await waitForNextServer(baseURL);
  });

  test.afterAll(() => {
    if (devServer?.pid) {
      try {
        process.kill(-devServer.pid, "SIGTERM");
      } catch {
        /* gone */
      }
    }
  });

  for (const locale of ["en", "de", "fr", "ar"] as const) {
    const path = locale === "en" ? "/about" : `/${locale}/about`;
    test(`screenshot ${locale} @component`, async ({ page }) => {
      await page.goto(baseURL + path);
      await expect(page.locator("main")).toBeVisible();
      await expect(page).toHaveScreenshot(`about-${locale}.png`);
    });
  }

  test("no sideways scroll at 390 @component", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "component-390", "390");
    for (const path of ["/about", "/de/about", "/fr/about", "/ar/about"]) {
      await page.goto(baseURL + path);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
  });

  test("hreflang @component", async ({ page }) => {
    const res = await page.goto(baseURL + "/about");
    const body = (await res?.text()) ?? "";
    expect(body).toMatch(/hreflang="en"/i);
    expect(body).toMatch(/hreflang="x-default"/i);
  });

  // 26.0 (main-green-3): /about is served from the DC mock app/pages/about.dc.html (middleware DC_PAGES),
  // not the React PageHero these three tests were written for (.vt-mh-checker / .vt-mh-photo never render,
  // so the first one waited out the 90 s Linux timeout and the serial describe skipped the rest).
  test("rtl checker inline-end @component", async ({ page }) => {
    await page.goto(baseURL + "/ar/about");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl"); // dir="rtl"
    const checker = page.locator('[aria-hidden="true"][style*="checker-mark"]').first();
    await expect(checker).toBeAttached();
    const inset = await checker.evaluate((el) => getComputedStyle(el).insetInlineEnd);
    expect(inset).not.toBe("auto");
  });

  test("translated alts @component", async ({ page }) => {
    const photo = page.locator('img[src*="hero-arrivals"]').first();
    await page.goto(baseURL + "/about");
    const en = await photo.getAttribute("alt");
    expect(en && en.length).toBeTruthy();
    await page.goto(baseURL + "/de/about");
    await expect.poll(() => photo.getAttribute("alt")).not.toBe(en);
  });

  test("van photo is the small file (site speed A, 02c1bd3d) @component", async ({ page }) => {
    // 9deff568 (site polish) took the van photo off About. The one page that carries it now is the home page's
    // Business travel section, so the 1200 px file is asserted there, and About must not load the 3 MB original.
    await page.goto(baseURL + "/");
    const src = await page.locator("img[data-biz-photo]").first().getAttribute("src");
    expect(src ?? "").toMatch(/fleet-van-street-1200\.jpg$/);
    await page.goto(baseURL + "/about");
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator('img[src$="/fleet-van-street.jpg"]')).toHaveCount(0);
  });
});

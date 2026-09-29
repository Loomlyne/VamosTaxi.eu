import { test, expect, emulateMedia } from "../support/test";
import { existsSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { waitForNextServer, WEB_ROOT, NEXT_BIN } from "../support/server-harness";

const PORTS: Record<string, number> = {
  "component-1440": 4260,
  "component-1024": 4261,
  "component-768": 4262,
  "component-390": 4263,
};

const LOCALES = ["en", "de", "fr", "ar"] as const;
const STATES = ["default", "loading", "empty", "error"] as const;

const MAIN_NEXT = join("/Users/koss/Developer/VamosTaxi.eu/apps/web/node_modules/.bin/next");
const NEXT = existsSync(NEXT_BIN) ? NEXT_BIN : MAIN_NEXT;

let devServer: ChildProcess | null = null;
let baseURL = "";

function pathFor(locale: string) {
  return locale === "en" ? "/dev/home/reviews" : `/${locale}/dev/home/reviews`;
}

test.describe("Home reviews @component", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(240_000);
    const port = PORTS[testInfo.project.name] ?? 4260;
    baseURL = `http://localhost:${port}`;
    devServer = spawn(NEXT, ["dev", "-p", String(port)], {
      cwd: WEB_ROOT,
      stdio: "ignore",
      detached: true,
      env: {
        ...process.env,
        TEST_DIST_DIR: `test-results/.next-home-reviews-${port}`,
        CLOUDFLARE_ENV: "staging",
      },
    });
    await waitForNextServer(baseURL, 180_000);
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

  for (const locale of LOCALES) {
    for (const state of STATES) {
      test(`screenshot ${locale} ${state} @component`, async ({ page }) => {
        await page.goto(baseURL + pathFor(locale), { timeout: 60_000 });
        const tile = page.locator(`[data-tile="${state}"]`);
        await tile.scrollIntoViewIfNeeded();
        await expect(tile.locator("[data-rv]")).toBeAttached({ timeout: 30_000 });
        await expect(tile).toHaveScreenshot(`reviews-${locale}-${state}.png`);
      });
    }
  }

  test("no sideways scroll at 390 @component", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "component-390", "390");
    for (const locale of LOCALES) {
      await page.goto(baseURL + pathFor(locale));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
        true,
      );
    }
  });

  test("reduced motion disables autoplay @component", async ({ page }) => {
    await emulateMedia(page, { reducedMotion: "reduce" });
    await page.goto(baseURL + pathFor("en"));
    const tile = page.locator('[data-tile="autoplay-on"]');
    await tile.scrollIntoViewIfNeeded();
    const first = await tile.locator('[data-rv-slide][data-on="1"]').first().getAttribute("data-i");
    await page.waitForTimeout(2800);
    const later = await tile.locator('[data-rv-slide][data-on="1"]').first().getAttribute("data-i");
    expect(later).toBe(first);
  });

  test("controls are at least 44px and keyboard-operable @component", async ({ page }) => {
    await page.goto(baseURL + pathFor("en"));
    const tile = page.locator('[data-tile="default"]');
    await tile.scrollIntoViewIfNeeded();
    const size = await tile.locator("[data-rv-arrow]").first().evaluate((el) => {
      const box = el.getBoundingClientRect();
      return { w: box.width, h: box.height };
    });
    expect(size.w).toBeGreaterThanOrEqual(44);
    expect(size.h).toBeGreaterThanOrEqual(44);
    const before = await tile.locator('[data-rv-slide][data-on="1"]').first().getAttribute("data-i");
    await tile.locator("[data-rv-arrow]").nth(1).focus();
    await page.keyboard.press("ArrowRight");
    const after = await tile.locator('[data-rv-slide][data-on="1"]').first().getAttribute("data-i");
    expect(after).not.toBe(before);
  });

  test("rtl dir and reading-direction advance @component", async ({ page }) => {
    await page.goto(baseURL + pathFor("ar"));
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const tile = page.locator('[data-tile="default"]');
    await tile.scrollIntoViewIfNeeded();
    await tile.locator("[data-rv-arrow]").nth(1).click();
    await expect(tile.locator("[data-rv]")).toHaveAttribute("data-dir", "-1");
  });
});

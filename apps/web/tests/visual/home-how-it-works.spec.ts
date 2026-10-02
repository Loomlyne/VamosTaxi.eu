import { test, expect, emulateMedia } from "../support/test";
import { testPort } from "../support/port";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { waitForNextServer, WEB_ROOT } from "../support/server-harness";
import { nextDevEnv } from "../support/test-stack";

const PORTS: Record<string, number> = {
  "component-1440": testPort(4220),
  "component-1024": testPort(4221),
  "component-768": testPort(4222),
  "component-390": testPort(4223),
};

const LOCALES = ["en", "de", "fr", "ar"] as const;
const STATES = ["light-reveal", "light-static", "inverse-reveal", "inverse-static"] as const;

const NEXT_BIN = join(WEB_ROOT, "node_modules", ".bin", "next");

let devServer: ChildProcess | null = null;
let baseURL = "";

function pathFor(locale: string) {
  return locale === "en" ? "/dev/home/how-it-works" : `/${locale}/dev/home/how-it-works`;
}

test.describe("Home how-it-works @component", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(240_000);
    const port = PORTS[testInfo.project.name] ?? testPort(4229);
    baseURL = `http://localhost:${port}`;
    devServer = spawn(NEXT_BIN, ["dev", "-p", String(port)], {
      cwd: WEB_ROOT,
      stdio: "ignore",
      detached: true,
      env: nextDevEnv({ TEST_DIST_DIR: `test-results/.next-how-it-works-${port}` }, { gallery: true }),
    });
    await waitForNextServer(baseURL, 180_000);
    // `next dev` compiles a route on its first request; on a loaded machine that is longer than a 30 s test.
    // Warm the gallery route here, inside the 240 s hook, so the first screenshot test measures the page.
    await waitForNextServer(baseURL + pathFor("en"), 180_000);
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
        const tile = page.locator(`[data-state="${state}"]`);
        await tile.scrollIntoViewIfNeeded();
        await expect(tile.locator("[data-hiw]")).toBeAttached({ timeout: 30_000 });
        await expect(tile).toHaveScreenshot(`hiw-${locale}-${state}.png`);
      });
    }
  }

  test("no sideways scroll at 390 @component", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "component-390", "390");
    for (const locale of LOCALES) {
      await page.goto(baseURL + pathFor(locale));
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
  });

  test("reduced motion paints every step @component", async ({ page }) => {
    await emulateMedia(page, { reducedMotion: "reduce" });
    await page.goto(baseURL + pathFor("en"));
    const cards = page.locator('[data-state="light-reveal"] [data-hiw-card]');
    await expect(cards).toHaveCount(4);
    for (let i = 0; i < 4; i++) {
      const vis = await cards.nth(i).evaluate((el) => {
        const s = getComputedStyle(el);
        return { opacity: s.opacity, visibility: s.visibility };
      });
      expect(vis.visibility).not.toBe("hidden");
      expect(Number(vis.opacity)).toBeGreaterThan(0.99);
    }
  });

  test("scroll past and back stays reachable @component", async ({ page }) => {
    await page.goto(baseURL + pathFor("en"));
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const bottom = await page.evaluate(() => document.documentElement.scrollTop);
    await page.evaluate(() => window.scrollTo(0, 0));
    const top = await page.evaluate(() => document.documentElement.scrollTop);
    expect(bottom).toBeGreaterThanOrEqual(top);
    await expect(page.locator("[data-hiw]").first()).toBeVisible();
  });

  test("german step cards fit at 1024 @component", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "component-1024", "1024");
    await page.goto(baseURL + pathFor("de"));
    const overflow = await page
      .locator('[data-state="light-static"] [data-hiw-card]')
      .evaluateAll((els) => els.every((el) => el.scrollWidth <= el.clientWidth));
    expect(overflow).toBe(true);
  });

  test("rtl logical spine @component", async ({ page }) => {
    await page.goto(baseURL + pathFor("ar"));
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const inset = await page.locator("[data-hiw-spine]").first().evaluate((el) => {
      return getComputedStyle(el).insetInlineStart;
    });
    expect(inset).not.toBe("auto");
  });

  test("aria title differs en vs de @component", async ({ page }) => {
    await page.goto(baseURL + pathFor("en"));
    const enTitle = await page.locator("#hiw-title").first().innerText();
    await page.goto(baseURL + pathFor("de"));
    const deTitle = await page.locator("#hiw-title").first().innerText();
    expect(enTitle).not.toBe(deTitle);
  });
});

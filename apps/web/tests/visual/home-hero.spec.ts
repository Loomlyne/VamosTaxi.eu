import { test, expect } from "../support/test";
import { testPort } from "../support/port";
import { spawn, type ChildProcess } from "node:child_process";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";
import { nextDevEnv } from "../support/test-stack";

const PORTS: Record<string, number> = {
  "component-1440": testPort(4160),
  "component-1024": testPort(4161),
  "component-768": testPort(4162),
  "component-390": testPort(4163),
};

const LOCALES = ["en", "de", "fr", "ar"] as const;
const STATES = ["empty", "filled", "sheet-closed", "sheet-open", "mount"] as const;

let devServer: ChildProcess | null = null;
let baseURL = "";

function pathFor(locale: string) {
  return locale === "en" ? "/dev/home/hero" : `/${locale}/dev/home/hero`;
}

test.describe("Home hero @component", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(240_000);
    const port = PORTS[testInfo.project.name] ?? testPort(4169);
    baseURL = `http://localhost:${port}`;
    devServer = spawn(NEXT_BIN, ["dev", "-p", String(port)], {
      cwd: WEB_ROOT,
      stdio: "ignore",
      detached: true,
      env: nextDevEnv({}, { gallery: true }),
    });
    await waitForNextServer(baseURL, 180_000);
    // `next dev` compiles a route on its first request (the first run died with net::ERR_ABORTED mid-compile).
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
        await page.goto(baseURL + pathFor(locale));
        const tile = page.locator(`[data-state="${state}"]`);
        await expect(tile.locator("[data-hero]")).toBeVisible();
        await expect(tile).toHaveScreenshot(`hero-${locale}-${state}.png`);
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

  test("grid shapes @component", async ({ page }, testInfo) => {
    await page.goto(baseURL + pathFor("en"));
    const name = testInfo.project.name;
    if (name === "component-390") {
      await expect(page.locator("[data-state='empty'] [data-bc-summary]").first()).toBeVisible();
      const areas = await page.locator("[data-state='sheet-open'] [data-fields]").evaluate((el) => {
        return getComputedStyle(el).gridTemplateAreas;
      });
      expect(areas.replace(/\s+/g, " ")).toMatch(/flight/);
      expect(areas).not.toMatch(/flight pickup/);
    }
    if (name === "component-1440") {
      const areas = await page.locator("[data-state='empty'] [data-fields]").evaluate((el) => {
        return getComputedStyle(el).gridTemplateAreas;
      });
      expect(areas.replace(/\n/g, " ")).toMatch(/flight.*pickup.*swap.*dest.*when.*party/);
    }
  });

  test("touch targets 54px @component", async ({ page }, testInfo) => {
    await page.goto(baseURL + pathFor("en"));
    const cta =
      testInfo.project.name === "component-1440"
        ? page.locator("[data-state='empty'] [data-only-wide] .vt-btn--lg").first()
        : page.locator("[data-state='sheet-open'] [data-sheetonly='cta'] .vt-btn--lg").first();
    await expect(cta).toBeVisible();
    const box = await cta.boundingBox();
    expect(box && box.height >= 54).toBe(true);
  });

  test("sheet Escape @component", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "component-1440", "sheet is desktop-inline");
    await page.goto(baseURL + pathFor("en"));
    const open = page.locator("[data-state='sheet-open']");
    await expect(open.locator("[data-shell]")).toHaveAttribute("data-open", "1");
    await page.keyboard.press("Escape");
    await expect(open.locator("[data-shell]")).toHaveAttribute("data-open", "0");
  });

  test("rtl logical swap @component", async ({ page }) => {
    await page.goto(baseURL + pathFor("ar"));
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl"); // dir="rtl"
    const inset = await page.locator(".vt-hh-checker").first().evaluate((el) => {
      return getComputedStyle(el).insetInlineEnd;
    });
    expect(inset).not.toBe("auto");
  });

  test("no CHF amount @component", async ({ page }) => {
    await page.goto(baseURL + pathFor("en"));
    const text = await page.locator("main").innerText();
    // The header's currency picker prints a bare "CHF" label; only an amount (CHF then digits) is banned.
    expect(text).not.toMatch(/\bCHF\s*\d/);
    expect(text).not.toMatch(/\d{1,3}['’]\d{3}/);
  });
});

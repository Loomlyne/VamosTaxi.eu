import { test, expect, type Page, emulateMedia } from "../support/test";
import { testPort } from "../support/port";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { waitForNextServer, WEB_ROOT } from "../support/server-harness";

const PORTS: Record<string, number> = {
  "component-1440": testPort(4230),
  "component-1024": testPort(4231),
  "component-768": testPort(4232),
  "component-390": testPort(4233),
};

const LOCALES = ["en", "de", "fr", "ar"] as const;
const STATES = [
  "support-on-driven",
  "support-off-driven",
  "support-on-static",
  "per-step-34",
  "per-step-90",
] as const;

const NEXT_BIN = join(WEB_ROOT, "node_modules", ".bin", "next");

let devServer: ChildProcess | null = null;
let baseURL = "";

function pathFor(locale: string) {
  return locale === "en" ? "/dev/home/why-vamos" : `/${locale}/dev/home/why-vamos`;
}

async function gotoReady(page: Page, locale: string) {
  let last = 0;
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await page.goto(baseURL + pathFor(locale), {
      timeout: 60_000,
      waitUntil: "domcontentloaded",
    });
    last = res?.status() ?? 0;
    if (last > 0 && last < 400) return;
    await page.waitForTimeout(800);
  }
  throw new Error(`goto ${pathFor(locale)} status ${last}`);
}

test.describe("Home why-vamos @component", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(240_000);
    const port = PORTS[testInfo.project.name] ?? testPort(4239);
    baseURL = `http://localhost:${port}`;
    devServer = spawn(NEXT_BIN, ["dev", "-p", String(port)], {
      cwd: WEB_ROOT,
      stdio: "ignore",
      detached: true,
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
        await gotoReady(page, locale);
        const pin = page.locator(`[data-state="${state}"] [data-why-pin]`);
        await expect(pin).toBeVisible({ timeout: 30_000 });
        await expect(pin).toHaveScreenshot(`why-${locale}-${state}.png`);
      });
    }
  }

  test("no sideways scroll at 390 @component", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "component-390", "390");
    for (const locale of LOCALES) {
      await gotoReady(page, locale);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
  });

  test("reduced motion paints every step @component", async ({ page }) => {
    await emulateMedia(page, { reducedMotion: "reduce" });
    await gotoReady(page, "en");
    const titles = page.locator('[data-state="support-on-driven"] [data-why-t]');
    await expect(titles).toHaveCount(4);
    const opacities = await titles.evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).opacity),
    );
    expect(opacities.every((value) => Number(value) === 1)).toBe(true);
    const vis = await titles.evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).visibility),
    );
    expect(vis.every((value) => value !== "hidden")).toBe(true);
    const bodies = page.locator('[data-state="support-on-driven"] [data-why-p]');
    const bodyOp = await bodies.evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).opacity),
    );
    expect(bodyOp.every((value) => Number(value) === 1)).toBe(true);
  });

  test("scroll past and back stays reachable @component", async ({ page }) => {
    await gotoReady(page, "en");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const bottom = await page.evaluate(() => document.documentElement.scrollTop);
    await page.evaluate(() => window.scrollTo(0, 0));
    const top = await page.evaluate(() => document.documentElement.scrollTop);
    expect(bottom).toBeGreaterThanOrEqual(top);
    await expect(page.locator("[data-why]").first()).toBeVisible();
  });

  test("german step cards fit at 1024 @component", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "component-1024", "1024");
    await gotoReady(page, "de");
    const overflow = await page
      .locator('[data-state="support-on-static"] [data-why-row]')
      .evaluateAll((els) => els.every((el) => el.scrollWidth <= el.clientWidth));
    expect(overflow).toBe(true);
  });

  test("rtl logical numbering @component", async ({ page }) => {
    await gotoReady(page, "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    const inset = await page.locator("[data-why-num]").nth(1).evaluate((el) => {
      return getComputedStyle(el).insetInlineStart;
    });
    expect(inset).not.toBe("");
  });

  test("aria title differs en vs de @component", async ({ page }) => {
    await gotoReady(page, "en");
    const enTitle = await page.locator("#why-title").first().innerText();
    await gotoReady(page, "de");
    const deTitle = await page.locator("#why-title").first().innerText();
    expect(enTitle).not.toBe(deTitle);
  });
});

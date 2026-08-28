import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";

const PORTS: Record<string, number> = {
  "component-1440": 4150,
  "component-1024": 4151,
  "component-768": 4152,
  "component-390": 4153,
};

let devServer: ChildProcess | null = null;
let baseURL = "";

test.describe("About page @component", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(90_000);
    const port = PORTS[testInfo.project.name] ?? 4159;
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

  test("rtl checker inline-end @component", async ({ page }) => {
    await page.goto(baseURL + "/ar/about");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl"); // dir="rtl"
    const inset = await page.locator(".vt-mh-checker").evaluate((el) => getComputedStyle(el).insetInlineEnd);
    expect(inset).not.toBe("auto");
  });

  test("translated alts @component", async ({ page }) => {
    await page.goto(baseURL + "/about");
    const en = await page.locator(".vt-mh-photo img").first().getAttribute("alt");
    await page.goto(baseURL + "/de/about");
    const de = await page.locator(".vt-mh-photo img").first().getAttribute("alt");
    expect(en && en.length).toBeTruthy();
    expect(de).not.toBe(en);
  });

  test("next/image src is optimizer url @component", async ({ page }) => {
    // Local next dev may not hit Cloudflare IMAGES; assert the optimizer URL shape.
    await page.goto(baseURL + "/about");
    const src = await page.locator(".vt-mh-photo img").first().getAttribute("src");
    expect(src ?? "").toMatch(/\/_next\/image/);
  });
});

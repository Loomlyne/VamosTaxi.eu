import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";

const PORTS: Record<string, number> = {
  "component-1440": 4170,
  "component-1024": 4171,
  "component-768": 4172,
  "component-390": 4173,
};

const STATES = [
  "signin-password-form",
  "signin-magic-form",
  "signup-password-form",
  "signup-magic-form",
  "forgot-form",
  "signin-sent",
  "signup-sent",
  "forgot-sent",
  "credentials",
  "registered",
  "pending",
  "field-errors",
  "reset-form",
  "reset-saved",
  "reset-expired",
] as const;

let devServer: ChildProcess | null = null;
let baseURL = "";

test.describe("Auth forms @component", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(90_000);
    const port = PORTS[testInfo.project.name] ?? 4179;
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

  for (const state of STATES) {
    test(`screenshot en ${state} @component`, async ({ page }) => {
      await page.goto(baseURL + "/dev/auth");
      const tile = page.locator(`[data-auth-state="${state}"]`);
      await expect(tile).toBeVisible();
      await expect(tile).toHaveScreenshot(`auth-en-${state}.png`);
    });
  }

  test("no sideways scroll at 390 @component", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "component-390", "390");
    for (const path of ["/dev/auth", "/de/dev/auth", "/fr/dev/auth", "/ar/dev/auth"]) {
      await page.goto(baseURL + path);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
  });

  test("german tabs no overflow @component", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "component-1024", "1024");
    await page.goto(baseURL + "/de/dev/auth");
    const tabs = page.locator("[data-auth-state='signin-password-form'] [role='tablist']");
    expect(
      await tabs.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
  });

  test("rtl @component", async ({ page }) => {
    await page.goto(baseURL + "/ar/dev/auth");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl"); // dir="rtl"
  });

  test("focus box-shadow none @component", async ({ page }) => {
    await page.goto(baseURL + "/dev/auth");
    const input = page.locator("[data-auth-state='signin-password-form'] input").first();
    await input.focus();
    const shadow = await input.evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow === "none" || shadow === "rgb(0, 0, 0) 0px 0px 0px 0px").toBeTruthy();
  });

  test("placeholder differs en vs de @component", async ({ page }) => {
    await page.goto(baseURL + "/dev/auth");
    const en = await page
      .locator("[data-auth-state='signin-password-form'] input[placeholder]")
      .first()
      .getAttribute("placeholder");
    await page.goto(baseURL + "/de/dev/auth");
    const de = await page
      .locator("[data-auth-state='signin-password-form'] input[placeholder]")
      .first()
      .getAttribute("placeholder");
    expect(en && de && en !== de).toBeTruthy();
  });
});

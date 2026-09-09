// apps/web/tests/visual/confirmation.spec.ts
//
// Plan 07-09 Task 3. Chrome only. Tagged @checkout.

import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";

const RUN_PROJECT = "component-1440";
const REF = "VT-26-0001";

const DRAFT = {
  pickup: "Zurich Airport (ZRH)",
  destination: "Zürich HB",
  date: "2026-10-01",
  time: "10:00",
  returnDate: "",
  returnTime: "",
  passengers: 2,
  luggage: 1,
  flightNumber: "LX123",
};

let devServer: ChildProcess | null = null;
let baseURL = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({}, testInfo) => {
  if (testInfo.project.name !== RUN_PROJECT) return;
  testInfo.setTimeout(180_000);
  const port = 4240 + testInfo.workerIndex;
  baseURL = `http://127.0.0.1:${port}`;
  devServer = spawn(NEXT_BIN, ["dev", "-p", String(port)], {
    cwd: WEB_ROOT,
    stdio: "ignore",
    detached: true,
    env: {
      ...process.env,
      NODE_ENV: "development",
      TEST_DIST_DIR: ".next-confirmation-visual",
    },
  });
  await waitForNextServer(baseURL, 180_000);
});

test.afterAll(() => {
  if (devServer?.pid) {
    try {
      process.kill(-devServer.pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
  devServer = null;
});

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== RUN_PROJECT,
    "confirmation visuals run once under component-1440 with setViewportSize.",
  );
  await page.route((url) => {
    const host = url.hostname;
    return host.includes("stripe") || host.includes("cloudflare") || host.includes("turnstile");
  }, (route) => route.abort());
});

async function grantCookie(page: Page) {
  await page.context().addCookies([
    {
      name: "vt_manage",
      value: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      url: baseURL,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

async function openConfirmed(page: Page, path: string) {
  await grantCookie(page);
  await page.route("**/api/checkout/status/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "confirmed" }),
    });
  });
  await page.addInitScript((seed) => {
    sessionStorage.setItem("vamosTrip", JSON.stringify(seed));
  }, DRAFT);
  const res = await page.goto(`${baseURL}${path}`);
  expect(res?.ok()).toBeTruthy();
  await expect(page.locator("[data-confirmation-state=confirmed]")).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
}

test("en and de voucher at 1440 and 390, ar RTL at 1440 @checkout", async ({ page }) => {
  for (const width of [1440, 390] as const) {
    await page.setViewportSize({ width, height: 900 });
    for (const locale of ["en", "de"] as const) {
      await openConfirmed(page, locale === "en" ? `/confirmation/${REF}` : `/${locale}/confirmation/${REF}`);
      await expect(page.locator("[data-confirmation-ref]")).toHaveText(REF);
      await expect(page.locator("[data-confirmation-voucher]")).toContainText("CHF");
      await expect(page.locator("[data-confirmation-voucher]")).toContainText("000");
      await expect(page.locator("[data-confirmation]")).toHaveScreenshot(`voucher-${locale}-${width}.png`);
    }
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await openConfirmed(page, `/ar/confirmation/${REF}`);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("[data-confirmation]")).toHaveScreenshot("voucher-ar-1440.png");
});

test("de give-up at 390 @checkout", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 900 });
  await grantCookie(page);
  await page.route("**/api/checkout/status/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "pending" }),
    });
  });
  const res = await page.goto(`${baseURL}/de/confirmation/${REF}`);
  expect(res?.ok()).toBeTruthy();
  await expect(page.locator("[data-confirmation-state=processing]")).toBeVisible();
  await expect(page.locator("[data-confirmation-state=give-up]")).toBeVisible({
    timeout: 40_000,
  });
  await expect(page.locator("[data-confirmation]")).toHaveScreenshot("giveup-de-390.png");
});

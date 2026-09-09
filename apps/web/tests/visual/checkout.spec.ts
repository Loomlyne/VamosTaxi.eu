// apps/web/tests/visual/checkout.spec.ts
//
// Plan 07-08 Task 3. Chrome only — the payment iframe is not screenshot.
// Tagged @checkout.

import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";

const RUN_PROJECT = "component-1440";
const WIDTHS = [1440, 1024, 768, 390] as const;

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
  quoteId: "11111111-1111-4111-8111-111111111111",
  lock: "lock-token",
  vehicleClass: "executive",
};

let devServer: ChildProcess | null = null;
let baseURL = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({}, testInfo) => {
  if (testInfo.project.name !== RUN_PROJECT) return;
  testInfo.setTimeout(180_000);
  const port = 4220 + testInfo.workerIndex;
  baseURL = `http://127.0.0.1:${port}`;
  devServer = spawn(NEXT_BIN, ["dev", "-p", String(port)], {
    cwd: WEB_ROOT,
    stdio: "ignore",
    detached: true,
    env: {
      ...process.env,
      NODE_ENV: "development",
      TEST_DIST_DIR: ".next-checkout-visual",
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
    "checkout visuals run once under component-1440 with setViewportSize.",
  );
  await page.route((url) => {
    const host = url.hostname;
    return host.includes("stripe") || host.includes("cloudflare") || host.includes("turnstile");
  }, (route) => route.abort());
});

async function openCheckout(page: Page, path: string) {
  await page.addInitScript((seed) => {
    sessionStorage.setItem("vamosTrip", JSON.stringify(seed));
  }, DRAFT);
  const res = await page.goto(`${baseURL}${path}`);
  expect(res?.ok()).toBeTruthy();
  await expect(page.locator("[data-checkout]")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
}

for (const locale of ["en", "de"] as const) {
  for (const width of WIDTHS) {
    test(`${locale} ${width} checkout chrome @checkout`, async ({ page }) => {
      await page.setViewportSize({ width, height: width >= 1024 ? 900 : 844 });
      await openCheckout(page, locale === "en" ? "/checkout" : `/${locale}/checkout`);
      await settle(page);
      // Mock does not drop the Book CTA (`cta` stays on). Wide: visible link.
      await expect(page.locator("[data-hd-cta], [data-hd-menucta]").first()).toBeAttached();
      if (width >= 1440) {
        await expect(page.locator("[data-hd-cta]").first()).toBeVisible();
      }
      await expect(page.locator("[data-checkout-charge]")).toBeVisible();
      if (locale === "de" && width === 1024) {
        const charge = page.locator("[data-checkout-charge]");
        const total = page.locator("[data-checkout-total]");
        const chargeBox = await charge.boundingBox();
        const totalBox = await total.boundingBox();
        expect(chargeBox).toBeTruthy();
        expect(totalBox).toBeTruthy();
        expect(chargeBox!.height).toBeLessThan(80);
        expect(totalBox!.height).toBeLessThan(160);
      }
      await expect(page.locator("[data-checkout]")).toHaveScreenshot(
        `checkout-${locale}-${width}.png`,
      );
    });
  }
}

for (const width of [1440, 390] as const) {
  test(`ar ${width} checkout chrome @checkout`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await openCheckout(page, "/ar/checkout");
    await settle(page);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("[data-checkout]")).toHaveScreenshot(`checkout-ar-${width}.png`);
  });
}

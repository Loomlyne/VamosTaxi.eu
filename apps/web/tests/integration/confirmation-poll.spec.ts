// apps/web/tests/integration/confirmation-poll.spec.ts
//
// Plan 07-09 Task 3. Stubs GET /api/checkout/status/{ref}. Does not talk to a
// processor. Tagged @checkout.

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
  const port = 4230 + testInfo.workerIndex;
  baseURL = `http://127.0.0.1:${port}`;
  devServer = spawn(NEXT_BIN, ["dev", "-p", String(port)], {
    cwd: WEB_ROOT,
    stdio: "ignore",
    detached: true,
    env: {
      ...process.env,
      NODE_ENV: "development",
      TEST_DIST_DIR: ".next-confirmation-poll",
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
    "confirmation-poll runs once under component-1440.",
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

async function openConfirmation(page: Page) {
  await grantCookie(page);
  await page.addInitScript((seed) => {
    sessionStorage.setItem("vamosTrip", JSON.stringify(seed));
  }, DRAFT);
  const res = await page.goto(`${baseURL}/confirmation/${REF}`);
  expect(res?.ok()).toBeTruthy();
  await expect(page.locator("[data-confirmation]")).toBeVisible();
}

test("pending then confirmed shows the voucher facts @checkout", async ({ page }) => {
  let hits = 0;
  await page.route("**/api/checkout/status/**", async (route) => {
    hits += 1;
    const status = hits >= 2 ? "confirmed" : "pending";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status }),
    });
  });
  await openConfirmation(page);
  await expect(page.locator("[data-confirmation-state=processing]")).toBeVisible();
  await expect(page.locator("[data-confirmation-state=confirmed]")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("[data-confirmation-ref]")).toHaveText(REF);
  await expect(page.getByText("Zurich Airport (ZRH)")).toBeVisible();
  await expect(page.getByText("Zürich HB")).toBeVisible();
  await expect(page.getByText("10:00")).toBeVisible();
  await expect(page.getByText("Vehicle", { exact: true })).toBeVisible();
  await expect(page.locator("[data-confirmation-voucher]")).toContainText("CHF");
  await expect(page.locator("[data-confirmation-voucher]")).toContainText("000");
});

test("a run that never leaves pending reaches give-up @checkout", async ({ page }) => {
  test.setTimeout(180_000);
  await page.route("**/api/checkout/status/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "pending" }),
    });
  });
  await openConfirmation(page);
  await expect(page.locator("[data-confirmation-state=processing]")).toBeVisible();
  await expect(page.locator("[data-confirmation-state=give-up]")).toBeVisible({
    timeout: 40_000,
  });
});

test("no cookie is not-visible and still 200 @checkout", async ({ page }) => {
  const res = await page.goto(`${baseURL}/confirmation/${REF}`);
  expect(res?.status()).toBe(200);
  await expect(page.locator("[data-confirmation-state=hidden]")).toBeVisible();
  await expect(page.locator("[data-confirmation-processing]")).toHaveCount(0);
  await expect(page.locator("[data-confirmation-voucher]")).toHaveCount(0);
});

test("hiding the tab pauses the poller @checkout", async ({ page }) => {
  let hits = 0;
  await page.route("**/api/checkout/status/**", async (route) => {
    hits += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "pending" }),
    });
  });
  await openConfirmation(page);
  await expect(page.locator("[data-confirmation-state=processing]")).toBeVisible();
  await expect.poll(() => hits, { timeout: 8_000 }).toBeGreaterThan(0);
  const frozen = hits;
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(6_000);
  expect(hits).toBe(frozen);
});

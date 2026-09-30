// apps/web/tests/integration/confirmation-poll.spec.ts
//
// Plan 07-09 Task 3. Stubs GET /api/checkout/status/{ref}. Does not talk to a
// processor. Tagged @checkout.

import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";
import { stubConsentChosen } from "../support/consent-state";

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
  await stubConsentChosen(page);
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

function stubStatus(page: Page, bodyFor: (hit: number) => Record<string, unknown>) {
  const counter = { hits: 0 };
  return page
    .route("**/api/checkout/status/**", async (route) => {
      counter.hits += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(bodyFor(counter.hits)),
      });
    })
    .then(() => counter);
}

test("confirming then booked swaps in place to the confirmation @checkout", async ({ page }) => {
  await stubStatus(page, (hit) => ({ status: hit >= 3 ? "confirmed" : "pending" }));
  await openConfirmation(page);
  await expect(page.locator("[data-confirmation-state=confirming]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Confirming your booking" })).toBeVisible();
  await expect(page.locator("[role=progressbar]")).toBeVisible();
  await expect(page.locator("[data-confirmation-state=booked]")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("[data-confirmation-ref]").first()).toHaveText(REF);
  await expect(page.getByText("Booked", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Zurich Airport (ZRH)")).toBeVisible();
  await expect(page.getByText("Zürich HB")).toBeVisible();
  await expect(page.getByText("10:00")).toBeVisible();
  await expect(page.getByText("Travellers", { exact: true })).toBeVisible();
  await expect(page.locator("[data-confirmation-voucher]")).toContainText("CHF");
  await expect(page.locator("[data-confirmation-voucher]")).toContainText("000");
  await expect(page.getByText(/add to calendar/i)).toHaveCount(0);
  await expect(page.locator('a[href*="/api/checkout/invite"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: /manage booking/i })).toBeVisible();
});

test("never confirmed: Payment received. after 20 s, no error copy, still polling @checkout", async ({ page }) => {
  await page.clock.install();
  const counter = await stubStatus(page, () => ({ status: "pending" }));
  await openConfirmation(page);
  await expect(page.locator("[data-confirmation-state=confirming]")).toBeVisible();
  // The first status GET proves the client hydrated and its timers are running.
  await expect.poll(() => counter.hits).toBeGreaterThan(0);
  await page.clock.fastForward(21_000);
  await expect(page.locator("[data-confirmation-state=received]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Payment received." })).toBeVisible();
  await expect(page.getByText("Your confirmation is on its way by e-mail.")).toBeVisible();
  await expect(page.locator("main").getByText("Questions? Write to info@vamostaxi.site.")).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/failed|error|try again|retry/i);
  const before = counter.hits;
  await page.clock.fastForward(5_000);
  await expect.poll(() => counter.hits).toBeGreaterThan(before);
  // Confirmation landing later still swaps in place.
  await page.unroute("**/api/checkout/status/**");
  await stubStatus(page, () => ({ status: "confirmed" }));
  await page.clock.fastForward(3_000);
  await expect(page.locator("[data-confirmation-state=booked]")).toBeVisible();
});

test("a booking that is not visible yet is the loading screen, never an error @checkout", async ({ page }) => {
  await stubStatus(page, () => ({ visible: false }));
  const res = await page.goto(`${baseURL}/confirmation/${REF}`);
  expect(res?.status()).toBe(200);
  await expect(page.locator("[data-confirmation-state=confirming]")).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/failed|error|not visible/i);
  await expect(page.locator("[data-confirmation-voucher]")).toHaveCount(0);
});

test("confirmation index with a session id shows Payment received. only @checkout", async ({ page }) => {
  const res = await page.goto(`${baseURL}/confirmation?session=cs_test_x`);
  expect(res?.status()).toBe(200);
  await expect(page.locator("[data-confirmation-state=received]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Payment received." })).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/failed|error|not visible/i);
});

test("the calendar file route is not a document any more @checkout", async ({ page }) => {
  const res = await page.goto(`${baseURL}/api/checkout/invite/${REF}`);
  expect(res?.status()).toBe(404);
});

test("hiding the tab pauses the poller @checkout", async ({ page }) => {
  const counter = await stubStatus(page, () => ({ status: "pending" }));
  await openConfirmation(page);
  await expect(page.locator("[data-confirmation-state=confirming]")).toBeVisible();
  await expect.poll(() => counter.hits, { timeout: 8_000 }).toBeGreaterThan(0);
  const frozen = counter.hits;
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(6_000);
  expect(counter.hits).toBe(frozen);
});

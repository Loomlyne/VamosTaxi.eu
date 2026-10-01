// apps/web/tests/visual/confirmation.spec.ts
//
// Plan 07-09 Task 3. Chrome only. Tagged @checkout.

import { test, expect, type Page } from "../support/test";
import { testPort } from "../support/port";
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
  const port = testPort(4240) + testInfo.workerIndex;
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
  await stubConsentChosen(page);
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

type Screen = "confirming" | "received" | "booked";

// English only in the browser: middleware 308s /de|/fr|/ar/... to the unprefixed URL and
// (localeDetection: false) the NEXT_LOCALE cookie does not select a Next route locale, so
// de/ar cannot be opened by URL here. de/ar copy is proven in lib/checkout/confirmation-phase.test.ts.
async function openScreen(page: Page, path: string, screen: Screen) {
  await grantCookie(page);
  let hits = 0;
  await page.route("**/api/checkout/status/**", async (route) => {
    hits += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: screen === "booked" ? "confirmed" : "pending" }),
    });
  });
  await page.addInitScript((seed) => {
    sessionStorage.setItem("vamosTrip", JSON.stringify(seed));
  }, DRAFT);
  const res = await page.goto(`${baseURL}${path}`);
  expect(res?.ok()).toBeTruthy();
  if (screen === "received") {
    // The first status GET proves the client hydrated and its timers are running. Count only
    // requests made after goto returned: while goto waits for the server, the previous page keeps
    // polling every second and hit this route too, so on a slow runner the 21 s jump below ran
    // before the new page had started its clock and the screen stayed on "confirming".
    hits = 0;
    await expect.poll(() => hits).toBeGreaterThan(0);
    await page.clock.fastForward(21_000);
    await expect
      .poll(async () => {
        await page.clock.fastForward(1_000);
        return page.locator("[data-confirmation-state=received]").count();
      })
      .toBe(1);
  }
  await expect(page.locator(`[data-confirmation-state=${screen}]`)).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

const SCREENS: Screen[] = ["confirming", "received", "booked"];

test("S3 A, S3 B and S4 in en at 1440, 1024, 768 and 390 @checkout", async ({ page }) => {
  await page.clock.install();
  for (const width of [1440, 1024, 768, 390] as const) {
    await page.setViewportSize({ width, height: 900 });
    for (const screen of SCREENS) {
      await openScreen(page, `/confirmation/${REF}`, screen);
      await noSidewaysScroll(page);
      if (screen === "booked") {
        await expect(page.locator("[data-confirmation-voucher]")).toContainText("000");
        await expect(page.getByText(/add to calendar/i)).toHaveCount(0);
      }
      await expect(page.locator("[data-confirmation]")).toHaveScreenshot(`${screen}-en-${width}.png`);
    }
  }
});

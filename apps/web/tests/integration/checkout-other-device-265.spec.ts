// apps/web/tests/integration/checkout-other-device-265.spec.ts
//
// Plan 26.5-10 Task 3, D-16 / D-16a: an unpaid booking is never continued on another device.
// A second browser opens a pasted checkout link. The link may carry the trip, the class and
// the ticked extras; the server answers "none" to resume (no vt_manage cookie), and the page
// must show the trip, an empty form, no booking reference and drop the other browser's quote
// id (`resume`, `pay`) from the address bar. A signed-in customer gets name, e-mail and phone
// from their own row only. The control case shows the same-device path still refills.
// Server answers are route fixtures (the Worker e2e other-device.e2e.mjs proves the real
// routes). Runs once under component-1440 with its own `next dev`. Tagged @checkout.

import { test, expect, type Page, type Route } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";
import { openInLocale } from "../support/locale";

const RUN_PROJECT = "component-1440";
const GS = "11111111-1111-4111-8111-111111111111";
const QID = "22222222-2222-4222-8222-222222222222";
const BOOKING = "33333333-3333-4333-8333-333333333333";
const TRIP =
  `from=Zurich%20Airport&fid=dXJuOm1ieHBvaTox&to=Bahnhofstrasse%201&tid=dXJuOm1ieHBvaTox2` +
  `&gs=${GS}&when=2026-12-15T08:15&pax=2&bags=3&flight=LX318`;
const PASTED = `${TRIP}&class=business&extras=child-seat&resume=${QID}&pay=unpaid`;

let devServer: ChildProcess | null = null;
let baseURL = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({}, testInfo) => {
  if (testInfo.project.name !== RUN_PROJECT) return;
  testInfo.setTimeout(180_000);
  const port = 4337;
  baseURL = `http://127.0.0.1:${port}`;
  devServer = spawn(NEXT_BIN, ["dev", "-p", String(port)], {
    cwd: WEB_ROOT,
    stdio: "ignore",
    detached: true,
    env: { ...process.env, NODE_ENV: "development", TEST_DIST_DIR: ".next-checkout-other-device-265" },
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

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== RUN_PROJECT, "checkout page specs run once under component-1440.");
  test.setTimeout(90_000);
});

type Opts = {
  me?: { signed_in: true; email: string; first_name: string; last_name: string; phone: string };
  resume?: Record<string, unknown>;
};

async function setup(page: Page, opts: Opts = {}) {
  await page.route(
    (url) => url.hostname.includes("cloudflare") || url.hostname.includes("turnstile"),
    (route) => route.abort(),
  );
  await page.route("**/api/flight/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: false }) }),
  );
  await page.route("**/api/quote", async (route: Route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        quote_id: QID,
        lock: "v1.fixture.lock",
        expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
        pricing_live: true,
        classes: ["economy", "business"].map((slug) => ({
          slug,
          name: slug === "economy" ? "Economy" : "Business",
          eligible: true,
          ineligible_reason: null,
          effective_max_pax: 3,
          max_bags: 3,
          fixed_route: false,
          total_rappen: 10810,
          lines: [],
          photo_url: null,
        })),
      }),
    });
  });
  await page.route("**/api/geo/retrieve**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ place: { isAirport: true } }) }),
  );
  await page.route("**/api/checkout/extras", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        extras: [{ code: "child-seat", amount_rappen: 1000, names: { en: "Child seat" } }],
        vat_rate_bps: 810,
      }),
    }),
  );
  await page.route("**/api/checkout/price", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, lines: [], net_rappen: 10000, vat_rappen: 810, charged_rappen: 10810 }),
    }),
  );
  await page.route("**/api/checkout/me", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(opts.me ?? { signed_in: false }) }),
  );
  await page.route("**/api/checkout/resume**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(opts.resume ?? { state: "none" }) }),
  );
}

async function openPasted(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  const res = await openInLocale(page, baseURL, `/checkout?${PASTED}`, "en");
  expect(res?.ok()).toBeTruthy();
  await expect(page.locator("[data-co-classes]")).toBeVisible({ timeout: 30_000 });
}

const contactInput = (page: Page, autocomplete: string) => page.locator(`[data-co-contact] input[autocomplete="${autocomplete}"]`);

async function expectNoResumeInUrl(page: Page) {
  await expect.poll(() => new URL(page.url()).searchParams.has("resume")).toBe(false);
  const params = new URL(page.url()).searchParams;
  expect(params.has("pay")).toBe(false);
  // D-16a: trip, class and extras stay.
  expect(params.get("class")).toBe("business");
  expect(params.get("extras")).toBe("child-seat");
  expect(params.get("when")).toBe("2026-12-15T08:15");
}

async function expectEmptyForm(page: Page) {
  await expect(contactInput(page, "given-name")).toHaveValue("");
  await expect(contactInput(page, "family-name")).toHaveValue("");
  await expect(contactInput(page, "email")).toHaveValue("");
  await expect(page.locator("[data-co-contact] [data-vt-phone] input")).toHaveValue(/^\+?$/);
  await expect(page.locator("#co-company-button")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#co-note-button")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("[data-co-voucher-applied]")).toHaveCount(0);
  await expect(page.locator("[data-co-back-notice]")).toHaveCount(0);
  expect(await page.evaluate(() => document.body.innerText)).not.toMatch(/VT-\d{2}-\d{4}/);
}

test("second browser, pasted link: the trip is shown, the form is empty, resume and pay leave the address bar @checkout", async ({ page }) => {
  await setup(page);
  await openPasted(page);
  await expect(page.locator("[data-co-route]")).toContainText("Zurich Airport");
  await expect(page.locator("[data-co-route]")).toContainText("Bahnhofstrasse 1");
  await expect(page.locator("[data-co-facts]")).toContainText("15");
  await expectEmptyForm(page);
  await expectNoResumeInUrl(page);
});

test("second browser, signed in as the same customer: only name, e-mail and phone from their own row @checkout", async ({ page }) => {
  await setup(page, {
    me: { signed_in: true, email: "amira@example.com", first_name: "Amira", last_name: "Keller", phone: "+41796267082" },
  });
  await openPasted(page);
  await expect(contactInput(page, "given-name")).toHaveValue("Amira");
  await expect(contactInput(page, "family-name")).toHaveValue("Keller");
  await expect(contactInput(page, "email")).toHaveValue("amira@example.com");
  await expect(page.locator("[data-co-contact] [data-vt-phone] input")).toHaveValue(/41796267082|79 626 70 82/);
  await expect(page.locator("#co-company-button")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#co-note-button")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("[data-co-voucher-applied]")).toHaveCount(0);
  await expect(page.locator("[data-co-back-notice]")).toHaveCount(0);
  expect(await page.evaluate(() => document.body.innerText)).not.toMatch(/VT-\d{2}-\d{4}/);
  await expectNoResumeInUrl(page);
});

test("control, same device: an expired resume answer refills the tab @checkout", async ({ page }) => {
  await setup(page, {
    resume: {
      state: "expired",
      booking_id: BOOKING,
      quote_id: QID,
      trip_query: TRIP,
      contact: { name: "Amira Keller", email: "amira@example.com", phone: "+41796267082" },
      company: { name: "", address: "", vat: "" },
      note: "",
      class: "business",
      extra_codes: ["child-seat"],
      coupon: null,
      charged_rappen: 10810,
    },
  });
  await openPasted(page);
  await expect(contactInput(page, "given-name")).toHaveValue("Amira");
  await expect(contactInput(page, "email")).toHaveValue("amira@example.com");
  await expect(page.locator("[data-co-top-notice]").first()).toBeVisible();
});

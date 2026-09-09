// apps/web/tests/integration/checkout-guest.spec.ts
//
// Plan 07-08 Task 3. Stubs POST /api/checkout/intent. Does not talk to a
// processor. Tagged @checkout.

import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";

const RUN_PROJECT = "component-1440";

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
  const port = 4210 + testInfo.workerIndex;
  baseURL = `http://127.0.0.1:${port}`;
  devServer = spawn(NEXT_BIN, ["dev", "-p", String(port)], {
    cwd: WEB_ROOT,
    stdio: "ignore",
    detached: true,
    env: {
      ...process.env,
      NODE_ENV: "development",
      TEST_DIST_DIR: ".next-checkout-guest",
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
    "checkout-guest runs once under component-1440.",
  );
  await page.route((url) => {
    const host = url.hostname;
    return host.includes("stripe") || host.includes("cloudflare") || host.includes("turnstile");
  }, (route) => route.abort());
});

async function openCheckout(page: Page, draft: Record<string, unknown> = DRAFT) {
  await page.addInitScript((seed) => {
    sessionStorage.setItem("vamosTrip", JSON.stringify(seed));
  }, draft);
  const res = await page.goto(`${baseURL}/checkout`);
  expect(res?.ok()).toBeTruthy();
  await expect(page.locator("[data-checkout]")).toBeVisible();
}

async function fillContact(page: Page) {
  await page.getByLabel("First name").fill("Ada");
  await page.getByLabel("Last name").fill("Lovelace");
  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByLabel("Mobile").fill("+41 79 000 00 00");
}

test("guest sees the route, vehicle class, total, and can fill contact @checkout", async ({
  page,
}) => {
  await openCheckout(page);
  await expect(page.getByText("Zurich Airport (ZRH)")).toBeVisible();
  await expect(page.getByText("Zürich HB")).toBeVisible();
  await expect(page.locator("[data-checkout-total]")).toContainText("CHF");
  await expect(page.locator("[data-checkout-total]")).toContainText("000");
  await expect(page.getByRole("radio", { name: /continue as guest/i })).toBeChecked();
  await fillContact(page);
  await expect(page.getByLabel("First name")).toHaveValue("Ada");
});

test("an empty required field shows an error and does not POST @checkout", async ({ page }) => {
  const posts: string[] = [];
  await page.route("**/api/checkout/intent", async (route) => {
    posts.push(route.request().postData() ?? "");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ client_secret: "cs_test_stub", reference: "VT-TEST01" }),
    });
  });
  await openCheckout(page);
  await page.getByRole("button", { name: "Pay and confirm" }).click();
  await expect(page.getByText("Enter a first name")).toBeVisible();
  expect(posts).toEqual([]);
});

test("POST body has quote_id, idempotency_key, contact — never totals or rate ids @checkout", async ({
  page,
}) => {
  let body: Record<string, unknown> = {};
  await page.route("**/api/checkout/intent", async (route) => {
    body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ client_secret: "cs_test_stub", reference: "VT-TEST01" }),
    });
  });
  await openCheckout(page);
  await fillContact(page);
  await page.getByRole("button", { name: "Pay and confirm" }).click();
  await expect.poll(() => body.quote_id).toBe(DRAFT.quoteId);
  expect(typeof body.idempotency_key).toBe("string");
  expect(String(body.idempotency_key).length).toBeGreaterThan(8);
  expect(body.contact).toMatchObject({
    name: "Ada Lovelace",
    email: "ada@example.com",
    phone: "+41 79 000 00 00",
  });
  expect(body).not.toHaveProperty("total_rappen");
  expect(body).not.toHaveProperty("distance_m");
  expect(body).not.toHaveProperty("rate_version_id");
  expect(body).not.toHaveProperty("lines");
  await expect(page.locator("[data-checkout-pay]")).toBeVisible();
});

test("reload keeps the same idempotency_key @checkout", async ({ page }) => {
  const keys: string[] = [];
  await page.route("**/api/checkout/intent", async (route) => {
    const parsed = JSON.parse(route.request().postData() ?? "{}") as { idempotency_key?: string };
    if (parsed.idempotency_key) keys.push(parsed.idempotency_key);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ client_secret: "cs_test_stub", reference: "VT-TEST01" }),
    });
  });
  await openCheckout(page, { ...DRAFT, idempotencyKey: "11111111-2222-4333-8444-555555555555" });
  await fillContact(page);
  await page.getByRole("button", { name: "Pay and confirm" }).click();
  await expect.poll(() => keys.length).toBe(1);
  await page.reload();
  await expect(page.locator("[data-checkout]")).toBeVisible();
  await fillContact(page);
  await page.getByRole("button", { name: "Pay and confirm" }).click();
  await expect.poll(() => keys.length).toBe(2);
  expect(keys[0]).toBe(keys[1]);
  expect(keys[0]).toBe("11111111-2222-4333-8444-555555555555");
});

test("pricing_not_live shows the message and does not mount a payment panel @checkout", async ({
  page,
}) => {
  await page.route("**/api/checkout/intent", async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ code: "pricing_not_live" }),
    });
  });
  await openCheckout(page);
  await fillContact(page);
  await page.getByRole("button", { name: "Pay and confirm" }).click();
  await expect(page.getByText("Online booking is not open yet. Call dispatch.")).toBeVisible();
  await expect(page.locator("[data-checkout-pay]")).toHaveCount(0);
});

test("quote_expired offers Get a new quote @checkout", async ({ page }) => {
  await page.route("**/api/checkout/intent", async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ code: "quote_expired", action: "requote" }),
    });
  });
  await openCheckout(page);
  await fillContact(page);
  await page.getByRole("button", { name: "Pay and confirm" }).click();
  await expect(page.getByText("This quote has expired. Get a new price.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Get a new quote" })).toBeVisible();
});

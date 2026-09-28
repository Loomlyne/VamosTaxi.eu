import { test, expect, type Page, type Route } from "@playwright/test";
import { serveMock, waitForMockReady } from "../support/mock-harness";

// Quick task 260928-lux. Under 700px the class strip is hidden, so on a phone the
// sheet's SHOW FIXED PRICES button must carry a locked quote on to /checkout/trip.
// Tablet and desktop keep the strip and must never navigate from that button.

const QUOTE_OK = {
  ok: true,
  quote_id: "test-quote",
  lock: "test-lock",
  expires_at: "2099-01-01T00:00:00.000Z",
  classes: [
    { slug: "business", eligible: true, total_rappen: 13000 },
    { slug: "van", eligible: true, total_rappen: 15000 },
  ],
};

async function dismissCookies(page: Page) {
  const accept = page.getByRole("button", { name: /Accept all/i });
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
  }
}

async function stubTripPage(page: Page) {
  await page.route("**/checkout/trip**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>trip</body></html>" }),
  );
}

async function openHome(page: Page) {
  const url = await serveMock("app/home/home.dc.html");
  await page.goto(url);
  await waitForMockReady(page);
  await dismissCookies(page);
  return url;
}

// Under 1080px the booking card is inline (no sheet). Picking the airport moves the
// widget to the Airport pickup tab, which needs a flight number before it quotes.
async function fillTrip(page: Page) {
  const pickup = page.getByRole("combobox", { name: "Pickup" }).filter({ visible: true }).first();
  await pickup.fill("Zurich Airport");
  await page.getByRole("option", { name: /Zurich Airport \(ZRH\), Terminal 2/ }).click();

  const destination = page.getByRole("combobox", { name: "Destination" }).filter({ visible: true }).first();
  await destination.fill("Bahnhofstrasse");
  await page.getByRole("option", { name: /Zurich, Bahnhofstrasse 1/ }).click();

  const flight = page.getByRole("textbox", { name: /^Flight/ }).filter({ visible: true }).first();
  if (await flight.isVisible().catch(() => false)) await flight.fill("LX 54");

  const when = page.getByRole("button", { name: /Select date & time/ }).filter({ visible: true }).first();
  await when.click();
  const dialog = page.getByRole("dialog", { name: "Pickup date & time" }).filter({ visible: true }).first();
  await dialog.getByRole("button", { name: "Next month" }).click();
  await dialog.getByRole("button", { name: "5", exact: true }).click();
  const saved = dialog.getByRole("button", { name: "Saved" });
  if (await saved.isVisible().catch(() => false)) await saved.click();
}

function showPrices(page: Page) {
  return page.getByRole("button", { name: /show fixed prices/i }).filter({ visible: true }).first();
}

async function savedTrip(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem("vamosTrip");
    return raw ? JSON.parse(raw) : null;
  });
}

test.describe("Home phone SHOW FIXED PRICES @customer", () => {
  test("phone: a locked quote continues to /checkout/trip @customer", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "component-390");
    let posts = 0;
    await page.route("**/api/quote", async (route: Route) => {
      if (route.request().method() === "POST") posts += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(QUOTE_OK) });
    });
    await stubTripPage(page);
    await openHome(page);
    await fillTrip(page);

    await showPrices(page).click();
    await page.waitForURL(/\/checkout\/trip/, { timeout: 8000 });

    const trip = await savedTrip(page);
    expect(trip).not.toBeNull();
    expect(trip.quote_id).toBe("test-quote");
    expect(trip.lock).toBe("test-lock");
    expect(trip.vehicle).toBe("");
    expect(Array.isArray(trip.classes) && trip.classes.length > 0).toBe(true);
    expect(posts).toBeGreaterThan(0);
  });

  test("phone: a second tap on a live locked quote navigates without a new quote @customer", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "component-390");
    let posts = 0;
    await page.route("**/api/quote", async (route: Route) => {
      if (route.request().method() === "POST") posts += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(QUOTE_OK) });
    });
    await stubTripPage(page);
    await openHome(page);
    await fillTrip(page);

    // Let the field-driven quotes settle into a live, locked quote before tapping.
    await page.waitForTimeout(1200);
    const before = posts;
    expect(before).toBeGreaterThan(0);
    await showPrices(page).click();
    await page.waitForURL(/\/checkout\/trip/, { timeout: 8000 });
    expect(posts).toBe(before);
  });

  test("phone: a refused quote never navigates @customer", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "component-390");
    await page.route("**/api/quote", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: false, error: "route_unavailable" }) }),
    );
    await stubTripPage(page);
    const url = await openHome(page);
    await fillTrip(page);

    await showPrices(page).click();
    await page.waitForTimeout(1500);
    expect(page.url()).toBe(url);
    const trip = await savedTrip(page);
    expect(trip && trip.quote_id).toBeFalsy();
  });

  test("phone: a failed quote request never navigates @customer", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "component-390");
    await page.route("**/api/quote", (route) => route.abort());
    await stubTripPage(page);
    const url = await openHome(page);
    await fillTrip(page);

    await showPrices(page).click();
    await page.waitForTimeout(1500);
    expect(page.url()).toBe(url);
    const trip = await savedTrip(page);
    expect(trip && trip.quote_id).toBeFalsy();
  });

  test("tablet: SHOW FIXED PRICES quotes into the class strip and stays put @customer", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "component-1024");
    await page.route("**/api/quote", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(QUOTE_OK) }),
    );
    await stubTripPage(page);
    const url = await openHome(page);
    await fillTrip(page);

    await showPrices(page).click();
    await page.waitForTimeout(1500);
    expect(page.url()).toBe(url);
    await expect(page.locator("[data-fleet-card]").filter({ hasText: "Business" })).toBeVisible();
    const trip = await savedTrip(page);
    expect(trip && trip.vehicle === "" && trip.quote_id).toBeFalsy();
  });

  test("desktop: the live quote fills the class strip and never navigates @customer", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "component-1440");
    await page.route("**/api/quote", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(QUOTE_OK) }),
    );
    await stubTripPage(page);
    const url = await openHome(page);
    await fillTrip(page);

    await expect(page.locator("[data-fleet-card]").filter({ hasText: "Business" })).toBeVisible();
    const button = showPrices(page);
    if (await button.isVisible().catch(() => false)) await button.click();
    await page.waitForTimeout(1500);
    expect(page.url()).toBe(url);
    const trip = await savedTrip(page);
    expect(trip && trip.vehicle === "" && trip.quote_id).toBeFalsy();
  });
});

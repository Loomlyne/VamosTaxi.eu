// apps/web/tests/visual/bp-distance-home-capture.spec.ts
//
// Booking polish, hand-over 1 (design pictures), home proposal. NOT a gate: runs only with
// BP_CAPTURE=1. The home class cards exist from 1081 px up; the distance is the server's
// `route.legs[0].distance_m` from the POST /api/quote fixture. Amounts
// are null: no price is invented, so the cards read "Price at checkout".

import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { serveMock, waitForMockReady } from "../support/mock-harness";
import { WEB_ROOT } from "../support/server-harness";

const OUT = join(WEB_ROOT, "..", "..", ".planning", "quick", "260930-bp-booking-polish", "screens");
const PLACES = [
  { mapbox_id: "mb-air-1", name: "Zurich Airport", address: "Kloten", is_airport: true },
  { mapbox_id: "mb-davos-1", name: "Davos Platz", address: "Davos", is_airport: false },
];
const CLASSES = [
  { slug: "economy", name: "Economy", eligible: true, ineligible_reason: null, effective_max_pax: 3, max_bags: 3, total_rappen: null, photo_url: "/photos/classes/class-economy.jpg" },
  { slug: "business", name: "Business", eligible: true, ineligible_reason: null, effective_max_pax: 7, max_bags: 6, total_rappen: null, photo_url: "/photos/classes/class-business.jpg" },
  { slug: "van-luxury", name: "Van luxury", eligible: true, ineligible_reason: null, effective_max_pax: 12, max_bags: 9, total_rappen: null, photo_url: "/photos/classes/class-van.jpg" },
];

async function stub(page: Page) {
  await page.route("**/photos/classes/**", (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    return route.fulfill({ status: 200, contentType: "image/jpeg", body: readFileSync(join(WEB_ROOT, "..", "..", "assets", "photography", name)) });
  });
  await page.route("**/api/geo/suggest**", async (route) => {
    const q = (new URL(route.request().url()).searchParams.get("q") ?? "").toLowerCase();
    const hits = PLACES.filter((s) => (q.includes("davos") ? s.name.includes("Davos") : s.is_airport)).map(({ mapbox_id, name, address }) => ({ mapbox_id, name, address }));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ suggestions: hits }) });
  });
  await page.route("**/api/geo/retrieve**", async (route) => {
    const id = new URL(route.request().url()).searchParams.get("mapbox_id");
    const hit = PLACES.find((s) => s.mapbox_id === id);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, place: hit ? { mapbox_id: id, name: hit.name, isAirport: hit.is_airport } : null }) });
  });
  await page.route("**/api/quote", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, classes: CLASSES, fixed_routes: [] }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true, quote_id: "q-fixture", lock: "lock-fixture", expires_at: "2099-01-01T00:00:00Z", pricing_live: false, display_currency: "CHF",
        route: { legs: [{ leg_seq: 1, distance_m: 148_230, duration_s: 6400, geometry: { type: "LineString", coordinates: [] }, origin_zone_id: null, dest_zone_id: null, road: true }] },
        classes: CLASSES,
      }),
    });
  });
}

async function fillTrip(page: Page) {
  await page.getByRole("combobox", { name: "From", exact: true }).fill("Kloten terminal");
  await page.getByRole("option", { name: /Zurich Airport/ }).last().click();
  await page.locator('[data-bx="flight"] input').fill("LX 318");
  await page.getByRole("combobox", { name: "To", exact: true }).fill("Davos");
  await page.getByRole("option", { name: /Davos Platz/ }).last().click();
  await page.locator('[data-bx="when"] button[aria-haspopup="dialog"]').click();
  const dialog = page.getByRole("dialog", { name: "When" });
  await dialog.getByRole("button", { name: "Next month" }).click();
  await dialog.getByRole("button", { name: "5", exact: true }).click();
  const saved = dialog.getByRole("button", { name: "Saved" });
  if (await saved.isVisible().catch(() => false)) await saved.click();
  await page.keyboard.press("Escape");
}

test("booking polish pictures: home distance @bp-capture", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "component-1440" || !process.env.BP_CAPTURE, "capture only, BP_CAPTURE=1");
  testInfo.setTimeout(300_000);
  await stub(page);
  for (const width of [1440, 1180] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(await serveMock("app/home/home.dc.html"));
    await waitForMockReady(page);
    const accept = page.getByRole("button", { name: /Accept all/i });
    if (await accept.isVisible().catch(() => false)) await accept.click();
    await fillTrip(page);
    const sec = page.locator("[data-cc]");
    await expect(sec).toHaveAttribute("data-state", "ok", { timeout: 8000 });
    await expect(sec.locator("[data-cc-km]")).toHaveText("148.2 km");
    for (const lang of ["en", "de", "ar"] as const) {
      await page.evaluate((l) => (window as unknown as { VamosLocale: { setLang(v: string): void } }).VamosLocale.setLang(l), lang);
      await page.waitForTimeout(500);
      if (lang !== "en") {
        const cov = await page.evaluate(
          (l) => (window as unknown as { VamosLocale: { coverage(r: Element, l: string): unknown } }).VamosLocale.coverage(document.querySelector("[data-cc]")!, l),
          lang,
        );
        expect(cov).toMatchObject({ count: 0, strings: [], attrs: [] });
      }
      const w = await page.evaluate(() => ({ sw: document.scrollingElement!.scrollWidth, iw: window.innerWidth }));
      expect(w.sw).toBeLessThanOrEqual(w.iw);
      await sec.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await sec.screenshot({ path: join(OUT, `home-${width}-${lang}-class-section.png`) });
      await page.screenshot({ path: join(OUT, `home-${width}-${lang}-page.png`) });
    }
    await page.evaluate(() => (window as unknown as { VamosLocale: { setLang(v: string): void } }).VamosLocale.setLang("en"));
  }
});

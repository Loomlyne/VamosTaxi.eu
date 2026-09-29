import { test, expect, type Page } from "@playwright/test";
import { serveMock, waitForMockReady } from "../support/mock-harness";

const SHOTS = "/private/tmp/claude-501/-Users-koss-Developer-VamosTaxi-eu/3c6c6056-f11d-41a2-8b13-17a758844e5c/scratchpad";

const SUGGESTIONS = [
  { mapbox_id: "mb-air-1", name: "Fixture Airport", address: "Kloten", is_airport: true },
  { mapbox_id: "mb-street-1", name: "Fixture Street 1", address: "Zurich", is_airport: false },
  { mapbox_id: "mb-street-2", name: "Fixture Street 2", address: "Zurich", is_airport: false },
];

async function stubGeo(page: Page) {
  await page.route("**/api/geo/suggest**", async (route) => {
    const q = (new URL(route.request().url()).searchParams.get("q") ?? "").toLowerCase();
    const hits = SUGGESTIONS.filter((s) => s.name.toLowerCase().includes(q)).map(({ mapbox_id, name, address }) => ({ mapbox_id, name, address }));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ suggestions: hits }) });
  });
  await page.route("**/api/geo/retrieve**", async (route) => {
    const id = new URL(route.request().url()).searchParams.get("mapbox_id");
    const hit = SUGGESTIONS.find((s) => s.mapbox_id === id);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, place: hit ? { mapbox_id: id, name: hit.name, isAirport: hit.is_airport } : null }) });
  });
}

async function open(page: Page, width: number) {
  await page.setViewportSize({ width, height: 800 });
  await stubGeo(page);
  await page.goto(await serveMock("app/home/home.dc.html"));
  await waitForMockReady(page);
  const accept = page.getByRole("button", { name: /Accept all/i });
  if (await accept.isVisible().catch(() => false)) await accept.click();
}

type R = { left: number; right: number; top: number; bottom: number };

const rect = (page: Page, sel: string) =>
  page.evaluate((q) => {
    const el = document.querySelector(q) as HTMLElement | null;
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
  }, sel);

/** Field and its list measured in one pass, so a page scroll between two calls cannot skew the comparison. */
const fieldAndList = (page: Page, cell: "from" | "to") =>
  page.evaluate((c) => {
    const f = document.querySelector(`#book [data-bx=${c}] [data-vtcombo]`)!.getBoundingClientRect();
    const l = document.querySelector(`#book [data-bx=${c}] [data-sug]`)!.getBoundingClientRect();
    return { fieldBottom: f.bottom, fieldTop: f.top, listTop: l.top };
  }, cell);

const overlap = (a: R, b: R) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

/** Every visible option of the open list is what the user actually hits at its centre (nothing paints over it). */
async function listOnTop(page: Page) {
  await page.waitForTimeout(700);
  return page.evaluate(() => {
    const list = document.querySelector('#book [data-sug]') as HTMLElement | null;
    if (!list) return { found: false, hits: [] as boolean[] };
    const rows = (Array.from(list.querySelectorAll('[data-sug-row]')) as HTMLElement[]).slice(0, 2);
    const hits = rows.map((r) => {
      const b = r.getBoundingClientRect();
      if (b.bottom > window.innerHeight || b.top < 0) return false;
      const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return !!top && (top === r || r.contains(top));
    });
    return { found: true, hits };
  });
}

test.describe("Home desktop fixes 26.4.2 @component", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "component-1440", "laptop widths run in the 1440 project");
  });

  for (const w of [1440, 1360, 1280, 1081]) {
    test(`airport flight field clear of From, lists below their field at ${w}`, async ({ page }) => {
      await open(page, w);
      const from = page.getByRole("combobox", { name: "From", exact: true });
      await from.fill("Fixture Air");
      await expect(page.getByRole("option", { name: /Fixture Airport/ })).toBeVisible();
      expect((await listOnTop(page)).hits.every(Boolean)).toBe(true);
      const m1 = await fieldAndList(page, "from");
      expect(m1.listTop).toBeGreaterThanOrEqual(m1.fieldBottom - 1);
      expect(m1.fieldTop).toBeGreaterThan(60);
      await page.screenshot({ path: `${SHOTS}/obf-b-from-list-${w}.png` });
      await page.getByRole("option", { name: /Fixture Airport/ }).click();
      await expect(page.getByRole("textbox", { name: "Flight number" })).toBeVisible();
      const flight = await rect(page, '#book [data-bx=flight]:not([data-om-label="Add flight"]) [data-vtcombo]');
      const fromAfter = await rect(page, "#book [data-bx=from] [data-vtcombo]");
      expect(overlap(flight!, fromAfter!)).toBe(false);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${SHOTS}/obf-b-flight-${w}.png` });
      // Typing in From again while the flight field is showing: list still below From and on top.
      await from.fill("Fixture");
      await expect(page.getByRole("option", { name: /Fixture Street 1/ })).toBeVisible();
      await page.screenshot({ path: `${SHOTS}/obf-b-from-retype-${w}.png` });
      expect((await listOnTop(page)).hits.every(Boolean)).toBe(true);
      const m2 = await fieldAndList(page, "from");
      expect(m2.listTop).toBeGreaterThanOrEqual(m2.fieldBottom - 1);
      await page.getByRole("option", { name: /Fixture Street 2/ }).click();
      const to = page.getByRole("combobox", { name: "To", exact: true });
      await to.fill("Fixture Street");
      await expect(page.getByRole("option", { name: /Fixture Street 1/ })).toBeVisible();
      expect((await listOnTop(page)).hits.every(Boolean)).toBe(true);
      const m3 = await fieldAndList(page, "to");
      expect(m3.listTop).toBeGreaterThanOrEqual(m3.fieldBottom - 1);
      await page.screenshot({ path: `${SHOTS}/obf-b-to-list-${w}.png` });
    });
  }

  test("flight field visible with the To list open below its field at 1440", async ({ page }) => {
    await open(page, 1440);
    await page.getByRole("combobox", { name: "From", exact: true }).fill("Fixture Air");
    await page.getByRole("option", { name: /Fixture Airport/ }).click();
    await expect(page.getByRole("textbox", { name: "Flight number" })).toBeVisible();
    await page.getByRole("combobox", { name: "To", exact: true }).fill("Fixture Street");
    await expect(page.getByRole("option", { name: /Fixture Street 1/ })).toBeVisible();
    expect((await listOnTop(page)).hits.every(Boolean)).toBe(true);
    const m = await fieldAndList(page, "to");
    expect(m.listTop).toBeGreaterThanOrEqual(m.fieldBottom - 1);
    const flight = await rect(page, '#book [data-bx=flight]:not([data-om-label="Add flight"]) [data-vtcombo]');
    const from = await rect(page, "#book [data-bx=from] [data-vtcombo]");
    expect(overlap(flight!, from!)).toBe(false);
    await page.screenshot({ path: `${SHOTS}/obf-desktop-flight-dropdown-1440.png` });
  });
});

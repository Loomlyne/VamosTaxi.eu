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

async function open(page: Page, width: number, height = 800) {
  await page.setViewportSize({ width, height });
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

const overlap = (a: R, b: R) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

/** Field and its list measured in one pass, so a page scroll between two calls cannot skew the comparison. */
const fieldAndList = (page: Page, cell: "from" | "to") =>
  page.evaluate((c) => {
    const f = document.querySelector(`#book [data-bx=${c}] [data-vtcombo]`)!.getBoundingClientRect();
    const l = document.querySelector(`#book [data-bx=${c}] [data-sug]`)!.getBoundingClientRect();
    return { fieldTop: f.top, fieldBottom: f.bottom, listTop: l.top, listBottom: l.bottom, vh: window.innerHeight, sy: window.scrollY };
  }, cell);

/** The first two options of the open list are what the user actually hits at their centre (nothing paints over them). */
async function listOnTop(page: Page) {
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const list = document.querySelector("#book [data-sug]") as HTMLElement | null;
    if (!list) return { found: false, hits: [] as boolean[] };
    const rows = (Array.from(list.querySelectorAll("[data-sug-row]")) as HTMLElement[]).slice(0, 2);
    const hits = rows.map((r) => {
      const b = r.getBoundingClientRect();
      if (b.bottom > window.innerHeight || b.top < 0) return false;
      const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return !!top && (top === r || r.contains(top));
    });
    return { found: true, hits };
  });
}

const cardHeight = (page: Page) => page.evaluate(() => Math.round(document.querySelector("[data-bookcard]")!.getBoundingClientRect().height));

test.describe("Home desktop fixes 26.4.2 @component", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "component-1440", "laptop widths run in the 1440 project");
  });

  for (const w of [1440, 1360, 1280, 1081]) {
    test(`airport pickup: flight field slides in before From, focus lands in it, the bar does not grow at ${w}`, async ({ page }) => {
      await open(page, w);
      const h0 = await cardHeight(page);
      const from = page.getByRole("combobox", { name: "From", exact: true });
      await from.fill("Fixture Air");
      await page.getByRole("option", { name: /Fixture Airport/ }).click();
      const flightInput = page.getByRole("textbox", { name: "Flight number" });
      await expect(flightInput).toBeVisible();
      await expect(flightInput).toBeFocused();
      await page.waitForTimeout(400);
      const flight = await rect(page, '#book [data-bx=flight]:not([data-om-label="Add flight"]) [data-vtcombo]');
      const fromBox = await rect(page, "#book [data-bx=from] [data-vtcombo]");
      expect(overlap(flight!, fromBox!)).toBe(false);
      expect(flight!.right).toBeLessThanOrEqual(fromBox!.left + 1);
      expect(Math.abs(flight!.top - fromBox!.top)).toBeLessThanOrEqual(1);
      expect(await cardHeight(page), "the bar keeps its height when the flight field appears").toBe(h0);
      await page.screenshot({ path: `${SHOTS}/obf-b-flight-before-from-${w}.png` });
    });
  }

  for (const w of [1440, 1360, 1280, 1081]) {
    test(`From and To lists open upward when there is no room below, above other content, bar stays put at ${w}`, async ({ page }) => {
      await open(page, w);
      const barTop = await rect(page, "#book [data-box]");
      const from = page.getByRole("combobox", { name: "From", exact: true });
      await from.fill("Fixture Air");
      await expect(page.getByRole("option", { name: /Fixture Airport/ })).toBeVisible();
      expect((await listOnTop(page)).hits.every(Boolean)).toBe(true);
      const m1 = await fieldAndList(page, "from");
      expect(m1.listBottom, "list ends above the field").toBeLessThanOrEqual(m1.fieldTop);
      expect(m1.listTop).toBeGreaterThanOrEqual(0);
      expect(await rect(page, "#book [data-box]"), "bar did not move").toEqual(barTop);
      await page.screenshot({ path: `${SHOTS}/obf-b-from-list-${w}.png` });
      await page.getByRole("option", { name: /Fixture Airport/ }).click();
      await expect(page.getByRole("textbox", { name: "Flight number" })).toBeFocused();
      const to = page.getByRole("combobox", { name: "To", exact: true });
      await to.fill("Fixture Street");
      await expect(page.getByRole("option", { name: /Fixture Street 1/ })).toBeVisible();
      expect((await listOnTop(page)).hits.every(Boolean)).toBe(true);
      const m2 = await fieldAndList(page, "to");
      expect(m2.listBottom).toBeLessThanOrEqual(m2.fieldTop);
      expect(m2.listTop).toBeGreaterThanOrEqual(0);
      await page.screenshot({ path: `${SHOTS}/obf-b-to-list-${w}.png` });
    });
  }

  test("lists open below the field when there is room below it at 1440", async ({ page }) => {
    await open(page, 1440, 1000);
    await page.evaluate(() => {
      const bar = document.querySelector("#book")!;
      window.scrollTo({ top: bar.getBoundingClientRect().top + window.scrollY - 90, behavior: "instant" as ScrollBehavior });
    });
    await page.waitForTimeout(300);
    await page.getByRole("combobox", { name: "From", exact: true }).fill("Fixture Street");
    await expect(page.getByRole("option", { name: /Fixture Street 1/ })).toBeVisible();
    expect((await listOnTop(page)).hits.every(Boolean)).toBe(true);
    const m = await fieldAndList(page, "from");
    expect(m.listTop).toBeGreaterThanOrEqual(m.fieldBottom - 1);
  });

  test("flight field visible with the To list open at 1440 (screenshot)", async ({ page }) => {
    await open(page, 1440);
    await page.getByRole("combobox", { name: "From", exact: true }).fill("Fixture Air");
    await page.getByRole("option", { name: /Fixture Airport/ }).click();
    await expect(page.getByRole("textbox", { name: "Flight number" })).toBeFocused();
    await page.getByRole("combobox", { name: "To", exact: true }).fill("Fixture Street");
    await expect(page.getByRole("option", { name: /Fixture Street 1/ })).toBeVisible();
    expect((await listOnTop(page)).hits.every(Boolean)).toBe(true);
    const flight = await rect(page, '#book [data-bx=flight]:not([data-om-label="Add flight"]) [data-vtcombo]');
    const from = await rect(page, "#book [data-bx=from] [data-vtcombo]");
    expect(overlap(flight!, from!)).toBe(false);
    await page.screenshot({ path: `${SHOTS}/obf-desktop-flight-dropdown-1440.png` });
  });

  for (const lang of ["en", "ar"]) {
    for (const w of [1440, 1280]) {
      test(`Tab order equals the visual order: Flight, From, To, When, Travellers, SEE PRICES in ${lang} at ${w}`, async ({ page }) => {
        await open(page, w);
        if (lang !== "en") {
          await page.evaluate((l) => (window as unknown as { VamosLocale: { setLang(v: string): void } }).VamosLocale.setLang(l), lang);
          await page.waitForTimeout(250);
        }
        const from = page.locator('#book [data-bx="from"] input');
        await from.fill("Fixture Air");
        await page.locator('#book [data-bx="from"] [role="option"]').first().click();
        const flight = page.locator('#book [data-bx="flight"] input');
        await expect(flight).toBeFocused();
        await page.waitForTimeout(300);
        const seen: { cell: string; x: number; y: number }[] = [];
        const snap = () =>
          page.evaluate(() => {
            const a = document.activeElement as HTMLElement;
            const cell = a.closest("[data-bx]")?.getAttribute("data-bx") ?? "";
            const b = a.getBoundingClientRect();
            return { cell, x: b.left + b.width / 2, y: b.top + b.height / 2 };
          });
        seen.push(await snap());
        for (let i = 0; i < 8; i++) {
          await page.keyboard.press("Tab");
          seen.push(await snap());
        }
        const order = seen.map((x) => x.cell).filter((c, i, arr) => i === 0 || c !== arr[i - 1]);
        expect(order.slice(0, 7)).toEqual(["flight", "from", "swap", "to", "when", "trav", "cta"]);
        const rtl = lang === "ar";
        for (let i = 1; i < seen.length; i++) {
          const a = seen[i - 1]!, b = seen[i]!;
          if (!["flight", "from", "swap", "to", "when", "trav", "cta"].includes(b.cell)) continue;
          const nextRow = b.y > a.y + 20;
          const sameRow = Math.abs(b.y - a.y) <= 20;
          const forward = rtl ? b.x <= a.x + 1 : b.x >= a.x - 1;
          expect(nextRow || (sameRow && forward), `focus ${a.cell} -> ${b.cell} follows the reading order`).toBe(true);
        }
        await page.screenshot({ path: `${SHOTS}/obf-tab-order-${lang}-${w}.png` });
      });
    }
  }
});

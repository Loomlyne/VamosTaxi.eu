import { test, expect, type Page } from "@playwright/test";
import { serveMock, waitForMockReady } from "../support/mock-harness";

// Phase 26.3 plan 04 (SC-2). The home booking box on `/` is From, Flight (airport
// pickups only), To, When, Travellers, SEE PRICES. It never prices, never stores the
// trip and hands it to /checkout in the URL (D-05, D-06).

const SUGGESTIONS = [
  { mapbox_id: "mb-air-1", name: "Fixture Airport", address: "Kloten", is_airport: true },
  { mapbox_id: "mb-street-1", name: "Fixture Street 1", address: "Zurich", is_airport: false },
];

async function dismissCookies(page: Page) {
  const accept = page.getByRole("button", { name: /Accept all/i });
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
  }
}

async function stubGeo(page: Page) {
  await page.route("**/api/geo/suggest**", async (route) => {
    const q = (new URL(route.request().url()).searchParams.get("q") ?? "").toLowerCase();
    const hits = SUGGESTIONS.filter((s) => s.name.toLowerCase().includes(q)).map(({ mapbox_id, name, address }) => ({
      mapbox_id,
      name,
      address,
    }));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ suggestions: hits }) });
  });
  await page.route("**/api/geo/retrieve**", async (route) => {
    const id = new URL(route.request().url()).searchParams.get("mapbox_id");
    const hit = SUGGESTIONS.find((s) => s.mapbox_id === id);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, place: hit ? { mapbox_id: id, name: hit.name, isAirport: hit.is_airport } : null }),
    });
  });
}

async function openHome(page: Page) {
  await stubGeo(page);
  const url = await serveMock("app/home/home.dc.html");
  await page.goto(url);
  await waitForMockReady(page);
  await dismissCookies(page);
  await expect(page.locator("[data-box]")).toBeVisible();
  return url;
}

async function pickFrom(page: Page, query: string, option: string) {
  const from = page.getByRole("combobox", { name: "From", exact: true });
  await from.fill(query);
  await page.getByRole("option", { name: new RegExp(option) }).click();
}

async function pickTo(page: Page, query: string, option: string) {
  const to = page.getByRole("combobox", { name: "To", exact: true });
  await to.fill(query);
  await page.getByRole("option", { name: new RegExp(option) }).click();
}

async function pickWhen(page: Page) {
  await page.locator('[data-bx="when"] button[aria-haspopup="dialog"]').click();
  const dialog = page.getByRole("dialog", { name: "When" });
  await dialog.getByRole("button", { name: "Next month" }).click();
  await dialog.getByRole("button", { name: "5", exact: true }).click();
  const saved = dialog.getByRole("button", { name: "Saved" });
  if (await saved.isVisible().catch(() => false)) await saved.click();
}

function order(page: Page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-box] > [data-bx]"))
      .map((el) => (el as HTMLElement).dataset.bx as string)
      .filter((k) => k !== "swap" && k !== "note"),
  );
}

test.describe("Home booking box @component", () => {
  // 26.4 D-01: the box is the laptop layout (>=1081). At 1080px and under home shows the bar and
  // sheet instead; those are covered by home-booking-sheet.spec.ts.
  test.beforeEach(async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 0) <= 1080, "26.4 D-01: the box shows at 1081px and over");
  });

  test("DOM order is From, To, When, Travellers, SEE PRICES; an airport adds Flight under From @component", async ({ page }) => {
    await openHome(page);
    expect(await order(page)).toEqual(["from", "to", "when", "trav", "cta"]);
    await expect(page.locator('[data-box] [role="tablist"]')).toHaveCount(0);

    await pickFrom(page, "Fixture Air", "Fixture Airport");
    await expect(page.locator('[data-bx="flight"]')).toBeVisible();
    expect(await order(page)).toEqual(["from", "flight", "to", "when", "trav", "cta"]);

    // Flight sits directly under From at every width; on the phone the whole box is one column in DOM order.
    const pos = await page.evaluate(() => {
      const r = (k: string) => {
        const b = (document.querySelector(`[data-box] > [data-bx="${k}"]`) as HTMLElement).getBoundingClientRect();
        return { top: Math.round(b.top), left: Math.round(b.left), bottom: Math.round(b.bottom) };
      };
      return { from: r("from"), flight: r("flight"), to: r("to"), when: r("when"), trav: r("trav"), cta: r("cta"), w: window.innerWidth };
    });
    expect(pos.flight.left).toBe(pos.from.left);
    expect(pos.flight.top).toBeGreaterThanOrEqual(pos.from.bottom - 1);
    expect(pos.cta.top).toBeGreaterThanOrEqual(pos.trav.bottom - 1);
    expect(pos.cta.top).toBeGreaterThanOrEqual(pos.when.bottom - 1);
    if (pos.w <= 680) {
      expect(pos.to.top).toBeGreaterThanOrEqual(pos.flight.bottom - 1);
      expect(pos.when.top).toBeGreaterThanOrEqual(pos.to.bottom - 1);
      expect(pos.trav.top).toBeGreaterThanOrEqual(pos.when.bottom - 1);
    } else {
      expect(Math.abs(pos.to.top - pos.from.top)).toBeLessThanOrEqual(1);
      expect(pos.trav.left).toBeGreaterThan(pos.when.left);
    }
  });

  test("a street pickup offers an optional flight and keeps a typed value @component", async ({ page }) => {
    await openHome(page);
    await expect(page.getByRole("button", { name: "Add a flight number" })).toHaveCount(0);
    await pickFrom(page, "Fixture Air", "Fixture Airport");
    const flight = page.getByRole("textbox", { name: "Flight number" });
    await flight.fill("lx  318");
    await expect(flight).toHaveValue("LX 318");
    await page.getByRole("combobox", { name: "From", exact: true }).fill("Fixture Street");
    await page.getByRole("option", { name: /Fixture Street 1/ }).click();
    // The typed flight stays, now optional.
    await expect(page.getByRole("textbox", { name: "Flight number" })).toHaveValue("LX 318");
    await expect(page.locator('[data-bx="flight"]').getByText("Optional")).toBeVisible();
    await expect(page.getByText("It does not change the price.")).toBeVisible();
  });

  test("a street pickup shows the opener, then an optional flight that must be valid @component", async ({ page }) => {
    await page.route("**/checkout?**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>checkout</body></html>" }),
    );
    await openHome(page);
    await pickFrom(page, "Fixture Street", "Fixture Street 1");
    await expect(page.getByRole("textbox", { name: "Flight number" })).toHaveCount(0);
    await page.getByRole("button", { name: "Add a flight number" }).click();
    const flight = page.getByRole("textbox", { name: "Flight number" });
    await expect(flight).toBeFocused();
    await expect(page.locator('[data-bx="flight"]').getByText("Optional")).toBeVisible();
    await pickTo(page, "Fixture Air", "Fixture Airport");
    await pickWhen(page);
    await flight.fill("X");
    await page.getByRole("button", { name: /See prices/i }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Check the flight number" })).toBeVisible();
    await flight.fill("LX318");
    const nav = page.waitForRequest((r) => r.isNavigationRequest() && /\/checkout\?/.test(r.url()));
    await page.getByRole("button", { name: /See prices/i }).click();
    expect(new URL((await nav).url()).searchParams.get("flight")).toBe("LX318");
  });
  test("Travellers is one 54px button with Passengers and Bags counters @component", async ({ page }) => {
    await openHome(page);
    const btn = page.locator("[data-trav-btn]");
    expect((await btn.boundingBox())!.height).toBe(54);
    await expect(btn).toContainText("1 passenger · 0 bags");
    await btn.click();
    const dialog = page.getByRole("dialog", { name: "Travellers" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Add a passenger" }).click();
    await dialog.getByRole("button", { name: "Add a bag" }).click();
    await dialog.getByRole("button", { name: "Add a bag" }).click();
    expect((await dialog.getByRole("button", { name: "Add a bag" }).boundingBox())!.height).toBe(44);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(btn).toBeFocused();
    await expect(btn).toContainText("2 passengers · 2 bags");
  });

  test("SEE PRICES with gaps shows inline errors and focuses From @component", async ({ page }) => {
    await openHome(page);
    await page.getByRole("button", { name: /See prices/i }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Enter a pickup address" })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Enter a drop-off address" })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Choose a pickup time" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "From", exact: true })).toBeFocused();
    expect(new URL(page.url()).pathname).not.toMatch(/checkout/);
  });

  test("an airport pickup needs a valid flight number before it goes on @component", async ({ page }) => {
    await openHome(page);
    await pickFrom(page, "Fixture Air", "Fixture Airport");
    await pickTo(page, "Fixture Street", "Fixture Street 1");
    await pickWhen(page);
    await page.getByRole("button", { name: /See prices/i }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Enter the flight number" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Flight number" })).toBeFocused();
    await page.getByRole("textbox", { name: "Flight number" }).fill("X");
    await page.getByRole("button", { name: /See prices/i }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Check the flight number" })).toBeVisible();
  });

  test("a valid airport trip goes to /checkout in the URL and stores nothing @component", async ({ page }) => {
    await page.addInitScript(() => {
      // An old browser still holding the previous box's trip: it must be gone after load.
      if (!sessionStorage.getItem("seeded")) {
        localStorage.setItem("vamosTrip", '{"stale":true}');
        localStorage.setItem("vamosQuoteLock", "old");
        sessionStorage.setItem("seeded", "1");
      }
    });
    await page.route("**/checkout?**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>checkout</body></html>" }),
    );
    await openHome(page);
    expect(await page.evaluate(() => localStorage.getItem("vamosTrip"))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem("vamosQuoteLock"))).toBeNull();

    await pickFrom(page, "Fixture Air", "Fixture Airport");
    await pickTo(page, "Fixture Street", "Fixture Street 1");
    await pickWhen(page);
    await page.getByRole("textbox", { name: "Flight number" }).fill("lx 318");
    await page.locator("[data-trav-btn]").click();
    const dialog = page.getByRole("dialog", { name: "Travellers" });
    await dialog.getByRole("button", { name: "Add a passenger" }).click();
    await dialog.getByRole("button", { name: "Add a bag" }).click();
    await dialog.getByRole("button", { name: "Add a bag" }).click();
    await dialog.getByRole("button", { name: "Add a bag" }).click();
    await dialog.getByRole("button", { name: "Done" }).click();

    const nav = page.waitForRequest((r) => r.isNavigationRequest() && /\/checkout\?/.test(r.url()));
    await page.getByRole("button", { name: /See prices/i }).click();
    const u = new URL((await nav).url());
    expect(u.pathname).toBe("/checkout");
    expect([...u.searchParams.keys()]).toEqual(["from", "fid", "gs", "to", "tid", "when", "pax", "bags", "flight"]);
    expect(u.searchParams.get("from")).toBe("Fixture Airport");
    expect(u.searchParams.get("fid")).toBe("mb-air-1");
    expect(u.searchParams.get("gs")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(u.searchParams.get("to")).toBe("Fixture Street 1");
    expect(u.searchParams.get("tid")).toBe("mb-street-1");
    expect(u.searchParams.get("when")).toMatch(/^\d{4}-\d{2}-05T\d{2}:\d{2}$/);
    expect(u.searchParams.get("pax")).toBe("2");
    expect(u.searchParams.get("bags")).toBe("3");
    expect(u.searchParams.get("flight")).toBe("LX 318");
    await page.waitForLoadState("domcontentloaded");
    expect(await page.evaluate(() => localStorage.getItem("vamosTrip"))).toBeNull();
  });

  test("no price shows in the box and nothing scrolls sideways @component", async ({ page }) => {
    let priced = 0;
    // Other home sections read the fleet with a GET; the box itself must never POST a quote.
    await page.route("**/api/quote**", (route) => {
      if (route.request().method() === "POST") priced++;
      return route.continue();
    });
    await openHome(page);
    await pickFrom(page, "Fixture Air", "Fixture Airport");
    await pickTo(page, "Fixture Street", "Fixture Street 1");
    await pickWhen(page);
    const text = await page.locator("#book").innerText();
    expect(text).not.toMatch(/CHF\s*[\d']|\d\s*CHF/);
    expect(priced).toBe(0);
    const w = await page.evaluate(() => ({ sw: document.scrollingElement!.scrollWidth, iw: window.innerWidth }));
    expect(w.sw).toBeLessThanOrEqual(w.iw);
  });

  for (const lang of ["de", "fr", "ar"] as const) {
    test(`the optional flight opener and field resolve in ${lang} @component`, async ({ page }) => {
      await openHome(page);
      await pickFrom(page, "Fixture Street", "Fixture Street 1");
      const cov = () =>
        page.evaluate(
          (l) =>
            (window as unknown as { VamosLocale: { coverage(root: Element, l: string): unknown } }).VamosLocale.coverage(
              document.querySelector("#book")!,
              l,
            ),
          lang,
        );
      await page.evaluate((l) => (window as unknown as { VamosLocale: { setLang(v: string): void } }).VamosLocale.setLang(l), lang);
      await page.waitForTimeout(250);
      expect(await cov()).toMatchObject({ count: 0, strings: [], attrs: [] });
      await page.locator('[data-bx="flight"] button').click();
      await page.waitForTimeout(250);
      expect(await cov()).toMatchObject({ count: 0, strings: [], attrs: [] });
    });
  }

  for (const lang of ["de", "fr", "ar"] as const) {
    test(`every string in the box resolves in ${lang} @component`, async ({ page }) => {
      await openHome(page);
      await pickFrom(page, "Fixture Air", "Fixture Airport");
      await page.getByRole("button", { name: /See prices/i }).click();
      await page.locator("[data-trav-btn]").click();
      await page.evaluate((l) => (window as unknown as { VamosLocale: { setLang(v: string): void } }).VamosLocale.setLang(l), lang);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      if (lang === "ar") await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await page.waitForTimeout(250);
      const missing = await page.evaluate(
        (l) =>
          (window as unknown as { VamosLocale: { coverage(root: Element, l: string): unknown } }).VamosLocale.coverage(
            document.querySelector("#book")!,
            l,
          ),
        lang,
      );
      expect(missing).toMatchObject({ count: 0, strings: [], attrs: [] });
      const w = await page.evaluate(() => ({ sw: document.scrollingElement!.scrollWidth, iw: window.innerWidth }));
      expect(w.sw).toBeLessThanOrEqual(w.iw);
    });
  }
});

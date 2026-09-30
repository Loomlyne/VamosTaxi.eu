import { test, expect, type Page } from "@playwright/test";
import { serveMock, waitForMockReady } from "../support/mock-harness";

// Phase 26.4 plan 09 (D-01…D-06, D-09, D-13), sheet reshaped to ONE page by quick 260930-obf.
// At 1080px and under, home shows one BookingBar
// and the full-screen one-page BookingSheet instead of the laptop box; both read and write the box's
// one trip state. At 1081px and over the 26.3 box is unchanged and no bar or sheet exists.
// Runs at 1440 / 1024 / 768 / 390 in en, de, fr and ar.

const SUGGESTIONS = [
  { mapbox_id: "mb-air-1", name: "Fixture Airport", address: "Kloten", is_airport: true },
  { mapbox_id: "mb-street-1", name: "Fixture Street 1", address: "Zurich", is_airport: false },
];

type Locale = { setLang(v: string): void; coverage(root: Element, l?: string): { count: number; strings: string[]; attrs: string[] } };
const LANGS = ["en", "de", "fr", "ar"] as const;

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
  await page.route("**/checkout?**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>checkout</body></html>" }),
  );
}

async function openHome(page: Page, hash = "") {
  await stubGeo(page);
  const url = await serveMock("app/home/home.dc.html");
  await page.goto(url + hash);
  await waitForMockReady(page);
  const accept = page.getByRole("button", { name: /Accept all/i });
  if (await accept.isVisible().catch(() => false)) await accept.click();
  return url;
}

const width = (page: Page) => page.viewportSize()!.width;
const heroBar = (page: Page) => page.locator("[data-bar-wrap] [data-bb]");
const dockBar = (page: Page) => page.locator("[data-bar-dock] [data-bb]");
const sheet = (page: Page) => page.locator("[data-bs]");
const nextBtn = (page: Page) => page.locator("[data-bs-next] button");
const msg = (page: Page) => page.locator("[data-bs-msg]");

async function openSheet(page: Page) {
  await heroBar(page).click();
  await expect(sheet(page)).toBeVisible();
}

async function pickFrom(page: Page, query: string, option: string) {
  await sheet(page).locator('input[id$="-from"]').fill(query);
  await sheet(page).locator('[id$="-list-from"] [role="option"]').filter({ hasText: option }).first().click();
}

async function pickTo(page: Page, query: string, option: string) {
  await sheet(page).locator('input[id$="-to"]').fill(query);
  await sheet(page).locator('[id$="-list-to"] [role="option"]').filter({ hasText: option }).first().click();
}

async function setLang(page: Page, lang: string) {
  await page.evaluate((l) => (window as unknown as { VamosLocale: Locale }).VamosLocale.setLang(l), lang);
  await expect(page.locator("html")).toHaveAttribute("lang", lang);
  await page.waitForTimeout(250);
}

/** The 5th of next month in Zurich, as the picker offers it (always past the 3-hour lead time). */
function future(): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const y = Number(p.find((x) => x.type === "year")!.value);
  const m = Number(p.find((x) => x.type === "month")!.value);
  const d = new Date(Date.UTC(y, m, 5));
  return d.toISOString().slice(0, 10);
}

/** Date then Time, through the same brand picker the laptop box uses. Returns the time the picker settled on. */
async function fillWhen(page: Page): Promise<string> {
  await sheet(page).locator("[data-bs-date] button[aria-haspopup]").click();
  const cal = page.getByRole("dialog", { name: "Date" });
  await cal.getByRole("button", { name: "Next month" }).click();
  await cal.getByRole("button", { name: "5", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Date" })).toHaveCount(0);
  await sheet(page).locator("[data-bs-time] button[aria-haspopup]").click();
  const tp = page.getByRole("dialog", { name: "Time" });
  await expect(tp).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Time" })).toHaveCount(0);
  const shown = (await sheet(page).locator("[data-bs-time] button[aria-haspopup]").innerText()).trim();
  expect(shown).toMatch(/^\d{2}:\d{2}$/);
  return shown;
}

async function storageKeys(page: Page) {
  return page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage).map((k) => "s:" + k)]);
}

test.describe("Home bar and sheet @component", () => {
  test("at 1081px and over the box shows; no bar, dock or sheet exists @component", async ({ page }) => {
    test.skip(width(page) <= 1080, "laptop only");
    await openHome(page);
    await expect(page.locator("[data-box]")).toBeVisible();
    await expect(heroBar(page)).toBeHidden();
    await expect(dockBar(page)).toBeHidden();
    await expect(sheet(page)).toHaveCount(0);
    await expect(page.locator("#book")).toHaveAttribute("data-bookcard", "1");
    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForTimeout(400);
    await expect(page.locator("[data-bar-dock]")).toHaveAttribute("data-show", "0");
  });

  test("at 1080px and under the bar replaces the box: 54px, 'Where to?', id=book @component", async ({ page }) => {
    test.skip(width(page) > 1080, "tablet and phone only");
    await openHome(page);
    await expect(page.locator("[data-box]")).toBeHidden();
    await expect(heroBar(page)).toBeVisible();
    await expect(heroBar(page)).toContainText("Where to?");
    const h = await heroBar(page).evaluate((el) => Math.round(el.getBoundingClientRect().height));
    expect(Math.abs(h - 54)).toBeLessThanOrEqual(1);
    await expect(page.locator("[data-bar-wrap]")).toHaveAttribute("id", "book");
    await expect(sheet(page)).toHaveCount(0);
    const w = await page.evaluate(() => ({ sw: document.scrollingElement!.scrollWidth, iw: window.innerWidth }));
    expect(w.sw).toBeLessThanOrEqual(w.iw);
  });

  test("one page goes to /checkout with the trip in the URL, no flight for a street pickup @component", async ({ page }) => {
    test.skip(width(page) > 1080, "tablet and phone only");
    await openHome(page);
    const before = await storageKeys(page);
    const len0 = await page.evaluate(() => history.length);
    await openSheet(page);
    await expect(page.getByRole("dialog", { name: "Book a transfer" })).toBeVisible();
    // Where, When and Who are all on the page when it opens.
    for (const h of ["Where", "When", "Who"]) await expect(sheet(page).locator("[data-bs-sech]", { hasText: h })).toBeVisible();
    await expect(sheet(page).locator("[data-bs-date] button[aria-haspopup]")).toBeVisible();
    await expect(sheet(page).locator("[data-bs-time] button[aria-haspopup]")).toBeVisible();
    await expect(sheet(page).getByRole("button", { name: "Add a passenger" })).toBeVisible();
    await expect(sheet(page).locator("[data-bs-prog], [data-bs-mirror]")).toHaveCount(0);

    // SEE PRICES is never disabled: it names the first missing answer and focuses that field.
    await expect(nextBtn(page)).toBeEnabled();
    await nextBtn(page).click();
    await expect(msg(page)).toContainText("Enter a pickup address");
    await expect(sheet(page).locator('input[id$="-from"]')).toBeFocused();

    await pickFrom(page, "Fixture Street", "Fixture Street 1");
    await expect(sheet(page).getByRole("button", { name: "Add a flight number" })).toBeVisible();
    await nextBtn(page).click();
    await expect(msg(page)).toContainText("Enter a drop-off address");
    await expect(sheet(page).locator('input[id$="-to"]')).toBeFocused();
    await pickTo(page, "Fixture Air", "Fixture Airport");
    await nextBtn(page).click();
    await expect(msg(page)).toContainText("Choose a date and a pickup time");
    await expect(sheet(page).locator("[data-bs-date] button[aria-haspopup]")).toBeFocused();
    const time = await fillWhen(page);
    await sheet(page).getByRole("button", { name: "Add a passenger" }).click();

    const nav = page.waitForRequest((r) => r.isNavigationRequest() && /\/checkout\?/.test(r.url()));
    await nextBtn(page).click();
    const u = new URL((await nav).url());
    expect(u.pathname).toBe("/checkout");
    expect(u.searchParams.get("from")).toBe("Fixture Street 1");
    expect(u.searchParams.get("fid")).toBe("mb-street-1");
    expect(u.searchParams.get("to")).toBe("Fixture Airport");
    expect(u.searchParams.get("tid")).toBe("mb-air-1");
    expect(u.searchParams.get("when")).toBe(future() + "T" + time);
    expect(u.searchParams.get("pax")).toBe("2");
    expect(u.searchParams.get("bags")).toBe("0");
    expect(u.searchParams.has("flight")).toBe(false);
    await page.waitForLoadState("domcontentloaded");

    // No sheet history entries remain: one entry for checkout, none for the sheet.
    expect(await page.evaluate(() => (history.state as { vtSheet?: number } | null)?.vtSheet)).toBeUndefined();
    expect(await page.evaluate(() => history.length)).toBe(len0 + 1);
    // No trip, draft or booking key was written anywhere.
    const after = await storageKeys(page);
    expect(after.filter((k) => /trip|draft|booking/i.test(k))).toEqual([]);
    const allowed = new Set([...before, "s:vamosGeoSession", "vamosLang", "vamosCurrency"]);
    expect(after.filter((k) => !allowed.has(k))).toEqual([]);
  });

  test("Flight number, From and To are one block, flight first; an airport pickup needs a flight; LX318 goes to checkout @component", async ({ page }) => {
    test.skip(width(page) > 1080, "tablet and phone only");
    await openHome(page);
    await openSheet(page);
    await pickFrom(page, "Fixture Air", "Fixture Airport");
    const flight = sheet(page).getByRole("textbox", { name: "Flight number" });
    await expect(flight).toBeVisible();
    // Owner order (2026-09-30): Flight number, then From, then To, on the same page. Focus moves into the flight field.
    await expect(flight).toBeFocused();
    const g = await page.evaluate(() => {
      const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
      const from = r('[data-bs] input[id$="-from"]'), fl = r('[data-bs] input[id$="-flight"]'), to = r('[data-bs] input[id$="-to"]');
      return { flB: fl.bottom, fromT: from.top, fromB: from.bottom, toT: to.top };
    });
    expect(g.fromT).toBeGreaterThanOrEqual(g.flB - 1);
    expect(g.toT).toBeGreaterThanOrEqual(g.fromB - 1);
    await nextBtn(page).click();
    await expect(msg(page)).toContainText("Enter the flight number");
    await expect(flight).toBeFocused();
    await flight.fill("lx318");
    await pickTo(page, "Fixture Street", "Fixture Street 1");
    await fillWhen(page);
    const nav = page.waitForRequest((r) => r.isNavigationRequest() && /\/checkout\?/.test(r.url()));
    await nextBtn(page).click();
    const u = new URL((await nav).url());
    expect(u.searchParams.get("flight")).toBe("LX318");
    expect(u.searchParams.get("from")).toBe("Fixture Airport");
    expect(u.searchParams.get("pax")).toBe("1");
  });

  for (const lang of ["en", "ar"] as const) {
    test(`Tab order equals the page order: Flight, From, To, Date, Time, travellers, SEE PRICES in ${lang} @component`, async ({ page }) => {
      test.skip(width(page) > 1080, "tablet and phone only");
      await openHome(page);
      if (lang !== "en") await setLang(page, lang);
      await openSheet(page);
      await pickFrom(page, "Fixture Air", "Fixture Airport");
      const flight = sheet(page).locator('input[id$="-flight"]');
      await expect(flight).toBeFocused();
      const kind = () =>
        page.evaluate(() => {
          const a = document.activeElement as HTMLElement;
          if (!a) return "";
          if (a.id.endsWith("-flight")) return "flight";
          if (a.id.endsWith("-from")) return "from";
          if (a.id.endsWith("-to")) return "to";
          if (a.closest("[data-bs-date]")) return "date";
          if (a.closest("[data-bs-time]")) return "time";
          if (a.hasAttribute("data-step")) return "traveller";
          if (a.closest("[data-bs-next]")) return "cta";
          return "other";
        });
      const seen: string[] = [await kind()];
      // Filling From/To first would add clear buttons; here only From holds text.
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press("Tab");
        seen.push(await kind());
      }
      const order = seen.filter((c, i, arr) => c !== "other" && (i === 0 || c !== arr[i - 1]));
      expect(order.slice(0, 7)).toEqual(["flight", "from", "to", "date", "time", "traveller", "cta"]);
    });
  }

  for (const lang of ["de", "fr", "ar"] as const) {
    test(`the sheet writes the chosen date in ${lang}, not English, and follows a switch @component`, async ({ page }) => {
      test.skip(width(page) > 1080, "tablet and phone only");
      const EN_DAY = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/;
      await openHome(page);
      await openSheet(page);
      await fillWhen(page);
      const btn = sheet(page).locator("[data-bs-date] button[aria-haspopup]");
      const en = (await btn.innerText()).trim();
      expect(en).toMatch(EN_DAY);
      await setLang(page, lang);
      const txt = (await btn.innerText()).trim();
      expect(txt).not.toMatch(EN_DAY);
      expect(txt).not.toBe(en);
      const cov = await page.evaluate((l) => (window as unknown as { VamosLocale: Locale }).VamosLocale.coverage(document.querySelector("[data-bs]")!, l), lang);
      expect(cov.count).toBe(0);
    });
  }

  test("close keeps the entries in the bar; reopening shows them; a reload starts empty and stores nothing @component", async ({ page }) => {
    test.skip(width(page) > 1080, "tablet and phone only");
    await openHome(page);
    const before = await storageKeys(page);
    await openSheet(page);
    await pickFrom(page, "Fixture Street", "Fixture Street 1");
    await sheet(page).getByRole("button", { name: "Close booking" }).click();
    await expect(sheet(page)).toHaveCount(0);
    await expect(heroBar(page)).toContainText("Fixture Street 1");
    await expect(heroBar(page)).toContainText("Drop-off");
    await expect(heroBar(page)).toContainText("Add date and time");
    expect(await page.evaluate(() => (history.state as { vtSheet?: number } | null)?.vtSheet)).toBeUndefined();

    await heroBar(page).click();
    await expect(sheet(page).locator('input[id$="-from"]')).toHaveValue("Fixture Street 1");
    await sheet(page).getByRole("button", { name: "Close booking" }).click();

    const keys = await storageKeys(page);
    expect(keys.filter((k) => /trip|draft|booking/i.test(k))).toEqual([]);
    const allowed = new Set([...before, "s:vamosGeoSession", "vamosLang", "vamosCurrency"]);
    expect(keys.filter((k) => !allowed.has(k))).toEqual([]);

    await page.reload();
    await waitForMockReady(page);
    await expect(heroBar(page)).toContainText("Where to?");
    await expect(heroBar(page)).not.toContainText("Fixture Street 1");
  });

  test("the sheet locks scroll, inerts the page, stops Lenis and restores the scroll position @component", async ({ page }) => {
    test.skip(width(page) > 1080, "tablet and phone only");
    await openHome(page);
    await page.evaluate(() => window.scrollTo(0, 900));
    await expect(page.locator("[data-bar-dock]")).toHaveAttribute("data-show", "1");
    const y0 = await page.evaluate(() => Math.round(window.scrollY));
    expect(y0).toBeGreaterThan(400);
    await dockBar(page).click();
    await expect(sheet(page)).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe("hidden");
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    await expect(page.locator("[data-hero]")).toHaveAttribute("inert", "");
    const lenis = await page.evaluate(() => document.documentElement.classList.contains("lenis"));
    if (lenis) await expect(page.locator("html")).toHaveClass(/lenis-stopped/);
    await expect(page.locator("[data-bar-dock]")).toHaveAttribute("data-show", "0");

    await page.keyboard.press("Escape");
    await expect(sheet(page)).toHaveCount(0);
    await expect(page.locator("[data-hero]")).not.toHaveAttribute("inert", /.*/);
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("");
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
    const y1 = await page.evaluate(() => Math.round(window.scrollY));
    expect(Math.abs(y1 - y0)).toBeLessThanOrEqual(2);
    await expect(page.locator("[data-bar-dock]")).toHaveAttribute("data-show", "1");
  });

  test("after the sheet closes the page scrolls again: Lenis is running and the wheel moves the page @component", async ({ page }) => {
    test.skip(width(page) > 1080, "tablet and phone only");
    await openHome(page);
    for (const how of ["escape", "close", "back"] as const) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await openSheet(page);
      if (how === "escape") await page.keyboard.press("Escape");
      else if (how === "close") await sheet(page).locator("[data-bs-head] button").last().click();
      else await page.goBack();
      await expect(sheet(page)).toHaveCount(0);
      await page.waitForTimeout(300);
      const st = await page.evaluate(() => ({
        cls: document.documentElement.className,
        de: getComputedStyle(document.documentElement).overflowY,
        body: getComputedStyle(document.body).overflowY,
        stopped: (window as unknown as { __vtLenis?: { isStopped: boolean } }).__vtLenis?.isStopped ?? null,
      }));
      expect(st.cls, how).not.toContain("lenis-stopped");
      expect(["visible", "auto", "scroll"], `${how} html ${st.de}`).toContain(st.de);
      expect(["visible", "auto", "scroll"], `${how} body ${st.body}`).toContain(st.body);
      if (st.stopped !== null) expect(st.stopped, how).toBe(false);
      await page.mouse.move(200, 300);
      await page.mouse.wheel(0, 600);
      await expect.poll(() => page.evaluate(() => window.scrollY), { message: how }).toBeGreaterThan(200);
    }
  });

  test("SEE PRICES then browser Back: the home page scrolls @component", async ({ page }) => {
    test.skip(width(page) > 1080, "tablet and phone only");
    await openHome(page);
    await openSheet(page);
    await pickFrom(page, "Fixture Street", "Fixture Street 1");
    await pickTo(page, "Fixture Air", "Fixture Airport");
    await fillWhen(page);
    const nav = page.waitForURL(/\/checkout\?/);
    await nextBtn(page).click();
    await nav;
    await page.goBack();
    await waitForMockReady(page);
    await expect(sheet(page)).toHaveCount(0);
    await page.waitForTimeout(400);
    const st = await page.evaluate(() => ({
      cls: document.documentElement.className,
      de: getComputedStyle(document.documentElement).overflowY,
      body: getComputedStyle(document.body).overflowY,
      inert: document.querySelectorAll("[inert]").length,
    }));
    expect(st.cls).not.toContain("lenis-stopped");
    expect(["visible", "auto", "scroll"]).toContain(st.de);
    expect(["visible", "auto", "scroll"]).toContain(st.body);
    expect(st.inert).toBe(0);
    await page.mouse.move(200, 300);
    await page.mouse.wheel(0, 600);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
  });

  test("with the keyboard up (visual viewport shrunk) the sheet still covers the page and the typed field stays visible @component", async ({ page }) => {
    test.skip(width(page) > 1080, "tablet and phone only");
    await openHome(page);
    await openSheet(page);
    const full = page.viewportSize()!.height;
    // What the iPhone keyboard does: the visual viewport gets shorter, the layout viewport does not.
    const shrink = (h: number, top: number) =>
      page.evaluate(([hh, tt]) => {
        const v = window.visualViewport!;
        Object.defineProperty(v, "height", { configurable: true, get: () => hh });
        Object.defineProperty(v, "offsetTop", { configurable: true, get: () => tt });
        v.dispatchEvent(new Event("resize"));
      }, [h, top]);
    const to = sheet(page).locator('input[id$="-to"]');
    await to.focus();
    const vvh = Math.round(full * 0.45);
    await shrink(vvh, 0);
    await page.waitForTimeout(250);
    const g = await page.evaluate(() => {
      const r = (el: Element) => el.getBoundingClientRect();
      const root = document.querySelector("[data-bs]")!, foot = document.querySelector("[data-bs-foot], [data-bs-next]")!;
      const under = [40, 120, 200].map((dy) => !!document.elementFromPoint(window.innerWidth / 2, Math.min(window.innerHeight - 2, r(foot).bottom + dy))?.closest("[data-bs]"));
      const f = r(document.activeElement!);
      return { rootTop: r(root).top, rootBottom: r(root).bottom, footBottom: r(document.querySelector("[data-bs-next]")!).bottom, under, fTop: f.top, fBottom: f.bottom, ih: window.innerHeight, bg: getComputedStyle(root).backgroundColor };
    });
    // the sheet's own surface reaches the bottom of the screen: nothing of the home page under SEE PRICES
    expect(g.rootTop).toBeLessThanOrEqual(1);
    expect(g.rootBottom).toBeGreaterThanOrEqual(g.ih - 1);
    expect(g.under).toEqual([true, true, true]);
    // SEE PRICES and the field being typed in sit inside the visible part
    expect(g.footBottom).toBeLessThanOrEqual(vvh + 1);
    expect(g.fTop).toBeGreaterThanOrEqual(0);
    expect(g.fBottom).toBeLessThanOrEqual(vvh + 1);
    // iOS also pans the visual viewport: the content follows, the surface still covers everything
    await shrink(vvh, 60);
    await page.waitForTimeout(250);
    const g2 = await page.evaluate(() => {
      const root = document.querySelector("[data-bs]")!.getBoundingClientRect(), head = document.querySelector("[data-bs-head]")!.getBoundingClientRect(), next = document.querySelector("[data-bs-next]")!.getBoundingClientRect();
      return { rootTop: root.top, rootBottom: root.bottom, headTop: head.top, nextBottom: next.bottom, ih: window.innerHeight };
    });
    expect(g2.rootTop).toBeLessThanOrEqual(1);
    expect(g2.rootBottom).toBeGreaterThanOrEqual(g2.ih - 1);
    expect(g2.headTop).toBeGreaterThanOrEqual(60 - 1);
    expect(g2.nextBottom).toBeLessThanOrEqual(60 + vvh + 1);
    // keyboard down again: the sheet is the full screen
    await shrink(full, 0);
    await page.waitForTimeout(250);
    const nb = await page.evaluate(() => document.querySelector("[data-bs-next]")!.getBoundingClientRect().bottom);
    expect(nb).toBeGreaterThan(full - 80);
  });

  test("browser back closes the sheet in one press and the bar keeps the entry @component", async ({ page }) => {
    test.skip(width(page) > 1080, "tablet and phone only");
    await openHome(page);
    await openSheet(page);
    await pickFrom(page, "Fixture Street", "Fixture Street 1");
    await page.goBack();
    await expect(sheet(page)).toHaveCount(0);
    await expect(heroBar(page)).toBeVisible();
    await expect(heroBar(page)).toContainText("Fixture Street 1");
  });

  test("the docked bar sits under the header on scroll and opens the same sheet @component", async ({ page }) => {
    test.skip(width(page) > 1080, "tablet and phone only");
    await openHome(page);
    await expect(page.locator("[data-bar-dock]")).toHaveAttribute("data-show", "0");
    await page.evaluate(() => window.scrollTo(0, 1200));
    await expect(page.locator("[data-bar-dock]")).toHaveAttribute("data-show", "1");
    await page.waitForTimeout(300);
    const g = await page.evaluate(() => {
      const hd = document.querySelector("[data-hd]")!.getBoundingClientRect();
      const dk = document.querySelector("[data-bar-dock] [data-bb]")!.getBoundingClientRect();
      const hi = document.querySelector("[data-bar-dock]")!.getBoundingClientRect();
      return { hdBottom: hd.bottom, dkTop: dk.top, dkH: dk.height, hdLeft: hd.left, hdRight: hd.right, dkLeft: dk.left, dkRight: dk.right, hi: hi.top, dir: document.documentElement.dir };
    });
    expect(g.dkTop).toBeGreaterThanOrEqual(g.hdBottom);
    expect(g.dkTop - g.hdBottom).toBeLessThanOrEqual(24);
    expect(Math.abs(g.dkH - 54)).toBeLessThanOrEqual(1);
    expect(Math.abs(g.dkLeft - g.hdLeft)).toBeLessThanOrEqual(2);
    expect(Math.abs(g.dkRight - g.hdRight)).toBeLessThanOrEqual(2);
    await dockBar(page).click();
    await expect(page.getByRole("dialog", { name: "Book a transfer" })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
  });

  test("the docked bar hides while the header menu is open @component", async ({ page }) => {
    test.skip(width(page) > 1080, "tablet and phone only");
    await openHome(page);
    await page.evaluate(() => window.scrollTo(0, 1200));
    await expect(page.locator("[data-bar-dock]")).toHaveAttribute("data-show", "1");
    await page.locator("[data-hd-menu-btn]").click();
    await expect(page.locator("[data-bar-dock]")).toHaveAttribute("data-show", "0");
  });

  test("a /#book link on home opens the sheet: footer link and header menu CTA @component", async ({ page }) => {
    test.skip(width(page) > 1080, "tablet and phone only");
    await openHome(page);
    await page.locator('a[href="/#book"]:visible').filter({ hasText: /City to city/i }).first().click();
    await expect(page.getByRole("dialog", { name: "Book a transfer" })).toBeVisible();
    await page.getByRole("button", { name: "Close booking" }).click();
    await expect(sheet(page)).toHaveCount(0);

    // Header menu: the menu closes first, then the sheet opens; the lock is released on close.
    await page.evaluate(() => window.scrollTo(0, 1200));
    await expect(page.locator("[data-hd][data-hd-float='1']")).toHaveCount(1);
    await page.locator("[data-hd-menu-btn]").click();
    await page.locator("[data-hd-cta]").click();
    await expect(page.getByRole("dialog", { name: "Book a transfer" })).toBeVisible();
    await expect(page.locator("[data-hd-open='1']")).toHaveCount(0);
    await page.getByRole("button", { name: "Close booking" }).click();
    await expect(sheet(page)).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("");
  });

  test("arriving on /#book lands on the bar without opening the sheet @component", async ({ page }) => {
    test.skip(width(page) > 1080, "tablet and phone only");
    await openHome(page, "#book");
    await page.waitForTimeout(1200);
    await expect(sheet(page)).toHaveCount(0);
    await expect(heroBar(page)).toBeInViewport();
    await expect(page.locator("[data-bar-dock]")).toHaveAttribute("data-show", "0");
  });

  test("a destination chip opens the sheet with To pre-filled @component", async ({ page }) => {
    test.skip(width(page) > 1080, "tablet and phone only");
    await openHome(page);
    const chip = page.locator('a[href="/#book"]:visible').filter({ hasText: "Zermatt" }).first();
    await chip.scrollIntoViewIfNeeded();
    await chip.click();
    await expect(page.getByRole("dialog", { name: "Book a transfer" })).toBeVisible();
    await expect(sheet(page).locator('input[id$="-to"]')).toHaveValue("Zermatt");
    await pickFrom(page, "Fixture Street", "Fixture Street 1");
    await expect(sheet(page).locator('input[id$="-to"]')).toHaveValue("Zermatt");
  });

  test("resizing to laptop closes the sheet silently and the box shows the same values @component", async ({ page }) => {
    test.skip(width(page) > 1080, "tablet and phone only");
    await openHome(page);
    await openSheet(page);
    await pickFrom(page, "Fixture Street", "Fixture Street 1");
    await pickTo(page, "Fixture Air", "Fixture Airport");
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(sheet(page)).toHaveCount(0);
    await expect(page.locator("[data-box]")).toBeVisible();
    await expect(page.getByRole("combobox", { name: "From", exact: true })).toHaveValue("Fixture Street 1");
    await expect(page.getByRole("combobox", { name: "To", exact: true })).toHaveValue("Fixture Airport");
    await expect(page.locator("#book")).toHaveAttribute("data-bookcard", "1");
    expect(await page.evaluate(() => (history.state as { vtSheet?: number } | null)?.vtSheet)).toBeUndefined();
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("");
    await expect(page.locator("[data-hero]")).not.toHaveAttribute("inert", /.*/);
    // And back to the phone width: the bar shows the same trip.
    await page.setViewportSize({ width: 390, height: 780 });
    await expect(heroBar(page)).toContainText("Fixture Street 1");
  });

  for (const lang of LANGS) {
    test(`bar and sheet read correctly in ${lang} @component`, async ({ page }) => {
      test.skip(width(page) > 1080, "tablet and phone only");
      await openHome(page);
      await setLang(page, lang);
      // `en` is the source language: the dictionary has nothing to check, so coverage runs for de/fr/ar.
      const cov = (sel: string) =>
        lang === "en"
          ? Promise.resolve({ count: 0, strings: [], attrs: [] })
          : page.evaluate(
          ([s, l]) => (window as unknown as { VamosLocale: Locale }).VamosLocale.coverage(document.querySelector(s as string)!, l as string),
          [sel, lang],
        );
      expect(await cov("[data-bar-wrap]")).toMatchObject({ count: 0, strings: [], attrs: [] });
      if (lang === "ar") await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

      await openSheet(page);
      await expect(sheet(page).locator('input[id$="-from"]')).toBeVisible();
      await page.waitForTimeout(450);
      expect(await cov("[data-bs]")).toMatchObject({ count: 0, strings: [], attrs: [] });
      // SEE PRICES arrow mirrors in Arabic only.
      const arrow = sheet(page).locator("[data-bs-next] .vt-btn > span:last-child");
      const tf = await arrow.evaluate((el) => getComputedStyle(el).transform);
      if (lang === "ar") expect(tf).toBe("matrix(-1, 0, 0, 1, 0, 0)");
      else expect(tf).toBe("none");
      await pickFrom(page, "Fixture Air", "Fixture Airport");
      // by id: the field's accessible name is translated, so an English name only matched before the runtime relabelled it
      await expect(sheet(page).locator('input[id$="-flight"]')).toBeVisible();
      await nextBtn(page).click();
      await page.waitForTimeout(250);
      expect(await cov("[data-bs]")).toMatchObject({ count: 0, strings: [], attrs: [] });
      await sheet(page).locator("[data-bs-date] button[aria-haspopup]").click();
      await expect(page.locator("[data-bs] [role='dialog'][aria-label]")).toBeVisible();
      await page.waitForTimeout(250);
      expect(await cov("[data-bs]")).toMatchObject({ count: 0, strings: [], attrs: [] });
      await page.keyboard.press("Escape");
      await sheet(page).locator("[data-bs-time] button[aria-haspopup]").click();
      await page.waitForTimeout(250);
      expect(await cov("[data-bs]")).toMatchObject({ count: 0, strings: [], attrs: [] });
      await page.keyboard.press("Escape");
      const w = await page.evaluate(() => ({ sw: document.scrollingElement!.scrollWidth, iw: window.innerWidth, bw: document.querySelector("[data-bs]")!.scrollWidth, bc: document.querySelector("[data-bs]")!.clientWidth }));
      expect(w.sw).toBeLessThanOrEqual(w.iw);
      expect(w.bw).toBeLessThanOrEqual(w.bc);
      await sheet(page).locator("[data-bs-head] button").last().click();
      await expect(sheet(page)).toHaveCount(0);
      // The bar shows the filled trip; nothing overflows at any width.
      await expect(heroBar(page)).toContainText("Fixture Airport");
      expect(await cov("[data-bar-wrap]")).toMatchObject({ count: 0, strings: [], attrs: [] });
      const w2 = await page.evaluate(() => ({ sw: document.scrollingElement!.scrollWidth, iw: window.innerWidth }));
      expect(w2.sw).toBeLessThanOrEqual(w2.iw);
    });
  }
});

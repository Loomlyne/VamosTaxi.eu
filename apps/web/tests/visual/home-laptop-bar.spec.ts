import { test, expect, type Page } from "../support/test";
import { serveMock, waitForMockReady } from "../support/mock-harness";

// Phase 26.4.1 plan 01. At >=1081 the home booking box is the laptop bar: one row from 1360,
// two rows 1081-1359, no tabs, no price, trust line under it. <=1080 stays the 26.4 bar + sheet.

const SUGGESTIONS = [
  { mapbox_id: "mb-air-1", name: "Fixture Airport", address: "Kloten", is_airport: true },
  { mapbox_id: "mb-street-1", name: "Fixture Street 1", address: "Zurich", is_airport: false },
];

type Loc = { VamosLocale: { setLang(v: string): void; coverage(root: Element, l: string): unknown } };
type R = { left: number; right: number; top: number; bottom: number; width: number; height: number };
type Geo = Record<string, R | null> & { sw?: never };

async function dismissCookies(page: Page) {
  const accept = page.getByRole("button", { name: /Accept all/i });
  if (await accept.isVisible().catch(() => false)) await accept.click();
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

async function open(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await stubGeo(page);
  const url = await serveMock("app/home/home.dc.html");
  await page.goto(url);
  await waitForMockReady(page);
  await dismissCookies(page);
}

async function pickFrom(page: Page, query: string, option: string) {
  await page.getByRole("combobox", { name: "From", exact: true }).fill(query);
  await page.getByRole("option", { name: new RegExp(option) }).click();
}

async function pickTo(page: Page, query: string, option: string) {
  await page.getByRole("combobox", { name: "To", exact: true }).fill(query);
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

async function setLang(page: Page, l: string) {
  await page.evaluate((v) => (window as unknown as Loc).VamosLocale.setLang(v), l);
  await page.waitForTimeout(250);
}

async function geom(page: Page) {
  return page.evaluate(() => {
    const q = (sel: string) => {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return {
        left: Math.round(b.left),
        right: Math.round(b.right),
        top: Math.round(b.top),
        bottom: Math.round(b.bottom),
        width: Math.round(b.width),
        height: Math.round(b.height),
      };
    };
    return {
      from: q('#book [data-bx="from"] [data-vtcombo]'),
      to: q('#book [data-bx="to"] [data-vtcombo]'),
      flight: q('#book [data-bx="flight"]:not([data-om-label="Add flight"]) [data-vtcombo]'),
      opener: q('#book [data-bx="flight"][data-om-label="Add flight"] button'),
      flightCell: q('#book [data-bx="flight"]'),
      swap: q('#book [data-bx="swap"] button'),
      when: q('#book [data-bx="when"] button[aria-haspopup="dialog"]'),
      trav: q("#book [data-trav-btn]"),
      cta: q('#book [data-bx="cta"] button'),
      card: q("[data-bookcard]"),
      note: q('#book [data-bx="note"]'),
      noteFirst: q('#book [data-bx="note"] > *'),
      sw: document.scrollingElement!.scrollWidth,
      iw: window.innerWidth,
      rtl: document.documentElement.dir === "rtl",
    } as unknown as Record<string, R | null> & { sw: number; iw: number; rtl: boolean };
  });
}

const end = (r: R, rtl: boolean) => (rtl ? r.left : r.right);
const start = (r: R, rtl: boolean) => (rtl ? r.right : r.left);

const LAPTOP = [1440, 1360];
const TWO_ROW = [1280, 1272, 1181, 1081];
const ALL_LAPTOP = [1440, 1360, 1280, 1272, 1181, 1081];
const LANGS = ["en", "de", "fr", "ar"];

test.describe("Home laptop booking bar @component", () => {
  test.describe("laptop", () => {
    test.beforeEach(({}, testInfo) => {
      test.skip(testInfo.project.name !== "component-1440", "laptop widths run in the 1440 project");
    });

    for (const w of LAPTOP) {
      for (const lang of ["en", "de", "ar"]) {
        test(`one row at ${w} in ${lang}, no tabs, no price, no quote call`, async ({ page }) => {
          let priced = 0;
          await page.route("**/api/quote**", (route) => {
            if (route.request().method() === "POST") priced++;
            return route.continue();
          });
          await open(page, w);
          await expect(page.locator("[data-box]")).toBeVisible();
          await expect(page.locator('#book [data-bx="flight"]')).toHaveCount(0);
          await expect(page.locator('#book [role="tablist"]')).toHaveCount(0);
          if (lang !== "en") await setLang(page, lang);
          const g = await geom(page);
          const boxes = [g.from!, g.to!, g.when!, g.trav!, g.cta!];
          for (const b of boxes) expect(b.height).toBe(54);
          for (const b of boxes) expect(Math.abs(b.bottom - g.from!.bottom)).toBeLessThanOrEqual(1);
          const order = boxes;
          for (let i = 1; i < order.length; i++) {
            const cur = order[i]!;
            const prev = order[i - 1]!;
            if (g.rtl) expect(cur.right).toBeLessThan(prev.right);
            else expect(cur.left).toBeGreaterThan(prev.left);
          }
          if (lang === "ar") await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
          if (w === 1440) expect(g.card!.width).toBeGreaterThanOrEqual(g.iw - 82);
          const text = await page.locator("#book").innerText();
          expect(text).not.toMatch(/Step 2/i);
          expect(text).not.toMatch(/CHF\s*[\d']|\d\s*CHF/);
          expect(priced).toBe(0);
        });
      }
    }

    for (const w of LAPTOP) {
      for (const lang of ["en", "de"]) {
        test(`airport flight field sits before From at ${w} in ${lang}`, async ({ page }, testInfo) => {
          await open(page, w);
          await pickFrom(page, "Fixture Air", "Fixture Airport");
          await pickTo(page, "Fixture Street", "Fixture Street 1");
          if (lang !== "en") await setLang(page, lang);
          const g = await geom(page);
          expect(g.flight).not.toBeNull();
          expect(g.flight!.right).toBeLessThanOrEqual(g.from!.left + 1);
          expect(g.from!.right).toBeLessThanOrEqual(g.swap!.left + 1);
          expect(g.swap!.right).toBeLessThanOrEqual(g.to!.left + 1);
          expect(g.flight!.width).toBeGreaterThanOrEqual(168);
          expect(g.flight!.width).toBeLessThanOrEqual(232);
          expect(g.flight!.height).toBe(54);
          expect(Math.abs(g.flight!.top - g.from!.top)).toBeLessThanOrEqual(1);
          testInfo.annotations.push({
            type: "widths",
            description: `${w} ${lang} flight shown: From ${g.from!.width}px, To ${g.to!.width}px, Flight ${g.flight!.width}px`,
          });
          console.log(`WIDTHS ${w} ${lang} flight shown: From ${g.from!.width} To ${g.to!.width} Flight ${g.flight!.width}`);
          expect(g.from!.width).toBeGreaterThanOrEqual(120);
          expect(g.to!.width).toBeGreaterThanOrEqual(120);
        });

        test(`street pickup shows the opener, whole and centred at ${w} in ${lang}`, async ({ page }) => {
          await open(page, w);
          await pickFrom(page, "Fixture Street", "Fixture Street 1");
          if (lang !== "en") await setLang(page, lang);
          const g = await geom(page);
          expect(g.opener).not.toBeNull();
          expect(g.opener!.height).toBe(44);
          const mid = (g.opener!.top + g.opener!.bottom) / 2;
          expect(Math.abs(mid - (g.from!.top + g.from!.bottom) / 2)).toBeLessThanOrEqual(2);
          const clip = await page.locator('#book [data-bx="flight"] button').evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
          expect(clip).toBe(true);
          if (lang === "en") await expect(page.locator('#book [data-bx="flight"] button')).toContainText("Add a flight number");
        });
      }
    }

    for (const w of TWO_ROW) {
      for (const lang of ["en", "de", "ar"]) {
        test(`two rows at ${w} in ${lang}`, async ({ page }) => {
          await open(page, w);
          await pickFrom(page, "Fixture Street", "Fixture Street 1");
          if (lang !== "en") await setLang(page, lang);
          const g = await geom(page);
          const rtl = g.rtl;
          for (const b of [g.from!, g.to!, g.swap!]) expect(Math.abs(b.top - g.from!.top) - (b === g.swap ? 5 : 0)).toBeLessThanOrEqual(6);
          expect(Math.abs(g.to!.top - g.from!.top)).toBeLessThanOrEqual(1);
          const row2 = [g.when!, g.trav!, g.cta!];
          for (const b of row2) expect(Math.abs(b.top - g.when!.top)).toBeLessThanOrEqual(1);
          expect(g.when!.top).toBeGreaterThan(g.from!.bottom);
          expect(Math.abs(g.trav!.width - 148)).toBeLessThanOrEqual(1);
          expect(Math.abs(end(g.cta!, rtl) - end(g.to!, rtl))).toBeLessThanOrEqual(2);
          expect(g.trav!.right <= g.cta!.left + 1 || g.cta!.right <= g.trav!.left + 1).toBe(true);
        });
      }
    }

    test("two rows at 1081 in de with the airport flight shown, Travellers and SEE PRICES do not overlap", async ({ page }, testInfo) => {
      await open(page, 1081);
      await pickFrom(page, "Fixture Air", "Fixture Airport");
      await setLang(page, "de");
      const g = await geom(page);
      expect(g.flight).not.toBeNull();
      expect(g.trav!.right <= g.cta!.left + 1 || g.cta!.right <= g.trav!.left + 1).toBe(true);
      expect(Math.abs(g.to!.top - g.from!.top)).toBeLessThanOrEqual(1);
      expect(g.sw).toBeLessThanOrEqual(g.iw);
      console.log(`WIDTHS 1081 de flight shown: From ${g.from!.width} To ${g.to!.width} Flight ${g.flight!.width} CTA ${g.cta!.width}`);
      testInfo.annotations.push({
        type: "widths",
        description: `1081 de flight shown: From ${g.from!.width}px, To ${g.to!.width}px, Flight ${g.flight!.width}px`,
      });
    });

    for (const w of [1440, 1181]) {
      test(`SEE PRICES is whole in German at ${w}`, async ({ page }) => {
        await open(page, w);
        await setLang(page, "de");
        const cta = page.locator('#book [data-bx="cta"] button');
        await expect(cta).toContainText(/preise anzeigen/i);
        await expect(cta).toBeEnabled();
        expect(await cta.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      });

      for (const lang of ["en", "de"]) {
        test(`trust line is one start-aligned line at ${w} in ${lang}`, async ({ page }) => {
          await open(page, w);
          if (lang !== "en") await setLang(page, lang);
          const g = await geom(page);
          expect(g.note!.height).toBeLessThanOrEqual(26);
          expect(Math.abs(start(g.noteFirst!, g.rtl) - start(g.from!, g.rtl))).toBeLessThanOrEqual(2);
        });
      }
    }

    for (const w of ALL_LAPTOP) {
      for (const lang of LANGS) {
        test(`nothing scrolls sideways at ${w} in ${lang}`, async ({ page }) => {
          await open(page, w);
          await pickFrom(page, "Fixture Air", "Fixture Airport");
          await pickTo(page, "Fixture Street", "Fixture Street 1");
          await setLang(page, lang);
          const g = await geom(page);
          expect(g.sw).toBeLessThanOrEqual(g.iw);
          expect(g.card!.right).toBeLessThanOrEqual(g.iw);
          expect(g.card!.left).toBeGreaterThanOrEqual(0);
        });
      }
    }

    for (const w of [1440, 1181]) {
      for (const lang of ["de", "fr", "ar"]) {
        test(`coverage of #book is empty at ${w} in ${lang}`, async ({ page }) => {
          await open(page, w);
          await pickFrom(page, "Fixture Air", "Fixture Airport");
          await page.locator('#book [data-bx="cta"] button').click();
          await page.locator("[data-trav-btn]").click();
          await setLang(page, lang);
          await expect(page.locator("[data-trav-panel]")).toBeVisible();
          const cov = await page.evaluate(
            (l) => (window as unknown as Loc).VamosLocale.coverage(document.getElementById("book")!, l),
            lang,
          );
          expect(cov).toMatchObject({ count: 0, strings: [], attrs: [] });
          const label = await page.locator("[data-trav-btn]").getAttribute("aria-label");
          expect(label).not.toBe("1 passenger · 0 bags");
        });
      }
    }

    test("empty SEE PRICES shows errors without moving the 54px line", async ({ page }) => {
      await open(page, 1440);
      const before = await geom(page);
      await page.locator('#book [data-bx="cta"] button').click();
      await expect(page.locator('#book [data-bx="from"] [data-bx-err]')).toBeVisible();
      await expect(page.locator('#book [data-bx="to"] [data-bx-err]')).toBeVisible();
      await expect(page.locator('#book [data-bx="when"]').getByRole("alert")).toBeVisible();
      await expect(page.getByRole("combobox", { name: "From", exact: true })).toHaveAttribute("aria-invalid", "true");
      await expect(page.getByRole("combobox", { name: "From", exact: true })).toBeFocused();
      const after = await geom(page);
      // Focus scrolls the page, so compare each top to From's own top.
      for (const k of ["to", "when", "trav"] as const)
        expect(Math.abs(after[k]!.top - after.from!.top - (before[k]!.top - before.from!.top))).toBeLessThanOrEqual(1);
    });

    for (const lang of ["en", "ar"]) {
      test(`travellers panel is 320 wide and ends with the trigger at 1440 in ${lang}`, async ({ page }) => {
        await open(page, 1440);
        if (lang !== "en") await setLang(page, lang);
        await page.locator("[data-trav-btn]").click();
        const panel = page.locator("[data-trav-panel]");
        await expect(panel).toBeVisible();
        const [p, t, rtl] = await Promise.all([
          panel.boundingBox(),
          page.locator("[data-trav-btn]").boundingBox(),
          page.evaluate(() => document.documentElement.dir === "rtl"),
        ]);
        expect(Math.abs(p!.width - 320)).toBeLessThanOrEqual(1);
        const pe = rtl ? p!.x : p!.x + p!.width;
        const te = rtl ? t!.x : t!.x + t!.width;
        expect(Math.abs(pe - te)).toBeLessThanOrEqual(2);
      });
    }

    test("suggestion list is 360 wide and starts with the From field", async ({ page }) => {
      await open(page, 1440);
      await page.getByRole("combobox", { name: "From", exact: true }).fill("Fixture");
      const sug = page.locator('#book [data-bx="from"] [data-sug]');
      await expect(sug).toBeVisible();
      const [s, g] = [await sug.boundingBox(), await geom(page)];
      expect(s!.width).toBeGreaterThanOrEqual(359);
      expect(Math.abs(s!.x - g.from!.left)).toBeLessThanOrEqual(2);
    });

    test("same trip across layouts, panels close silently, reload starts empty", async ({ page }) => {
      await open(page, 1440);
      await pickFrom(page, "Fixture Air", "Fixture Airport");
      await page.getByRole("textbox", { name: "Flight number" }).fill("LX318");
      await pickTo(page, "Fixture Street", "Fixture Street 1");
      await pickWhen(page);
      const vals = async () => ({
        from: await page.locator('#book [data-bx="from"] input').inputValue(),
        to: await page.locator('#book [data-bx="to"] input').inputValue(),
        flight: await page.locator('#book [data-bx="flight"] input').inputValue(),
      });
      const v0 = await vals();
      expect(v0.from).toBe("Fixture Airport");
      await page.setViewportSize({ width: 1181, height: 900 });
      await page.waitForTimeout(200);
      expect(await vals()).toEqual(v0);
      await page.setViewportSize({ width: 1024, height: 900 });
      await page.waitForTimeout(200);
      await expect(page.locator("[data-bookcard]")).toBeHidden();
      await expect(page.locator("[data-bar-wrap] [data-bb]")).toBeVisible();
      await expect(page.locator("[data-bar-wrap] [data-bb]")).toContainText("Fixture Airport");
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForTimeout(200);
      expect(await vals()).toEqual(v0);

      await page.locator("[data-trav-btn]").click();
      await expect(page.locator("[data-trav-panel]")).toBeVisible();
      await page.setViewportSize({ width: 1181, height: 900 });
      await page.waitForTimeout(250);
      await expect(page.locator("[data-trav-panel]")).toHaveCount(0);
      await expect(page.locator("[data-trav-btn]")).toHaveAttribute("aria-label", "1 passenger · 0 bags");

      await page.setViewportSize({ width: 1440, height: 900 });
      await page.reload();
      await waitForMockReady(page);
      await dismissCookies(page);
      expect(await page.locator('#book [data-bx="from"] input').inputValue()).toBe("");
    });

    test("a full airport trip at 1181 goes to /checkout with the trip in the URL", async ({ page }) => {
      await page.route("**/checkout?**", (route) =>
        route.fulfill({ status: 200, contentType: "text/html", body: "<html><body>checkout</body></html>" }),
      );
      await open(page, 1181);
      await pickFrom(page, "Fixture Air", "Fixture Airport");
      await page.getByRole("textbox", { name: "Flight number" }).fill("LX318");
      await pickTo(page, "Fixture Street", "Fixture Street 1");
      await pickWhen(page);
      await page.locator("[data-trav-btn]").click();
      const dialog = page.getByRole("dialog", { name: "Travellers" });
      await dialog.getByRole("button", { name: "Add a passenger" }).click();
      await dialog.getByRole("button", { name: "Add a bag" }).click();
      await dialog.getByRole("button", { name: "Done" }).click();
      const nav = page.waitForRequest((r) => r.isNavigationRequest() && /\/checkout\?/.test(r.url()));
      await page.locator('#book [data-bx="cta"] button').click();
      const u = new URL((await nav).url());
      expect(u.pathname).toBe("/checkout");
      expect(u.searchParams.get("flight")).toBe("LX318");
      for (const k of ["from", "to", "when", "pax", "bags"]) expect(u.searchParams.get(k)).toBeTruthy();
      expect(u.searchParams.get("pax")).toBe("2");
      expect(u.searchParams.get("bags")).toBe("1");
    });

    test("boundary: at 1080 the box is hidden and the bar shows", async ({ page }) => {
      await open(page, 1080);
      await expect(page.locator("[data-bookcard]")).toBeHidden();
      await expect(page.locator("[data-bar-wrap] [data-bb]")).toBeVisible();
    });

    const EN_DAY = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/;
    for (const lang of ["de", "fr", "ar"]) {
      test(`the chosen date is written in ${lang}, not English, and follows a language switch`, async ({ page }) => {
        await open(page, 1440);
        await pickWhen(page);
        const btn = page.locator('#book [data-bx="when"] button[aria-haspopup="dialog"]');
        const en = (await btn.innerText()).trim();
        expect(en).toMatch(EN_DAY);
        await setLang(page, lang);
        const txt = (await btn.innerText()).trim();
        expect(txt).not.toMatch(EN_DAY);
        expect(txt).not.toBe(en);
        const cov = await page.evaluate((l) => (window as unknown as Loc).VamosLocale.coverage(document.querySelector("#book")!, l) as { count?: number }, lang);
        expect(cov.count ?? 0).toBe(0);
        await setLang(page, "en");
        expect((await btn.innerText()).trim()).toMatch(EN_DAY);
      });
    }

    // 26.4.2 owner order: Flight, From, To, When, Travellers, SEE PRICES. Tab order equals the
    // visual order in LTR and RTL; focus lands in the flight field the moment it appears.
    for (const lang of ["en", "ar"]) {
      test(`Tab order is Flight, From, To, When, Travellers, SEE PRICES in ${lang}`, async ({ page }) => {
        await open(page, 1440);
        if (lang !== "en") await setLang(page, lang);
        const from = page.locator('#book [data-bx="from"] input');
        await from.fill("Fixture Air");
        await page.getByRole("option", { name: /Fixture Airport/ }).click();
        const flight = page.locator('#book [data-bx="flight"] input');
        await expect(flight).toBeFocused();
        const kind = () =>
          page.evaluate(() => {
            const a = document.activeElement as HTMLElement | null;
            const cell = a && a.closest ? (a.closest("[data-bx]") as HTMLElement | null) : null;
            return cell ? (cell.getAttribute("data-bx") ?? "other") : "other";
          });
        const seen: string[] = [await kind()];
        for (let i = 0; i < 14; i++) {
          await page.keyboard.press("Tab");
          seen.push(await kind());
        }
        const order = seen.filter((c, i, arr) => c !== "other" && c !== "swap" && (i === 0 || c !== arr[i - 1]));
        expect(order.slice(0, 6)).toEqual(["flight", "from", "to", "when", "trav", "cta"]);
        // the visual order agrees: flight sits before From on the start side
        const g = await geom(page);
        if (g.rtl) expect(g.flight!.left).toBeGreaterThanOrEqual(g.from!.right - 1);
        else expect(g.flight!.right).toBeLessThanOrEqual(g.from!.left + 1);
      });
    }
  });

  test.describe("26.4 bar unchanged at 1080 and under", () => {
    test.beforeEach(({}, testInfo) => {
      test.skip(testInfo.project.name === "component-1440", "runs at 1024, 768, 390");
    });

    for (const lang of ["en", "ar"]) {
      test(`bar shows, box hidden, no sideways scroll in ${lang}`, async ({ page }) => {
        await stubGeo(page);
        const url = await serveMock("app/home/home.dc.html");
        await page.goto(url);
        await waitForMockReady(page);
        await dismissCookies(page);
        if (lang !== "en") await setLang(page, lang);
        await expect(page.locator("[data-bookcard]")).toBeHidden();
        const bar = page.locator("[data-bar-wrap] [data-bb]");
        await expect(bar).toBeVisible();
        expect((await bar.boundingBox())!.height).toBe(54);
        const w = await page.evaluate(() => ({ sw: document.scrollingElement!.scrollWidth, iw: window.innerWidth }));
        expect(w.sw).toBeLessThanOrEqual(w.iw);
      });
    }
  });
});

// apps/web/tests/visual/checkout-page.spec.ts
//
// Plan 26.3-15. The one-page checkout, first half: trip from the URL, trip strip, inline
// trip editor, Section 1 (class cards and every state), old step routes forwarding.
// Runs once under component-1440 (own `next dev`, the viewport is set per assertion).
// Every /api/quote answer is a route fixture in the real response shape; totals are null
// so cards read `CHF 000` (no book price is ever asserted). Tagged @checkout.

import { test, expect, type Page, type Route } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";
import { openInLocale } from "../support/locale";
import { stubConsentChosen } from "../support/consent-state";

const RUN_PROJECT = "component-1440";
const GS = "11111111-1111-4111-8111-111111111111";
const TRIP =
  `from=Zurich%20Airport&fid=dXJuOm1ieHBvaTox&to=Bahnhofstrasse%201&tid=dXJuOm1ieHBvaTox2` +
  `&gs=${GS}&when=2026-12-15T08:15&pax=2&bags=3&flight=LX318`;
const WIDTHS = [1440, 1024, 768, 390] as const;

let devServer: ChildProcess | null = null;
let baseURL = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({}, testInfo) => {
  if (testInfo.project.name !== RUN_PROJECT) return;
  testInfo.setTimeout(180_000);
  const port = 4260 + testInfo.workerIndex;
  baseURL = `http://127.0.0.1:${port}`;
  devServer = spawn(NEXT_BIN, ["dev", "-p", String(port)], {
    cwd: WEB_ROOT,
    stdio: "ignore",
    detached: true,
    env: { ...process.env, NODE_ENV: "development", TEST_DIST_DIR: ".next-checkout-page-visual" },
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
  test.skip(testInfo.project.name !== RUN_PROJECT, "checkout page specs run once under component-1440.");
  await page.route(
    (url) => {
      const host = url.hostname;
      return host.includes("stripe") || host.includes("cloudflare") || host.includes("turnstile");
    },
    (route) => route.abort(),
  );
});

type Cap = { slug: string; name: string; pax: number; bags: number };
const CAPS: Cap[] = [
  { slug: "economy", name: "Economy", pax: 3, bags: 3 },
  { slug: "business", name: "Business", pax: 3, bags: 3 },
  { slug: "van-luxury", name: "Van luxury", pax: 8, bags: 8 },
];

/** A real-shape /api/quote body for a party; `null` totals read `CHF 000`. */
function quoteBody(pax: number, bags: number, opts: { live?: boolean; legs?: { distance_m: number; road?: boolean }[] } = {}) {
  return {
    ok: true,
    quote_id: "22222222-2222-4222-8222-222222222222",
    lock: "v1.fixture.lock",
    expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    pricing_live: opts.live ?? false,
    ...(opts.legs
      ? {
          route: {
            legs: opts.legs.map((l, i) => ({
              leg_seq: i + 1,
              distance_m: l.distance_m,
              duration_s: 0,
              geometry: { type: "LineString", coordinates: [] },
              origin_zone_id: null,
              dest_zone_id: null,
              ...(l.road === undefined ? {} : { road: l.road }),
            })),
          },
        }
      : {}),
    classes: CAPS.map((c) => {
      const eligible = pax <= c.pax && bags <= c.bags;
      return {
        slug: c.slug,
        name: c.name,
        eligible,
        ineligible_reason: eligible ? null : pax > c.pax ? "pax" : "bags",
        effective_max_pax: c.pax,
        max_bags: c.bags,
        fixed_route: false,
        total_rappen: null,
        lines: [],
        photo_url: null,
      };
    }),
  };
}

type Answer = (body: Record<string, unknown>) => { status?: number; json: unknown; delayMs?: number };

/** Route /api/quote; returns the list of request bodies it saw. */
async function routeQuote(page: Page, answer: Answer): Promise<Record<string, unknown>[]> {
  const seen: Record<string, unknown>[] = [];
  await page.route("**/api/quote", async (route: Route) => {
    if (route.request().method() !== "POST") return route.continue();
    const body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    seen.push(body);
    const a = answer(body);
    if (a.delayMs) await new Promise((r) => setTimeout(r, a.delayMs));
    await route.fulfill({
      status: a.status ?? 200,
      contentType: "application/json",
      body: JSON.stringify(a.json),
    });
  });
  return seen;
}

const byParty: Answer = (b) => ({ json: quoteBody(Number(b.pax), Number(b.bags)) });

async function open(page: Page, query = TRIP, width = 1440) {
  await page.setViewportSize({ width, height: 900 });
  const res = await page.goto(`${baseURL}/checkout?${query}`);
  expect(res?.ok()).toBeTruthy();
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

const card = (page: Page, slug: string) => page.locator(`[data-co-class="${slug}"]`);

test("trip strip and three class cards at 1440, 1024, 768 and 390 @checkout", async ({ page }) => {
  const seen = await routeQuote(page, byParty);
  for (const width of WIDTHS) {
    await open(page, TRIP, width);
    await expect(page.locator("[data-co-classes]")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-co-route]")).toContainText("Zurich Airport");
    await expect(page.locator("[data-co-route]")).toContainText("Bahnhofstrasse 1");
    await expect(page.locator("[data-co-facts]")).toContainText("08:15");
    await expect(page.locator("[data-co-facts]")).toContainText("2 passengers");
    await expect(page.locator("[data-co-facts]")).toContainText("3 bags");
    await expect(page.locator("[data-co-class]")).toHaveCount(3);
    for (const c of CAPS) {
      await expect(card(page, c.slug)).toContainText(c.name);
      await expect(card(page, c.slug)).toContainText("CHF 000");
      await expect(card(page, c.slug)).toContainText("fixed price");
    }
    // No card preselected unless class= is in the URL.
    await expect(page.locator('[data-co-class][data-selected="true"]')).toHaveCount(0);
    await noSidewaysScroll(page);

    const boxes = await page.locator("[data-co-class]").evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width) };
      }),
    );
    if (width >= 768) {
      // >=681: cards sit side by side in one row.
      expect(new Set(boxes.map((b) => b.top)).size).toBe(1);
    } else {
      // <=680: stacked rows at the full width of the section.
      expect(new Set(boxes.map((b) => b.top)).size).toBe(3);
    }
    await page.screenshot({ path: join(process.env.TMPDIR ?? "/tmp", `26.3-15-cards-${width}.png`) });
  }
  // The server got retrieve kinds and never an airport flag or a price.
  const first = seen[0] as {
    pickup: { kind: string; mapbox_id: string; session_token: string };
    legs: { scheduled_local: string; flight_no: string }[];
  };
  expect(first.pickup).toMatchObject({ kind: "retrieve", mapbox_id: "dXJuOm1ieHBvaTox", session_token: GS });
  expect(first.legs[0]).toMatchObject({ scheduled_local: "2026-12-15T08:15", flight_no: "LX318" });
  expect(JSON.stringify(seen[0])).not.toMatch(/is_airport|total_rappen/);
});

test("the page raises no console error or React warning @checkout", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (err) => problems.push(`pageerror ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error" && msg.type() !== "warning") return;
    const text = msg.text();
    if (/Failed to load resource|net::ERR|favicon/i.test(text)) return;
    // Pre-existing on every public page: CookieBanner reads useTranslations("quote"), whose
    // dotted keys next-intl rejects (INVALID_KEY). Not this page; see deferred-items.md.
    if (/INVALID_KEY|\[i18n\]/.test(text)) return;
    problems.push(`${msg.type()} ${text.slice(0, 300)}`);
  });
  await routeQuote(page, byParty);
  await open(page, `${TRIP}&class=economy`);
  await expect(page.locator("[data-co-classes]")).toBeVisible({ timeout: 30_000 });
  await page.locator("[data-co-edit]").click();
  await expect(page.locator("[data-co-editor]")).toBeVisible();
  expect(problems).toEqual([]);
});

test("a class too small is greyed with its note and cannot be picked (pax 5) @checkout", async ({ page }) => {
  await routeQuote(page, byParty);
  await open(page, TRIP.replace("pax=2", "pax=5"));
  await expect(page.locator("[data-co-classes]")).toBeVisible({ timeout: 30_000 });
  for (const slug of ["economy", "business"]) {
    await expect(card(page, slug)).toHaveAttribute("data-eligible", "false");
    await expect(card(page, slug)).toContainText("Seats up to 3");
    await expect(card(page, slug).locator("button")).toHaveAttribute("aria-disabled", "true");
    await expect(card(page, slug).locator("button")).toBeDisabled();
    // The price is still shown.
    await expect(card(page, slug)).toContainText("CHF 000");
    const opacity = await card(page, slug).locator("button").evaluate((el) => getComputedStyle(el).opacity);
    expect(Number(opacity)).toBeCloseTo(0.42, 2);
  }
  await expect(card(page, "van-luxury")).toHaveAttribute("data-eligible", "true");
  await expect(page.locator('[data-co-class][data-selected="true"]')).toHaveCount(0);
});

test("bags too many shows 'Takes up to n bags' @checkout", async ({ page }) => {
  await routeQuote(page, byParty);
  await open(page, TRIP.replace("bags=3", "bags=5"));
  await expect(page.locator("[data-co-classes]")).toBeVisible({ timeout: 30_000 });
  await expect(card(page, "economy")).toContainText("Takes up to 3 bags");
});

test("choosing a class selects it, writes class= to the URL and turns the title disc to the check disc @checkout", async ({
  page,
}) => {
  await routeQuote(page, byParty);
  await open(page);
  await expect(page.locator("[data-co-classes]")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-co-section="1"] [data-done="true"]')).toHaveCount(0);
  await card(page, "business").locator("button").click();
  await expect(card(page, "business")).toHaveAttribute("data-selected", "true");
  await expect(page.locator('[data-co-section="1"] [data-done="true"]')).toHaveCount(1);
  expect(new URL(page.url()).searchParams.get("class")).toBe("business");
  // A reload keeps the selection through the URL.
  await page.reload();
  await expect(card(page, "business")).toHaveAttribute("data-selected", "true", { timeout: 30_000 });
});

test("loading state shows the sentence and three placeholders, then the cards @checkout", async ({ page }) => {
  await routeQuote(page, (b) => ({ json: quoteBody(Number(b.pax), Number(b.bags)), delayMs: 2500 }));
  await open(page);
  await expect(page.locator("[data-co-classes-loading]")).toBeVisible();
  await expect(page.getByText("Getting your fixed prices").first()).toBeVisible();
  await expect(page.locator("[data-co-classes-loading] .vt-veh--loading")).toHaveCount(3);
  await expect(page.locator("[data-co-classes]")).toBeVisible({ timeout: 30_000 });
});

test("quote error: danger alert with the matching message, TRY AGAIN re-quotes @checkout", async ({ page }) => {
  let ok = false;
  await routeQuote(page, (b) =>
    ok
      ? { json: quoteBody(Number(b.pax), Number(b.bags)) }
      : {
          status: 422,
          json: { ok: false, error: "out_of_service_area", i18n_key: "quote.error.out_of_service_area" },
        },
  );
  await open(page);
  const err = page.locator("[data-co-classes-error]");
  await expect(err).toBeVisible({ timeout: 30_000 });
  await expect(err).toContainText("This route is outside our service area");
  await expect(err.locator(".vt-alert--danger")).toHaveCount(1);
  ok = true;
  await page.locator("[data-co-retry]").click();
  await expect(page.locator("[data-co-classes]")).toBeVisible({ timeout: 30_000 });
});

test("generic failure copy when the server gives no code @checkout", async ({ page }) => {
  await routeQuote(page, () => ({ status: 500, json: null }));
  await open(page);
  await expect(page.locator("[data-co-classes-error]")).toContainText("We could not get prices for this trip", {
    timeout: 30_000,
  });
});

test("pricing not live: info alert, no retry button @checkout", async ({ page }) => {
  await routeQuote(page, () => ({
    status: 422,
    json: { ok: false, error: "pricing_not_live", i18n_key: "quote.error.pricing_not_live" },
  }));
  await open(page);
  const err = page.locator("[data-co-classes-error]");
  await expect(err).toBeVisible({ timeout: 30_000 });
  await expect(err.locator(".vt-alert--info")).toHaveCount(1);
  await expect(err.locator("[data-co-retry]")).toHaveCount(0);
});

test("empty: 'No class fits this trip' with EDIT TRIP opening the editor @checkout", async ({ page }) => {
  await routeQuote(page, (b) => ({ json: quoteBody(Number(b.pax) + 20, Number(b.bags)) }));
  await open(page);
  const empty = page.locator("[data-co-classes-empty]");
  await expect(empty).toBeVisible({ timeout: 30_000 });
  await expect(empty).toContainText("No class fits this trip");
  await expect(empty).toContainText("+41 79 626 70 82");
  await page.locator("[data-co-empty-edit]").click();
  await expect(page.locator("[data-co-editor]")).toBeVisible();
});

test("trip distance: the server's km lead the strip and open the summary, at four widths @checkout", async ({ page }) => {
  await routeQuote(page, (b) => ({ json: quoteBody(Number(b.pax), Number(b.bags), { legs: [{ distance_m: 148_230, road: true }] }) }));
  for (const width of WIDTHS) {
    await open(page, TRIP, width);
    await expect(page.locator("[data-co-classes]")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-co-facts]")).toHaveText(/^148\.2 km · .*08:15 · 2 passengers · 3 bags$/);
    await expect(page.locator("[data-co-facts] [data-co-distance] .vt-dir-keep")).toHaveText("148.2");
    const summary = page.locator(width >= 1081 ? ".vt-co__railcard" : "[data-co-section='3']").first();
    await expect(summary.locator("[data-co-distance]")).toContainText("148.2 km");
    await noSidewaysScroll(page);
  }
});

test("trip distance: a leg with no road writes the words in all places, never a partial sum @checkout", async ({ page }) => {
  await routeQuote(page, (b) => ({
    json: quoteBody(Number(b.pax), Number(b.bags), {
      legs: [
        { distance_m: 100_000, road: true },
        { distance_m: 9_000, road: false },
      ],
    }),
  }));
  await open(page, TRIP, 1440);
  await expect(page.locator("[data-co-classes]")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-co-facts] [data-co-no-road]")).toHaveText("No road route");
  await expect(page.locator(".vt-co__railcard [data-co-no-road]")).toHaveText("No road route");
  await expect(page.locator("[data-co-facts]")).not.toContainText("km");
  await expect(page.locator(".vt-co__railcard [data-co-distance]")).not.toContainText("km");
});

test("trip distance: an answer without a route shows neither figure nor words @checkout", async ({ page }) => {
  await routeQuote(page, byParty);
  await open(page, TRIP, 1440);
  await expect(page.locator("[data-co-classes]")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-co-distance]")).toHaveCount(0);
});

test("Edit trip: fields in home order, UPDATE PRICES re-quotes, replaces the URL and clears a class that became too small @checkout", async ({
  page,
}) => {
  const seen = await routeQuote(page, byParty);
  await open(page, `${TRIP}&class=economy`);
  await expect(card(page, "economy")).toHaveAttribute("data-selected", "true", { timeout: 30_000 });

  await page.locator("[data-co-edit]").click();
  const editor = page.locator("[data-co-editor]");
  await expect(editor).toBeVisible();
  await expect(page.locator("[data-co-strip]")).toHaveCount(0);
  // Focus moves to From, which is prefilled.
  await expect(page.locator('[data-co-field="from"] input')).toBeFocused();
  await expect(page.locator('[data-co-field="from"] input')).toHaveValue("Zurich Airport");
  // Home order: From, Flight (airport), To, When, Travellers.
  const order = await editor
    .locator("[data-co-field]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-co-field")));
  expect(order).toEqual(["from", "flight", "to", "when", "travellers"]);
  await expect(page.locator('[data-co-field="flight"] input')).toHaveValue("LX 318");
  await page.screenshot({ path: join(process.env.TMPDIR ?? "/tmp", "26.3-15-editor-1440.png") });
  await page.setViewportSize({ width: 390, height: 900 });
  await noSidewaysScroll(page);
  await page.screenshot({ path: join(process.env.TMPDIR ?? "/tmp", "26.3-15-editor-390.png") });
  await page.setViewportSize({ width: 1440, height: 900 });

  // 2 -> 5 passengers, then UPDATE PRICES.
  const add = editor.getByRole("button", { name: "Add a passenger" });
  for (let i = 0; i < 3; i++) await add.click();
  await editor.locator("[data-co-update]").click();

  await expect(editor).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator("[data-co-facts]")).toContainText("5 passengers");
  const url = new URL(page.url());
  expect(url.searchParams.get("pax")).toBe("5");
  expect(url.searchParams.get("from")).toBe("Zurich Airport");
  // Economy seats 3: it is greyed and the selection cleared (also out of the URL).
  await expect(card(page, "economy")).toHaveAttribute("data-eligible", "false");
  await expect(page.locator('[data-co-class][data-selected="true"]')).toHaveCount(0);
  expect(url.searchParams.get("class")).toBeNull();
  expect(seen.at(-1)).toMatchObject({ pax: 5 });
  // Focus returns to Edit trip.
  await expect(page.locator("[data-co-edit]")).toBeFocused();
});

test("Edit trip: Escape and CANCEL close without change and return focus @checkout", async ({ page }) => {
  await routeQuote(page, byParty);
  await open(page);
  await expect(page.locator("[data-co-classes]")).toBeVisible({ timeout: 30_000 });
  await page.locator("[data-co-edit]").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-co-editor]")).toHaveCount(0);
  await expect(page.locator("[data-co-edit]")).toBeFocused();
  await expect(page.locator("[data-co-facts]")).toContainText("2 passengers");
  await page.locator("[data-co-edit]").click();
  await page.locator("[data-co-cancel]").click();
  await expect(page.locator("[data-co-editor]")).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("pax")).toBe("2");
});

test("Edit trip error keeps the editor open, shows the message and leaves the trip untouched @checkout", async ({
  page,
}) => {
  let fail = false;
  await routeQuote(page, (b) =>
    fail
      ? { status: 422, json: { ok: false, error: "out_of_service_area", i18n_key: "quote.error.out_of_service_area" } }
      : { json: quoteBody(Number(b.pax), Number(b.bags)) },
  );
  await open(page);
  await expect(page.locator("[data-co-classes]")).toBeVisible({ timeout: 30_000 });
  await page.locator("[data-co-edit]").click();
  const editor = page.locator("[data-co-editor]");
  await editor.getByRole("button", { name: "Add a passenger" }).click();
  fail = true;
  await editor.locator("[data-co-update]").click();
  await expect(editor.locator("[data-co-editor-error]")).toContainText("outside our service area");
  await expect(editor.locator("[data-co-update]")).toBeEnabled();
  expect(new URL(page.url()).searchParams.get("pax")).toBe("2");
  // The cards of the previous trip are back.
  await expect(page.locator("[data-co-classes]")).toBeVisible();
});

test("Edit trip validates like home: missing pickup and a bad flight number @checkout", async ({ page }) => {
  await routeQuote(page, byParty);
  await open(page);
  await expect(page.locator("[data-co-classes]")).toBeVisible({ timeout: 30_000 });
  await page.locator("[data-co-edit]").click();
  const editor = page.locator("[data-co-editor]");
  await editor.locator('[data-co-field="flight"] input').fill("hello");
  await editor.locator("[data-co-update]").click();
  await expect(editor).toContainText("Check the flight number");
  await expect(page.locator('[data-co-field="flight"] input')).toBeFocused();
  await editor.locator('[data-co-field="from"] button[data-combo-x]').click();
  await editor.locator("[data-co-update]").click();
  await expect(editor).toContainText("Enter a pickup address");
  await expect(page.locator('[data-co-field="from"] input')).toBeFocused();
});

test("an incomplete URL opens the editor with the gaps named, never a quote @checkout", async ({ page }) => {
  const seen = await routeQuote(page, byParty);
  await open(page, `from=Zurich%20Airport&pax=2`);
  await expect(page.locator("[data-co-editor]")).toBeVisible();
  await expect(page.locator("[data-co-editor]")).toContainText("Enter a drop-off address");
  await expect(page.locator("[data-co-classes-idle]")).toContainText("Add your trip to see prices");
  expect(seen).toHaveLength(0);
});

test("old step routes forward to /checkout keeping the query @checkout", async ({ page }) => {
  await routeQuote(page, byParty);
  for (const step of ["trip", "details", "payment"]) {
    await page.goto(`${baseURL}/checkout/${step}?${TRIP}`);
    await expect(page).toHaveURL(new RegExp(`/checkout\\?from=Zurich`));
    expect(new URL(page.url()).pathname).toBe("/checkout");
    expect(new URL(page.url()).searchParams.get("fid")).toBe("dXJuOm1ieHBvaTox");
    await expect(page.locator("[data-co-classes]")).toBeVisible({ timeout: 30_000 });
  }
});

test("de, fr and ar render the page in the chosen language, ar mirrored, no sideways scroll @checkout", async ({
  page,
}) => {
  await routeQuote(page, (b) => ({ json: quoteBody(Number(b.pax) + 3, Number(b.bags)) }));
  const cases: { lang: "de" | "fr" | "ar"; title: RegExp; note: RegExp; edit: RegExp }[] = [
    { lang: "de", title: /Klasse wählen/, note: /Platz für bis zu 3/, edit: /Fahrt ändern/ },
    { lang: "fr", title: /Choisissez votre classe/, note: /Jusqu’à 3 places/, edit: /Modifier le trajet/ },
    { lang: "ar", title: /اختر فئتك/, note: /يتّسع حتى 3/, edit: /تعديل الرحلة/ },
  ];
  for (const c of cases) {
    for (const width of [1440, 390] as const) {
      await page.setViewportSize({ width, height: 900 });
      const res = await openInLocale(page, baseURL, `/checkout?${TRIP}`, c.lang);
      expect(res?.ok()).toBeTruthy();
      await expect(page.locator("html")).toHaveAttribute("lang", c.lang);
      await expect(page.locator("html")).toHaveAttribute("dir", c.lang === "ar" ? "rtl" : "ltr");
      await expect(page.locator("[data-co-classes]")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('[data-co-section="1"]')).toContainText(c.title);
      await expect(card(page, "economy")).toContainText(c.note);
      await expect(page.locator("[data-co-edit]")).toContainText(c.edit);
      await expect(page.locator("[data-co-class]")).toHaveCount(3);
      // Class names stay Latin in every language.
      await expect(card(page, "van-luxury")).toContainText("Van luxury");
      await noSidewaysScroll(page);
      await page.screenshot({ path: join(process.env.TMPDIR ?? "/tmp", `26.3-15-${c.lang}-${width}.png`) });
      const text = await page.locator("[data-checkout-page]").innerText();
      expect(text).not.toContain("ß");
      if (c.lang === "ar") {
        const back = await page.locator(".vt-co__strip-back").evaluate((el) => getComputedStyle(el).transform);
        const arrow = await page.locator(".vt-co__strip-arrow").evaluate((el) => getComputedStyle(el).transform);
        expect(back).toBe("matrix(-1, 0, 0, 1, 0, 0)");
        expect(arrow).toBe("matrix(-1, 0, 0, 1, 0, 0)");
        // Logical layout: Edit trip sits at the inline end, which is the left edge in rtl.
        const edit = await page.locator("[data-co-edit]").boundingBox();
        const strip = await page.locator("[data-co-strip]").boundingBox();
        expect(edit && strip && edit.x - strip.x < strip.width / 2).toBe(true);
      }
    }
  }
});

test("no glow and no tinted yellow anywhere on the page @checkout", async ({ page }) => {
  await routeQuote(page, byParty);
  await open(page, `${TRIP}&class=business`);
  await expect(card(page, "business")).toHaveAttribute("data-selected", "true", { timeout: 30_000 });
  await page.locator("[data-co-edit]").click();
  const css = readFileSync(join(WEB_ROOT, "..", "..", "design-system", "tokens", "colors.css"), "utf8");
  const tints = [50, 100, 200, 300, 600, 700].map((n) => {
    const hex = new RegExp(`--vt-yellow-${n}:\\s*#([0-9A-Fa-f]{6})`).exec(css)?.[1] ?? "";
    const v = parseInt(hex, 16);
    return `rgb(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255})`;
  });
  expect(tints.every((t) => /^rgb\(\d+, \d+, \d+\)$/.test(t))).toBe(true);
  const offenders = await page.evaluate((tintList) => {
    const yellowShadow = /rgba?\(\s*253,\s*194,\s*11/;
    const bad: string[] = [];
    for (const el of Array.from(document.querySelectorAll("[data-checkout-page], [data-checkout-page] *"))) {
      const s = getComputedStyle(el);
      const at = `${el.tagName.toLowerCase()}.${(el as HTMLElement).className?.toString().slice(0, 40)}`;
      if (yellowShadow.test(s.boxShadow)) bad.push(`glow ${at}`);
      for (const prop of ["backgroundColor", "borderTopColor", "borderBottomColor", "color"] as const) {
        if (tintList.includes(s[prop])) bad.push(`tint ${prop} ${at}`);
      }
    }
    return bad;
  }, tints);
  expect(offenders).toEqual([]);
});

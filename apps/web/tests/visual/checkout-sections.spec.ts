// apps/web/tests/visual/checkout-sections.spec.ts
//
// Plan 26.3-21. The finished one-page checkout across 1440, 1024, 768 and 390 in en, de
// and ar (dir rtl): exactly one PAY, first-missing-field focus, server repricing, voucher,
// no extras section when there are none, "Have an account? Sign in" with class and extras
// in returnTo, PAY to hosted Stripe, Back to a filled page, PAY again to the same Stripe URL
// without a new intent, the expired state, and no card fields anywhere. Runs once under
// component-1440 with its own `next dev`; the viewport is set per pass. Every server answer
// is a route fixture in the real response shape; Stripe is the plan 05 fake (its own origin).
// Amounts here are arithmetic fixtures, never a book price. Tagged @checkout.

import { test, expect, type Page, type Route } from "../support/test";
import { testPort } from "../support/port";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";
import { openInLocale, type Lang } from "../support/locale";
import { installFakeStripe, type FakeStripeHandle } from "../support/fake-stripe";
import { stubConsentChosen } from "../support/consent-state";

const RUN_PROJECT = "component-1440";
const GS = "11111111-1111-4111-8111-111111111111";
const QID = "22222222-2222-4222-8222-222222222222";
const BOOKING = "00000000-0000-4000-8000-000000000263";
const TRIP =
  `from=Zurich%20Airport&fid=dXJuOm1ieHBvaTox&to=Bahnhofstrasse%201&tid=dXJuOm1ieHBvaTox2` +
  `&gs=${GS}&when=2026-12-15T08:15&pax=2&bags=3&flight=LX318`;
const WIDTHS = [1440, 1024, 768, 390] as const;
const LANGS: Lang[] = ["en", "de", "ar"];

let devServer: ChildProcess | null = null;
let baseURL = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({}, testInfo) => {
  if (testInfo.project.name !== RUN_PROJECT) return;
  testInfo.setTimeout(180_000);
  const port = testPort(4310) + testInfo.workerIndex;
  baseURL = `http://127.0.0.1:${port}`;
  devServer = spawn(NEXT_BIN, ["dev", "-p", String(port)], {
    cwd: WEB_ROOT,
    stdio: "ignore",
    detached: true,
    env: { ...process.env, NODE_ENV: "development", TEST_DIST_DIR: ".next-checkout-sections-visual" },
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
  test.setTimeout(300_000);
});

// ── Fixtures (arithmetic only) ──────────────────────────────────────────────────────────
const BASE: Record<string, number> = { economy: 10000, business: 15000, "van-luxury": 20000 };
const CAPS = [
  { slug: "economy", name: "Economy", pax: 3, bags: 3 },
  { slug: "business", name: "Business", pax: 3, bags: 3 },
  { slug: "van-luxury", name: "Van luxury", pax: 8, bags: 8 },
];
const EXTRAS = [
  {
    code: "child-seat",
    amount_rappen: 1000,
    names: { en: "Child seat", de: "Kindersitz", fr: "Siège enfant", ar: "مقعد أطفال" },
  },
];
const VAT_BPS = 810;

function quoteBody(pax: number, bags: number) {
  return {
    ok: true,
    quote_id: QID,
    lock: "v1.fixture.lock",
    expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    pricing_live: true,
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
        total_rappen: Math.round((BASE[c.slug] ?? 0) * 1.081),
        lines: [],
        // FIXTURE photos (neutral grey SVG). Van luxury has none on purpose: it shows the car icon.
        photo_url: c.slug === "van-luxury" ? null : `/photos/classes/fixture-${c.slug}.svg`,
      };
    }),
  };
}

type PriceBody = { lock: string; vehicle_class: string; extra_codes: string[]; coupon: string | null };

/** What POST /api/checkout/price returns: VAT included, the lines add up. */
function priceAnswer(body: PriceBody) {
  const fare = BASE[body.vehicle_class] ?? 0;
  const lines: Record<string, unknown>[] = [
    { kind: "fare", code: "distance_fare", i18n_key: "price.line.transfer", params: {}, amount_rappen: fare },
  ];
  let net = fare;
  for (const code of body.extra_codes) {
    const extra = EXTRAS.find((e) => e.code === code)!;
    lines.push({
      kind: "surcharge",
      code,
      i18n_key: "price.surcharge.custom",
      params: { name: extra.names.en, names: extra.names },
      amount_rappen: extra.amount_rappen,
    });
    net += extra.amount_rappen;
  }
  if (body.coupon) {
    const off = Math.round(net / 10);
    lines.push({ kind: "coupon", code: body.coupon, i18n_key: "price.line.coupon", params: {}, amount_rappen: -off });
    net -= off;
  }
  const vat = Math.round((net * VAT_BPS) / 10000);
  lines.push({ kind: "vat", code: "vat", i18n_key: "price.line.vat", params: { vatRateBps: VAT_BPS }, amount_rappen: vat });
  return { ok: true, lines, net_rappen: net, vat_rappen: vat, charged_rappen: net + vat };
}

type Fixture = {
  priceBodies: PriceBody[];
  charged: number[];
  resume: Record<string, unknown> | null;
  stripe: FakeStripeHandle | null;
  quoteCalls: number;
  repriceBodies: Record<string, unknown>[];
};

async function setup(
  page: Page,
  opts: { extras?: typeof EXTRAS; resume?: Record<string, unknown> | null; priceDelayMs?: number } = {},
) {
  const fx: Fixture = { priceBodies: [], charged: [], resume: opts.resume ?? null, stripe: null, quoteCalls: 0, repriceBodies: [] };
  await page.route(
    (url) => url.hostname.includes("cloudflare") || url.hostname.includes("turnstile"),
    (route) => route.abort(),
  );
  await page.route("**/api/flight/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: false }) }),
  );
  await page.route("**/photos/classes/**", (route) =>
    route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" fill="#c9cacb"/><rect x="170" y="160" width="300" height="90" rx="30" fill="#e4e5e5"/></svg>' }),
  );
  await page.route("**/api/quote", async (route: Route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    fx.quoteCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(quoteBody(Number(body.pax), Number(body.bags))),
    });
  });
  // A flight-only edit re-signs the lock here: same classes and amounts, a new lock (26.4-07).
  await page.route("**/api/quote/reprice", async (route: Route) => {
    fx.repriceBodies.push(JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...quoteBody(2, 3), lock: "v1.fixture.lock.resigned" }),
    });
  });
  await page.route("**/api/geo/retrieve**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ place: { isAirport: /airport/i.test(route.request().url()) } }),
    }),
  );
  await page.route("**/api/checkout/extras", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, extras: opts.extras ?? EXTRAS, vat_rate_bps: VAT_BPS }),
    }),
  );
  await page.route("**/api/checkout/price", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as PriceBody;
    fx.priceBodies.push(body);
    const answer = priceAnswer(body);
    fx.charged.push(answer.charged_rappen);
    if (opts.priceDelayMs) await new Promise((r) => setTimeout(r, opts.priceDelayMs));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(answer) });
  });
  await page.route("**/api/checkout/me", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ signed_in: false }) }),
  );
  await page.route("**/api/checkout/resume**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(fx.resume ?? { state: "none" }),
    }),
  );
  fx.stripe = await installFakeStripe(page, { outcome: "cancel", returnRoute: true, resumeQuoteId: QID });
  return fx;
}

async function open(page: Page, lang: Lang, width: number, query = TRIP) {
  await page.setViewportSize({ width, height: 900 });
  const res = await openInLocale(page, baseURL, `/checkout?${query}`, lang);
  expect(res?.ok()).toBeTruthy();
  await expect(page.locator("[data-co-classes]")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("html")).toHaveAttribute("lang", lang);
  await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
}

const pay = (page: Page) => page.locator("[data-co-pay]");
const card = (page: Page, slug: string) => page.locator(`[data-co-class="${slug}"]`);
const total = (page: Page) => page.locator("[data-co-total]");
const focusedAutocomplete = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute("autocomplete"));

const messages = (lang: string) =>
  JSON.parse(readFileSync(join(WEB_ROOT, "i18n", "messages", `${lang}.json`), "utf8")) as {
    checkout: Record<string, string>;
  };

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function noCardFields(page: Page) {
  await expect(page.locator('input[autocomplete^="cc-"], input[name*="card" i], iframe')).toHaveCount(0);
  await expect(page.locator("[data-checkout-express], [data-checkout-paylink], [data-checkout-dummy-fields]")).toHaveCount(0);
}

async function fillContact(page: Page) {
  await page.locator('[data-co-contact] input[autocomplete="given-name"]').fill("Amira");
  await page.locator('[data-co-contact] input[autocomplete="family-name"]').fill("Keller");
  await page.locator('[data-co-contact] input[autocomplete="email"]').fill("amira@example.com");
  await page.locator("[data-co-contact] [data-vt-phone] input").fill("41796267082");
}

// ── 1. One PAY, no card fields, first missing field, at four widths ─────────────────────
for (const lang of LANGS) {
  test(`${lang}: one PAY, no card fields, the first gap gets the focus, at 1440, 1024, 768 and 390 @checkout`, async ({ page }) => {
    await setup(page);
    const tr = messages(lang).checkout;
    expect(tr.chooseClass, `${lang}.chooseClass`).toBeTruthy();
    expect(tr["enter-a-first-name"], `${lang}.enter-a-first-name`).toBeTruthy();
    for (const width of WIDTHS) {
      await open(page, lang, width);
      await expect(pay(page)).toHaveCount(1);
      await expect(pay(page)).toBeVisible();
      await noCardFields(page);
      await noSidewaysScroll(page);

      // 1. No class yet: the class section is named and the summary says so.
      await pay(page).click();
      await expect(page.locator('[data-co-section="1"] [data-co-section-error]')).toContainText(tr.chooseClass!);
      await expect(page.locator("[data-co-live]")).toContainText(tr.chooseClass!);

      // 2. A class, then the first contact field in DOM order.
      await card(page, "business").locator("button").first().click();
      await expect(total(page)).toBeVisible();
      await pay(page).click();
      await expect.poll(() => focusedAutocomplete(page)).toBe("given-name");
      await expect(page.locator("[data-co-contact]")).toContainText(tr["enter-a-first-name"]!);
      await expect(pay(page)).toHaveCount(1);
      await noSidewaysScroll(page);
    }
  });
}

// ── 2. Server repricing, voucher, no extras section when empty ──────────────────────────
for (const lang of LANGS) {
  test(`${lang}: an extra and a voucher reprice from the server; no amount leaves the browser @checkout`, async ({ page }) => {
    const fx = await setup(page, { priceDelayMs: 500 });
    const tr = messages(lang).checkout;
    expect(tr.updatingPrice, `${lang}.updatingPrice`).toBeTruthy();
    for (const width of WIDTHS) {
      await open(page, lang, width, `${TRIP}&class=economy`);
      await expect(total(page)).toBeVisible({ timeout: 30_000 });
      const base = await total(page).innerText();
      const baseCharged = fx.charged[fx.charged.length - 1]!;

      await page.locator('[data-co-extra="child-seat"] label').click();
      await expect(page.locator("[data-co-total-note]").first()).toContainText(tr.updatingPrice!);
      await expect.poll(() => fx.charged[fx.charged.length - 1]).toBe(baseCharged + 1081);
      await expect(total(page)).toBeVisible({ timeout: 15_000 });
      const withExtra = await total(page).innerText();
      expect(withExtra).not.toBe(base);
      expect(fx.priceBodies[fx.priceBodies.length - 1]!.extra_codes).toEqual(["child-seat"]);

      await page.locator("[data-co-voucher-open]").click();
      await page.locator("[data-co-voucher] input").fill("SPRING10");
      await page.locator("[data-co-voucher-apply]").click();
      await expect(page.locator("[data-co-voucher-applied]")).toContainText("SPRING10", { timeout: 15_000 });
      expect(fx.priceBodies[fx.priceBodies.length - 1]).toMatchObject({ coupon: "SPRING10", extra_codes: ["child-seat"] });
      await expect(total(page)).toBeVisible({ timeout: 15_000 });
      const withVoucher = await total(page).innerText();
      expect(withVoucher).not.toBe(withExtra);

      await page.locator("[data-co-voucher-remove]").click();
      await expect(page.locator("[data-co-voucher-applied]")).toHaveCount(0);
      await expect.poll(() => fx.priceBodies[fx.priceBodies.length - 1]!.coupon).toBeNull();
      await expect(total(page)).toHaveText(withExtra, { timeout: 15_000 });

      await page.locator('[data-co-extra="child-seat"] label').click();
      await expect(total(page)).toHaveText(base, { timeout: 15_000 });
      expect(JSON.stringify(fx.priceBodies)).not.toMatch(/rappen|amount|total/);
      await noSidewaysScroll(page);
    }
  });
}

test("no extras section at all when the dashboard has no extras, at four widths @checkout", async ({ page }) => {
  await setup(page, { extras: [] });
  for (const width of WIDTHS) {
    await open(page, "en", width, `${TRIP}&class=economy`);
    await expect(page.locator('[data-co-section="2"]')).toBeVisible();
    await expect(page.locator("[data-co-extras]")).toHaveCount(0);
    await expect(page.locator("[data-co-extra]")).toHaveCount(0);
    await expect(pay(page)).toHaveCount(1);
    await noSidewaysScroll(page);
  }
});

// ── 3. Sign in carries class and extras ─────────────────────────────────────────────────
for (const lang of LANGS) {
  test(`${lang}: the Sign in option carries class and extras in returnTo and no contact @checkout`, async ({ page }) => {
    await setup(page);
    await page.route("**/api/auth", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, stage: "sent" }) }),
    );
    for (const width of WIDTHS) {
      await open(page, lang, width, `${TRIP}&class=business`);
      await page.locator('[data-co-extra="child-seat"] label').click();
      await fillContact(page);
      // 26.5: the Sign in option sends the link request with this checkout as returnTo.
      const sent = page.waitForRequest((r) => r.url().endsWith("/api/auth") && r.method() === "POST");
      await page.locator('[data-acct-option="signin"]').click();
      await page.locator("[data-acct-signin='form'] [data-acct-action]").click();
      const returnTo = (JSON.parse((await sent).postData() ?? "{}") as { returnTo: string }).returnTo;
      expect(returnTo).toMatch(/\/checkout\?/);
      const params = new URLSearchParams(returnTo.split("?")[1]);
      expect(params.get("class")).toBe("business");
      expect(params.get("extras")).toBe("child-seat");
      expect(returnTo).not.toMatch(/Amira|amira|41796|Keller/);
      await noSidewaysScroll(page);
    }
  });
}

// ── 4. PAY, Back, PAY again to the same Stripe page, no second intent ───────────────────
for (const lang of LANGS) {
  test(`${lang}: Back from Stripe shows the filled page and PAY reaches the same Stripe URL without a new intent @checkout`, async ({ page }) => {
    const tr = messages(lang).checkout;
    expect(tr.backFromStripe, `${lang}.backFromStripe`).toBeTruthy();
    for (const width of WIDTHS) {
      const fx = await setup(page);
      const stripe = fx.stripe!;
      await open(page, lang, width, `${TRIP}&class=business`);
      await fillContact(page);
      await expect(total(page)).toBeVisible();
      await pay(page).click();
      await page.waitForURL(/checkout\.stripe\.com\/c\/pay\//);
      const stripeUrl = page.url();
      expect(stripe.intentBodies).toHaveLength(1);
      expect(JSON.stringify(stripe.intentBodies[0])).not.toMatch(/rappen|"amount|"total|"lines/);
      expect(stripe.intentBodies[0]).toMatchObject({ vehicle_class: "business", locale: lang });

      fx.resume = {
        state: "open",
        url: stripeUrl,
        booking_id: BOOKING,
        quote_id: QID,
        trip_query: `${TRIP}&class=business`,
        contact: { name: "Amira Keller", email: "amira@example.com", phone: "+41796267082" },
        company: { name: "", address: "", vat: "" },
        note: "",
        class: "business",
        extra_codes: [],
        coupon: null,
        charged_rappen: 0,
      };
      await page.getByTestId("fake-stripe-back").click();
      await expect(page.locator("[data-co-back-notice]")).toContainText(tr.backFromStripe!, { timeout: 30_000 });
      await expect(page.locator('[data-co-contact] input[autocomplete="given-name"]')).toHaveValue("Amira");
      await expect(page.locator('[data-co-contact] input[autocomplete="email"]')).toHaveValue("amira@example.com");
      await expect(card(page, "business")).toHaveAttribute("data-selected", "true");
      await expect(pay(page)).toHaveCount(1);
      await noCardFields(page);
      await noSidewaysScroll(page);

      await expect(total(page)).toBeVisible();
      await pay(page).click();
      await page.waitForURL(stripeUrl);
      expect(stripe.intentBodies).toHaveLength(1);
      await page.unrouteAll({ behavior: "ignoreErrors" });
    }
  });
}

// ── 5. Expired booking ──────────────────────────────────────────────────────────────────
for (const lang of LANGS) {
  test(`${lang}: an expired booking says so, keeps the contact and offers current prices @checkout`, async ({ page }) => {
    const tr = messages(lang).checkout;
    expect(tr.expiredBooking, `${lang}.expiredBooking`).toBeTruthy();
    await setup(page, {
      resume: {
        state: "expired",
        booking_id: BOOKING,
        quote_id: QID,
        trip_query: TRIP,
        contact: { name: "Amira Keller", email: "amira@example.com", phone: "+41796267082" },
        company: { name: "", address: "", vat: "" },
        note: "",
        class: "economy",
        extra_codes: [],
        coupon: null,
        charged_rappen: 0,
      },
    });
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await openInLocale(page, baseURL, `/checkout?resume=${QID}&pay=unpaid`, lang);
      await expect(page.locator("[data-co-top-notice]")).toContainText(tr.expiredBooking!, { timeout: 30_000 });
      await expect(page.locator("[data-co-classes]")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('[data-co-contact] input[autocomplete="given-name"]')).toHaveValue("Amira");
      await expect(page.locator("[data-co-see-prices]")).toBeVisible();
      await expect(pay(page)).toHaveCount(1);
      await noCardFields(page);
      await noSidewaysScroll(page);
    }
  });
}

// ── 6. D-09: the flight is optional off-airport, and a flight-only edit never re-quotes ─
const TRIP_STREET =
  `from=Bahnhofstrasse%201&fid=dXJuOm1ieHBvaTox&to=Zurich%20Airport&tid=dXJuOm1ieHBvaTox2` +
  `&gs=${GS}&when=2026-12-15T08:15&pax=2&bags=3`;

for (const lang of ["en", "ar"] as Lang[]) {
  test(`${lang}: Edit trip offers an optional flight off-airport; a flight-only edit re-signs, never re-quotes @checkout`, async ({ page }) => {
    const fx = await setup(page);
    const tr = messages(lang).checkout;
    for (const key of ["tripFlightAdd", "tripFlightOptional", "tripFlightOptionalHint", "stripeProductName"]) {
      expect(tr[key], `${lang}.${key}`).toBeTruthy();
    }
    for (const width of WIDTHS) {
      fx.quoteCalls = 0;
      fx.repriceBodies = [];
      await open(page, lang, width, `${TRIP_STREET}&class=economy`);
      await expect(total(page)).toBeVisible({ timeout: 30_000 });
      fx.quoteCalls = 0; // the opening quote is not the edit's
      // section 2 shows no flight for a street pickup that carries none
      await expect(page.locator("[data-co-s2-flight]")).toHaveCount(0);

      await page.locator("[data-co-edit]").click();
      const opener = page.locator("[data-co-flight-add] button");
      await expect(opener).toBeVisible();
      await expect(opener).toContainText(tr.tripFlightAdd!);
      // the plane icon sits on the inline-start side of the label
      const iconBox = (await opener.locator("[data-vt-icon]").boundingBox())!;
      const textBox = (await opener.boundingBox())!;
      if (lang === "ar") expect(iconBox.x).toBeGreaterThan(textBox.x + textBox.width / 2);
      else expect(iconBox.x).toBeLessThan(textBox.x + textBox.width / 2);
      await noSidewaysScroll(page);

      await opener.click();
      const field = page.locator("[data-co-editor] [data-co-flight-optional]");
      await expect(field).toContainText(tr.tripFlightOptional!);
      await expect(field).toContainText(tr.tripFlightOptionalHint!);
      await expect(field.locator("input")).toBeVisible();
      await noSidewaysScroll(page);

      await field.locator("input").fill("LX318");
      await page.locator("[data-co-update]").click();
      await expect.poll(() => fx.repriceBodies.length).toBe(1);
      expect(fx.repriceBodies[0]).toMatchObject({ legs: [{ leg_seq: 1, flight_no: "LX318" }] });
      expect(fx.quoteCalls).toBe(0);
      await expect(page.locator("[data-co-editor]")).toHaveCount(0);
      await expect(total(page)).toBeVisible();
      // section 2 now carries the flight, marked optional
      await expect(page.locator("[data-co-s2-flight]")).toBeVisible();
      await expect(page.locator("[data-co-flight-hint]")).toContainText(tr.tripFlightOptionalHint!);
      await expect(pay(page)).toHaveCount(1);
      await noSidewaysScroll(page);
    }
  });
}

// ── 26.4.2 (owner, 2026-09-30): the phone class cards ───────────────────────────────────
// At <=680 px one compact card per class: the class photo (or the car icon) at the inline start, name over
// seats and bags, then the price row. Selected = charcoal 2px border + check. Too small = greyed, no price,
// "Seats up to N". 768 keeps the tile cards. Amounts are arithmetic fixtures.
const SHOTS_D = "/private/tmp/claude-501/-Users-koss-Developer-VamosTaxi-eu/3c6c6056-f11d-41a2-8b13-17a758844e5c/scratchpad";
// Quick 260930-cps, owner-signed layout E: the same row card at every width. Square photo on the inline-start side,
// name, price, "N seats / N bags" in words, the check in the top inline-end corner.
for (const [lang, width] of [["en", 390], ["ar", 390], ["en", 768], ["ar", 768], ["en", 1024], ["en", 1440]] as const) {
  test(`${lang} ${width}: class cards are one row per class, photo at the side @checkout`, async ({ page }) => {
    await setup(page);
    const seats5 = TRIP.replace("pax=2", "pax=5");
    await open(page, lang, width, seats5);
    const phone = true;
    const economy = card(page, "economy");
    const van = card(page, "van-luxury");
    // Too small: Economy and Business take 3, the party is 5.
    await expect(economy).toHaveAttribute("data-eligible", "false");
    await expect(economy.locator(".vt-veh")).toBeDisabled();
    await expect(economy.locator(".vt-veh__note")).toContainText("3");
    await expect(economy.locator(".vt-veh__shot")).toBeVisible();
    if (phone) await expect(economy.locator(".vt-veh__amount")).toBeHidden();
    // Photo from the server on Economy, the car icon (no img, no text) on Van luxury; the photo box is the same size.
    await expect(economy.locator(".vt-veh__shot img")).toHaveAttribute("alt", "Economy");
    await expect(economy.locator(".vt-veh__shot img")).toHaveAttribute("loading", "lazy");
    await expect(economy.locator(".vt-veh__shot img")).toHaveAttribute("decoding", "async");
    await expect(economy.locator(".vt-veh__shot img")).toHaveAttribute("width", "640");
    await expect(van.locator(".vt-veh__shot img")).toHaveCount(0);
    await expect(van.locator(".vt-veh__shot > *").first()).toBeVisible();
    expect((await van.locator(".vt-veh__shot").innerText()).trim()).toBe("");
    const eb = (await economy.locator(".vt-veh__shot").boundingBox())!;
    const vb0 = (await van.locator(".vt-veh__shot").boundingBox())!;
    expect(Math.abs(vb0.width - eb.width)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(vb0.height - eb.height)).toBeLessThanOrEqual(0.5);
    // square photo, one card per row, seats and bags in words
    expect(Math.abs(eb.width - eb.height)).toBeLessThanOrEqual(0.5);
    expect(eb.width).toBe(width <= 680 ? 104 : 120);
    const eBox = (await economy.boundingBox())!, vBox = (await van.boundingBox())!;
    expect(vBox.y).toBeGreaterThanOrEqual(eBox.y + eBox.height);
    expect(Math.abs(vBox.x - eBox.x)).toBeLessThanOrEqual(0.5);
    if (lang === "en") await expect(economy.locator(".vt-veh__caps")).toHaveText(/3 seats\s*3 bags/);
    else await expect(economy.locator(".vt-veh__caps")).not.toContainText("seats");
    if (phone) {
      // on the inline-start side of the card, the card fits the viewport, 44 px target at least
      const cardBox = (await economy.boundingBox())!;
      const rtl = lang === "ar";
      if (rtl) expect(Math.abs(cardBox.x + cardBox.width - (eb.x + eb.width))).toBeLessThanOrEqual(16);
      else expect(eb.x - cardBox.x).toBeLessThanOrEqual(16);
      expect(cardBox.x).toBeGreaterThanOrEqual(0);
      expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(width);
      expect(cardBox.height).toBeGreaterThanOrEqual(72);
    }
    // Eligible: price prominent, 54 px tap target at least, selectable.
    await expect(van).toHaveAttribute("data-eligible", "true");
    await expect(van.locator(".vt-veh__amount")).toBeVisible();
    const box = (await van.locator(".vt-veh").boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(54);
    await van.locator(".vt-veh").click();
    await expect(van).toHaveAttribute("data-selected", "true");
    await expect(van.locator(".vt-veh")).toHaveCSS("border-top-width", "2px");
    const charcoal = await page.evaluate(() => {
      const probe = document.createElement("i");
      probe.style.color = "var(--vt-charcoal-900)";
      document.body.appendChild(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    });
    // the design-system card transitions its border colour, so wait for it to settle
    await expect(van.locator(".vt-veh")).toHaveCSS("border-top-color", charcoal);
    await expect(van.locator(".vt-co__class-check")).toBeVisible();
    if (phone) {
      // the check sits in the card's top inline-end corner, clear of the photo and of the name
      const chk = (await van.locator(".vt-co__class-check").boundingBox())!;
      const vc = (await van.boundingBox())!;
      const vs = (await van.locator(".vt-veh__shot").boundingBox())!;
      const nm = (await van.locator(".vt-veh__name").boundingBox())!;
      const rtl = lang === "ar";
      if (rtl) { expect(chk.x - vc.x).toBeLessThanOrEqual(14); expect(chk.x + chk.width).toBeLessThanOrEqual(vs.x); expect(nm.x).toBeGreaterThanOrEqual(chk.x + chk.width - 1); }
      else { expect(vc.x + vc.width - (chk.x + chk.width)).toBeLessThanOrEqual(14); expect(chk.x).toBeGreaterThanOrEqual(vs.x + vs.width); expect(nm.x + nm.width).toBeLessThanOrEqual(chk.x + 1); }
      expect(chk.y - vc.y).toBeLessThanOrEqual(14);
    }
    await noSidewaysScroll(page);
    await page.locator("[data-co-classes]").scrollIntoViewIfNeeded();
    
  });
}

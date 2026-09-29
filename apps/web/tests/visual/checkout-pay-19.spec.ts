// apps/web/tests/visual/checkout-pay-19.spec.ts
//
// Plan 26.3-19. The one-page checkout, second half: Section 2 (contact, flight, extras,
// company, note), Section 3 (voucher, legal, one PAY), the rail and the pay bar, the
// hosted redirect, Back from Stripe and the expired state. Runs once under component-1440
// with its own `next dev`; the viewport is set per assertion. Every server answer is a
// route fixture in the real response shape; Stripe is the plan 05 fake (its own origin,
// intercepted by page.route, no bypass in the app). Amounts in this file are arithmetic
// fixtures (TEST FIXTURES, never a book price). Tagged @checkout.

import { test, expect, type Locator, type Page, type Route } from "../support/test";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";
import { openInLocale } from "../support/locale";
import { installFakeStripe, type FakeStripeHandle } from "../support/fake-stripe";

const RUN_PROJECT = "component-1440";
const GS = "11111111-1111-4111-8111-111111111111";
const QID = "22222222-2222-4222-8222-222222222222";
const BOOKING = "00000000-0000-4000-8000-000000000263";
const TRIP =
  `from=Zurich%20Airport&fid=dXJuOm1ieHBvaTox&to=Bahnhofstrasse%201&tid=dXJuOm1ieHBvaTox2` +
  `&gs=${GS}&when=2026-12-15T08:15&pax=2&bags=3&flight=LX318`;

let devServer: ChildProcess | null = null;
let baseURL = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({}, testInfo) => {
  if (testInfo.project.name !== RUN_PROJECT) return;
  testInfo.setTimeout(180_000);
  const port = 4290 + testInfo.workerIndex;
  baseURL = `http://127.0.0.1:${port}`;
  devServer = spawn(NEXT_BIN, ["dev", "-p", String(port)], {
    cwd: WEB_ROOT,
    stdio: "ignore",
    detached: true,
    env: { ...process.env, NODE_ENV: "development", TEST_DIST_DIR: ".next-checkout-pay-19-visual" },
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

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== RUN_PROJECT, "checkout page specs run once under component-1440.");
});

// ── Fixtures ────────────────────────────────────────────────────────────────────────────
const BASE: Record<string, number> = { economy: 10000, business: 15000, "van-luxury": 20000 };
const CAPS = [
  { slug: "economy", name: "Economy", pax: 3, bags: 3 },
  { slug: "business", name: "Business", pax: 3, bags: 3 },
  { slug: "van-luxury", name: "Van luxury", pax: 8, bags: 8 },
];
// TEST FIXTURES: child-seat is the live row's code (1000), pet-crate is invented (1500).
const EXTRAS = [
  {
    code: "child-seat",
    amount_rappen: 1000,
    names: { en: "Child seat", de: "Kindersitz", fr: "Siège enfant", ar: "مقعد أطفال" },
  },
  {
    code: "pet-crate",
    amount_rappen: 1500,
    names: { en: "Pet crate", de: "Tierbox", fr: "Caisse pour animaux", ar: "صندوق حيوانات أليفة" },
  },
];
const EXTRA_AMOUNT: Record<string, number> = { "child-seat": 1000, "pet-crate": 1500 };
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
        photo_url: null,
      };
    }),
  };
}

/** What POST /api/checkout/price returns for a body: VAT included, lines add up. */
function priceAnswer(body: { vehicle_class: string; extra_codes: string[]; coupon: string | null }) {
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
      amount_rappen: EXTRA_AMOUNT[code],
    });
    net += EXTRA_AMOUNT[code]!;
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

const chf = (rappen: number) => `CHF ${(rappen / 100).toFixed(2)}`;

type Fixture = {
  quoteBodies: Record<string, unknown>[];
  priceBodies: { lock: string; vehicle_class: string; extra_codes: string[]; coupon: string | null }[];
  charged: number[];
  extrasCalls: number;
  resume: Record<string, unknown> | null;
  me: Record<string, unknown>;
  quoteAnswer: ((b: Record<string, unknown>) => unknown) | null;
  stripe: FakeStripeHandle | null;
};

async function setup(page: Page, opts: { resume?: Record<string, unknown> | null; me?: Record<string, unknown> } = {}) {
  const fx: Fixture = {
    quoteBodies: [],
    priceBodies: [],
    charged: [],
    extrasCalls: 0,
    resume: opts.resume ?? null,
    me: opts.me ?? { signed_in: false },
    quoteAnswer: null,
    stripe: null,
  };
  await page.route(
    (url) => url.hostname.includes("cloudflare") || url.hostname.includes("turnstile"),
    (route) => route.abort(),
  );
  await page.route("**/api/flight/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: false }) }),
  );
  await page.route("**/api/quote", async (route: Route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    fx.quoteBodies.push(body);
    const json = fx.quoteAnswer?.(body) ?? quoteBody(Number(body.pax), Number(body.bags));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(json) });
  });
  await page.route("**/api/checkout/extras", (route) => {
    fx.extrasCalls += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, extras: EXTRAS, vat_rate_bps: VAT_BPS }),
    });
  });
  await page.route("**/api/checkout/price", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as Fixture["priceBodies"][number];
    fx.priceBodies.push(body);
    const answer = priceAnswer(body);
    fx.charged.push(answer.charged_rappen);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(answer) });
  });
  await page.route("**/api/checkout/me", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fx.me) }),
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

async function open(page: Page, query = TRIP, width = 1440) {
  await page.setViewportSize({ width, height: 900 });
  const res = await page.goto(`${baseURL}/checkout?${query}`);
  expect(res?.ok()).toBeTruthy();
  await expect(page.locator("[data-co-classes]")).toBeVisible({ timeout: 30_000 });
}

const pay = (page: Page) => page.locator("[data-co-pay]");
const card = (page: Page, slug: string) => page.locator(`[data-co-class="${slug}"]`);
const total = (page: Page) => page.locator("[data-co-total]");

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function height(loc: Locator) {
  const box = await loc.first().boundingBox();
  if (!box) throw new Error("no box");
  return box.height;
}

async function fillContact(page: Page) {
  await page.locator('[data-co-contact] input[autocomplete="given-name"]').fill("Amira");
  await page.locator('[data-co-contact] input[autocomplete="family-name"]').fill("Keller");
  await page.locator('[data-co-contact] input[autocomplete="email"]').fill("amira@example.com");
  await page.locator("[data-co-contact] [data-vt-phone] input").fill("41796267082");
}

const messages = (lang: string) =>
  JSON.parse(readFileSync(join(WEB_ROOT, "i18n", "messages", `${lang}.json`), "utf8")) as {
    checkout: Record<string, string>;
  };

// ── 1. Layout: one PAY, rail or bar, 54px ───────────────────────────────────────────────
test("Sections 2 and 3, one PAY (rail >=1081, bar <=1080), 54px fields, no sideways scroll @checkout", async ({ page }) => {
  await setup(page);
  for (const width of [1440, 1024, 768, 390] as const) {
    await open(page, `${TRIP}&class=economy`, width);
    await expect(page.locator('[data-co-section="2"]')).toBeVisible();
    await expect(page.locator('[data-co-section="3"]')).toBeVisible();
    await expect(pay(page)).toHaveCount(1);
    await expect(pay(page)).toBeVisible();
    if (width >= 1081) {
      await expect(page.locator("[data-co-rail]")).toBeVisible();
      await expect(page.locator("[data-co-bar]")).toHaveCount(0);
      await expect(page.locator("[data-co-summary]")).toHaveCount(1);
    } else {
      await expect(page.locator("[data-co-bar]")).toBeVisible();
      await expect(page.locator("[data-co-rail]")).toHaveCount(0);
      await expect(page.locator('[data-co-section="3"] [data-co-summary]')).toBeVisible();
    }
    expect(await height(pay(page))).toBeCloseTo(54, 0);
    expect(await height(page.locator('[data-co-contact] input[autocomplete="given-name"]').locator("xpath=.."))).toBeGreaterThanOrEqual(54);
    expect(await height(page.locator("[data-co-contact] [data-vt-phone]"))).toBeGreaterThanOrEqual(54);
    // Flight is prefilled from the URL and editable; the two legal lines are on the page.
    await expect(page.locator("[data-co-s2-flight] input")).toHaveValue(/LX ?318/);
    await expect(page.locator("[data-co-legal]")).toContainText("By continuing you accept the terms and the cancellation policy.");
    await expect(page.locator("[data-co-legal]")).toContainText("Fixed price, all taxes and tolls included.");
    await expect(page.locator("[data-co-method]")).toContainText("secure page");
    // no card fields, no wallet buttons, no pay-link option
    await expect(page.locator("iframe, [data-checkout-express], [data-checkout-paylink]")).toHaveCount(0);
    await noSidewaysScroll(page);
  }
});

// ── 2. Extras: the owner's names, server price, exact delta ─────────────────────────────
test("extras carry the owner's name in en, de, fr, ar; ticking changes the total by exactly the price route's amount @checkout", async ({ page }) => {
  const fx = await setup(page);
  await open(page, `${TRIP}&class=economy`);
  await expect(total(page)).toHaveText(chf(priceAnswer({ vehicle_class: "economy", extra_codes: [], coupon: null }).charged_rappen));

  // All unticked on load, labelled by name, never by code.
  const rows = page.locator("[data-co-extra]");
  await expect(rows).toHaveCount(2);
  await expect(rows.locator("input:checked")).toHaveCount(0);
  await expect(page.locator('[data-co-extra="child-seat"]')).toContainText("Child seat");
  await expect(page.locator('[data-co-extra="pet-crate"]')).toContainText("Pet crate");
  await expect(page.locator("[data-co-extras]")).not.toContainText("child-seat");
  await expect(page.locator("[data-co-extras]")).not.toContainText("pet-crate");
  await expect(page.locator('[data-co-extra="child-seat"]')).toContainText(chf(1000));

  const before = fx.charged[fx.charged.length - 1]!;
  await page.locator('[data-co-extra="child-seat"] label').click();
  await expect(total(page)).toHaveText(chf(priceAnswer({ vehicle_class: "economy", extra_codes: ["child-seat"], coupon: null }).charged_rappen));
  const afterOne = fx.charged[fx.charged.length - 1]!;
  expect(afterOne - before).toBe(1081); // 1000 + 8.1 % VAT, from the route, not the browser
  await expect(total(page)).toHaveText(chf(afterOne));
  expect(fx.priceBodies[fx.priceBodies.length - 1]!.extra_codes).toEqual(["child-seat"]);

  await page.locator('[data-co-extra="pet-crate"] label').click();
  const afterTwo = fx.charged[fx.charged.length - 1]!;
  expect(afterTwo - afterOne).toBe(1622); // 1500 + 8.1 % (1621.5 half up) from the route
  await expect(total(page)).toHaveText(chf(afterTwo));
  await expect(page.locator("[data-co-price]")).toContainText("Pet crate");

  // No price body ever carries an amount.
  expect(JSON.stringify(fx.priceBodies)).not.toMatch(/rappen|amount|total/);

  // Untick: back to the base, by the route's amount.
  await page.locator('[data-co-extra="child-seat"] label').click();
  await page.locator('[data-co-extra="pet-crate"] label').click();
  await expect(total(page)).toHaveText(chf(before));

  for (const lang of ["de", "fr", "ar"] as const) {
    await openInLocale(page, baseURL, `/checkout?${TRIP}&class=economy`, lang);
    await expect(page.locator("[data-co-extras]")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-co-extra="child-seat"]')).toContainText(EXTRAS[0]!.names[lang]);
    await expect(page.locator('[data-co-extra="pet-crate"]')).toContainText(EXTRAS[1]!.names[lang]);
    await expect(page.locator("[data-co-extras]")).not.toContainText("child-seat");
  }
});

// ── 3. PAY: validation order, hosted redirect, Back, supersedes ─────────────────────────
test("PAY names the first gap in DOM order, posts no amounts, redirects to Stripe; Back reuses the booking, a change supersedes it @checkout", async ({ page }) => {
  const fx = await setup(page);
  const stripe = fx.stripe!;
  await open(page, `${TRIP}`);

  // 1. class
  await pay(page).click();
  await expect(page.locator('[data-co-section="1"] [data-co-section-error]')).toContainText("Choose a class");
  await expect(page.locator("[data-co-total-note]")).toContainText("Choose a class");
  await expect(page.locator("[data-co-live]")).toContainText("Choose a class");
  await card(page, "business").locator("button").first().click();
  await expect(total(page)).toBeVisible();

  // 2. first name, last name, e-mail, mobile, in order
  const focusedAutocomplete = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute("autocomplete"));
  await pay(page).click();
  await expect.poll(focusedAutocomplete).toBe("given-name");
  await expect(page.locator("[data-co-contact]")).toContainText("Enter a first name");
  await expect(page.locator("[data-co-live]")).toContainText("Enter a first name");
  await page.locator('[data-co-contact] input[autocomplete="given-name"]').fill("Amira");
  await pay(page).click();
  await expect.poll(focusedAutocomplete).toBe("family-name");
  await page.locator('[data-co-contact] input[autocomplete="family-name"]').fill("Keller");
  await pay(page).click();
  await expect.poll(focusedAutocomplete).toBe("email");
  await page.locator('[data-co-contact] input[autocomplete="email"]').fill("amira@");
  await pay(page).click();
  await expect(page.locator("[data-co-contact]")).toContainText("Check the email address");
  await page.locator('[data-co-contact] input[autocomplete="email"]').fill("amira@example.com");
  await pay(page).click();
  await expect.poll(focusedAutocomplete).toBe("tel");
  await page.locator("[data-co-contact] [data-vt-phone] input").fill("41796267082");

  // 3. flight (airport pickup): cleared -> named
  await page.locator("[data-co-s2-flight] input").fill("");
  await pay(page).click();
  await expect(page.locator("[data-co-s2-flight]")).toContainText("Enter the flight number");
  await page.locator("[data-co-s2-flight] input").fill("LX 318");

  // 4. company name only when the disclosure is open and anything is filled
  await page.locator("#co-company-button").click();
  await page.locator('#co-company-panel input[autocomplete="off"]').fill("CHE-123.456.789");
  await pay(page).click();
  await expect(page.locator("[data-co-company-name]")).toContainText("Enter the company name");
  await page.locator('#co-company-panel input[autocomplete="organization"]').fill("Vamos AG");

  // Extras and a note ride along; then a valid PAY.
  await page.locator('[data-co-extra="child-seat"] label').click();
  await page.locator("#co-note-button").click();
  await page.locator("#co-note-panel textarea").fill("Gate 3");
  await expect(total(page)).toBeVisible();
  await pay(page).click();
  await page.waitForURL(/checkout\.stripe\.com\/c\/pay\//);
  const stripeUrl = page.url();

  expect(stripe.intentBodies).toHaveLength(1);
  const body = stripe.intentBodies[0]!;
  expect(JSON.stringify(body)).not.toMatch(/rappen|"amount|"total|"lines/);
  expect(body).toMatchObject({
    quote_id: QID,
    lock: "v1.fixture.lock",
    vehicle_class: "business",
    extra_codes: ["child-seat"],
    company_name: "Vamos AG",
    company_vat: "CHE-123.456.789",
    driver_note: "Gate 3",
    flight_no: "LX318",
    locale: "en",
    contact: { name: "Amira Keller", email: "amira@example.com", phone: "+41796267082" },
  });
  expect(body).not.toHaveProperty("supersedes");
  expect(typeof body.idempotency_key).toBe("string");

  // Back from Stripe: the fake cancel URL carries only resume=<quote>.
  fx.resume = {
    state: "open",
    url: stripeUrl,
    booking_id: BOOKING,
    quote_id: QID,
    trip_query: TRIP,
    contact: { name: "Amira Keller", email: "amira@example.com", phone: "+41796267082" },
    company: { name: "Vamos AG", address: "", vat: "CHE-123.456.789" },
    note: "Gate 3",
    class: "business",
    extra_codes: ["child-seat"],
    coupon: null,
    charged_rappen: 0,
  };
  await page.getByTestId("fake-stripe-back").click();
  await expect(page.locator("[data-co-back-notice]")).toContainText(
    "Payment not finished. Your details are still here. Pay when you are ready.",
    { timeout: 30_000 },
  );
  await expect(page.locator('[data-co-contact] input[autocomplete="given-name"]')).toHaveValue("Amira");
  await expect(page.locator('[data-co-contact] input[autocomplete="email"]')).toHaveValue("amira@example.com");
  await expect(page.locator("#co-company-panel")).toBeVisible();
  await expect(page.locator('#co-company-panel input[autocomplete="organization"]')).toHaveValue("Vamos AG");
  await expect(page.locator("#co-note-panel textarea")).toHaveValue("Gate 3");
  await expect(card(page, "business")).toHaveAttribute("data-selected", "true");
  await expect(page.locator('[data-co-extra="child-seat"] input')).toBeChecked();
  await expect(total(page)).toBeVisible();

  // Nothing changed: PAY goes straight to the same Stripe page, no second intent.
  await pay(page).click();
  await page.waitForURL(stripeUrl);
  expect(stripe.intentBodies).toHaveLength(1);

  // Back again, change the class: a new intent that supersedes the first booking.
  await page.getByTestId("fake-stripe-back").click();
  await expect(page.locator("[data-co-back-notice]")).toBeVisible({ timeout: 30_000 });
  await card(page, "economy").locator("button").first().click();
  await expect(total(page)).toBeVisible();
  await pay(page).click();
  await page.waitForURL(/checkout\.stripe\.com\/c\/pay\/cs_test_fake_2/);
  expect(stripe.intentBodies).toHaveLength(2);
  expect(stripe.intentBodies[1]).toMatchObject({ vehicle_class: "economy", supersedes: BOOKING });
});

// ── 4. Expired booking ──────────────────────────────────────────────────────────────────
test("an expired booking shows the notice, keeps the contact, SEE CURRENT PRICES re-quotes, PAY supersedes @checkout", async ({ page }) => {
  const fx = await setup(page, {
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
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseURL}/checkout?resume=${QID}&pay=unpaid`);
  const notice = page.locator("[data-co-top-notice]");
  await expect(notice).toContainText("This booking expired — see current prices", { timeout: 30_000 });
  await expect(page.locator("[data-co-classes]")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-co-contact] input[autocomplete="given-name"]')).toHaveValue("Amira");
  const quotes = fx.quoteBodies.length;
  await page.locator("[data-co-see-prices]").click();
  await expect(notice).toHaveCount(0);
  await expect.poll(() => fx.quoteBodies.length).toBeGreaterThan(quotes);
  await expect(page.locator('[data-co-contact] input[autocomplete="email"]')).toHaveValue("amira@example.com");

  await expect(total(page)).toBeVisible();
  await pay(page).click();
  await page.waitForURL(/checkout\.stripe\.com\/c\/pay\//);
  expect(fx.stripe!.intentBodies[0]).toMatchObject({ supersedes: BOOKING, vehicle_class: "economy" });
});

// ── 5. Sign-in: returnTo carries class and extras; the rest stays in this tab ───────────
test("Have an account? Sign in carries class and extras in returnTo; voucher, company and note return from this tab only @checkout", async ({ page }) => {
  const fx = await setup(page);
  await open(page, `${TRIP}&class=business`);
  await page.locator('[data-co-extra="child-seat"] label').click();
  await page.locator("[data-co-voucher-open]").click();
  await page.locator("[data-co-voucher] input").fill("SPRING10");
  await page.locator("[data-co-voucher-apply]").click();
  await expect(page.locator("[data-co-voucher-applied]")).toContainText("Voucher SPRING10 applied");
  await page.locator("#co-company-button").click();
  await page.locator('#co-company-panel input[autocomplete="organization"]').fill("Vamos AG");
  await page.locator("#co-note-button").click();
  await page.locator("#co-note-panel textarea").fill("Gate 3");
  await fillContact(page);

  const link = page.locator("[data-co-sign-in]");
  const href = (await link.getAttribute("href"))!;
  expect(href.startsWith("/sign-in?returnTo=")).toBe(true);
  const returnTo = decodeURIComponent(href.slice("/sign-in?returnTo=".length));
  expect(returnTo.startsWith("/checkout?")).toBe(true);
  const params = new URLSearchParams(returnTo.split("?")[1]);
  expect(params.get("class")).toBe("business");
  expect(params.get("extras")).toBe("child-seat");
  expect(params.get("when")).toBe("2026-12-15T08:15");
  expect(returnTo).not.toMatch(/Amira|amira|41796|Keller/);

  // Click without leaving; read what was parked for this tab.
  await link.evaluate((el) => el.addEventListener("click", (e) => e.preventDefault(), { once: true }));
  await link.click();
  const stash = await page.evaluate(() => window.sessionStorage.getItem("vamosCheckoutReturn"));
  expect(JSON.parse(stash!)).toMatchObject({ voucher: "SPRING10", company: { name: "Vamos AG" }, note: "Gate 3" });
  expect(stash).not.toMatch(/amira|Keller|41796/);
  expect(await page.evaluate(() => JSON.stringify(window.localStorage))).not.toMatch(/amira|Keller|41796/);

  // Back from sign-in: the URL restores class and extras, the tab restores the rest, the
  // stash is read once, and the link now says who is signed in.
  fx.me = { signed_in: true, email: "amira@example.com", first_name: "Amira", last_name: "Keller", phone: "+41796267082" };
  await page.goto(`${baseURL}${returnTo}`);
  await expect(page.locator("[data-co-classes]")).toBeVisible({ timeout: 30_000 });
  await expect(card(page, "business")).toHaveAttribute("data-selected", "true");
  await expect(page.locator('[data-co-extra="child-seat"] input')).toBeChecked();
  await expect(page.locator("[data-co-voucher-applied]")).toContainText("Voucher SPRING10 applied");
  await expect(page.locator('#co-company-panel input[autocomplete="organization"]')).toHaveValue("Vamos AG");
  await expect(page.locator("#co-note-panel textarea")).toHaveValue("Gate 3");
  await expect(page.locator("[data-co-signed-in]")).toContainText("Signed in as amira@example.com");
  await expect(page.locator("[data-co-sign-in]")).toHaveCount(0);
  await expect(page.locator('[data-co-contact] input[autocomplete="given-name"]')).toHaveValue("Amira");
  expect(await page.evaluate(() => window.sessionStorage.getItem("vamosCheckoutReturn"))).toBeNull();
  expect(fx.priceBodies[fx.priceBodies.length - 1]).toMatchObject({ coupon: "SPRING10", extra_codes: ["child-seat"] });
});

// ── 6. A challenge shows where the customer is ──────────────────────────────────────────
test("a Turnstile challenge on a re-quote shows above PAY, not only in Section 1 @checkout", async ({ page }) => {
  const fx = await setup(page);
  fx.quoteAnswer = (b) => {
    const leg = (b.legs as { flight_no: string | null }[])[0];
    if (leg?.flight_no === "LX999" && !b.turnstile_token) {
      return { ok: false, error: "turnstile_required", i18n_key: "quote.error.turnstile_required" };
    }
    return quoteBody(Number(b.pax), Number(b.bags));
  };
  await open(page, `${TRIP}&class=economy`);
  await expect(total(page)).toBeVisible();
  await page.locator("[data-co-s2-flight] input").fill("LX 999");
  await page.locator('[data-co-contact] input[autocomplete="given-name"]').focus();
  await expect(page.locator("[data-co-page-challenge]")).toBeVisible({ timeout: 15_000 });
  // It is inside the pay area, and Section 1 kept its cards and selection.
  await expect(page.locator("[data-co-rail] [data-co-page-challenge]")).toHaveCount(1);
  await expect(card(page, "economy")).toHaveAttribute("data-selected", "true");
});

// ── 7. Real language: de, fr, ar at 1440 and 390 ────────────────────────────────────────
for (const lang of ["de", "fr", "ar"] as const) {
  test(`the full page in ${lang} at 1440 and 390: lang, dir, no English fallback, no sideways scroll, 54px @checkout`, async ({ page }) => {
    await setup(page);
    const en = messages("en").checkout;
    const tr = messages(lang).checkout;
    const keys = [
      "who-is-travelling",
      "payment",
      "signInLink",
      "discCompany",
      "discNote",
      "methodNote",
      "haveVoucher",
      "extras",
      "extrasHint",
      "contactFirstName",
      "contactMobile",
      "by-continuing-you-accept-the-terms-and-the-cance",
    ];
    for (const width of [1440, 390] as const) {
      await page.setViewportSize({ width, height: 900 });
      await openInLocale(page, baseURL, `/checkout?${TRIP}&class=economy`, lang);
      await expect(page.locator("[data-co-classes]")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator("[data-co-extras]")).toBeVisible();
      await expect(total(page)).toBeVisible();

      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");

      const text = await page.evaluate(() => document.querySelector("main, [data-checkout-page]")?.textContent ?? "");
      for (const key of keys) {
        expect(tr[key], `${lang}.${key}`).toBeTruthy();
        expect(text).toContain(tr[key]!);
        if (tr[key] !== en[key]) expect(text).not.toContain(en[key]!);
      }
      // the class the page sells and the PAY word are the language's own
      await expect(pay(page)).toContainText(tr.pay!);
      await expect(page.locator('[data-co-section="2"] h2')).toHaveText(tr["who-is-travelling"]!);
      await expect(page.locator('[data-co-section="3"] h2')).toHaveText(tr.payment!);

      expect(await height(pay(page))).toBeCloseTo(54, 0);
      expect(await height(page.locator("[data-co-contact] [data-vt-phone]"))).toBeGreaterThanOrEqual(54);
      expect(await height(page.locator('[data-co-contact] input[autocomplete="given-name"]').locator("xpath=.."))).toBeGreaterThanOrEqual(54);
      await expect(pay(page)).toHaveCount(1);
      await noSidewaysScroll(page);
      if (lang === "ar") {
        // the sign-in link sits at the inline end: the left side in RTL at 1440
        if (width === 1440) {
          const head = await page.locator('[data-co-section="2"] header').boundingBox();
          const aside = await page.locator("[data-co-sign-in]").boundingBox();
          expect(aside!.x + aside!.width / 2).toBeLessThan(head!.x + head!.width / 2);
        }
      }
      await page.screenshot({ path: join(process.env.TMPDIR ?? "/tmp", `26.3-19-${lang}-${width}.png`), fullPage: true });
    }
  });
}

// apps/web/tests/visual/pay-link-page.spec.ts
//
// Plan 26.3-18 (D-46). The pay-link page /checkout/pay/<token>: trip, price and one PAY
// that leaves for Stripe's hosted page. No card form anywhere. Runs once under
// component-1440 (own `next dev`, the width is set per assertion). Every
// /api/checkout/pay-link/open answer is a route fixture in the real response shape and
// Stripe is the plan 05 fake, so no key or network is needed. The amount is a TEST
// FIXTURE, not a price-book number. Tagged @component.

import { test, expect, type Page, type Route } from "../support/test";
import { testPort } from "../support/port";
import { spawn, type ChildProcess } from "node:child_process";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";
import { openInLocale, type Lang } from "../support/locale";
import { FAKE_STRIPE_HOST, installFakeStripe } from "../support/fake-stripe";

const RUN_PROJECT = "component-1440";
const TOKEN = "dG9rZW4tYWJjZGVmZ2g";
const PAY_PATH = `/checkout/pay/${TOKEN}`;
const REFERENCE = "VT-26-0018";
const WIDTHS = [1440, 1024, 768, 390] as const;
// TEST FIXTURE amount (never a book price). The page only has to show it under the CHF mark.
const FIXTURE_RAPPEN = 1234;

let devServer: ChildProcess | null = null;
let baseURL = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({}, testInfo) => {
  if (testInfo.project.name !== RUN_PROJECT) return;
  testInfo.setTimeout(180_000);
  const port = testPort(4280) + testInfo.workerIndex;
  baseURL = `http://127.0.0.1:${port}`;
  devServer = spawn(NEXT_BIN, ["dev", "-p", String(port)], {
    cwd: WEB_ROOT,
    stdio: "ignore",
    detached: true,
    env: { ...process.env, NODE_ENV: "development", TEST_DIST_DIR: ".next-pay-link-visual" },
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
  test.skip(testInfo.project.name !== RUN_PROJECT, "pay-link page specs run once under component-1440.");
  // Real Stripe and Cloudflare hosts stay offline; the fake Stripe origin is routed per test.
  await page.route(
    (url) => url.hostname.includes("cloudflare") || url.hostname.includes("turnstile"),
    (route) => route.abort(),
  );
});

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "cache-control": "private, no-store" },
    body: JSON.stringify(body),
  });
}

type OpenAnswer = { status?: number; body: Record<string, unknown> };

/** Route the open call. `answer(n)` gets the 1-based call number. Returns the request bodies seen. */
async function routeOpen(page: Page, answer: (n: number) => OpenAnswer): Promise<Record<string, unknown>[]> {
  const seen: Record<string, unknown>[] = [];
  await page.route("**/api/checkout/pay-link/open", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    seen.push(JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>);
    const a = answer(seen.length);
    return json(route, a.body, a.status ?? 200);
  });
  return seen;
}

/** A hosted-shape success answer whose url is the fake Stripe page (real Stripe origin). */
function hostedAnswer(page: Page, locale: string, n = 1): OpenAnswer {
  const origin = new URL(page.url() === "about:blank" ? baseURL : page.url()).origin;
  const prefix = locale === "en" ? "" : `/${locale}`;
  const sessionId = `cs_test_paylink${n}`;
  const success = `${origin}/api/checkout/return?locale=${locale}&session_id={CHECKOUT_SESSION_ID}`;
  const cancel = `${origin}${prefix}${PAY_PATH}`;
  return {
    body: {
      ok: true,
      hosted_page: true,
      url: `${FAKE_STRIPE_HOST}/pay/${sessionId}?success=${encodeURIComponent(success)}&cancel=${encodeURIComponent(cancel)}`,
      session_id: sessionId,
      reference: REFERENCE,
      pickup: "Zurich Airport",
      dropoff: "Bahnhofstrasse 1, Zurich",
      expires_at: new Date(Date.now() + 20 * 3600_000).toISOString(),
      lock_expires_at: new Date(Date.now() + 20 * 3600_000).toISOString(),
      currency: "CHF",
      amount_rappen: FIXTURE_RAPPEN,
      billing_email: "ada@example.test",
      quote_id: "22222222-2222-4222-8222-222222222222",
    },
  };
}

async function noSideways(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(0);
}

/** D-46: no card field, no Stripe iframe, no PaymentElement anywhere on the page. */
async function expectNoCardForm(page: Page) {
  await expect(page.locator('input[autocomplete^="cc-"]')).toHaveCount(0);
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.locator("input, select, textarea")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/child-seat|child_seat/);
}

const LANGS: Array<{ lang: Lang; dir: "ltr" | "rtl"; title: RegExp; note: RegExp; pay: RegExp }> = [
  { lang: "en", dir: "ltr", title: /Finish payment/, note: /Stripe's secure page/, pay: /^Pay CHF/ },
  { lang: "de", dir: "ltr", title: /Zahlung abschliessen/, note: /sicheren Seite von Stripe/, pay: /CHF.*bezahlen/ },
  { lang: "fr", dir: "ltr", title: /Terminer le paiement/, note: /page sécurisée de Stripe/, pay: /^Payer CHF/ },
  { lang: "ar", dir: "rtl", title: /أكمل الدفع/, note: /صفحة Stripe الآمنة/, pay: /ادفع/ },
];

for (const L of LANGS) {
  const widths = L.lang === "en" ? WIDTHS : ([1440, 390] as const);
  for (const width of widths) {
    test(`@component pay link page ${L.lang} at ${width}: trip, price, one PAY, no card form`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openInLocale(page, baseURL, "/", L.lang).catch(() => null);
      await routeOpen(page, () => hostedAnswer(page, L.lang));
      await openInLocale(page, baseURL, PAY_PATH, L.lang);

      await expect(page.locator("html")).toHaveAttribute("lang", L.lang);
      await expect(page.locator("html")).toHaveAttribute("dir", L.dir);
      await expect(page.locator("h1")).toHaveText(L.title);
      await expect(page.locator("[data-pay-link-method-note]")).toHaveText(L.note);
      await expect(page.locator(".vt-route")).toContainText("Zurich Airport");
      await expect(page.locator(".vt-price")).toContainText("CHF");
      const pay = page.getByRole("button", { name: L.pay });
      await expect(pay).toBeEnabled();
      await expect(page.locator("[data-checkout-pay-page] button")).toHaveCount(1);
      const box = await pay.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(54);
      await expectNoCardForm(page);
      await noSideways(page);
      // English chrome must not leak into another language.
      if (L.lang !== "en") await expect(page.locator("[data-checkout-pay-page]")).not.toContainText("Finish payment");
    });
  }
}

// --- 26.3-G9: the saved fare lines, extras included -------------------------------------
// TEST FIXTURE amounts (never book prices): live row code "child-seat" 1000, invented "pet-crate" 1500.
const FARE_RAPPEN = 5000;
const CHILD_SEAT_RAPPEN = 1000;
const PET_CRATE_RAPPEN = 1500;
const VAT_RAPPEN = 608;
const EXTRAS_TOTAL_RAPPEN = FARE_RAPPEN + CHILD_SEAT_RAPPEN + PET_CRATE_RAPPEN + VAT_RAPPEN;

const SAVED_LINES = [
  { kind: "fare", code: "distance_fare", names: null, vatRateBps: null, amountRappen: FARE_RAPPEN },
  {
    kind: "surcharge",
    code: "child-seat",
    names: { en: "Child seat", de: "Kindersitz", fr: "Siège enfant", ar: "مقعد أطفال" },
    vatRateBps: null,
    amountRappen: CHILD_SEAT_RAPPEN,
  },
  // Owner typed only en and de: fr and ar fall back to the English name.
  { kind: "surcharge", code: "pet-crate", names: { en: "Pet crate", de: "Tierbox" }, vatRateBps: null, amountRappen: PET_CRATE_RAPPEN },
  { kind: "vat", code: "vat", names: null, vatRateBps: 810, amountRappen: VAT_RAPPEN },
];

const EXTRA_NAMES: Record<Lang, { seat: string; crate: string }> = {
  en: { seat: "Child seat", crate: "Pet crate" },
  de: { seat: "Kindersitz", crate: "Tierbox" },
  fr: { seat: "Siège enfant", crate: "Pet crate" },
  ar: { seat: "مقعد أطفال", crate: "Pet crate" },
};

function figure(text: string | null): number {
  return Number((text ?? "").replace(/[^0-9.]/g, ""));
}

function withLines(page: Page, locale: string, lines: unknown[], amount: number): OpenAnswer {
  const a = hostedAnswer(page, locale);
  return { body: { ...a.body, amount_rappen: amount, lines } };
}

for (const lang of ["en", "de", "fr", "ar"] as const) {
  for (const width of WIDTHS) {
    test(`@component pay link ${lang} at ${width}: every extra is its own line, lines + fare + VAT = total = Stripe amount`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const answer = withLines(page, lang, SAVED_LINES, EXTRAS_TOTAL_RAPPEN);
      await routeOpen(page, () => answer);
      await openInLocale(page, baseURL, PAY_PATH, lang);
      await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
      const rows = page.locator("[data-pay-link-lines] .vt-price__row");
      await expect(rows).toHaveCount(4);
      const names = EXTRA_NAMES[lang];
      await expect(rows.nth(1)).toContainText(names.seat);
      await expect(rows.nth(2)).toContainText(names.crate);
      await expect(page.locator("body")).not.toContainText(/child-seat|pet-crate|child_seat|pet_crate/);
      const shown = await rows.locator(".vt-price__val").allTextContents();
      expect(shown.map(figure)).toEqual([50, 10, 15, 6.08]);
      const sum = shown.map(figure).reduce((a, b) => a + b, 0);
      const total = figure(await page.locator(".vt-price__totalval").textContent());
      expect(Math.round(sum * 100)).toBe(Math.round(total * 100));
      // The amount the open call hands to Stripe is the same figure.
      expect(Math.round(total * 100)).toBe((answer.body as { amount_rappen: number }).amount_rappen);
      await expect(page.locator("[data-checkout-pay-page] button")).toHaveCount(1);
      await expectNoCardForm(page);
      await noSideways(page);
    });
  }
}

test("@component a booking with no extras shows no extras block and no empty heading", async ({ page }) => {
  const plain = [SAVED_LINES[0], SAVED_LINES[3]];
  await routeOpen(page, () => withLines(page, "en", plain, FARE_RAPPEN + VAT_RAPPEN));
  await openInLocale(page, baseURL, PAY_PATH, "en");
  await expect(page.locator(".vt-price__totalval")).toBeVisible();
  await expect(page.locator("[data-pay-link-lines]")).toHaveCount(0);
  await expect(page.locator(".vt-price__row")).toHaveCount(0);
  await expect(page.locator("[data-pay-link-sheet] h2, [data-pay-link-sheet] h3")).toHaveCount(0);
});

test("@component an answer without lines (older Worker, unbalanced lines) keeps the plain total", async ({ page }) => {
  await routeOpen(page, () => hostedAnswer(page, "en"));
  await openInLocale(page, baseURL, PAY_PATH, "en");
  await expect(page.locator(".vt-price__totalval")).toBeVisible();
  await expect(page.locator("[data-pay-link-lines]")).toHaveCount(0);
});

test("@component PAY opens payment, posts open again, then navigates to the Stripe hosted url", async ({ page }) => {
  await installFakeStripe(page, { outcome: "cancel" });
  const seen = await routeOpen(page, (n) => hostedAnswer(page, "en", n));
  await openInLocale(page, baseURL, PAY_PATH, "en");
  const pay = page.getByRole("button", { name: /^Pay CHF/ });
  await expect(pay).toBeEnabled();
  expect(seen).toHaveLength(1);
  await pay.click();
  await page.waitForURL(`${FAKE_STRIPE_HOST}/pay/**`);
  expect(seen.length).toBeGreaterThanOrEqual(2);
  expect(seen[0]).toEqual({ token: TOKEN });
  await expect(page.locator("[data-fake-stripe]")).toBeVisible();
});

test("@component Back from Stripe returns to the same pay-link page, payable again", async ({ page }) => {
  await installFakeStripe(page, { outcome: "cancel" });
  await routeOpen(page, (n) => hostedAnswer(page, "de", n));
  await openInLocale(page, baseURL, PAY_PATH, "de");
  await page.getByRole("button", { name: /bezahlen/ }).click();
  await page.waitForURL(`${FAKE_STRIPE_HOST}/pay/**`);
  await page.getByTestId("fake-stripe-back").click();
  await page.waitForURL((u) => u.pathname === PAY_PATH || u.pathname === `/de${PAY_PATH}`);
  await expect(page.locator("h1")).toHaveText(/Zahlung abschliessen/);
  await expect(page.getByRole("button", { name: /bezahlen/ })).toBeEnabled();
  await expectNoCardForm(page);
});

test("@component paying on Stripe goes through /api/checkout/return to the confirmation", async ({ page }) => {
  await installFakeStripe(page, { outcome: "paid", returnRoute: true, reference: REFERENCE });
  await page.route("**/confirmation/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<body>confirmation</body>" }));
  await routeOpen(page, (n) => hostedAnswer(page, "en", n));
  await openInLocale(page, baseURL, PAY_PATH, "en");
  await page.getByRole("button", { name: /^Pay CHF/ }).click();
  await page.waitForURL(`${FAKE_STRIPE_HOST}/pay/**`);
  await page.getByTestId("fake-stripe-pay").click();
  await page.waitForURL(`**/confirmation/${REFERENCE}`);
});

test("@component the second open failing shows the start-failed alert and keeps PAY usable", async ({ page }) => {
  await routeOpen(page, (n) => (n === 1 ? hostedAnswer(page, "en") : { status: 500, body: { ok: false } }));
  await openInLocale(page, baseURL, PAY_PATH, "en");
  const pay = page.getByRole("button", { name: /^Pay CHF/ });
  await pay.click();
  await expect(page.locator("[data-pay-link-start-failed]")).toContainText("Payment did not start. Try Pay again.");
  await expect(pay).toBeEnabled();
  await noSideways(page);
});

test("@component already paid link shows the confirmed card, no PAY and no card form", async ({ page }) => {
  await routeOpen(page, () => ({ status: 409, body: { ok: false, code: "pay_link_paid", reference: REFERENCE } }));
  await openInLocale(page, baseURL, PAY_PATH, "en");
  await expect(page.locator("[data-pay-link-done='alreadyPaid']")).toContainText(REFERENCE);
  await expect(page.locator("[data-checkout-pay-page] button")).toHaveCount(0);
  await expectNoCardForm(page);
});

test("@component refunded duplicate shows the race card", async ({ page }) => {
  await routeOpen(page, () => ({ status: 409, body: { ok: false, code: "pay_link_refunded_duplicate", reference: REFERENCE } }));
  await openInLocale(page, baseURL, PAY_PATH, "en");
  await expect(page.locator("[data-pay-link-done='raceRefunded']")).toBeVisible();
  await expectNoCardForm(page);
});

test("@component expired link shows the expired alert in Arabic and PAY stays off", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await routeOpen(page, () => ({ status: 409, body: { ok: false, code: "pay_link_expired" } }));
  await openInLocale(page, baseURL, PAY_PATH, "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("[data-pay-link-expired]")).toContainText("انتهت صلاحية رابط الدفع هذا");
  await expect(page.getByRole("button", { name: /ادفع/ })).toBeDisabled();
  await expectNoCardForm(page);
  await noSideways(page);
});

test("@component no yellow glow or tinted yellow on the pay-link page", async ({ page }) => {
  await routeOpen(page, () => hostedAnswer(page, "en"));
  await openInLocale(page, baseURL, PAY_PATH, "en");
  await expect(page.getByRole("button", { name: /^Pay CHF/ })).toBeEnabled();
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    const tints = ["--vt-yellow-50", "--vt-yellow-100", "--vt-yellow-200", "--vt-yellow-300"];
    const root = getComputedStyle(document.documentElement);
    const tintValues = tints.map((n) => root.getPropertyValue(n).trim().toLowerCase()).filter(Boolean);
    for (const el of Array.from(document.querySelectorAll("[data-checkout-pay-page], [data-checkout-pay-page] *"))) {
      const cs = getComputedStyle(el);
      const shadow = cs.boxShadow;
      if (shadow !== "none" && /253,\s*194,\s*11/.test(shadow)) out.push(`glow ${el.tagName}`);
      if (tintValues.some((v) => v && cs.backgroundColor.toLowerCase() === v)) out.push(`tint ${el.tagName}`);
    }
    return out;
  });
  expect(bad).toEqual([]);
});

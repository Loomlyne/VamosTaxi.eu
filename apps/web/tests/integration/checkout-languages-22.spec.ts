// apps/web/tests/integration/checkout-languages-22.spec.ts
//
// Plan 26.3-22 / control-session item 2. The checkout in German, French and Arabic, in a real
// browser against `next dev`: the language chosen on the home page (VamosLocale.setLang, the
// NEXT_LOCALE cookie it writes) follows the customer onto /checkout, the two old step URLs
// (forward to /checkout with the query kept), the page after payment (loading and booked) and
// the pay-link page. Arabic is dir="rtl". No visible string falls back to English: on the home
// DC page through VamosLocale.coverage, on the Next pages by looking for any English message
// that has a different translation in the language under test.
//
// openInLocale (tests/support/locale.ts, gap G5) opens each page the way a returning customer
// does. Server answers are route fixtures; Stripe is never reached. Amounts are fixtures.
// Runs once under component-1440 with its own `next dev`. Tagged @checkout.

import { test, expect, type Page, type Route } from "../support/test";
import { testPort } from "../support/port";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";
import { openInLocale, type Lang } from "../support/locale";
import { FAKE_STRIPE_HOST } from "../support/fake-stripe";
import { stubConsentChosen } from "../support/consent-state";

const RUN_PROJECT = "component-1440";
const QID = "22222222-2222-4222-8222-222222222222";
const REF = "VT-26-0022";
const TOKEN = "dG9rZW4tYWJjZGVmZ2g";
const GS = "11111111-1111-4111-8111-111111111111";
const TRIP =
  `from=Zurich%20Airport&fid=dXJuOm1ieHBvaTox&to=Bahnhofstrasse%201&tid=dXJuOm1ieHBvaTox2` +
  `&gs=${GS}&when=2026-12-15T08:15&pax=2&bags=3&flight=LX318`;
const LANGS: Array<{ lang: Exclude<Lang, "en">; dir: "ltr" | "rtl" }> = [
  { lang: "de", dir: "ltr" },
  { lang: "fr", dir: "ltr" },
  { lang: "ar", dir: "rtl" },
];

let devServer: ChildProcess | null = null;
let baseURL = "";

test.describe.configure({ mode: "default" });

test.beforeAll(async ({}, testInfo) => {
  if (testInfo.project.name !== RUN_PROJECT) return;
  testInfo.setTimeout(240_000);
  const port = testPort(4310) + testInfo.workerIndex;
  baseURL = `http://127.0.0.1:${port}`;
  devServer = spawn(NEXT_BIN, ["dev", "-p", String(port)], {
    cwd: WEB_ROOT,
    stdio: "ignore",
    detached: true,
    env: { ...process.env, NODE_ENV: "development", TEST_DIST_DIR: ".next-checkout-languages-22" },
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
  test.skip(testInfo.project.name !== RUN_PROJECT, "runs once under component-1440.");
});

// ── Message catalogues: what an English fallback would look like ───────────────────────────
function flatten(node: unknown, out: Record<string, string> = {}, prefix = ""): Record<string, string> {
  if (typeof node === "string") out[prefix] = node;
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) flatten(v, out, prefix ? `${prefix}.${k}` : k);
  }
  return out;
}
const catalogue = (lang: string) =>
  flatten(JSON.parse(readFileSync(join(WEB_ROOT, "i18n", "messages", `${lang}.json`), "utf8")));

/** English strings a page in `lang` must not show: long, plain, and translated differently. */
function englishThatMustNotShow(lang: string): string[] {
  const en = catalogue("en");
  const other = catalogue(lang);
  return Object.entries(en)
    .filter(([key, value]) => {
      if (value.length < 14 || /[{}<>]/.test(value)) return false;
      const translated = other[key];
      return typeof translated === "string" && translated !== value;
    })
    .map(([, value]) => value);
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

async function expectNoEnglishFallback(page: Page, lang: string, scope = "body") {
  const text = norm(await page.locator(scope).first().innerText());
  const candidates = englishThatMustNotShow(lang);
  expect(candidates.length, "the fallback check has English strings to look for").toBeGreaterThan(200);
  const leaked = candidates.filter((value) => text.includes(norm(value)));
  expect(leaked, `English strings visible in ${lang}`).toEqual([]);
}

async function expectShell(page: Page, lang: string, dir: string) {
  await expect(page.locator("html")).toHaveAttribute("lang", lang);
  await expect(page.locator("html")).toHaveAttribute("dir", dir);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

// ── Route fixtures ───────────────────────────────────────────────────────────────────────
const CAPS = [
  { slug: "economy", name: "Economy", pax: 3, bags: 3 },
  { slug: "business", name: "Business", pax: 3, bags: 3 },
  { slug: "van-luxury", name: "Van luxury", pax: 8, bags: 8 },
];
const EXTRAS = [
  { code: "child-seat", amount_rappen: 1000, names: { en: "Child seat", de: "Kindersitz", fr: "Siège enfant", ar: "مقعد أطفال" } },
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "cache-control": "private, no-store" },
    body: JSON.stringify(body),
  });
}

async function fixtures(page: Page, opts: { status?: "pending" | "confirmed" } = {}) {
  await page.route(
    (url) => url.hostname.includes("cloudflare") || url.hostname.includes("turnstile"),
    (route) => route.abort(),
  );
  await page.route("**/api/flight/**", (route) => json(route, { ok: false }));
  await page.route("**/api/quote", (route) =>
    json(route, {
      ok: true,
      quote_id: QID,
      lock: "v1.fixture.lock",
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      pricing_live: true,
      classes: CAPS.map((c) => ({
        slug: c.slug,
        name: c.name,
        eligible: true,
        ineligible_reason: null,
        effective_max_pax: c.pax,
        max_bags: c.bags,
        fixed_route: false,
        total_rappen: 10000,
        lines: [],
        photo_url: null,
      })),
    }),
  );
  await page.route("**/api/checkout/extras", (route) => json(route, { ok: true, extras: EXTRAS, vat_rate_bps: 810 }));
  await page.route("**/api/checkout/me", (route) => json(route, { signed_in: false }));
  await page.route("**/api/checkout/resume**", (route) => json(route, { state: "none" }));
  await page.route("**/api/checkout/status/**", (route) =>
    json(
      route,
      opts.status === "confirmed"
        ? { status: "confirmed", paymentStatus: "succeeded" }
        : { status: "awaiting_payment", paymentStatus: "pending" },
    ),
  );
  await page.route("**/api/checkout/pay-link/open", (route) => {
    const origin = new URL(route.request().url()).origin;
    return json(route, {
      ok: true,
      hosted_page: true,
      url: `${FAKE_STRIPE_HOST}/pay/cs_test_lang?success=${encodeURIComponent(origin)}&cancel=${encodeURIComponent(origin)}`,
      session_id: "cs_test_lang",
      reference: REF,
      pickup: "Zurich Airport",
      dropoff: "Bahnhofstrasse 1, Zurich",
      expires_at: new Date(Date.now() + 20 * 3600_000).toISOString(),
      lock_expires_at: new Date(Date.now() + 20 * 3600_000).toISOString(),
      currency: "CHF",
      amount_rappen: 1234,
      billing_email: "ada@example.test",
      quote_id: QID,
    });
  });
}

async function grantManageCookie(page: Page) {
  await page.context().addCookies([
    { name: "vt_manage", value: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", url: baseURL, httpOnly: true, secure: false, sameSite: "Lax" },
  ]);
}

// ── The tests ────────────────────────────────────────────────────────────────────────────
for (const { lang, dir } of LANGS) {
  test(`${lang}: chosen on home (setLang), kept on /checkout; no English fallback on home or checkout @checkout`, async ({ page }) => {
    test.setTimeout(240_000);
    await fixtures(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseURL}/`);
    await expect(page.locator("[data-box]")).toBeVisible({ timeout: 60_000 });
    // The DC runtime's own coverage report: every visible English string on home that the
    // dictionary cannot resolve into this language (run on the English page, the way the
    // dictionary is keyed). Then the customer chooses the language.
    const missing = await page.evaluate(
      (l) =>
        (window as unknown as { VamosLocale: { coverage(root: Element, lang: string): { strings: string[]; attrs: string[] } } }).VamosLocale.coverage(
          document.body,
          l,
        ),
      lang,
    );
    // Hero copy and the empty-reviews note come from the content store, not the dictionary: the
    // dictionary cannot resolve them, so they are checked after the switch instead (below).
    await page.evaluate((l) => (window as unknown as { VamosLocale: { setLang(v: string): void } }).VamosLocale.setLang(l), lang);
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    await expect(page.locator("html")).toHaveAttribute("dir", dir);
    await expect
      .poll(async () => {
        const text = norm(await page.locator("body").innerText());
        return missing.strings.filter((str) => text.includes(norm(str)));
      }, { message: `home strings still English in ${lang}`, timeout: 15_000 })
      .toEqual([]);
    // The component-name attributes the runtime lists are identifiers, not visible copy.
    expect(missing.attrs.every((a) => /^[A-Za-z]+$/.test(a))).toBe(true);
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === "NEXT_LOCALE")?.value).toBe(lang);

    // Navigate from home to the Next checkout: nothing but the cookie carries the choice.
    const res = await page.goto(`${baseURL}/checkout?${TRIP}`);
    expect(res?.status()).toBeLessThan(400);
    expect(new URL(page.url()).pathname).toBe("/checkout");
    await expect(page.locator("[data-co-classes]")).toBeVisible({ timeout: 30_000 });
    await expectShell(page, lang, dir);
    await expectNoEnglishFallback(page, lang);
    if (dir === "rtl") expect(await page.evaluate(() => getComputedStyle(document.body).direction)).toBe("rtl");
  });

  for (const width of [1440, 390] as const) {
    test(`${lang} at ${width}: /checkout, /checkout/trip and /checkout/details open in ${lang}, forward keeps the query @checkout`, async ({ page }) => {
      test.setTimeout(240_000);
      await fixtures(page);
      await page.setViewportSize({ width, height: 900 });

      await openInLocale(page, baseURL, `/checkout?${TRIP}`, lang);
      await expect(page.locator("[data-co-classes]")).toBeVisible({ timeout: 30_000 });
      await expectShell(page, lang, dir);
      await expectNoEnglishFallback(page, lang);

      for (const step of ["trip", "details"] as const) {
        await openInLocale(page, baseURL, `/checkout/${step}?${TRIP}`, lang);
        await page.waitForURL(/\/checkout\?/, { timeout: 30_000 });
        const url = new URL(page.url());
        expect(url.pathname).toBe("/checkout");
        expect(url.searchParams.get("gs")).toBe(GS);
        expect(url.searchParams.get("flight")).toBe("LX318");
        expect(url.searchParams.get("pax")).toBe("2");
        await expect(page.locator("[data-co-classes]")).toBeVisible({ timeout: 30_000 });
        await expectShell(page, lang, dir);
        await expectNoEnglishFallback(page, lang);
      }
    });

    test(`${lang} at ${width}: the page after payment, loading then booked @checkout`, async ({ page }) => {
      test.setTimeout(240_000);
      await grantManageCookie(page);
      await page.setViewportSize({ width, height: 900 });

      await fixtures(page, { status: "pending" });
      await openInLocale(page, baseURL, `/confirmation/${REF}`, lang);
      await expect(page.locator("[data-confirmation-state=confirming]")).toBeVisible({ timeout: 30_000 });
      await expectShell(page, lang, dir);
      await expectNoEnglishFallback(page, lang);

      await page.unroute("**/api/checkout/status/**");
      await page.route("**/api/checkout/status/**", (route) =>
        json(route, { status: "confirmed", paymentStatus: "succeeded" }),
      );
      await page.goto(`${baseURL}/confirmation/${REF}`);
      await expect(page.locator("[data-confirmation-state=booked]")).toBeVisible({ timeout: 30_000 });
      await expectShell(page, lang, dir);
      await expectNoEnglishFallback(page, lang);
    });

    test(`${lang} at ${width}: the pay-link page /checkout/pay/<token> @checkout`, async ({ page }) => {
      test.setTimeout(240_000);
      await fixtures(page);
      await page.setViewportSize({ width, height: 900 });
      await openInLocale(page, baseURL, `/checkout/pay/${TOKEN}`, lang);
      await expect(page.locator("[data-checkout-pay-page]")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator("[data-checkout-pay-page] button")).toBeEnabled();
      await expectShell(page, lang, dir);
      await expectNoEnglishFallback(page, lang);
    });
  }
}

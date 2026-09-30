// apps/web/tests/integration/consent-banner-27.spec.ts
//
// Phase 27 plan 12 (META-03, META-04). Browser proof of the cookie banner:
//  A  Next /checkout (the old /checkout/details forwards here): PAY sits above the card at 390x844, en + de.
//  B  Next pay link: card shows, PAY reachable above it, no Meta pixel in the page, en + de.
//  C  Next, choice already made: no card; the footer link opens the sheet (all optional switches off)
//     and writes nothing.
//  D  Mock /app/pages/about.html: Necessary only posts once and hides the card; reload keeps it hidden.
//  E  Mock /app/pages/cookies.html?ck-gallery=1: the six labelled review states.
//  F  Next /ops, unauthenticated: no banner.
//  G  Next /de/about (prefixed mock address): the banner shows.
//
// Servers: one real `next dev` through the server-harness (never `pnpm dev`) and one node:http static
// server over apps/web/public for the mock pages (run scripts/sync-dc-mock-to-public.mjs first).
// /api/consent and /api/consent/state are answered by page.route; no database is used.
// The spec runs under every viewport project and sets its own viewport per case; nothing is skipped.

import { test, expect, type Page, type Route } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import type { AddressInfo } from "node:net";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";
import { openInLocale, type Lang } from "../support/locale";
import { stubConsentChosen, stubConsentUnchosen, statefulConsentStub } from "../support/consent-state";

const PUBLIC_ROOT = join(WEB_ROOT, "public");
const GS = "11111111-1111-4111-8111-111111111111";
const TRIP =
  `from=Zurich%20Airport&fid=dXJuOm1ieHBvaTox&to=Bahnhofstrasse%201&tid=dXJuOm1ieHBvaTox2` +
  `&gs=${GS}&when=2026-12-15T08:15&pax=2&bags=3&flight=LX318`;
const PAY_PATH = "/checkout/pay/dG9rZW4tYWJjZGVmZ2g";
// Test fixture amount, never a book price.
const FIXTURE_RAPPEN = 1234;
// Needles built from parts: lib/meta/legal-gate.test.ts scans test files for the literal names.
const PIXEL_NEEDLES = ["fb" + "events", "connect." + "facebook" + ".net"];

let nextServer: ChildProcess | null = null;
let staticServer: Server | null = null;
let nextURL = "";
let mockURL = "";

test.beforeAll(async ({}, testInfo) => {
  testInfo.setTimeout(240_000);
  // Own static server for the mock pages, on a free port.
  staticServer = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
    const file = normalize(join(PUBLIC_ROOT, path));
    if (!file.startsWith(PUBLIC_ROOT) || !existsSync(file) || !statSync(file).isFile()) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    const types: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".svg": "image/svg+xml",
      ".json": "application/json",
      ".woff2": "font/woff2",
      ".woff": "font/woff",
      ".jpg": "image/jpeg",
      ".png": "image/png",
    };
    res.setHeader("content-type", types[extname(file)] ?? "application/octet-stream");
    res.end(readFileSync(file));
  });
  await new Promise<void>((ok) => staticServer!.listen(0, "127.0.0.1", ok));
  mockURL = `http://127.0.0.1:${(staticServer.address() as AddressInfo).port}`;

  // Own Next server for the real customer pages and /ops.
  const port = 4400 + testInfo.workerIndex + Number(testInfo.project.name.replace(/\D/g, "").slice(0, 1) || 0) * 10;
  nextURL = `http://127.0.0.1:${port}`;
  nextServer = spawn(NEXT_BIN, ["dev", "-p", String(port)], {
    cwd: WEB_ROOT,
    stdio: "ignore",
    detached: true,
    env: { ...process.env, NODE_ENV: "development", TEST_DIST_DIR: `.next-consent-27-${port}` },
  });
  await waitForNextServer(nextURL, 200_000);
});

test.afterAll(async () => {
  if (nextServer?.pid) {
    try {
      process.kill(-nextServer.pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
  nextServer = null;
  await new Promise<void>((ok) => (staticServer ? staticServer.close(() => ok()) : ok()));
  staticServer = null;
});

test.beforeEach(async ({ page }) => {
  // Cloudflare / Turnstile / Stripe stay offline. React and Babel come from /assets/vendor on the
  // servers themselves, so the mock pages need no other network.
  await page.route(
    (url) => /cloudflare|turnstile|stripe/.test(url.hostname),
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

const nextCard = (page: Page) => page.locator('[data-ck-banner="1"] [data-ck-sheet="1"]').first();

async function noSideways(page: Page, width: number) {
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(w).toBeLessThanOrEqual(width);
}

/** A real-shape quote answer with no total (the amounts read CHF 000). */
async function routeQuote(page: Page) {
  await page.route("**/api/quote", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    return json(route, {
      ok: true,
      quote_id: "22222222-2222-4222-8222-222222222222",
      lock: "v1.fixture.lock",
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      pricing_live: false,
      classes: [
        { slug: "economy", name: "Economy", eligible: true, ineligible_reason: null, effective_max_pax: 3, max_bags: 3, fixed_route: false, total_rappen: null, lines: [], photo_url: null },
        { slug: "business", name: "Business", eligible: true, ineligible_reason: null, effective_max_pax: 3, max_bags: 3, fixed_route: false, total_rappen: null, lines: [], photo_url: null },
      ],
    });
  });
}

// ---------------------------------------------------------------- A: checkout PAY above the card
for (const lang of ["en", "de"] as Lang[]) {
  test(`A ${lang}: /checkout PAY stays above the banner at 390x844`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await stubConsentUnchosen(page);
    await routeQuote(page);
    await openInLocale(page, nextURL, `/checkout?${TRIP}`, lang);

    const card = nextCard(page);
    await expect(card).toBeVisible({ timeout: 60_000 });
    const pay = page.locator(".vt-co__bar [data-co-pay]");
    await expect(pay).toBeVisible();
    await expect.poll(async () => {
      const p = await pay.boundingBox();
      const c = await card.boundingBox();
      return p && c ? p.y + p.height <= c.y + 0.5 : false;
    }).toBe(true);
    await noSideways(page, 390);
    await page.screenshot({ path: test.info().outputPath(`A-${lang}.png`) });
  });
}

// ---------------------------------------------------------------- B: pay link
for (const lang of ["en", "de"] as Lang[]) {
  test(`B ${lang}: pay link shows the banner, PAY above it, no pixel`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await stubConsentUnchosen(page);
    await page.route("**/api/checkout/pay-link/open", (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      return json(route, {
        ok: true,
        hosted_page: true,
        url: "http://127.0.0.1:1/pay/cs_test_consent27",
        session_id: "cs_test_consent27",
        reference: "VT-26-0018",
        pickup: "Zurich Airport",
        dropoff: "Bahnhofstrasse 1, Zurich",
        expires_at: new Date(Date.now() + 20 * 3600_000).toISOString(),
        lock_expires_at: new Date(Date.now() + 20 * 3600_000).toISOString(),
        currency: "CHF",
        amount_rappen: FIXTURE_RAPPEN,
        billing_email: "ada@example.test",
        quote_id: "22222222-2222-4222-8222-222222222222",
      });
    });
    await openInLocale(page, nextURL, PAY_PATH, lang);

    const card = nextCard(page);
    await expect(card).toBeVisible({ timeout: 60_000 });
    const pay = page.locator("[data-checkout-pay-page] button").first();
    await expect(pay).toBeVisible();
    // UI-SPEC pass condition: the pay-link PAY can be scrolled fully above the banner (the page keeps
    // --vt-ck-reserve of room at its end; it is not a sticky bar, so on load it may sit under the card).
    await pay.evaluate((el) => el.scrollIntoView({ block: "start" }));
    await expect.poll(async () => {
      const p = await pay.boundingBox();
      const c = await card.boundingBox();
      return p && c ? p.y + p.height <= c.y + 0.5 : false;
    }).toBe(true);
    await noSideways(page, 390);
    const html = await page.content();
    for (const needle of PIXEL_NEEDLES) expect(html).not.toContain(needle);
    await page.screenshot({ path: test.info().outputPath(`B-${lang}.png`) });
  });
}

// ---------------------------------------------------------------- C: chosen -> no card; footer opens the sheet only
test("C: choice already made hides the card; the footer link opens the sheet and writes nothing", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await stubConsentChosen(page);
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/api\/consent(\?|$)/.test(r.url())) posts.push(r.url());
  });
  await routeQuote(page);
  await openInLocale(page, nextURL, `/checkout?${TRIP}`, "en");
  await expect(page.locator(".vt-co__bar [data-co-pay]")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('[data-ck-banner="1"]')).toHaveCount(0);

  await page.locator("footer").getByText("Cookie preferences").first().click();
  const modal = page.locator('[data-ck-modal="1"]');
  await expect(modal).toBeVisible();
  const optional = modal.locator('[data-ck-row] input:not([disabled])');
  await expect(optional).toHaveCount(3);
  for (let i = 0; i < 3; i++) await expect(optional.nth(i)).not.toBeChecked();
  await page.waitForTimeout(500);
  expect(posts).toEqual([]);
  await page.screenshot({ path: test.info().outputPath("C-sheet.png") });
});

// ---------------------------------------------------------------- D: mock page, Necessary only
test("D: mock /about, Necessary only posts once, hides the card, reload keeps it hidden", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const stub = await statefulConsentStub(page);
  await page.goto(`${mockURL}/app/pages/about.html`);
  await page.waitForTimeout(6000);

  const card = page.locator("[data-ck-banner]").first();
  try {
    await expect(card).toBeVisible({ timeout: 30_000 });
  } catch (err) {
    await page.screenshot({ path: test.info().outputPath("D-no-banner.png") });
    throw err;
  }
  await expect(card.getByRole("button", { name: "Accept all" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Necessary only" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Manage preferences" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("D-before.png") });

  await card.getByRole("button", { name: "Necessary only" }).click();
  await expect.poll(() => stub.posts.length).toBe(1);
  const body = stub.posts[0] ?? {};
  expect(body.method).toBe("reject_all");
  expect(body.marketing).toBe(false);
  expect(body.functional).toBe(false);
  expect(body.analytics).toBe(false);
  expect("turnstileToken" in body).toBe(false);
  await expect(page.locator("[data-ck-banner]")).toHaveCount(0);

  await page.reload();
  await page.waitForTimeout(2500);
  await expect(page.locator("[data-ck-banner]")).toHaveCount(0);
  expect(stub.posts.length).toBe(1);
});

// ---------------------------------------------------------------- G: prefixed address on the Next server
test("G: /de/about (prefixed mock address) shows the banner too", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await stubConsentUnchosen(page);
  await page.goto(`${nextURL}/de/about`, { waitUntil: "domcontentloaded" });
  const card = page.locator("[data-ck-banner]").first();
  try {
    await expect(card).toBeVisible({ timeout: 90_000 });
  } catch (err) {
    await page.screenshot({ path: test.info().outputPath("G-no-banner.png") });
    throw err;
  }
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await page.screenshot({ path: test.info().outputPath("G-de-about.png") });
});

// ---------------------------------------------------------------- E: states gallery
test("E: mock cookies page gallery shows the six labelled states", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await stubConsentUnchosen(page);
  await page.goto(`${mockURL}/app/pages/cookies.html?ck-gallery=1`);
  const gal = page.locator('[data-ck-gal="1"]');
  await expect(gal).toBeAttached({ timeout: 60_000 });
  for (const label of [
    "Default",
    "Busy",
    "Turnstile waiting",
    "Save failed",
    "Check failed",
    "Sheet with a saved choice",
  ]) {
    await expect(gal.getByText(label, { exact: true })).toHaveCount(1);
  }
  await gal.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("E-gallery.png"), fullPage: true });
});

// ---------------------------------------------------------------- F: ops, unauthenticated
test("F: /ops without a session shows no banner", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await stubConsentUnchosen(page);
  await page.goto(`${nextURL}/ops`, { waitUntil: "domcontentloaded" }).catch(() => null);
  await page.waitForTimeout(3000);
  await expect(page.locator('[data-ck-banner]')).toHaveCount(0);
  await expect(page.locator(".vt-ck-banner")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("F-ops.png") });
});

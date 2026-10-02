// apps/web/tests/visual/checkout-account.spec.ts
//
// Plan 26.5-06 Task 3: the account choice at the top of section 2 "Who is travelling",
// at 1440 / 1024 / 768 / 390 in en, de and ar. Run it and check the per-width counts:
//   npx playwright test tests/visual/checkout-account.spec.ts --project=component-1440 --reporter=list
// Every title ends in "@<width> @checkout" so a width that did not run is visible.
// Runs once under component-1440 with its own `next dev`, like checkout-sections.spec.ts.
// Amounts are arithmetic fixtures, never a book price.

import { test, expect, type Page, type Route } from "../support/test";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";
import { openInLocale, type Lang } from "../support/locale";
import { stubConsentChosen } from "../support/consent-state";

const RUN_PROJECT = "component-1440";
const GS = "11111111-1111-4111-8111-111111111111";
const QID = "22222222-2222-4222-8222-222222222222";
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
  const port = 4330 + testInfo.workerIndex;
  baseURL = `http://127.0.0.1:${port}`;
  devServer = spawn(NEXT_BIN, ["dev", "-p", String(port)], {
    cwd: WEB_ROOT,
    stdio: "ignore",
    detached: true,
    env: { ...process.env, NODE_ENV: "development", TURNSTILE_SITE_KEY: "1x00000000000000000000AA", TEST_DIST_DIR: ".next-checkout-account-visual" },
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
  test.setTimeout(300_000);
});

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────
const CAPS = [
  { slug: "economy", name: "Economy", pax: 3, bags: 3 },
  { slug: "business", name: "Business", pax: 3, bags: 3 },
];

type Fx = { intentBodies: Record<string, unknown>[]; authBodies: Record<string, unknown>[] };

/**
 * Routes. `me` starts signed out; `intent` answers the given code (default sign_in_first).
 * `settings` (guest switch / create available) come from the server page, so the run
 * needs the env that turns them on; see the wiring notes.
 */
async function setup(
  page: Page,
  opts: { signedInEmail?: string; intentCode?: "sign_in_first" | "account_consent_required" | "pay_limit" | "rate_limited" } = {},
) {
  const fx: Fx = { intentBodies: [], authBodies: [] };
  // Phase 27: the consent banner paints after its state call answers and covers the options (a bottom card on a
  // tablet, a bottom sheet on a phone), so a click waited until the 300 s limit. This spec is not about the banner:
  // the state answers "already chosen" and it never shows.
  await stubConsentChosen(page);
  // The challenge script is a stub that solves at once, so the widgets stay invisible as in production.
  await page.route(
    (url) => url.hostname.includes("cloudflare") || url.hostname.includes("turnstile"),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body:
          "window.turnstile={render:function(el,o){setTimeout(function(){o.callback('fixture-token')},0);return 'w1'},remove:function(){},reset:function(){}};",
      }),
  );
  await page.route("**/api/flight/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: false }) }),
  );
  await page.route("**/api/quote", async (route: Route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
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
          total_rappen: 10810,
          lines: [],
          photo_url: null,
        })),
      }),
    });
  });
  await page.route("**/api/geo/retrieve**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ place: { isAirport: true } }) }),
  );
  await page.route("**/api/checkout/extras", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, extras: [], vat_rate_bps: 810 }) }),
  );
  await page.route("**/api/checkout/price", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, lines: [], net_rappen: 10000, vat_rappen: 810, charged_rappen: 10810 }),
    }),
  );
  await page.route("**/api/checkout/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        opts.signedInEmail
          ? { signed_in: true, email: opts.signedInEmail, first_name: "Amira", last_name: "Keller", phone: "" }
          : { signed_in: false },
      ),
    }),
  );
  await page.route("**/api/checkout/resume**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ state: "none" }) }),
  );
  await page.route("**/api/auth", async (route) => {
    fx.authBodies.push(JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, stage: "sent" }) });
  });
  await page.route("**/api/checkout/intent", async (route) => {
    fx.intentBodies.push(JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>);
    const code = opts.intentCode ?? "sign_in_first";
    await route.fulfill({
      status: code === "pay_limit" || code === "rate_limited" ? 429 : 409,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, code }),
    });
  });
  return fx;
}

async function open(page: Page, lang: Lang, width: number) {
  await page.setViewportSize({ width, height: 900 });
  const res = await openInLocale(page, baseURL, `/checkout?${TRIP}`, lang);
  expect(res?.ok()).toBeTruthy();
  await expect(page.locator("[data-co-classes]")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
}

const tr = (lang: string) =>
  (JSON.parse(readFileSync(join(WEB_ROOT, "i18n", "messages", `${lang}.json`), "utf8")) as {
    checkout: Record<string, string>;
  }).checkout;

const stripTags = (s: string) => s.replace(/<[^>]+>/g, "");
const panel = (page: Page) => page.locator("[data-co-section='2'] [data-acct-choice]");
const option = (page: Page, v: "guest" | "signin" | "create") => page.locator(`[data-acct-option="${v}"]`);
const pay = (page: Page) => page.locator("[data-co-pay]");

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

async function height(page: Page, selector: string) {
  return (await page.locator(selector).first().boundingBox())?.height ?? 0;
}

async function chooseClass(page: Page) {
  await page.locator('[data-co-class="business"] button').first().click();
}

// ── 1. Layout: panel first in section 2, columns, targets, RTL, no sideways scroll ──────
for (const lang of LANGS) {
  for (const width of WIDTHS) {
    test(`${lang} @${width}: panel first in section 2, layout, targets, no sideways scroll @checkout`, async ({ page }) => {
      await setup(page);
      const m = tr(lang);
      await open(page, lang, width);

      // Panel is the first thing in section 2, above the contact fields; no header sign-in link.
      await expect(panel(page)).toBeVisible();
      const firstChild = await page.evaluate(() => {
        const body = document.querySelector("[data-co-section='2']");
        const p = body?.querySelector("[data-acct-choice]");
        const c = body?.querySelector("[data-co-contact]");
        return !!p && !!c && !!(p.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      expect(firstChild).toBe(true);
      await expect(page.locator("[data-acct-kicker]")).toContainText(m.acctKicker!);
      await expect(option(page, "guest").locator("input[type=radio]")).toBeChecked();

      // Three cards across at >= 681, one column at 390 (and 680 and below).
      const xs = await page.$$eval("[data-acct-option]", (els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
      expect(xs).toHaveLength(3);
      if (width >= 681) expect(new Set(xs).size).toBe(1);
      else expect(new Set(xs).size).toBe(3);

      // Targets: option cards >= 72 px; PAY >= 54 px.
      for (const v of ["guest", "signin", "create"] as const) {
        expect(await height(page, `[data-acct-option="${v}"]`)).toBeGreaterThanOrEqual(72);
      }
      expect(await height(page, "[data-co-pay]")).toBeGreaterThanOrEqual(54);

      // Arabic: the radio sits at the inline-start, which is the right edge.
      if (lang === "ar") {
        const box = await option(page, "guest").boundingBox();
        const radio = await option(page, "guest").locator("input[type=radio]").boundingBox();
        expect(radio!.x + radio!.width / 2).toBeGreaterThan(box!.x + box!.width / 2);
      }

      // Sign in option: email field / send button >= 54 px, links/ghost >= 44 px.
      await option(page, "signin").click();
      await expect(page.locator("[data-acct-signin='form']")).toBeVisible();
      expect(await height(page, "[data-acct-signin] .vt-input")).toBeGreaterThanOrEqual(54);
      expect(await height(page, "[data-acct-signin='form'] [data-acct-action]")).toBeGreaterThanOrEqual(54);
      expect(await height(page, "[data-acct-signin='form'] [data-acct-link]")).toBeGreaterThanOrEqual(44);

      await noSidewaysScroll(page);
      // No English source left in the de/ar render of the panel.
      if (lang !== "en") {
        const en = tr("en");
        const text = await panel(page).innerText();
        for (const k of ["acctGuestTitle", "acctSignInTitle", "acctCreateTitle", "acctKicker"]) {
          expect(text, `${lang}.${k}`).not.toContain(en[k]!);
        }
      }
    });
  }
}

// ── 2. Guest and Create: the tick box, links, PAY rules ──────────────────────────────────
for (const lang of LANGS) {
  for (const width of WIDTHS) {
    test(`${lang} @${width}: guest has no checkbox; Create has one tick with Text 1 and working links; PAY never disabled @checkout`, async ({ page }) => {
      const fx = await setup(page);
      const m = tr(lang);
      await open(page, lang, width);
      await chooseClass(page);

      // Guest: no checkbox anywhere in the panel.
      await expect(panel(page).locator("input[type=checkbox]")).toHaveCount(0);

      // Create: exactly one, labelled with Text 1 (tags stripped) and links to /terms and /privacy.
      await option(page, "create").click();
      const box = panel(page).locator("input[type=checkbox]");
      await expect(box).toHaveCount(1);
      await expect(page.locator("[data-acct-consent]")).toContainText(stripTags(m.acctCreateNotice!));
      const hrefs = await page.$$eval("[data-acct-consent] a", (as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")));
      expect(hrefs.some((h) => /\/terms$/.test(h ?? ""))).toBe(true);
      expect(hrefs.some((h) => /\/privacy$/.test(h ?? ""))).toBe(true);

      // PAY unticked: the line names the tick, focus lands on the box, PAY stays enabled, nothing is sent.
      await expect(pay(page)).toBeEnabled();
      await pay(page).click();
      await expect(page.locator("[data-acct-choice] [data-acct-error]").first()).toContainText(m.acctCreateConsentError!);
      await expect.poll(() => page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.type)).toBe("checkbox");
      await expect(pay(page)).toBeEnabled();
      expect(fx.intentBodies).toHaveLength(0);
      await noSidewaysScroll(page);
    });
  }
}

// ── 3. Sent stage: after Send and after a sign_in_first PAY they look the same ───────────
for (const lang of LANGS) {
  for (const width of WIDTHS) {
    test(`${lang} @${width}: sent stage after Send and after a sign_in_first PAY is identical @checkout`, async ({ page }) => {
      const fx = await setup(page, { intentCode: "sign_in_first" });
      await open(page, lang, width);
      await chooseClass(page);

      // Via the Sign in option.
      await option(page, "signin").click();
      await page.locator("[data-acct-signin='form'] input[type=email]").fill("amira@example.com");
      await page.locator("[data-acct-signin='form'] [data-acct-action]").click();
      await expect(page.locator("[data-acct-signin='sent']")).toBeVisible();
      expect(fx.authBodies.at(-1)).toMatchObject({ mode: "signin", email: "amira@example.com" });
      expect(fx.authBodies.at(-1)).not.toHaveProperty("createUser");
      const viaSend = await page.locator("[data-acct-signin='sent']").innerText();

      // Via a guest PAY answered sign_in_first (a known e-mail): the same neutral stage.
      await page.reload();
      await chooseClass(page);
      await page.locator('[data-co-contact] input[autocomplete="given-name"]').fill("Amira");
      await page.locator('[data-co-contact] input[autocomplete="family-name"]').fill("Keller");
      await page.locator('[data-co-contact] input[autocomplete="email"]').fill("amira@example.com");
      await page.locator("[data-co-contact] [data-vt-phone] input").fill("41796267082");
      await pay(page).click();
      await expect(page.locator("[data-acct-signin='sent']")).toBeVisible();
      expect(await page.locator("[data-acct-signin='sent']").innerText()).toBe(viaSend);
      await noSidewaysScroll(page);
    });
  }
}

// ── 4. D-20 messages ─────────────────────────────────────────────────────────────────────
for (const lang of LANGS) {
  for (const code of ["pay_limit", "rate_limited"] as const) {
    test(`${lang} @390: ${code} shows its own message and leaves PAY usable @checkout`, async ({ page }) => {
      await setup(page, { intentCode: code });
      const m = tr(lang);
      await open(page, lang, 390);
      await chooseClass(page);
      await page.locator('[data-co-contact] input[autocomplete="given-name"]').fill("Amira");
      await page.locator('[data-co-contact] input[autocomplete="family-name"]').fill("Keller");
      await page.locator('[data-co-contact] input[autocomplete="email"]').fill("amira@example.com");
      await page.locator("[data-co-contact] [data-vt-phone] input").fill("41796267082");
      await pay(page).click();
      await expect(page.locator("[data-co-pay-error]")).toContainText(code === "pay_limit" ? m.payLimit! : m.payRateLimited!);
      await expect(pay(page)).toBeEnabled();
    });
  }
}

// ── 5. Signed in: no panel ───────────────────────────────────────────────────────────────
for (const lang of LANGS) {
  for (const width of WIDTHS) {
    test(`${lang} @${width}: signed in has no panel, shows Signed in as, prefills @checkout`, async ({ page }) => {
      await setup(page, { signedInEmail: "amira@example.com" });
      await open(page, lang, width);
      await expect(page.locator("[data-acct-choice]")).toHaveCount(0);
      await expect(page.locator("[data-co-section='2']")).toContainText("amira@example.com");
      await expect(page.locator('[data-co-contact] input[autocomplete="email"]')).toHaveValue("amira@example.com");
      await noSidewaysScroll(page);
    });
  }
}

// ── 6. Screenshots for the review (only when SHOT_DIR is set) ────────────────────────────
// One per width in English (Create expanded, so the panel, the tick and the contact fields
// show), plus 390 in German and Arabic. Written to $SHOT_DIR, committed by name.
const SHOTS: { lang: Lang; width: number }[] = [
  { lang: "en", width: 1440 },
  { lang: "en", width: 1024 },
  { lang: "en", width: 768 },
  { lang: "en", width: 390 },
  { lang: "de", width: 390 },
  { lang: "ar", width: 390 },
];
for (const { lang, width } of SHOTS) {
  test(`${lang} @${width}: screenshot of section 2 @checkout`, async ({ page }) => {
    const dir = process.env.SHOT_DIR;
    test.skip(!dir, "set SHOT_DIR to write screenshots");
    await setup(page);
    await open(page, lang, width);
    await option(page, "create").click();
    await page.locator("[data-co-section='2']").scrollIntoViewIfNeeded();
    await page.locator("[data-co-section='2']").screenshot({ path: join(dir!, `checkout-account-${lang}-${width}.png`) });
  });
}

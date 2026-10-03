// apps/web/tests/integration/meta-pixel-28-real.spec.ts
//
// Phase 28 plan 28-07. Opt-in proof with Meta's REAL script and setup file, served from a local folder
// (VAMOS_META_REAL_DIR holds `fbevents.js` and `config.js`, downloaded with plain GETs; never committed).
// Every request to a Meta host is fulfilled by this test and recorded: nothing reaches Meta, so the owner's
// Events Manager sees nothing. The page carries the Content-Security-Policy the Worker would send.
//
//  a  /sign-in (no query): type into the fields, press buttons and Enter -> one PageView and nothing else
//  b  /about: scroll, click links -> one PageView and nothing else
//  c  withdraw on /about, then click around -> no further request
//
// Skipped without VAMOS_META_REAL_DIR. Runs once, on the 1440 project.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type BrowserContext, type Page } from "../support/test";
import { blockOthers, routeSite, routeTurnstile, stubConsentMarketing } from "../support/meta-pixel";
import { contentSecurityPolicy } from "../../lib/security/headers";

const DIR = process.env["VAMOS_META_REAL_DIR"] ?? "";
const SITE = "https://vamostaxi.site";
const SCRIPT_HOST = "connect." + "face" + "book" + ".net";
const BEACON_HOST = "www." + "face" + "book" + ".com";
const EMAIL = "lena.zurich.test@example.test";

test.beforeEach(({}, testInfo) => {
  test.skip(!DIR, "set VAMOS_META_REAL_DIR to the folder holding Meta's downloaded script and setup file");
  test.skip(testInfo.project.name !== "component-1440", "one viewport is enough for this proof");
});

interface Seen {
  method: string;
  url: URL;
  body: string;
}

async function setup(context: BrowserContext) {
  await blockOthers(context);
  await routeSite(context, { flagsOn: true, csp: contentSecurityPolicy({ metaPixel: true }) });
  await routeTurnstile(context);
  const seen: Seen[] = [];
  const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
  await context.route(`https://${SCRIPT_HOST}/**`, (route) => {
    const url = new URL(route.request().url());
    seen.push({ method: route.request().method(), url, body: route.request().postData() ?? "" });
    if (url.pathname === "/en_US/fbevents.js") {
      return route.fulfill({ status: 200, contentType: "text/javascript", body: readFileSync(join(DIR, "fbevents.js")) });
    }
    if (url.pathname.startsWith("/signals/config/")) {
      return route.fulfill({ status: 200, contentType: "text/javascript", body: readFileSync(join(DIR, "config.js")) });
    }
    return route.fulfill({ status: 204, body: "" });
  });
  await context.route(new RegExp(`^https://(?!${SCRIPT_HOST.replace(/\./g, "\\.")}/)[^/]*(face${"book"}|insta${"gram"})\\.`), (route) => {
    seen.push({ method: route.request().method(), url: new URL(route.request().url()), body: route.request().postData() ?? "" });
    return route.fulfill({ status: 200, contentType: "image/gif", body: gif });
  });
  return seen;
}

async function stage(page: Page, marketing: boolean) {
  // No navigation away from the page under test; no other page load may add a second page view.
  let first = true;
  await page.route("**/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await stubConsentMarketing(page, marketing);
  await page.route(/^https:\/\/vamostaxi\.site\//, (route) => {
    if (route.request().isNavigationRequest()) {
      if (!first) return route.abort();
      first = false;
    }
    return route.fallback();
  });
}

const trs = (seen: Seen[]) => seen.filter((s) => s.url.hostname === BEACON_HOST && s.url.pathname.startsWith("/tr"));

function assertClean(seen: Seen[], address: string) {
  const views = trs(seen).filter((s) => (s.url.searchParams.get("ev") ?? "") === "PageView");
  expect(views, "one PageView").toHaveLength(1);
  expect(views[0]!.url.searchParams.get("dl")).toBe(`${SITE}${address}`);
  expect(["", `${SITE}/`]).toContain(views[0]!.url.searchParams.get("rl") ?? "");
  // Nothing else: no other event name anywhere, not in a URL and not in a body.
  for (const s of trs(seen)) {
    const ev = s.url.searchParams.get("ev") ?? new URLSearchParams(s.body).get("ev");
    expect(ev, `${s.method} ${s.url.pathname}`).toBe("PageView");
  }
  // No user data, no typed e-mail, no hash of it.
  const sha = createHash("sha256").update(EMAIL).digest("hex");
  for (const s of seen) {
    const text = `${s.url.href}\n${s.body}`;
    for (const needle of ["ud[", "udff[", "ud%5B", "udff%5B", EMAIL, encodeURIComponent(EMAIL), sha]) {
      expect(text.includes(needle), `${s.url.pathname} contains ${needle}`).toBe(false);
    }
  }
  // The only Meta paths: the two script files and the PageView request.
  for (const s of seen) {
    const ok = s.url.pathname === "/en_US/fbevents.js" || s.url.pathname.startsWith("/signals/config/") || s.url.pathname.startsWith("/tr");
    expect(ok, `${s.method} ${s.url.href}`).toBe(true);
  }
  if (process.env["VAMOS_META_REAL_LOG"]) {
    for (const s of seen) {
      const keys = [...new Set([...s.url.searchParams.keys()].map((k) => k.replace(/\[\d+\]$/, "[]")))].join(",");
      console.log(`${s.method} ${s.url.hostname}${s.url.pathname} ev=${s.url.searchParams.get("ev") ?? "-"} dl=${s.url.searchParams.get("dl") ?? "-"} keys=${keys}`);
    }
  }
}

test("a: /sign-in, typing and pressing buttons sends one PageView and nothing else", async ({ context, page }) => {
  const seen = await setup(context);
  await stage(page, true);
  await page.goto(`${SITE}/sign-in`);
  await expect.poll(() => trs(seen).length, { timeout: 20_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1500);

  await page.locator('input[type="email"]').first().fill(EMAIL);
  const password = page.locator('input[type="password"]').first();
  await password.fill("correct horse battery");
  await password.press("Enter");
  const buttons = page.locator("main button:visible, form button:visible");
  for (let i = 0; i < Math.min(3, await buttons.count()); i++) await buttons.nth(i).click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(5000);

  assertClean(seen, "/sign-in");
  const fbp = (await context.cookies()).find((c) => c.name === "_fbp");
  expect(fbp?.domain).toBe(".vamostaxi.site");
  const days = ((fbp?.expires ?? 0) * 1000 - Date.now()) / 86_400_000;
  expect(days).toBeGreaterThan(89);
  expect(days).toBeLessThan(91);
});

test("b: /about, scrolling and clicking sends one PageView and nothing else", async ({ context, page }) => {
  const seen = await setup(context);
  await stage(page, true);
  await page.goto(`${SITE}/about`);
  await expect.poll(() => trs(seen).length, { timeout: 20_000 }).toBeGreaterThan(0);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const links = page.locator("main a:visible");
  for (let i = 0; i < Math.min(2, await links.count()); i++) await links.nth(i).click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(5000);
  assertClean(seen, "/about");
});

test("c: after a withdraw nothing more is sent", async ({ context, page }) => {
  const seen = await setup(context);
  await stage(page, true);
  await page.goto(`${SITE}/about`);
  await expect.poll(() => trs(seen).length, { timeout: 20_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1500);

  await page.evaluate(() => window.dispatchEvent(new Event("vamos:cookie-prefs")));
  const modal = page.locator('[data-ck-modal="1"]').first();
  await expect(modal).toBeVisible({ timeout: 15_000 });
  await modal.getByRole("switch", { name: /marketing/i }).evaluate((el: HTMLInputElement) => {
    if (el.checked) el.click();
  });
  await modal.getByRole("button", { name: "Save choices" }).click();
  await page.waitForTimeout(1500);
  const afterWithdraw = seen.length;

  await page.evaluate(() => history.replaceState(null, "", "/about#faq"));
  await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press("Tab");
  await page.waitForTimeout(5000);
  expect(seen.length).toBe(afterWithdraw);
  expect((await context.cookies()).filter((c) => c.name === "_fbp" || c.name === "_fbc")).toEqual([]);
  assertClean(seen, "/about");
});

// apps/web/tests/integration/google-tag.spec.ts
//
// Owner decisions 2026-10-09 (D2, D4): the Google tag, with Google's REAL gtag.js. Opt-in: VAMOS_GOOGLE_REAL_DIR holds
// `gtag.js`, downloaded with one plain GET (never committed). Every request to a Google host is fulfilled by this test
// and recorded: nothing reaches Google, so no Ads account sees a thing. Pages are served at their public addresses from
// apps/web/public (run `node scripts/sync-dc-mock-to-public.mjs` first) with the Content-Security-Policy the Worker would send.
//
//  A  before Accept: no request to Google, only the local denied default
//  B  Accept on /about?gclid=...: the tag loads, the page address Google sees is the path only, nothing is blocked by the policy,
//     and every host it reaches is in the policy
//  C  the conversion on a confirmation address: one request with the amount, CHF and the reference; a reload sends none
//  D  withdraw: consent denied, Google's cookies deleted, no further request
//  E  a pay link: no Google at all
//
// Runs once, on the 1440 project.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type BrowserContext, type Page } from "../support/test";
import { blockOthers, routeSite, routeTurnstile, stubConsentMarketing } from "../support/meta-pixel";
import { contentSecurityPolicy } from "../../lib/security/headers";

const DIR = process.env["VAMOS_GOOGLE_REAL_DIR"] ?? "";
const SITE = "https://vamostaxi.site";
const GOOGLE_HOSTS = /(^|\.)(google|googletagmanager|googleadservices|googlesyndication|doubleclick|google-analytics|googleapis)\.[a-z.]+$/;
const REF = "VT-26-07331";

test.beforeEach(({}, testInfo) => {
  test.skip(!DIR, "set VAMOS_GOOGLE_REAL_DIR to the folder holding Google's downloaded gtag.js");
  test.skip(testInfo.project.name !== "component-1440", "one viewport is enough for this proof");
});

interface Seen {
  url: URL;
  method: string;
}

const POLICY = contentSecurityPolicy({ metaPixel: false, googleTag: true });
const policyHosts = (directive: string) =>
  POLICY.split("; ").find((d) => d.startsWith(`${directive} `))!.split(" ").slice(1).filter((h) => h.startsWith("https://"));
// GA4's two hosts are leftmost wildcards (https://*.google-analytics.com): a subdomain matches, the bare name does not.
const allowedBy = (directive: string, url: URL) =>
  policyHosts(directive).some(
    (h) => h === url.origin || (h.startsWith("https://*.") && url.protocol === "https:" && url.port === "" && url.hostname.endsWith(h.slice("https://*".length))),
  );

async function setup(context: BrowserContext, alias?: Record<string, string>) {
  await blockOthers(context);
  await routeSite(context, { flagsOn: false, googleOn: true, csp: POLICY, alias });
  await routeTurnstile(context);
  const seen: Seen[] = [];
  const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
  await context.route((u) => GOOGLE_HOSTS.test(u.hostname), (route) => {
    const url = new URL(route.request().url());
    seen.push({ url, method: route.request().method() });
    if (url.hostname === "www.googletagmanager.com" && url.pathname === "/gtag/js") {
      return route.fulfill({ status: 200, contentType: "text/javascript", body: readFileSync(join(DIR, "gtag.js")) });
    }
    return route.fulfill({ status: 200, contentType: "image/gif", body: gif });
  });
  return seen;
}

async function stage(page: Page, marketing: boolean | null) {
  await page.route("**/api/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  return stubConsentMarketing(page, marketing);
}

function csp(page: Page): string[] {
  const out: string[] = [];
  page.on("console", (m) => {
    if (/content security policy/i.test(m.text())) out.push(m.text());
  });
  return out;
}

const fromTag = (seen: Seen[]) => seen.filter((s) => !(s.url.hostname === "www.googletagmanager.com" && s.url.pathname === "/gtag/js"));
const cookieNames = async (context: BrowserContext) => (await context.cookies()).map((c) => c.name).filter((n) => /^(_ga|_gcl|_gac|FPLC)/.test(n));

test("A: before Accept nothing is requested from Google", async ({ context, page }) => {
  const seen = await setup(context);
  const violations = csp(page);
  await stage(page, null);
  await page.goto(`${SITE}/about?gclid=TESTCLICK123`);
  await page.waitForTimeout(2500);
  expect(seen).toEqual([]);
  expect(await cookieNames(context)).toEqual([]);
  expect(violations).toEqual([]);
  const layer = await page.evaluate(() => ((window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? []).map((a) => Array.from(a)));
  // The default, then (the server has no choice for this visitor) a local denied update. Both stay in the page.
  expect(layer[0]).toEqual(["consent", "default", { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied" }]);
  for (const entry of layer.slice(1)) expect(entry.slice(0, 2)).toEqual(["consent", "update"]);
});

test("B: Accept loads the tag; Google sees the path only; the policy blocks nothing and covers every host reached", async ({ context, page }) => {
  const seen = await setup(context);
  const violations = csp(page);
  await stage(page, true);
  await page.goto(`${SITE}/about?gclid=TESTCLICK123&utm_source=google&token=SECRET9`, { referer: "https://www.google.com/search?q=vamos+taxi+zurich" });
  await expect.poll(() => seen.length, { timeout: 20_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(3000);
  expect(violations).toEqual([]);
  expect(seen[0]!.url.pathname).toBe("/gtag/js");
  expect(seen[0]!.url.searchParams.get("id")).toBe("AW-368142830");
  const text = seen.map((s) => decodeURIComponent(s.url.href)).join("\n");
  expect(text).not.toContain("SECRET9");
  expect(text).not.toContain("search?q=");
  expect(text).not.toContain("vamos+taxi");
  for (const s of fromTag(seen)) {
    const dl = s.url.searchParams.get("dl");
    if (dl) expect(dl).toBe(`${SITE}/about`);
  }
  // Every host reached is named by the policy for the directive that governs it.
  for (const s of seen) {
    const ok = allowedBy("script-src", s.url) || allowedBy("connect-src", s.url) || allowedBy("img-src", s.url) || allowedBy("frame-src", s.url);
    expect(ok, `${s.method} ${s.url.origin}${s.url.pathname} is not in the policy`).toBe(true);
  }
  if (process.env["VAMOS_GOOGLE_REAL_LOG"]) {
    for (const s of seen) console.log(`${s.method} ${s.url.origin}${s.url.pathname} ${decodeURIComponent(s.url.search).slice(0, 300)}`);
    console.log("cookies", await cookieNames(context));
  }
});

test("C: the conversion is one request with the amount, CHF and the reference; a reload sends none", async ({ context, page }) => {
  const seen = await setup(context, { [`/confirmation/${REF}`]: "/about" });
  const violations = csp(page);
  await stage(page, true);
  await page.goto(`${SITE}/confirmation/${REF}?session=cs_test_1`);
  await expect.poll(() => seen.some((s) => s.url.pathname === "/gtag/js"), { timeout: 20_000 }).toBe(true);
  await page.waitForTimeout(1500);
  const sent = await page.evaluate(() => (window as unknown as { VamosGoogle: { conversion: (i: unknown) => boolean } }).VamosGoogle.conversion({ value: 99.79, transactionId: "VT-26-07331" }));
  expect(sent).toBe(true);
  await page.waitForTimeout(3000);
  const conversions = seen.filter((s) => /\/pagead\/(1p-)?conversion|\/ccm\/collect|\/pagead\/viewthroughconversion/.test(s.url.pathname));
  if (process.env["VAMOS_GOOGLE_REAL_LOG"]) for (const s of seen) console.log(`${s.method} ${s.url.origin}${s.url.pathname}\n   ${[...s.url.searchParams.entries()].filter(([k]) => ["dl", "dr", "url", "top", "ref", "tid", "en", "ep.page_location", "gclaw", "gclid", "oid", "value", "currency_code", "ep.value", "cu", "tt", "ep.transaction_id", "ref", "sr", "dt", "gcs", "gcd"].includes(k) || /^(ep|epn)\./.test(k)).map(([k, v]) => k + "=" + v).join("\n   ")}`);
  expect(conversions.length, "a conversion request").toBeGreaterThan(0);
  const all = conversions.map((s) => decodeURIComponent(s.url.search)).join("\n");
  expect(all).toContain("AW-368142830/liI8CIe79pUdEO7Txa8B".split("/")[1]);
  expect(all).toMatch(/value=99\.79/);
  expect(all).toMatch(/currency(_code)?=CHF/);
  expect(all).toContain(REF);
  expect(all).not.toContain("cs_test_1");
  for (const s of seen) {
    // Google's own page_view ping and its `top` field carry the real path (never a query or a hash: Google drops
    // them); the reference in it is the one the owner decided to send (D4). Our `url` field is the scrubbed one.
    for (const k of ["dl", "top", "url"]) {
      const v = s.url.searchParams.get(k);
      if (v) expect([`${SITE}/confirmation/${REF}`, `${SITE}/confirmation/:ref`], `${s.url.pathname} ${k}`).toContain(v);
    }
    const text = decodeURIComponent(s.url.search);
    expect(text.includes("cs_test_1"), `${s.url.pathname} has the Stripe session`).toBe(false);
  }
  expect(violations).toEqual([]);
  // Reload: the key is in local storage, nothing more is sent.
  const before = seen.length;
  await page.reload();
  await page.waitForTimeout(2500);
  await page.evaluate(() => (window as unknown as { VamosGoogle: { conversion: (i: unknown) => boolean } }).VamosGoogle.conversion({ value: 99.79, transactionId: "VT-26-07331" }));
  await page.waitForTimeout(2500);
  const after = seen.slice(before).filter((s) => /\/conversion\//.test(s.url.pathname)).map((s) => s.url.href);
  expect(after).toEqual([]);
});

test("D: withdrawing denies consent, deletes Google's cookies and stops every request", async ({ context, page }) => {
  const seen = await setup(context);
  const consent = await stage(page, true);
  await page.goto(`${SITE}/about?gclid=TESTCLICK123`);
  await expect.poll(() => seen.length, { timeout: 20_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(2500);
  const had = await cookieNames(context);
  consent.set(false);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("vamos:consent", { detail: { marketing: false } })));
  await page.waitForTimeout(800);
  expect(await cookieNames(context)).toEqual([]);
  const after = seen.length;
  await page.evaluate(() => (window as unknown as { VamosGoogle: { conversion: (i: unknown) => boolean } }).VamosGoogle.conversion({ value: 10, transactionId: "VT-26-07331" }));
  await page.waitForTimeout(2500);
  expect(seen.length).toBe(after);
  if (process.env["VAMOS_GOOGLE_REAL_LOG"]) console.log("cookies before withdraw", had);
});

test("E: a pay link gets no Google at all", async ({ context, page }) => {
  const seen = await setup(context, { "/checkout/pay/abc123": "/about" });
  await stage(page, true);
  await page.goto(`${SITE}/checkout/pay/abc123`);
  await page.waitForTimeout(2500);
  expect(seen).toEqual([]);
  expect(await page.evaluate(() => typeof (window as unknown as { gtag?: unknown }).gtag)).toBe("undefined");
});

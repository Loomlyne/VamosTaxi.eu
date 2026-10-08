// apps/web/tests/integration/meta-events-0610.spec.ts
//
// Owner events (decision 2026-10-09): Contact, Lead, the service link and a referrer from a Meta product.
// Same harness as meta-pixel-28.spec.ts: pages at their public addresses from apps/web/public (run
// `node scripts/sync-dc-mock-to-public.mjs` first), Meta's hosts fulfilled by the test, nothing reaches Meta.
//
//  A  accepted: a click on the phone, e-mail and WhatsApp links sends Contact with only the kind
//  B  no Accept: the same clicks send nothing
//  C  accepted: the contact form sent sends one Lead with nothing in it
//  D  /?service=airport#book counts as a page view
//  E  a referrer from a Meta product with its long address counts; a look-alike does not
//  F  withdraw: later clicks send nothing
//
// Runs once, on the 1440 project.

import { test, expect, type BrowserContext, type Page } from "../support/test";
import { blockOthers, routeMeta, routeSite, routeTurnstile, stubConsentMarketing } from "../support/meta-pixel";

const SITE = "https://vamostaxi.site";

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "component-1440", "one viewport is enough for this proof");
});

async function setup(context: BrowserContext) {
  await blockOthers(context);
  await routeSite(context, { flagsOn: true });
  const meta = await routeMeta(context);
  await routeTurnstile(context);
  return meta;
}

const events = (beacons: URL[]) => beacons.map((u) => ({ ev: u.searchParams.get("ev"), cd: u.searchParams.get("cd") }));

/** Click a link without leaving the page: the click event still runs the capturing listener first. */
async function pressLink(page: Page, selector: string) {
  await page.evaluate((sel) => {
    const a = document.querySelector(sel) as HTMLAnchorElement;
    const stop = (e: Event) => e.preventDefault();
    window.addEventListener("click", stop, { once: true });
    a.click();
  }, selector);
}

test("A: accepted, phone, e-mail and WhatsApp clicks send Contact with only the kind", async ({ context, page }) => {
  const s = await setup(context);
  await stubConsentMarketing(page, true);
  await page.goto(`${SITE}/contact`);
  await expect.poll(() => s.beacons.length, { timeout: 15_000 }).toBe(1); // the PageView
  await pressLink(page, 'a[href^="tel:"]');
  await page.waitForTimeout(1600);
  await pressLink(page, 'a[href^="mailto:"]');
  await page.waitForTimeout(1600);
  await pressLink(page, 'a[href*="wa.me/"]');
  await expect.poll(() => s.beacons.length, { timeout: 10_000 }).toBe(4);
  expect(events(s.beacons)).toEqual([
    { ev: "PageView", cd: null },
    { ev: "Contact", cd: JSON.stringify({ content_category: "phone" }) },
    { ev: "Contact", cd: JSON.stringify({ content_category: "email" }) },
    { ev: "Contact", cd: JSON.stringify({ content_category: "whatsapp" }) },
  ]);
  const all = s.beacons.map((u) => u.href).join("\n");
  expect(all).not.toContain("41796267082");
  expect(all).not.toContain("info%40");
});

test("B: without Accept the same clicks send nothing", async ({ context, page }) => {
  const s = await setup(context);
  await stubConsentMarketing(page, null);
  await page.goto(`${SITE}/contact`);
  await page.waitForTimeout(1800);
  await pressLink(page, 'a[href^="tel:"]');
  await pressLink(page, 'a[href*="wa.me/"]');
  await page.waitForTimeout(1800);
  expect(s.scripts).toEqual([]);
  expect(s.beacons).toEqual([]);
});

test("C: accepted, a sent contact form sends one Lead with nothing in it", async ({ context, page }) => {
  const s = await setup(context);
  await stubConsentMarketing(page, true);
  await page.route("**/api/contact", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) }),
  );
  await page.goto(`${SITE}/contact`);
  await expect.poll(() => s.beacons.length, { timeout: 15_000 }).toBe(1);
  await page.fill("#ct-name", "Lena Test");
  await page.fill("#ct-email", "lena.zurich.test@example.test");
  await page.fill("#ct-msg", "One line about my airport transfer, thanks.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect.poll(() => s.beacons.length, { timeout: 15_000 }).toBe(2);
  await page.waitForTimeout(1500);
  expect(events(s.beacons)).toEqual([
    { ev: "PageView", cd: null },
    { ev: "Lead", cd: JSON.stringify({}) },
  ]);
  const all = s.beacons.map((u) => decodeURIComponent(u.href)).join("\n");
  expect(all).not.toContain("Lena");
  expect(all).not.toContain("example.test");
  expect(all).not.toContain("airport transfer");
});

test("D: the service link /?service=airport#book counts as a page view", async ({ context, page }) => {
  const s = await setup(context);
  await stubConsentMarketing(page, true);
  await page.goto(`${SITE}/?service=airport#book`);
  await expect.poll(() => s.beacons.length, { timeout: 15_000 }).toBe(1);
  expect(s.beacons[0]!.searchParams.get("ev")).toBe("PageView");
  expect(s.beacons[0]!.searchParams.get("dl")).toBe(`${SITE}/?service=airport#book`);
});

test("E: a referrer from a Meta product counts with its long address; a look-alike does not", async ({ context, page }) => {
  const s = await setup(context);
  await stubConsentMarketing(page, true);
  const real = "https://l.facebook.com/l.php?u=https%3A%2F%2Fvamostaxi.site%2F%3Ffbclid%3DIwAR0abc&h=AT0abcDEF-ghi_JKL";
  await page.goto(`${SITE}/?fbclid=IwAR0abc`, { referer: real });
  await expect.poll(() => s.beacons.length, { timeout: 15_000 }).toBe(1);
  expect(s.beacons[0]!.searchParams.get("ev")).toBe("PageView");
  s.beacons.length = 0;
  s.scripts.length = 0;
  const other = await context.newPage();
  await stubConsentMarketing(other, true);
  await other.goto(`${SITE}/?fbclid=IwAR0abc`, { referer: "https://facebook.com.evil.test/l.php?u=x&h=y" });
  await other.waitForTimeout(2000);
  expect(s.beacons).toEqual([]);
  expect(s.scripts).toEqual([]);
});

test("F: after a withdraw, later clicks send nothing", async ({ context, page }) => {
  const s = await setup(context);
  const consent = await stubConsentMarketing(page, true);
  await page.goto(`${SITE}/contact`);
  await expect.poll(() => s.beacons.length, { timeout: 15_000 }).toBe(1);
  consent.set(false);
  await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "vamosCookieConsent", newValue: JSON.stringify({ marketing: false }) })));
  await page.waitForTimeout(300);
  await pressLink(page, 'a[href^="tel:"]');
  await page.waitForTimeout(1800);
  expect(events(s.beacons)).toEqual([{ ev: "PageView", cd: null }]);
});

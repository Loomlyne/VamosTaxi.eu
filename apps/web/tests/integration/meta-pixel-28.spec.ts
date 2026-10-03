// apps/web/tests/integration/meta-pixel-28.spec.ts
//
// Phase 28 plan 28-06 (META-06, META-07, META-08). Browser proof of the Meta page view at the real public
// addresses. Meta's hosts are intercepted by the test: nothing reaches Meta. No Next server, no database;
// run `node scripts/sync-dc-mock-to-public.mjs` first. The stand-in script (tests/fixtures/fbevents-stub.js)
// mimics the observed contract of Meta's script; the opt-in real-script proof is meta-pixel-28-real.spec.ts.
//
//  A  before Accept: no request to Meta and no _fbp, on every allowed page
//  B  Accept on /about: exactly one page view for /about, referrer empty or the bare origin
//  C  already accepted: one page view on each allowed address
//  D  denied addresses: no script request, no beacon
//  E  referrer: from a confirmation or checkout address it does not count, from the bare origin it does
//  F  one page view: a language switch or an account section change adds no second one
//  G  withdraw: no further beacon, cookies and storage gone, next page load starts nothing
//  H  flags off: nothing even after Accept
//
// Runs once, on the 1440 project (the rest would only repeat it).

import { test, expect, type BrowserContext, type Page } from "../support/test";
import { blockOthers, routeMeta, routeSite, routeTurnstile, stubConsentMarketing, META_SCRIPT_HOST } from "../support/meta-pixel";
import { statefulConsentStub } from "../support/consent-state";
import { pixelPageAllowed } from "../../lib/meta/pixel-pages";

const SITE = "https://vamostaxi.site";

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "component-1440", "one viewport is enough for this proof");
});

async function setup(context: BrowserContext, flagsOn = true) {
  const outside = await blockOthers(context); // first = lowest priority
  await routeSite(context, { flagsOn });
  const meta = await routeMeta(context);
  await routeTurnstile(context);
  return { outside, ...meta };
}

async function open(page: Page, address: string, referer?: string) {
  await page.goto(address.startsWith("http") ? address : `${SITE}${address}`, referer ? { referer } : undefined);
  // The loader polls for the consent runtime, asks the server, loads the script, which sends the image.
  await page.waitForTimeout(1800);
}

const cookies = (context: BrowserContext) => context.cookies().then((c) => c.filter((x) => x.name === "_fbp" || x.name === "_fbc"));

test("A: before accept, no request to Meta and no _fbp on any allowed page", async ({ context, page }) => {
  const s = await setup(context);
  await stubConsentMarketing(page, null);
  for (const address of ["/", "/about", "/sign-in", "/de/faq"]) {
    await open(page, address);
  }
  expect(s.scripts).toEqual([]);
  expect(s.beacons).toEqual([]);
  expect(await cookies(context)).toEqual([]);
});

test("B: accept on /about sends exactly one page view for /about", async ({ context, page }) => {
  const s = await setup(context);
  const stub = await statefulConsentStub(page);
  await page.goto(`${SITE}/about`);
  const card = page.locator("[data-ck-banner]").first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  expect(s.beacons).toEqual([]);
  await card.getByRole("button", { name: "Accept all" }).click();
  await expect.poll(() => stub.posts.length, { timeout: 15_000 }).toBe(1);
  expect(stub.posts[0]).toMatchObject({ method: "accept_all", marketing: true });
  await expect.poll(() => s.beacons.length, { timeout: 15_000 }).toBe(1);
  await page.waitForTimeout(1500);
  expect(s.beacons).toHaveLength(1);
  const q = s.beacons[0]!.searchParams;
  expect(q.get("ev")).toBe("PageView");
  expect(q.get("dl")).toBe(`${SITE}/about`);
  expect(["", `${SITE}/`]).toContain(q.get("rl") ?? "");
  expect((await cookies(context)).map((c) => c.name)).toContain("_fbp");
});

test("C: already accepted, one page view on each allowed address", async ({ context, page }) => {
  const s = await setup(context);
  await stubConsentMarketing(page, true);
  for (const address of ["/", "/de/about", "/account/details", "/bookings", "/sign-in", "/?fbclid=x&utm_source=y"]) {
    const before = s.beacons.length;
    await open(page, address);
    expect(s.beacons.length - before, address).toBe(1);
    // The mock's own locale runtime moves /de/about to /about for an English visitor before the beacon;
    // either way the address that is sent is one of the clean ones.
    // A signed-out visitor on /account/... or /bookings is sent to the bare /sign-in by the mock itself.
    const dl = s.beacons.at(-1)!.searchParams.get("dl")!;
    expect(pixelPageAllowed(new URL(dl)), `${address} -> ${dl}`).toBe(true);
    if (!/^\/(de\/about|account|bookings)/.test(address)) expect(dl, address).toBe(`${SITE}${address}`);
  }
});

test("D: denied addresses load no script and send no page view", async ({ context, page }) => {
  const s = await setup(context);
  await stubConsentMarketing(page, true);
  for (const address of [
    "/manage-booking",
    "/booking-detail",
    "/reset-password",
    "/sign-in?returnTo=/checkout",
    "/sign-up?code=x",
    "/about?ref=1",
    "/about?session=x",
    "/about#token=x",
    "https://dashboard.vamostaxi.site/about",
  ]) {
    await open(page, address);
  }
  expect(s.scripts).toEqual([]);
  expect(s.beacons).toEqual([]);
  expect(s.outside.aborted.filter((u) => u.includes(META_SCRIPT_HOST))).toEqual([]);
});

test("E: a page reached from a confirmation or checkout address does not count; from the bare origin it does", async ({ context, page }) => {
  const s = await setup(context);
  await stubConsentMarketing(page, true);
  await open(page, "/about", `${SITE}/confirmation/VT-26-07331`);
  await open(page, "/about", `${SITE}/checkout?from=a&to=b`);
  await open(page, "/about", `${SITE}/checkout/pay/tok`);
  expect(s.beacons).toEqual([]);
  await open(page, "/about", `${SITE}/`);
  expect(s.beacons).toHaveLength(1);
});

test("F: a language switch or an account section change adds no second page view", async ({ context, page }) => {
  const s = await setup(context);
  await stubConsentMarketing(page, true);
  await open(page, "/");
  expect(s.beacons).toHaveLength(1);
  await page.evaluate(() => (window as unknown as { VamosLocale: { setLang: (l: string) => void } }).VamosLocale.setLang("de"));
  await page.evaluate(() => history.replaceState(null, "", "#faq"));
  await page.waitForTimeout(2000);
  expect(s.beacons).toHaveLength(1);

  await open(page, "/account");
  const after = s.beacons.length;
  await page.evaluate(() => history.replaceState(null, "", "/account/details"));
  await page.waitForTimeout(2000);
  expect(s.beacons.length).toBe(after);
});

test("G: withdrawing stops the page view, deletes the cookies and storage, and the next page starts nothing", async ({ context, page }) => {
  const s = await setup(context);
  const consent = await stubConsentMarketing(page, true);
  await open(page, "/about?fbclid=abc123");
  expect(s.beacons).toHaveLength(1);
  expect((await cookies(context)).map((c) => c.name)).toContain("_fbp");
  expect(await page.evaluate(() => localStorage.getItem("multiFbc"))).not.toBeNull();

  // Cookie preferences, Marketing off, Save choices.
  await page.evaluate(() => window.dispatchEvent(new Event("vamos:cookie-prefs")));
  const modal = page.locator('[data-ck-modal="1"]').first();
  await expect(modal).toBeVisible({ timeout: 15_000 });
  const marketing = modal.getByRole("switch", { name: /marketing/i }).or(modal.locator('[data-ck-row] input[type="checkbox"]').last());
  await marketing.first().evaluate((el: HTMLInputElement) => {
    if (el.checked) el.click();
  });
  await modal.getByRole("button", { name: "Save choices" }).click();
  await expect.poll(async () => (await page.evaluate(() => (window as unknown as { __fbqCalls: unknown[][] }).__fbqCalls)).some((c) => c[0] === "consent" && c[1] === "revoke"), { timeout: 15_000 }).toBe(true);
  expect(consent).toBeTruthy();

  const beaconsAtWithdraw = s.beacons.length;
  await page.evaluate(() => history.replaceState(null, "", "/about#faq"));
  await page.waitForTimeout(1500);
  expect(s.beacons.length).toBe(beaconsAtWithdraw);
  expect(await cookies(context)).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem("multiFbc"))).toBeNull();

  const scriptsBefore = s.scripts.length;
  await open(page, "/faq");
  expect(s.scripts.length).toBe(scriptsBefore);
  expect(s.beacons.length).toBe(beaconsAtWithdraw);
});

test("H: with the flags off nothing goes to Meta, even after Accept", async ({ context, page }) => {
  const s = await setup(context, false);
  await stubConsentMarketing(page, true);
  await open(page, "/about");
  expect(s.scripts).toEqual([]);
  expect(s.beacons).toEqual([]);

  const ctx2 = page.context();
  expect(ctx2).toBe(context);
  const stub = await statefulConsentStub(page);
  await page.unroute("**/api/consent/state");
  await page.unroute("**/api/consent");
  await statefulConsentStub(page);
  await page.goto(`${SITE}/faq`);
  const card = page.locator("[data-ck-banner]").first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByRole("button", { name: "Accept all" }).click();
  await page.waitForTimeout(2500);
  expect(s.scripts).toEqual([]);
  expect(s.beacons).toEqual([]);
  void stub;
});

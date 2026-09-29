// apps/web/tests/integration/checkout-hosted.spec.ts
//
// Plan 26.3-22 Task 1 (D-38 / D-39). The whole funnel in a real browser against `next dev`:
// home box -> SEE PRICES -> /checkout (from the URL) -> class, contact, extra, voucher -> PAY ->
// Stripe stand-in -> PAY there -> return -> "Confirming your booking" -> "Booked". Also Back
// from Stripe (same booking, no second intent) and a status that never confirms ("Payment
// received." with no error words).
//
// Every server answer is a route fixture in the real response shape; Stripe is the plan 05
// fake on its own origin (no bypass in the app). The phone width runs first, then 1440.
// Amounts are arithmetic fixtures, never a book price. The saved-booking half of "screen total
// = Stripe amount = saved lines" is proven on the real database in checkout-server-db.spec.ts
// and extras-charged-recorded-db.spec.ts; here the screen total is proven equal to what the
// price route answered and to the amount the intent answer hands to Stripe for the ticked
// child seat. Runs once under component-1440 with its own `next dev`. Tagged @checkout.

import { test, expect, type Page, type Route } from "../support/test";
import { testPort } from "../support/port";
import { spawn, type ChildProcess } from "node:child_process";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";
import { FAKE_STRIPE_HOST } from "../support/fake-stripe";

const RUN_PROJECT = "component-1440";
const QID = "22222222-2222-4222-8222-222222222222";
const BOOKING = "00000000-0000-4000-8000-000000000263";
const REF = "VT-26-0022";

let devServer: ChildProcess | null = null;
let baseURL = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({}, testInfo) => {
  if (testInfo.project.name !== RUN_PROJECT) return;
  testInfo.setTimeout(240_000);
  const port = testPort(4300) + testInfo.workerIndex;
  baseURL = `http://127.0.0.1:${port}`;
  devServer = spawn(NEXT_BIN, ["dev", "-p", String(port)], {
    cwd: WEB_ROOT,
    stdio: "ignore",
    detached: true,
    env: { ...process.env, NODE_ENV: "development", TEST_DIST_DIR: ".next-checkout-hosted" },
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
  test.skip(testInfo.project.name !== RUN_PROJECT, "the funnel spec runs once under component-1440; widths are set inside.");
});

// ── Fixtures ────────────────────────────────────────────────────────────────────────────
const BASE: Record<string, number> = { economy: 10000, business: 15000, "van-luxury": 20000 };
const CAPS = [
  { slug: "economy", name: "Economy", pax: 3, bags: 3 },
  { slug: "business", name: "Business", pax: 3, bags: 3 },
  { slug: "van-luxury", name: "Van luxury", pax: 8, bags: 8 },
];
const EXTRAS = [
  { code: "child-seat", amount_rappen: 1000, names: { en: "Child seat", de: "Kindersitz", fr: "Siège enfant", ar: "مقعد أطفال" } },
  { code: "pet-crate", amount_rappen: 1500, names: { en: "Pet crate", de: "Tierbox", fr: "Caisse pour animaux", ar: "صندوق حيوانات أليفة" } },
];
const VAT_BPS = 810;
const SUGGESTIONS = [
  { mapbox_id: "mb-air-1", name: "Fixture Airport", address: "Kloten", is_airport: true },
  { mapbox_id: "mb-street-1", name: "Fixture Street 1", address: "Zurich", is_airport: false },
];

const chf = (rappen: number) => `CHF ${(rappen / 100).toFixed(2)}`;

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

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "cache-control": "private, no-store" },
    body: JSON.stringify(body),
  });
}

type World = {
  quoteBodies: Record<string, unknown>[];
  priceBodies: { lock: string; vehicle_class: string; extra_codes: string[]; coupon: string | null }[];
  charged: number[];
  intentBodies: Record<string, unknown>[];
  intentAmounts: number[];
  savedLines: Array<{ code: string; amount_rappen: number }[]>;
  resume: Record<string, unknown> | null;
  statusSeq: Array<"pending" | "confirmed">;
  statusHits: number;
  outcome: "paid" | "cancel";
};

async function setup(page: Page, world: Partial<World> = {}): Promise<World> {
  const w: World = {
    quoteBodies: [],
    priceBodies: [],
    charged: [],
    intentBodies: [],
    intentAmounts: [],
    savedLines: [],
    resume: null,
    statusSeq: ["pending", "confirmed"],
    statusHits: 0,
    outcome: "paid",
    ...world,
  };
  await page.route(
    (url) => url.hostname.includes("cloudflare") || url.hostname.includes("turnstile"),
    (route) => route.abort(),
  );
  await page.route("**/api/flight/**", (route) => json(route, { ok: false }));
  await page.route("**/api/geo/suggest**", async (route) => {
    const q = (new URL(route.request().url()).searchParams.get("q") ?? "").toLowerCase();
    const hits = SUGGESTIONS.filter((s) => s.name.toLowerCase().includes(q)).map(({ mapbox_id, name, address }) => ({ mapbox_id, name, address }));
    await json(route, { suggestions: hits });
  });
  await page.route("**/api/geo/retrieve**", async (route) => {
    const id = new URL(route.request().url()).searchParams.get("mapbox_id");
    const hit = SUGGESTIONS.find((s) => s.mapbox_id === id);
    await json(route, { ok: true, place: hit ? { mapbox_id: id, name: hit.name, isAirport: hit.is_airport } : null });
  });
  await page.route("**/api/quote", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    w.quoteBodies.push(body);
    const pax = Number(body.pax);
    const bags = Number(body.bags);
    await json(route, {
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
    });
  });
  await page.route("**/api/checkout/extras", (route) => json(route, { ok: true, extras: EXTRAS, vat_rate_bps: VAT_BPS }));
  await page.route("**/api/checkout/price", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}") as World["priceBodies"][number];
    w.priceBodies.push(body);
    const answer = priceAnswer(body);
    w.charged.push(answer.charged_rappen);
    await json(route, answer);
  });
  await page.route("**/api/checkout/me", (route) => json(route, { signed_in: false }));
  await page.route("**/api/checkout/resume**", (route) => json(route, w.resume ?? { state: "none" }));

  // The intent: the server answers with a hosted Stripe url on the real Stripe origin; what the
  // "server" saved is the price route's lines for the posted selection (fixture arithmetic).
  await page.route("**/api/checkout/intent", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    w.intentBodies.push(body);
    const priced = priceAnswer({
      vehicle_class: String(body.vehicle_class),
      extra_codes: (body.extra_codes as string[]) ?? [],
      coupon: (body.coupon as string | null | undefined) ?? null,
    });
    w.intentAmounts.push(priced.charged_rappen);
    w.savedLines.push(priced.lines.map((l) => ({ code: String(l.code), amount_rappen: Number(l.amount_rappen) })));
    const n = w.intentBodies.length;
    const sessionId = `cs_test_hosted_${n}`;
    const origin = new URL(route.request().url()).origin;
    const success = `${origin}/api/checkout/return?locale=en&session_id={CHECKOUT_SESSION_ID}`;
    const cancel = `${origin}/en/checkout?resume=${encodeURIComponent(QID)}`;
    await route.request();
    await json(route, {
      ok: true,
      reference: REF,
      booking_id: BOOKING,
      url: `${FAKE_STRIPE_HOST}/pay/${sessionId}?success=${encodeURIComponent(success)}&cancel=${encodeURIComponent(cancel)}`,
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      amount_rappen: priced.charged_rappen,
    });
  });

  // Stripe's hosted page: PAY goes to the success url only when the outcome is "paid".
  await page.route(`${FAKE_STRIPE_HOST}/**`, async (route) => {
    const u = new URL(route.request().url());
    const sessionId = u.pathname.split("/").pop() ?? "cs_test_hosted_0";
    const success = (u.searchParams.get("success") ?? "/").replace("{CHECKOUT_SESSION_ID}", sessionId);
    const cancel = u.searchParams.get("cancel") ?? "/";
    const target = w.outcome === "paid" ? success : cancel;
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html><head><meta charset="utf-8"><title>Fake Stripe</title></head><body data-session="${sessionId}"><main>
<button type="button" data-testid="fake-stripe-pay" onclick='location.assign(${JSON.stringify(target)})'>PAY</button>
<button type="button" data-testid="fake-stripe-back" onclick='location.assign(${JSON.stringify(cancel)})'>BACK</button></main></body></html>`,
    });
  });
  // The return route reads Stripe (server side); a redirected request bypasses page.route, so hop by document.
  await page.route("**/api/checkout/return**", async (route) => {
    const location = w.outcome === "paid" ? `/en/confirmation/${REF}` : `/en/checkout?resume=${encodeURIComponent(QID)}&pay=unpaid`;
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><body><script>location.replace(${JSON.stringify(location)})</script></body>`,
    });
  });
  await page.route("**/api/checkout/status/**", async (route) => {
    const step = w.statusSeq[Math.min(w.statusHits, w.statusSeq.length - 1)];
    w.statusHits += 1;
    await json(
      route,
      step === "confirmed"
        ? { status: "confirmed", paymentStatus: "succeeded" }
        : { status: "awaiting_payment", paymentStatus: "pending" },
    );
  });
  return w;
}

const pay = (page: Page) => page.locator("[data-co-pay]");
const card = (page: Page, slug: string) => page.locator(`[data-co-class="${slug}"]`);
const total = (page: Page) => page.locator("[data-co-total]");

async function fillContact(page: Page) {
  await page.locator('[data-co-contact] input[autocomplete="given-name"]').fill("Amira");
  await page.locator('[data-co-contact] input[autocomplete="family-name"]').fill("Keller");
  await page.locator('[data-co-contact] input[autocomplete="email"]').fill("amira@example.com");
  await page.locator("[data-co-contact] [data-vt-phone] input").fill("41796267082");
}

/** Home on the real server: From (airport), To, When, SEE PRICES. Lands on /checkout with the trip in the URL. */
async function fromHomeToCheckout(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  const res = await page.goto(`${baseURL}/`);
  expect(res?.ok()).toBeTruthy();
  await expect(page.locator("[data-box]")).toBeVisible({ timeout: 60_000 });
  // The consent banner mounts late and covers the When sheet; wait for it, then accept.
  await page.getByRole("button", { name: /Accept all/i }).click({ timeout: 20_000 }).catch(() => undefined);

  await page.getByRole("combobox", { name: "From", exact: true }).fill("Fixture Air");
  await page.getByRole("option", { name: /Fixture Airport/ }).click();
  await page.getByRole("textbox", { name: "Flight number" }).fill("LX 318");
  await page.getByRole("combobox", { name: "To", exact: true }).fill("Fixture Street");
  await page.getByRole("option", { name: /Fixture Street 1/ }).click();
  await page.locator('[data-bx="when"] button[aria-haspopup="dialog"]').click();
  const dialog = page.getByRole("dialog", { name: "When" });
  await dialog.getByRole("button", { name: "Next month" }).click();
  await dialog.getByRole("button", { name: "5", exact: true }).click();
  const saved = dialog.getByRole("button", { name: "Saved" });
  if (await saved.isVisible().catch(() => false)) await saved.click({ timeout: 10_000 });

  await page.locator('[data-bx="cta"] button, [data-bx="cta"] a').first().click();
  await page.waitForURL(/\/checkout\?/, { timeout: 30_000 });
  const url = new URL(page.url());
  expect(url.searchParams.get("from")).toContain("Fixture Airport");
  expect(url.searchParams.get("to")).toContain("Fixture Street");
  expect(url.searchParams.get("flight")).toBeTruthy();
  await expect(page.locator("[data-co-classes]")).toBeVisible({ timeout: 30_000 });
}

for (const width of [390, 1440] as const) {
  test(`home -> SEE PRICES -> class, contact, child seat, voucher -> PAY -> Stripe -> Booked at ${width} @checkout`, async ({ page }) => {
    test.setTimeout(240_000);
    const w = await setup(page);
    await fromHomeToCheckout(page, width);
    expect(w.quoteBodies.length).toBeGreaterThan(0);

    await card(page, "business").locator("button").first().click();
    await expect(card(page, "business")).toHaveAttribute("data-selected", "true");
    await fillContact(page);

    // The child seat: the screen total moves by exactly the price route's amount.
    const plain = priceAnswer({ vehicle_class: "business", extra_codes: [], coupon: null }).charged_rappen;
    await expect(total(page)).toHaveText(chf(plain));
    await page.locator('[data-co-extra="child-seat"] label').click();
    const withSeat = priceAnswer({ vehicle_class: "business", extra_codes: ["child-seat"], coupon: null }).charged_rappen;
    await expect(total(page)).toHaveText(chf(withSeat));

    // A voucher, applied through the real control.
    await page.locator("[data-co-voucher-open]").click();
    await page.locator("[data-co-voucher] input").first().fill("WELCOME10");
    await page.locator("[data-co-voucher-apply]").click();
    await expect(page.locator("[data-co-voucher-applied]")).toBeVisible({ timeout: 15_000 });
    const withCoupon = priceAnswer({ vehicle_class: "business", extra_codes: ["child-seat"], coupon: "WELCOME10" }).charged_rappen;
    await expect(total(page)).toHaveText(chf(withCoupon), { timeout: 15_000 });
    const onScreen = w.charged[w.charged.length - 1]!;
    await expect(total(page)).toHaveText(chf(onScreen));

    // The browser stands in for the intent's Set-Cookie (the intent is a fixture here).
    await page.context().addCookies([
      { name: "vt_manage", value: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", url: baseURL, httpOnly: true, secure: false, sameSite: "Lax" },
    ]);
    await pay(page).click();
    await page.waitForURL(/checkout\.stripe\.com\/c\/pay\//, { timeout: 30_000 });

    // screen total = the amount the intent handed to Stripe = the lines the "server" saved.
    expect(w.intentBodies).toHaveLength(1);
    expect(JSON.stringify(w.intentBodies[0])).not.toMatch(/rappen|"amount|"total|"lines/);
    expect(w.intentBodies[0]).toMatchObject({ vehicle_class: "business", extra_codes: ["child-seat"], quote_id: QID });
    expect(JSON.stringify(w.intentBodies[0])).toContain("WELCOME10");
    expect(w.intentAmounts[0]).toBe(onScreen);
    const saved = w.savedLines[0]!;
    expect(saved.some((l) => l.code === "child-seat" && l.amount_rappen === 1000)).toBe(true);
    const net = saved.filter((l) => l.code !== "vat").reduce((a, l) => a + l.amount_rappen, 0);
    const vat = saved.find((l) => l.code === "vat")!.amount_rappen;
    expect(net + vat).toBe(onScreen);

    await page.getByTestId("fake-stripe-pay").click();
    await page.waitForURL(new RegExp(`/confirmation/${REF}`), { timeout: 30_000 });
    await expect(page.locator("[data-confirmation-state=confirming]")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Confirming your booking" })).toBeVisible();
    await expect(page.locator("[data-confirmation-state=booked]")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-confirmation-ref]").first()).toHaveText(REF);
    await expect(page.getByText("Booked", { exact: true }).first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("Back from Stripe returns to the filled checkout and the same booking; no second intent @checkout", async ({ page }) => {
  test.setTimeout(240_000);
  const w = await setup(page, { outcome: "cancel" });
  await fromHomeToCheckout(page, 390);
  await card(page, "economy").locator("button").first().click();
  await fillContact(page);
  const tripQuery = new URL(page.url()).search.slice(1);
  await pay(page).click();
  await page.waitForURL(/checkout\.stripe\.com\/c\/pay\//, { timeout: 30_000 });
  const stripeUrl = page.url();
  expect(w.intentBodies).toHaveLength(1);

  w.resume = {
    state: "open",
    url: stripeUrl,
    booking_id: BOOKING,
    quote_id: QID,
    trip_query: tripQuery,
    contact: { name: "Amira Keller", email: "amira@example.com", phone: "+41796267082" },
    company: { name: "", address: "", vat: "" },
    note: "",
    class: "economy",
    extra_codes: [],
    coupon: null,
    charged_rappen: w.intentAmounts[0],
  };
  await page.getByTestId("fake-stripe-back").click();
  await expect(page.locator("[data-co-back-notice]")).toContainText("Payment not finished", { timeout: 30_000 });
  await expect(page.locator('[data-co-contact] input[autocomplete="given-name"]')).toHaveValue("Amira");
  await expect(page.locator('[data-co-contact] input[autocomplete="email"]')).toHaveValue("amira@example.com");
  await expect(card(page, "economy")).toHaveAttribute("data-selected", "true");

  await pay(page).click();
  await page.waitForURL(stripeUrl);
  expect(w.intentBodies).toHaveLength(1);
});

test("a status that never confirms shows Payment received. with no error words @checkout", async ({ page }) => {
  test.setTimeout(240_000);
  await page.clock.install();
  const w = await setup(page, { statusSeq: ["pending"] });
  await page.context().addCookies([
    { name: "vt_manage", value: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", url: baseURL, httpOnly: true, secure: false, sameSite: "Lax" },
  ]);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`${baseURL}/confirmation/${REF}`);
  await expect(page.locator("[data-confirmation-state=confirming]")).toBeVisible();
  await expect.poll(() => w.statusHits).toBeGreaterThan(0);
  await page.clock.fastForward(21_000);
  await expect(page.locator("[data-confirmation-state=received]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Payment received." })).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/failed|error|try again|retry/i);
});

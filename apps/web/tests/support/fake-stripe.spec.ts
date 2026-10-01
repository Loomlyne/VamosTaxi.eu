// @component — self-test for the fake hosted Stripe page (26.3 D-38). Offline: the app
// under test is a blank route on a local origin.
import { test, expect } from "./test";
import { installFakeStripe, FAKE_STRIPE_HOST } from "./fake-stripe";

const ORIGIN = "http://127.0.0.1:4173";

async function blank(page: import("./test").Page) {
  await page.route(`${ORIGIN}/**`, (route) => {
    const u = new URL(route.request().url());
    if (u.pathname.startsWith("/api/")) return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><body data-path="${u.pathname}${u.search}">blank</body>`,
    });
  });
}

async function startIntent(page: import("./test").Page) {
  await page.goto(`${ORIGIN}/en/checkout`);
  return page.evaluate(async () => {
    const r = await fetch("/api/checkout/intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locale: "en", class: "economy", extra_codes: ["child_seat"] }),
    });
    return (await r.json()) as { ok: boolean; url: string };
  });
}

test("@component fake stripe: PAY reaches the return route shape", async ({ page }) => {
  await blank(page);
  const h = await installFakeStripe(page, { outcome: "paid" });
  await page.route("**/api/checkout/return**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<body>returned</body>" }),
  );
  const res = await startIntent(page);
  expect(res.ok).toBe(true);
  expect(res.url.startsWith(`${FAKE_STRIPE_HOST}/pay/cs_test_fake_1`)).toBe(true);
  await page.goto(res.url);
  await page.getByTestId("fake-stripe-pay").click();
  await page.waitForURL(/\/api\/checkout\/return\?locale=en&session_id=cs_test_fake_1/);
  expect(h.intentBodies[0]).toMatchObject({ class: "economy", extra_codes: ["child_seat"] });
  expect(JSON.stringify(h.intentBodies[0])).not.toMatch(/amount/);
});

test("@component fake stripe: BACK reaches the cancel url with resume", async ({ page }) => {
  await blank(page);
  await installFakeStripe(page, { outcome: "cancel", resumeQuoteId: "q-1" });
  const res = await startIntent(page);
  await page.goto(res.url);
  await page.getByTestId("fake-stripe-back").click();
  await page.waitForURL(/\/en\/checkout\?resume=q-1/);
});

test("@component fake stripe: mocked return route paid goes to confirmation", async ({ page }) => {
  await blank(page);
  await installFakeStripe(page, { outcome: "paid", returnRoute: true });
  const res = await startIntent(page);
  await page.goto(res.url);
  await page.getByTestId("fake-stripe-pay").click();
  await page.waitForURL(/\/en\/confirmation\/VT-00-0000/);
});

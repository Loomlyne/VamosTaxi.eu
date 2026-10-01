// apps/web/tests/integration/ops-detail-hosted-pay.spec.ts
//
// 26.3-G8 @component (D-48): the OpsDetail payment controls hold no card form. Take card opens
// Stripe's hosted page in a new tab; the extra-fare payment shows Open Stripe payment page and
// Copy payment link. Labels in en/de/fr/ar, no sideways scroll at 1440/1024/768/390 (one run per
// project). Served alone with a stubbed VamosOps and VamosOpsApi. No network, no Stripe.js.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Page } from "../support/test";
import { serveMock, waitForMockReady } from "../support/mock-harness";

const APP = join(__dirname, "../../../../app");
// The ops shell (ops.dc.html) loads the locale runtime; a screen served alone does not, so the
// spec injects the same two files before the page boots.
const DS = "../../_ds/vamos-taxi-design-system-245af154-0455-4c10-af76-5254642c3786";
const DS_HEAD = [
  ...["fonts", "colors", "typography", "spacing", "elevation", "motion", "base"].map(
    (f) => `<link rel="stylesheet" href="${DS}/tokens/${f}.css">`,
  ),
  `<link rel="stylesheet" href="${DS}/styles.css">`,
  `<script src="${DS}/_ds_bundle.js"></script>`,
  `<style>:root{--vt-icon-base:"../../assets/icons/";--vt-shadow-accent:none}.vt-input--focus{box-shadow:none}</style>`,
].join("\n");
const LOCALE_JS = [readFileSync(join(APP, "vamos-i18n-dict.js"), "utf8"), readFileSync(join(APP, "vamos-locale.js"), "utf8")];



const BASE = {
  id: "",
  reference: "VT-2101",
  klass: "Economy",
  vehicle: "Economy",
  customer: "Test Guest",
  email: "guest@example.test",
  pickup: "Zurich Airport",
  dropoff: "Bahnhofstrasse 1, Zurich",
  date: "2026-10-01",
  time: "08:00",
  pax: 2,
  bags: 1,
  totalRappen: 8600,
  extras: [],
  fareLines: [],
};
const UNPAID = { ...BASE, status: "pending", paid: false };
const EDIT = {
  ...BASE,
  reference: "VT-2102",
  status: "confirmed",
  paid: true,
  pendingEditId: "00000000-0000-4000-8000-0000000000e1",
  pendingEditQuoteRappen: 11600,
  pendingEditExtraSessionId: "cs_test_extra1",
};
const STRIPE_URL = "https://checkout.stripe.test/c/pay/cs_test_x";

const LABELS = {
  en: { take: "Take card", open: "Open Stripe payment page", copy: "Copy payment link" },
  de: { take: "Karte erfassen", open: "Stripe-Zahlungsseite öffnen", copy: "Zahlungslink kopieren" },
  fr: { take: "Encaisser par carte", open: "Ouvrir la page de paiement Stripe", copy: "Copier le lien de paiement" },
  ar: { take: "تحصيل بطاقة", open: "فتح صفحة الدفع على Stripe", copy: "نسخ رابط الدفع" },
} as const;

async function openDetail(page: Page, lang: keyof typeof LABELS, booking: unknown, calls: string[]): Promise<void> {
  await page.addInitScript((l) => {
    try {
      localStorage.setItem("vamosLang", l);
    } catch {}
  }, lang);
  await page.addInitScript((b) => {
    const noop = () => () => {};
    const coll = (rows: unknown[]) => ({ all: () => rows, onChange: noop, get: () => null, reset: () => {} });
    const w = window as unknown as Record<string, unknown>;
    w.VamosOps = { bookings: coll([b]), chauffeurs: coll([]), vehicles: coll([]), onChange: noop };
    w.VamosOpsApi = {
      request: (method: string, url: string, body: unknown) =>
        fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) }).then((r) => r.json()),
    };
  }, booking);
  for (const src of LOCALE_JS) await page.addInitScript(src);
  await page.route(/\/app\/ops\/OpsDetail\.dc\.html/, async (route) => {
    const res = await route.fetch();
    const text = (await res.text()).replace("</head>", `${DS_HEAD}\n</head>`);
    await route.fulfill({ response: res, body: text });
  });
  await page.route("**/api/staff/**", (route) => {
    calls.push(new URL(route.request().url()).pathname);
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: { url: STRIPE_URL } }) });
  });
  await page.context().route("https://checkout.stripe.test/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<title>stripe</title>" }),
  );
  await page.goto(await serveMock("app/ops/OpsDetail.dc.html"));
  await waitForMockReady(page);
}

async function noSidewaysScroll(page: Page): Promise<void> {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(1);
}

test.describe("OpsDetail hosted payment controls @ops-detail-hosted-pay", () => {
  for (const lang of ["en", "de", "fr", "ar"] as const) {
    test(`unpaid booking: Take card, no card form, no Stripe.js (${lang})`, async ({ page }) => {
      const calls: string[] = [];
      const scripts: string[] = [];
      page.on("request", (r) => {
        if (/js\.stripe\.com/.test(r.url())) scripts.push(r.url());
      });
      await openDetail(page, lang, UNPAID, calls);
      await expect(page.getByText(LABELS[lang].take).first()).toBeVisible();
      await expect(page.locator("#ops-stripe-el")).toHaveCount(0);
      if (lang === "ar") await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await noSidewaysScroll(page);
      expect(scripts).toEqual([]);
    });

    test(`pending edit with an open extra payment shows the Stripe page and copy controls (${lang})`, async ({ page }) => {
      const calls: string[] = [];
      await openDetail(page, lang, EDIT, calls);
      await expect(page.getByText(LABELS[lang].open).first()).toBeVisible();
      await expect(page.getByText(LABELS[lang].copy).first()).toBeVisible();
      await noSidewaysScroll(page);
    });
  }

  test("Take card opens the hosted URL in a new tab", async ({ page, context }) => {
    const calls: string[] = [];
    await openDetail(page, "en", UNPAID, calls);
    const popup = context.waitForEvent("page");
    await page.getByText("Take card").first().click();
    const tab = await popup;
    await tab.waitForURL(STRIPE_URL);
    expect(calls.some((c) => c.endsWith("/take-card"))).toBe(true);
  });

  test("Open Stripe payment page asks the extra-pay route and opens the hosted URL", async ({ page, context }) => {
    const calls: string[] = [];
    await openDetail(page, "en", EDIT, calls);
    const popup = context.waitForEvent("page");
    await page.getByText("Open Stripe payment page").first().click();
    const tab = await popup;
    await tab.waitForURL(STRIPE_URL);
    expect(calls.some((c) => c.endsWith("/extra-pay"))).toBe(true);
  });
});

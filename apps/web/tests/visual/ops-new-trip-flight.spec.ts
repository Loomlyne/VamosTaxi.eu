// apps/web/tests/visual/ops-new-trip-flight.spec.ts
//
// 26.4-08 (D-09): dashboard New trip flight rule and its layout in en and ar at 390 and 768.
// The form is served alone from the DC source; every API is stubbed so nothing leaves the page.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Page } from "../support/test";
import { serveMock, waitForMockReady } from "../support/mock-harness";

const APP = join(__dirname, "../../../../app");
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
const QUOTE_ID = "0b0f5f0e-3f0a-4d6c-9d6e-6f3c1c5b8a11";
const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });

type Lang = "en" | "ar";
const L = {
  en: { pickup: "Pickup", drop: "Drop-off", date: "Date", name: "Name", email: "Email", mobile: "Mobile", flight: "Flight number", hint: "Optional. It does not change the price.", req: "Enter the flight number", save: "Save trip" },
  ar: { pickup: "مكان الانطلاق", drop: "الوصول", date: "التاريخ", name: "الاسم", email: "البريد الإلكتروني", mobile: "الجوال", flight: "رقم الرحلة", hint: "اختياري. لا يغيّر ذلك السعر.", req: "أدخل رقم الرحلة", save: "حفظ الرحلة" },
} as const;

async function open(page: Page, lang: Lang, airport: boolean): Promise<{ intent: unknown[] }> {
  const seen = { intent: [] as unknown[] };
  await page.addInitScript((l) => {
    try {
      localStorage.setItem("vamosLang", l);
      sessionStorage.setItem("vamosGeo", "1b4e28ba-2fa1-11d2-883f-0016d3cca427");
    } catch {}
  }, lang);
  for (const src of LOCALE_JS) await page.addInitScript(src);
  await page.route(/\/app\/ops\/OpsNewTrip\.dc\.html/, async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: (await res.text()).replace("</head>", `${DS_HEAD}\n</head>`) });
  });
  await page.route("**/api/checkout/extras", (r) => r.fulfill(json({ ok: true, extras: [], vat_rate_bps: 81 })));
  await page.route("**/api/geo/suggest**", (r) => {
    const q = new URL(r.request().url()).searchParams.get("q") ?? "";
    const id = q.toLowerCase().startsWith("zur") ? "pickup-id" : "drop-id";
    r.fulfill(json({ suggestions: [{ name: id === "pickup-id" ? "Zurich Pickup" : "Bahnhofstrasse", address: "Zurich", mapbox_id: id }] }));
  });
  await page.route("**/api/geo/retrieve**", (r) => r.fulfill(json({ place: { isAirport: airport } })));
  await page.route("**/api/quote/reprice", (r) => r.fulfill(json({ ok: true, quote_id: QUOTE_ID, lock: "lock-2" })));
  await page.route("**/api/quote", (r) =>
    r.fulfill(json({ ok: true, quote_id: QUOTE_ID, lock: "lock-1", classes: [{ slug: "saden", name: "Economy", eligible: true, total_rappen: 10000 }] })),
  );
  await page.route("**/api/checkout/price", (r) => r.fulfill(json({ ok: true, lines: [], net_rappen: 0, vat_rappen: 0, charged_rappen: 10000 })));
  await page.route("**/api/checkout/intent", (r) => {
    seen.intent.push(r.request().postDataJSON());
    r.fulfill(json({ ok: true, reference: "VT-26-9001", booking_id: QUOTE_ID, url: "https://checkout.stripe.com/c/pay/x" }));
  });
  await page.route("**/api/staff/**", (r) => r.fulfill(json({ ok: true, data: [] })));
  await page.goto(await serveMock("app/ops/OpsNewTrip.dc.html"));
  await waitForMockReady(page);
  return seen;
}

async function fill(page: Page, lang: Lang): Promise<void> {
  const t = L[lang];
  await page.getByLabel(t.pickup, { exact: true }).fill("Zurich");
  await page.getByText("Zurich Pickup — Zurich").click();
  await page.getByLabel(t.drop, { exact: true }).fill("Bahnhof");
  await page.getByText("Bahnhofstrasse — Zurich").click();
  await page.getByLabel(t.date, { exact: true }).fill("2026-10-20");
  await page.getByLabel(t.name, { exact: true }).fill("Test Caller");
  await page.getByLabel(t.email, { exact: true }).fill("caller@example.com");
  await page.getByLabel(t.mobile, { exact: true }).fill("+41790000000");
  await expect(page.getByText("CHF 100")).toBeVisible();
}

const saveButton = (page: Page, lang: Lang) => page.getByRole("button", { name: L[lang].save });

test.beforeEach(({}, info) => {
  test.skip(!["component-390", "component-768"].includes(info.project.name), "flight layout runs at 390 and 768");
});

for (const lang of ["en", "ar"] as const) {
  test.describe(`New trip flight rule (${lang})`, () => {
    test("non-airport pickup: flight optional, hint visible, empty flight is valid", async ({ page }) => {
      const t = L[lang];
      const seen = await open(page, lang, false);
      await fill(page, lang);
      await expect(page.getByText(t.hint)).toBeVisible();
      await expect(page.getByText(t.req)).toHaveCount(0);
      await saveButton(page, lang).click();
      await expect(page).toHaveURL(/\/bookings\/VT-26-9001$/);
      expect(seen.intent).toHaveLength(1);
    });

    test("airport pickup: empty flight is refused and nothing posts", async ({ page }) => {
      const t = L[lang];
      const seen = await open(page, lang, true);
      await fill(page, lang);
      await expect(page.getByText(t.hint)).toHaveCount(0);
      await saveButton(page, lang).click();
      await expect(page.getByText(t.req)).toBeVisible();
      expect(seen.intent).toHaveLength(0);
    });

    test("layout: no sideways scroll, flight hint aligned with its field, no untranslated strings", async ({ page }) => {
      const t = L[lang];
      await open(page, lang, false);
      await fill(page, lang);
      const hint = page.getByText(t.hint);
      await expect(hint).toBeVisible();
      if (lang === "ar") await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      const field = page.getByLabel(t.flight, { exact: true });
      const [hb, fb] = await Promise.all([hint.boundingBox(), field.boundingBox()]);
      expect(hb && fb).toBeTruthy();
      if (hb && fb) {
        // Logical inline-start: left edge in LTR, right edge in RTL.
        const delta = lang === "ar" ? Math.abs(hb.x + hb.width - (fb.x + fb.width)) : Math.abs(hb.x - fb.x);
        expect(delta).toBeLessThanOrEqual(24);
      }
      // The control (input plus its frame) is at least 44 px tall.
      const h = await field.evaluate((el) => {
        let n: Element | null = el;
        let best = 0;
        for (let i = 0; i < 3 && n; i++, n = n.parentElement) best = Math.max(best, n.getBoundingClientRect().height);
        return best;
      });
      expect(h).toBeGreaterThanOrEqual(44);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over).toBeLessThanOrEqual(0);
      const missing = await page.evaluate(() => {
        const vl = (window as unknown as { VamosLocale: { coverage: (r: Element) => unknown } }).VamosLocale;
        return vl.coverage(document.body);
      });
      const own = ["English", "Deutsch", "Français", "العربية"];
      const strings = ((missing as { strings?: string[] }).strings ?? []).filter((x) => !own.includes(x));
      expect(strings).toEqual([]);
    });
  });
}

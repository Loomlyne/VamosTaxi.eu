// apps/web/tests/integration/ops-new-trip-260929.spec.ts
//
// 260929-nts @ops-new-trip: dashboard New trip, served alone from the DC source with every API
// mocked (no network). Save sends a body the strict intent schema accepts, a flight typed after
// the quote re-signs the lock without moving the total (and refuses Save when it would), the
// flight is required at an airport pickup, and de/ar show no sideways scroll at 1440/1024/768/390
// (one run per project).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { checkoutIntentSchema } from "../../lib/checkout/intent-schema";
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
const SESSION = "1b4e28ba-2fa1-11d2-883f-0016d3cca427";
const json = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });

type Opts = { lang: "en" | "de" | "ar"; airport: boolean; movesOnReprice?: boolean };
type Seen = { intent: unknown[]; reprice: unknown[]; quote: unknown[] };

async function openNewTrip(page: Page, opts: Opts): Promise<Seen> {
  const seen: Seen = { intent: [], reprice: [], quote: [] };
  await page.addInitScript((l) => {
    try {
      localStorage.setItem("vamosLang", l);
      sessionStorage.setItem("vamosGeo", "1b4e28ba-2fa1-11d2-883f-0016d3cca427");
    } catch {}
  }, opts.lang);
  for (const src of LOCALE_JS) await page.addInitScript(src);
  await page.route(/\/app\/ops\/OpsNewTrip\.dc\.html/, async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: (await res.text()).replace("</head>", `${DS_HEAD}\n</head>`) });
  });
  await page.route("**/api/checkout/extras", (r) =>
    r.fulfill(json({ ok: true, extras: [{ code: "child-seat", amount_rappen: 1500, names: { en: "Child seat", de: "Kindersitz", fr: "Siège enfant", ar: "مقعد أطفال" } }], vat_rate_bps: 81 })),
  );
  await page.route("**/api/geo/suggest**", (r) => {
    const q = new URL(r.request().url()).searchParams.get("q") ?? "";
    const id = q.toLowerCase().startsWith("zur") ? "pickup-id" : "drop-id";
    r.fulfill(json({ suggestions: [{ name: id === "pickup-id" ? "Zurich Airport" : "Bahnhofstrasse", address: "Zurich", mapbox_id: id }] }));
  });
  await page.route("**/api/geo/retrieve**", (r) => r.fulfill(json({ place: { isAirport: opts.airport } })));
  await page.route("**/api/quote/reprice", (r) => {
    seen.reprice.push(r.request().postDataJSON());
    r.fulfill(json({ ok: true, quote_id: QUOTE_ID, lock: "lock-2" }));
  });
  await page.route("**/api/quote", (r) => {
    seen.quote.push(r.request().postDataJSON());
    r.fulfill(
      json({
        ok: true, quote_id: QUOTE_ID, lock: "lock-1",
        classes: [
          { slug: "saden", name: "Economy", eligible: true, total_rappen: 10000 },
          { slug: "mercedes-benz-v-class", name: "Business", eligible: true, total_rappen: 14000 },
        ],
      }),
    );
  });
  await page.route("**/api/checkout/price", (r) => {
    const b = r.request().postDataJSON() as { lock: string; vehicle_class: string; extra_codes: string[] };
    const base = b.vehicle_class === "mercedes-benz-v-class" ? 14000 : 10000;
    const moved = opts.movesOnReprice && b.lock === "lock-2" ? 500 : 0;
    r.fulfill(json({ ok: true, lines: [], net_rappen: 0, vat_rappen: 0, charged_rappen: base + moved + b.extra_codes.length * 1500 }));
  });
  await page.route("**/api/checkout/intent", (r) => {
    seen.intent.push(r.request().postDataJSON());
    r.fulfill(json({ ok: true, reference: "VT-26-9001", booking_id: QUOTE_ID, url: "https://checkout.stripe.com/c/pay/x" }));
  });
  await page.route("**/api/staff/**", (r) => r.fulfill(json({ ok: true, data: [] })));
  await page.goto(await serveMock("app/ops/OpsNewTrip.dc.html"));
  await waitForMockReady(page);
  return seen;
}

async function fillTrip(page: Page, labels: { pickup: string; drop: string; date: string; name: string; email: string; mobile: string }): Promise<void> {
  await page.getByLabel(labels.pickup).fill("Zurich");
  await page.getByText("Zurich Airport — Zurich").click();
  await page.getByLabel(labels.drop).fill("Bahnhof");
  await page.getByText("Bahnhofstrasse — Zurich").click();
  await page.getByLabel(labels.date).fill("2026-10-20");
  await page.getByLabel(labels.name).fill("Test Caller");
  await page.getByLabel(labels.email).fill("caller@example.com");
  await page.getByLabel(labels.mobile).fill("+41790000000");
}

const EN = { pickup: "Pickup", drop: "Drop-off", date: "Date", name: "Name", email: "Email", mobile: "Mobile" };

async function noSidewaysScroll(page: Page): Promise<void> {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(1);
}

test.describe("OpsNewTrip Save @ops-new-trip", () => {
  test("extra ticked, flight typed after the quote: intent body is valid and the booking opens", async ({ page }) => {
    const seen = await openNewTrip(page, { lang: "en", airport: true });
    await fillTrip(page, EN);
    await expect(page.getByText("CHF 100")).toBeVisible();
    const seat = page.getByRole("checkbox", { name: /Child seat/ });
    await expect(seat).not.toBeChecked();
    await page.locator("label", { hasText: "Child seat" }).click();
    await expect(seat).toBeChecked();
    await expect(page.getByText("CHF 115")).toBeVisible();
    await page.getByLabel("Flight number").fill("lx 318");
    expect(seen.reprice).toHaveLength(0); // typing never re-quotes
    await page.getByRole("button", { name: "Save trip" }).click();
    await expect(page).toHaveURL(/\/bookings\/VT-26-9001$/);
    expect(seen.reprice).toEqual([{ quote_id: QUOTE_ID, lock: "lock-1", locale: "en", display_currency: "CHF", legs: [{ leg_seq: 1, flight_no: "LX318" }] }]);
    expect(seen.intent).toHaveLength(1);
    const parsed = checkoutIntentSchema.safeParse(seen.intent[0]);
    expect(parsed.success).toBe(true);
    const body = seen.intent[0] as { lock: string; extra_codes: string[]; vehicle_class: string; trip: { flight: string } };
    expect(body.lock).toBe("lock-2");
    expect(body.extra_codes).toEqual(["child-seat"]);
    expect(body.vehicle_class).toBe("saden");
    expect(body.trip.flight).toBe("LX318");
  });

  test("Business comes from the quote and is what Save sends", async ({ page }) => {
    const seen = await openNewTrip(page, { lang: "en", airport: false });
    await fillTrip(page, EN);
    await expect(page.getByText("CHF 100")).toBeVisible();
    await page.getByLabel("Vehicle class").selectOption("mercedes-benz-v-class");
    await expect(page.getByText("CHF 140")).toBeVisible();
    await page.getByRole("button", { name: "Save trip" }).click();
    await expect(page).toHaveURL(/\/bookings\/VT-26-9001$/);
    expect((seen.intent[0] as { vehicle_class: string }).vehicle_class).toBe("mercedes-benz-v-class");
    expect(seen.reprice).toHaveLength(0); // no flight, no reprice
  });

  test("a flight that would move the total refuses Save until it is saved again", async ({ page }) => {
    const seen = await openNewTrip(page, { lang: "en", airport: true, movesOnReprice: true });
    await fillTrip(page, EN);
    await expect(page.getByText("CHF 100")).toBeVisible();
    await page.getByLabel("Flight number").fill("LX318");
    await page.getByRole("button", { name: "Save trip" }).click();
    await expect(page.getByText("Price changed")).toBeVisible();
    await expect(page.getByText("CHF 105")).toBeVisible();
    expect(seen.intent).toHaveLength(0);
    await page.getByRole("button", { name: "Save trip" }).click();
    await expect(page).toHaveURL(/\/bookings\/VT-26-9001$/);
    expect(seen.intent).toHaveLength(1);
  });

  test("airport pickup without a flight number does not post", async ({ page }) => {
    const seen = await openNewTrip(page, { lang: "en", airport: true });
    await fillTrip(page, EN);
    await expect(page.getByText("CHF 100")).toBeVisible();
    await page.getByRole("button", { name: "Save trip" }).click();
    await expect(page.getByText("Enter the flight number")).toBeVisible();
    expect(seen.intent).toHaveLength(0);
  });
});

test.describe("OpsNewTrip languages @ops-new-trip", () => {
  const cases = [
    { lang: "de", labels: { pickup: "Abholung", drop: "Ziel", date: "Datum", name: "Name", email: "E-Mail", mobile: "Mobil" }, extra: "Kindersitz", flight: "Flugnummer" },
    { lang: "ar", labels: null, extra: "مقعد أطفال", flight: "رقم الرحلة" },
  ] as const;
  for (const c of cases) {
    test(`extras and flight field in ${c.lang}: no sideways scroll, no untranslated strings`, async ({ page }) => {
      await openNewTrip(page, { lang: c.lang, airport: true });
      await expect(page.getByText(c.extra)).toBeVisible();
      await expect(page.getByText(c.flight).first()).toBeVisible();
      if (c.lang === "ar") await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await noSidewaysScroll(page);
      const missing = await page.evaluate(() => {
        const vl = (window as unknown as { VamosLocale: { coverage: (r: Element) => string[] } }).VamosLocale;
        return vl.coverage(document.body);
      });
      // The four language names are written in their own language on purpose.
      const own = ["English", "Deutsch", "Français", "العربية"];
      expect(((missing as unknown as { strings: string[] }).strings ?? []).filter((x) => !own.includes(x))).toEqual([]);
    });
  }
});

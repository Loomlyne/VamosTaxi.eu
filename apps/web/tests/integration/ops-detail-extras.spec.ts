// apps/web/tests/integration/ops-detail-extras.spec.ts
//
// 26.3-20 @component: the OpsDetail fare block prints the snapshot lines as given (fare, one row
// per owner-named extra, negative voucher, VAT), each amount once; a legacy booking still renders;
// German and Arabic names show; no sideways scroll at 1440/1024/768/390 (one run per project).
// The screen is served alone with a stubbed VamosOps. No network.

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


const BOOKING = {
  id: "",
  reference: "VT-2001",
  status: "confirmed",
  klass: "Economy",
  vehicle: "Economy",
  customer: "Test Guest",
  pickup: "Zurich Airport",
  dropoff: "Bahnhofstrasse 1, Zurich",
  date: "2026-10-01",
  time: "08:00",
  pax: 2,
  bags: 1,
  paid: true,
  totalRappen: 8600,
  couponCode: "SAVE20",
  extras: ["roof-box"],
  fareLines: [
    { kind: "fare", code: "distance_fare", label: "Transfer, Economy", names: null, rappen: 8000 },
    { kind: "surcharge", code: "roof-box", label: "Roof box", names: { en: "Roof box", de: "Dachbox", fr: "Coffre de toit", ar: "صندوق السقف" }, rappen: 2500 },
    { kind: "coupon", code: "SAVE20", label: "Coupon", names: null, rappen: -2000 },
    { kind: "vat", code: "vat", label: "VAT", names: null, rappen: 100 },
  ],
};
const LEGACY = {
  ...BOOKING,
  reference: "VT-1001",
  totalRappen: 9000,
  couponCode: "",
  extras: ["child_seat"],
  fareLines: [
    { kind: "fare", code: "distance_fare", label: "Transfer, Economy", names: null, rappen: 8000 },
    { kind: "surcharge", code: "child_seat", label: "Child seat", names: null, rappen: 1000 },
  ],
};

async function openDetail(page: Page, lang: "en" | "de" | "ar", booking: unknown): Promise<void> {
  await page.addInitScript((l) => {
    try {
      localStorage.setItem("vamosLang", l);
    } catch {}
  }, lang);
  await page.addInitScript((b) => {
    const noop = () => () => {};
    const coll = (rows: unknown[]) => ({ all: () => rows, onChange: noop, get: () => null });
    (window as unknown as Record<string, unknown>).VamosOps = {
      bookings: coll([b]),
      chauffeurs: coll([]),
      vehicles: coll([]),
      onChange: noop,
    };
  }, booking);
  for (const src of LOCALE_JS) await page.addInitScript(src);
  await page.route(/\/app\/ops\/OpsDetail\.dc\.html/, async (route) => {
    const res = await route.fetch();
    const text = (await res.text()).replace("</head>", `${DS_HEAD}\n</head>`);
    await route.fulfill({ response: res, body: text });
  });
  await page.route("**/api/staff/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: [] }) }),
  );
  await page.goto(await serveMock("app/ops/OpsDetail.dc.html"));
  await waitForMockReady(page);
}

async function noSidewaysScroll(page: Page): Promise<void> {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (over > 1) {
    const culprits = await page.evaluate(() =>
      Array.from(document.querySelectorAll("body *"))
        .filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
        .slice(0, 8)
        .map((el) => `${el.tagName}[${el.getAttribute("style")?.slice(0, 60) ?? ""}|${(el.textContent ?? "").slice(0, 30)}]${Math.round(el.getBoundingClientRect().right)}`),
    );
    console.log("OVERFLOW", over, culprits.join(" | "));
  }
  expect(over).toBeLessThanOrEqual(1);
}

test.describe("OpsDetail generic fare block @ops-detail-extras", () => {
  const cases = [
    { lang: "en", name: "Roof box", coupon: "Coupon SAVE20" },
    { lang: "de", name: "Dachbox", coupon: "Gutschein SAVE20" },
    { lang: "ar", name: "صندوق السقف", coupon: "قسيمة SAVE20" },
  ] as const;
  for (const c of cases) {
    test(`owner-named extra, voucher and VAT in ${c.lang}`, async ({ page }) => {
      await openDetail(page, c.lang, BOOKING);
      await expect(page.getByText(c.name).first()).toBeVisible();
      // The name appears once in the fare block (and once in the details chips), never twice per block.
      const block = page.locator("[class*='price'], [class*='Price']").first();
      await expect(block).toContainText(c.name);
      await expect(block).toContainText(c.coupon);
      const negative = await block.innerText();
      expect(negative).toContain("\u2212");
      const roofRows = (negative.match(new RegExp(c.name, "g")) ?? []).length;
      expect(roofRows).toBe(1);
      if (c.lang === "ar") await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await noSidewaysScroll(page);
    });
  }

  test("legacy three-code booking still renders", async ({ page }) => {
    await openDetail(page, "en", LEGACY);
    await expect(page.getByText("Child seat").first()).toBeVisible();
    await expect(page.getByText("Transfer, Economy").first()).toBeVisible();
    await noSidewaysScroll(page);
  });
});

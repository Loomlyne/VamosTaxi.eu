// apps/web/tests/integration/ops-26-3-widths.spec.ts
//
// 26.3-13: the extra editor (four name fields) and the board's "Awaiting payment" filter with its
// empty state, each rendered from the DC source at 1440/1024/768/390 (one run per project).
// No sideways scroll, German and Arabic strings present, Arabic sets dir=rtl. No network.

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

async function open(page: Page, rel: string, lang: "en" | "de" | "ar"): Promise<void> {
  await page.addInitScript((l) => {
    try {
      localStorage.setItem("vamosLang", l);
    } catch {}
  }, lang);
  for (const src of LOCALE_JS) await page.addInitScript(src);
  // The ops shell loads the design-system bundle for its screens; a screen served alone needs it too.
  await page.route(/\/app\/ops\/Ops(Board|Pricing)\.dc\.html/, async (route) => {
    const res = await route.fetch();
    const body = (await res.text()).replace("</head>", `${DS_HEAD}\n</head>`);
    await route.fulfill({ response: res, body });
  });
  await page.route("**/api/staff/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, data: [] }) }),
  );
  await page.goto(await serveMock(rel));
  await waitForMockReady(page);
}

async function noSidewaysScroll(page: Page): Promise<void> {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (over > 1) {
    const culprits = await page.evaluate(() =>
      Array.from(document.querySelectorAll("body *"))
        .filter((el) => !el.closest("[data-vt-board]") && el.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
        .slice(0, 6)
        .map((el) => `${el.tagName}[${Array.from(el.attributes).map((a) => a.name + "=" + a.value.slice(0, 40)).join(",")}]${Math.round(el.getBoundingClientRect().right)}`),
    );
    console.log("OVERFLOW", over, culprits.join(" | "));
  }
  expect(over).toBeLessThanOrEqual(1);
}

const BOARD = "app/ops/OpsBoard.dc.html";
const PRICING = "app/ops/OpsPricing.dc.html";

test.describe("OpsBoard awaiting payment @ops-26-3-widths", () => {
  const cases = [
    { lang: "en", filter: "Awaiting payment", empty: "No bookings awaiting payment." },
    { lang: "de", filter: "Zahlung ausstehend", empty: "Keine Buchungen mit ausstehender Zahlung." },
    { lang: "ar", filter: "بانتظار الدفع", empty: "لا حجوزات بانتظار الدفع." },
  ] as const;
  for (const c of cases) {
    test(`filter and empty state in ${c.lang}`, async ({ page }) => {
      await open(page, BOARD, c.lang);
      await page.getByRole("button", { name: new RegExp(c.filter) }).first().click();
      await expect(page.getByText(c.empty)).toBeVisible();
      if (c.lang === "ar") await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await noSidewaysScroll(page);
    });
  }
});

test.describe("OpsPricing extra names @ops-26-3-widths", () => {
  const cases = [
    { lang: "en", add: "Add surcharge", labels: ["Name in German", "Name in French", "Name in Arabic"] },
    { lang: "de", add: "Zuschlag hinzufügen", labels: ["Name auf Deutsch", "Name auf Französisch", "Name auf Arabisch"] },
    { lang: "ar", add: "إضافة رسم", labels: ["الاسم بالألمانية", "الاسم بالفرنسية", "الاسم بالعربية"] },
  ] as const;
  for (const c of cases) {
    test(`four name fields in ${c.lang}`, async ({ page }) => {
      await open(page, PRICING, c.lang);
      await page.locator("nav button").nth(2).click(); // Surcharges & extras
      await page.getByText(c.add).first().click();
      for (const label of c.labels) await expect(page.getByText(label).first()).toBeVisible();
      if (c.lang === "ar") await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      await noSidewaysScroll(page);
    });
  }
});

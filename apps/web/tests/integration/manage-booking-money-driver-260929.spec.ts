/**
 * @component 260929-mbp: the manage-booking page opened from the confirmation e-mail shows
 * the price lines, how it was paid, the extras and the driver. Behavioural, runs once under
 * component-1440 (the sideways-scroll check resizes the page itself). The API is mocked with
 * exactly the shape /api/manage/booking returns.
 */
import { test, expect, type Page } from "../support/test";
import { spawn, type ChildProcess } from "node:child_process";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";

const RUN_PROJECT = "component-1440";
const PORT = 4298;
const PATH = "/manage-booking?token=mbp-token-0123456789";

let devServer: ChildProcess | null = null;
let baseURL = "";

const LINES = [
  { kind: "fare", code: "distance_fare", labels: { en: "Fare", de: "Fare", fr: "Fare", ar: "Fare" }, vatRateBps: null, amountRappen: 9000 },
  {
    kind: "surcharge",
    code: "child-seat",
    labels: { en: "Child seat", de: "Kindersitz", fr: "Siège enfant", ar: "مقعد أطفال" },
    vatRateBps: null,
    amountRappen: 1000,
  },
  { kind: "coupon", code: "coupon", labels: { en: "coupon", de: "coupon", fr: "coupon", ar: "coupon" }, vatRateBps: null, amountRappen: -500 },
  { kind: "vat", code: "vat", labels: { en: "vat", de: "vat", fr: "vat", ar: "vat" }, vatRateBps: 81, amountRappen: 770 },
];

function booking(over: { driver: unknown; money: unknown }) {
  return {
    ok: true,
    booking: {
      id: "00000000-0000-0000-0000-000000000001",
      reference: "VT-26-0901",
      status: "confirmed",
      locale: "en",
      contactName: "Anna Keller",
      contactEmail: "anna@example.com",
      pickupText: "Zurich Airport (ZRH)",
      dropoffText: "Zurich HB",
      scheduledLocal: "2030-08-14T06:45",
      originalScheduledAt: "2030-08-14T04:45:00.000Z",
      flightNo: "",
      pax: 2,
      bags: 1,
      priceTotalRappen: 10270,
      refundStatus: "none",
      refundOwedRappen: 0,
      refundedRappen: 0,
      payoutCountry: null,
      payoutCountryLabel: null,
      availableOn: null,
      reviewSubmitted: false,
      canCancel: true,
      cancelWindow: "auto_full",
      ...over,
    },
  };
}

const MONEY = {
  chargedRappen: 10270,
  method: "card",
  presentment: { amountMinor: 1100, currency: "EUR" },
  className: "Van luxury",
  lines: LINES,
};
const DRIVER = { firstName: "Anna", phone: "+41 79 000 00 77", vehicleModel: "Mercedes V-Class", plate: "ZH 123456" };

async function mockManage(page: Page, payload: unknown): Promise<void> {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { signedIn: false } }));
  await page.route("**/api/manage/booking**", (route) => route.fulfill({ json: payload }));
}

async function open(page: Page, lang = "en"): Promise<void> {
  await page.addInitScript((l) => localStorage.setItem("vamosLang", l), lang);
  await page.goto(`${baseURL}${PATH}`);
  await expect(page.getByText("VT-26-0901").first()).toBeVisible();
}

test.beforeAll(async ({}, testInfo) => {
  if (testInfo.project.name !== RUN_PROJECT) return;
  testInfo.setTimeout(90_000);
  baseURL = `http://localhost:${PORT}`;
  devServer = spawn(NEXT_BIN, ["dev", "-p", String(PORT)], {
    cwd: WEB_ROOT,
    stdio: "ignore",
    detached: true,
    env: {
      ...process.env,
      SUPABASE_URL: process.env.SUPABASE_URL ?? "http://127.0.0.1:54321",
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "anon-placeholder",
    },
  });
  await waitForNextServer(baseURL);
});

test.afterAll(() => {
  if (devServer?.pid) {
    try {
      process.kill(-devServer.pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
  devServer = null;
});

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== RUN_PROJECT, "Behavioural, not visual — runs once under component-1440.");
});

test.describe("manage booking money and driver 260929", () => {
  test("assigned driver, extras, VAT, voucher, card, paid in EUR", async ({ page }) => {
    await mockManage(page, booking({ driver: DRIVER, money: MONEY }));
    await open(page);
    await expect(page.getByText("Child seat", { exact: true })).toBeVisible();
    await expect(page.getByText("Van luxury").first()).toBeVisible();
    await expect(page.getByText("Voucher", { exact: true })).toBeVisible();
    await expect(page.getByText(/^VAT 8\.1 %$/)).toBeVisible();
    await expect(page.getByText("−CHF 5.00")).toBeVisible();
    await expect(page.getByText("CHF 10.00")).toBeVisible();
    await expect(page.getByText("CHF 102.70").first()).toBeVisible();
    await expect(page.getByText("Paid with")).toBeVisible();
    await expect(page.getByText("Card", { exact: true })).toBeVisible();
    await expect(page.getByText("Charged as")).toBeVisible();
    await expect(page.getByText(/€\s?11\.00|EUR\s?11\.00/)).toBeVisible();
    await expect(page.getByText("Anna", { exact: true })).toBeVisible();
    const tel = page.getByRole("link", { name: "+41 79 000 00 77" });
    await expect(tel).toHaveAttribute("href", "tel:+41790000077");
    expect((await tel.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await expect(page.getByText("Mercedes V-Class · ZH 123456").first()).toBeVisible();
    await expect(page.getByText("No driver assigned yet.")).toHaveCount(0);
    await expect(page.locator("img[src*='chauffeur'], img[alt*='river']")).toHaveCount(0);
  });

  test("no driver yet shows the waiting line and no driver data", async ({ page }) => {
    await mockManage(page, booking({ driver: null, money: { ...MONEY, presentment: null, method: null } }));
    await open(page);
    await expect(
      page.getByText("No driver assigned yet. We will show your driver here once assigned."),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /^\+41 79 000/ })).toHaveCount(0);
    await expect(page.getByText("Paid online")).toBeVisible();
    await expect(page.getByText("Charged as")).toHaveCount(0);
  });

  test("lines that do not add up: the total alone", async ({ page }) => {
    await mockManage(page, booking({ driver: null, money: { ...MONEY, lines: [] } }));
    await open(page);
    await expect(page.getByText("CHF 102.70").first()).toBeVisible();
    await expect(page.getByText("Child seat", { exact: true })).toHaveCount(0);
    await expect(page.getByText(/^VAT/)).toHaveCount(0);
  });

  for (const lang of ["de", "fr", "ar"] as const) {
    test(`${lang}: extra named in the page language, coverage empty`, async ({ page }) => {
      await mockManage(page, booking({ driver: null, money: MONEY }));
      await open(page, lang);
      const name = { de: "Kindersitz", fr: "Siège enfant", ar: "مقعد أطفال" }[lang];
      await expect(page.getByText(name, { exact: true })).toBeVisible();
      await expect(page.getByText("No driver assigned yet.")).toHaveCount(0);
      const missing = await page.evaluate(() => {
        const v = (window as unknown as {
          VamosLocale?: { coverage: (r: Element) => { strings?: string[]; attrs?: string[] } | string[] };
        }).VamosLocale;
        const c = v ? v.coverage(document.body) : { strings: ["no VamosLocale"], attrs: [] };
        const all = Array.isArray(c) ? c : [...(c.strings ?? []), ...(c.attrs ?? [])];
        return all.filter((x) =>
          /driver|Paid with|Charged as|Paid online|^Voucher$|Your driver|^Phone$/i.test(x),
        );
      });
      expect(missing).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.dir)).toBe(lang === "ar" ? "rtl" : "ltr");
    });
  }

  for (const width of [1440, 1024, 768, 390]) {
    test(`${width}px: assigned driver, no sideways scroll`, async ({ page }) => {
      await mockManage(page, booking({ driver: DRIVER, money: MONEY }));
      await page.setViewportSize({ width, height: 900 });
      await open(page, "de");
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over).toBeLessThanOrEqual(0);
    });
  }
});

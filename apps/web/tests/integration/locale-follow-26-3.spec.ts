// apps/web/tests/integration/locale-follow-26-3.spec.ts
//
// G5 / D-47: the customer's language follows them onto the Next pages. Real browser
// against `next dev`. The choice is the NEXT_LOCALE cookie exactly as
// VamosLocale.setLang writes it on home; the page is opened at its unprefixed address.

import { test, expect, type Page } from "../support/test";
import { testPort } from "../support/port";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NEXT_BIN, settleCloudflareDev, waitForNextServer, WEB_ROOT } from "../support/server-harness";
import { nextDevEnv } from "../support/test-stack";
import { openInLocale, setChosenLanguage } from "../support/locale";

const RUN_PROJECT = "component-1440";
const PORT = testPort(4443);
const REF = "VT-26-0001";
const DRAFT = {
  pickup: "Zurich Airport (ZRH)",
  destination: "Zürich HB",
  date: "2026-10-01",
  time: "10:00",
  returnDate: "",
  returnTime: "",
  passengers: 2,
  luggage: 1,
  flightNumber: "LX123",
};

let devServer: ChildProcess | null = null;
let baseURL = "";

const messages = (lang: string) =>
  JSON.parse(readFileSync(join(WEB_ROOT, "i18n", "messages", `${lang}.json`), "utf8")) as {
    checkout: { confirmingTitle: string };
  };

const LANGS = ["de", "fr", "ar"] as const;
const WIDTHS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "390", width: 390, height: 900 },
] as const;

test.describe.configure({ mode: "default" });

test.beforeAll(async ({}, testInfo) => {
  if (testInfo.project.name !== RUN_PROJECT) return;
  testInfo.setTimeout(180_000);
  baseURL = `http://127.0.0.1:${PORT}`;
  devServer = spawn(NEXT_BIN, ["dev", "-p", String(PORT)], {
    cwd: WEB_ROOT,
    stdio: "ignore",
    detached: true,
    env: nextDevEnv({ NODE_ENV: "development", TEST_DIST_DIR: ".next-locale-follow" }),
  });
  await settleCloudflareDev();
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

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== RUN_PROJECT, "runs once; sets its own widths.");
  await page.route(
    (url) => /stripe|cloudflare|turnstile/.test(url.hostname),
    (route) => route.abort(),
  );
  await page.route("**/api/checkout/status/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "pending" }) }),
  );
});

async function grantManageCookie(page: Page) {
  await page.addInitScript((seed) => {
    sessionStorage.setItem("vamosTrip", JSON.stringify(seed));
  }, DRAFT);
  await page.context().addCookies([
    {
      name: "vt_manage",
      value: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      url: baseURL,
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

async function expectShell(page: Page, lang: string, width: number) {
  await expect(page.locator("html")).toHaveAttribute("lang", lang);
  await expect(page.locator("html")).toHaveAttribute("dir", lang === "ar" ? "rtl" : "ltr");
  if (width <= 390) {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  }
}

for (const lang of LANGS) {
  for (const vp of WIDTHS) {
    test(`confirmation loading screen renders ${lang} at ${vp.name} @checkout`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await grantManageCookie(page);
      const res = await openInLocale(page, baseURL, `/confirmation/${REF}`, lang);
      expect(res?.ok()).toBeTruthy();
      expect(new URL(page.url()).pathname).toBe(`/confirmation/${REF}`);
      await expect(page.locator("[data-confirmation-state=confirming]")).toBeVisible();
      await expect(
        page.getByRole("heading", { name: messages(lang).checkout.confirmingTitle }),
      ).toBeVisible();
      await expectShell(page, lang, vp.width);
    });

    test(`/checkout renders ${lang} at ${vp.name} @checkout`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const res = await openInLocale(page, baseURL, "/checkout", lang);
      expect(res?.status()).toBeLessThan(400);
      expect(new URL(page.url()).pathname.startsWith(`/${lang}`)).toBe(false);
      await expectShell(page, lang, vp.width);
      // Header/footer chrome is translated: no English chrome copy left over.
      const en = await page.evaluate(() => document.body.innerText);
      expect(en).not.toMatch(/Book a transfer/i);
      const script = { de: /[A-Za-zäöüß]{4,}/, fr: /[A-Za-zéèàç]{4,}/, ar: /[؀-ۿ]{3,}/ }[lang];
      expect(en).toMatch(script);
    });
  }
}

test("the header switcher on a Next page changes the language @checkout", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await grantManageCookie(page);
  await page.goto(`${baseURL}/confirmation/${REF}`);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  const switcher = page.locator("[data-hd-wide] [data-vs-root]").first();
  await switcher.locator("[data-vs-btn]").click();
  await switcher.locator("[data-vs-opt]").filter({ hasText: "DE" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "de", { timeout: 20_000 });
  expect(new URL(page.url()).pathname).toBe(`/confirmation/${REF}`);
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === "NEXT_LOCALE")?.value).toBe("de");
  await switcher.locator("[data-vs-btn]").click();
  await switcher.locator("[data-vs-opt]").filter({ hasText: "AR" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl", { timeout: 20_000 });
});

test("an invalid cookie value falls back to English @checkout", async ({ page }) => {
  await setChosenLanguage(page, baseURL, "xx");
  const res = await page.goto(`${baseURL}/checkout`);
  expect(res?.status()).toBeLessThan(400);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});

test("DC pages still 308 away from a locale prefix @checkout", async ({ request }) => {
  const res = await request.get(`${baseURL}/de/about`, { maxRedirects: 0 });
  expect(res.status()).toBe(308);
  expect(new URL(res.headers()["location"] ?? "", baseURL).pathname).toBe("/about");
});

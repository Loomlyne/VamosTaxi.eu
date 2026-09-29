import { test, expect } from "../support/test";
import { testPort } from "../support/port";
import { spawn, type ChildProcess } from "node:child_process";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";

const PRIVACY_IDS = [
  "controller",
  "collect",
  "basis",
  "processors",
  "transfers",
  "retention",
  "rights",
  "cookies",
  "requests",
  "changes",
] as const;

const COOKIES_IDS = [
  "what",
  "choice",
  "necessary",
  "functional",
  "analytics",
  "marketing",
  "change",
] as const;

// Live [data-tok] = LegalPage hero (date+version) + body PendingSlots.
// Plan grep 19/14 counted CSS. Mock content: privacy 17, cookies 21.
const PRIVACY_TOK = 17;
const COOKIES_TOK = 21;

const PORTS: Record<string, number> = {
  "component-1440": testPort(4194),
  "component-1024": testPort(4191),
  "component-768": testPort(4192),
  "component-390": testPort(4193),
};

const LOCALES = ["en", "de", "fr", "ar"] as const;

let devServer: ChildProcess | null = null;
let baseURL = "";

function pathFor(locale: string, route: "/privacy" | "/cookies"): string {
  return locale === "en" ? route : `/${locale}${route}`;
}

test.describe("Privacy and cookies pages @component", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(240_000);
    const port = PORTS[testInfo.project.name] ?? testPort(4199);
    baseURL = `http://localhost:${port}`;
    // Isolated distDir so four viewport projects (and `pnpm test:visual`'s other
    // next-dev specs) do not wipe each other's compiled `[locale]/privacy` page.
    devServer = spawn(NEXT_BIN, ["dev", "-p", String(port)], {
      cwd: WEB_ROOT,
      stdio: "ignore",
      detached: true,
      env: {
        ...process.env,
        TEST_DIST_DIR: `test-results/.next-privacy-cookies-${port}`,
      },
    });
    await waitForNextServer(baseURL, 180_000);
    for (const path of ["/privacy", "/cookies"] as const) {
      const res = await fetch(baseURL + path);
      if (res.status >= 400) {
        throw new Error(`warmup ${path} status ${res.status}`);
      }
    }
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

  for (const locale of LOCALES) {
    test(`screenshot privacy ${locale} @component`, async ({ page }) => {
      await page.goto(baseURL + pathFor(locale, "/privacy"), { timeout: 60_000 });
      await expect(page.locator("main")).toBeVisible({ timeout: 30_000 });
      await expect(page).toHaveScreenshot(`privacy-${locale}.png`);
    });

    test(`screenshot cookies ${locale} @component`, async ({ page }) => {
      await page.goto(baseURL + pathFor(locale, "/cookies"), { timeout: 60_000 });
      await expect(page.locator("main")).toBeVisible({ timeout: 30_000 });
      await expect(page).toHaveScreenshot(`cookies-${locale}.png`);
    });
  }

  test("no sideways scroll at 390 @component", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "component-390", "390 only");
    for (const locale of LOCALES) {
      for (const route of ["/privacy", "/cookies"] as const) {
        await page.goto(baseURL + pathFor(locale, route));
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        );
        expect(overflow).toBe(true);
      }
    }
  });

  test("cookies table region scrolls at 390 without paging sideways @component", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "component-390", "390 only");
    for (const locale of LOCALES) {
      await page.goto(baseURL + pathFor(locale, "/cookies"));
      const pageFits = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );
      expect(pageFits).toBe(true);
      const wrap = page.locator(".vt-tablewrap").first();
      await expect(wrap).toBeVisible();
      const tableOverflows = await wrap.evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(tableOverflows).toBe(true);
    }
  });

  test("TOC hashes match section ids @component", async ({ page }) => {
    for (const [route, ids] of [
      ["/privacy", PRIVACY_IDS],
      ["/cookies", COOKIES_IDS],
    ] as const) {
      await page.goto(baseURL + route);
      for (const id of ids) {
        await expect(page.locator(`#${id}`)).toHaveCount(1);
      }
      const hrefs = await page.locator("[data-lg-tl]").evaluateAll((els) =>
        els.map((el) => (el as HTMLAnchorElement).getAttribute("href")),
      );
      expect(hrefs.sort()).toEqual(ids.map((id) => `#${id}`).sort());
    }
  });

  test("hreflang in raw response @component", async ({ page }) => {
    for (const route of ["/privacy", "/cookies"]) {
      const res = await page.goto(baseURL + route);
      const body = (await res?.text()) ?? "";
      expect(body).toMatch(/hreflang="en"/i);
      expect(body).toMatch(/hreflang="de"/i);
      expect(body).toMatch(/hreflang="fr"/i);
      expect(body).toMatch(/hreflang="ar"/i);
      expect(body).toMatch(/hreflang="x-default"/i);
    }
  });

  test("rtl and English data-tok @component", async ({ page }) => {
    for (const [route, expected] of [
      ["/privacy", PRIVACY_TOK],
      ["/cookies", COOKIES_TOK],
    ] as const) {
      const byLocale: Record<string, string[]> = {};
      for (const locale of LOCALES) {
        await page.goto(baseURL + pathFor(locale, route));
        if (locale === "ar") {
          await expect(page.locator("html")).toHaveAttribute("dir", "rtl"); // dir="rtl"
        }
        const labels = await page.locator("[data-tok]").evaluateAll((els) =>
          els.map((el) => el.textContent ?? ""),
        );
        expect(labels.length).toBe(expected);
        byLocale[locale] = labels;
      }
      for (const locale of LOCALES) {
        expect(byLocale[locale]).toEqual(byLocale.en);
      }
    }
  });

  test("LanguageCoverageNotice is a no-op @component", async ({ page }) => {
    for (const locale of LOCALES) {
      for (const route of ["/privacy", "/cookies"] as const) {
        await page.goto(baseURL + pathFor(locale, route));
        await expect(page.locator("[data-notice='present']")).toHaveCount(0);
      }
    }
  });

  test("print control 44px keyboard @component", async ({ page }) => {
    await page.goto(baseURL + "/privacy");
    const btn = page.locator(".vt-legal-print");
    await expect(btn).toBeVisible();
    const box = await btn.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await btn.focus();
    await expect(btn).toBeFocused();
  });
});

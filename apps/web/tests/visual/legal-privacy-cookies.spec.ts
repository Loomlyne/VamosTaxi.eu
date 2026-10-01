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

// 26.0: the legal ship (owner-approved texts) removed every data-tok pill from the privacy and
// cookies mocks. The test still proves the count is the same in all four languages, now zero.
const PRIVACY_TOK = 0;
const COOKIES_TOK = 0;

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
        // Measure the rendered mock, not the boot frame.
        await expect(page.locator("[data-lg-tl]").first()).toBeAttached();
        await expect
          .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
          .toBe(true);
      }
    }
  });

  test("cookies table region scrolls at 390 without paging sideways @component", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "component-390", "390 only");
    // 26.0 (main-green-3): /cookies is the DC mock app/pages/cookies.dc.html; each table[data-ct] sits in its own
    // overflow-x:auto box (the React page's .vt-tablewrap never renders here). The page itself must never page
    // sideways; a table wider than the screen scrolls inside its box.
    for (const locale of LOCALES) {
      await page.goto(baseURL + pathFor(locale, "/cookies"));
      const table = page.locator("table[data-ct]").first();
      await expect(table).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true);
      const boxes = await page.locator("table[data-ct]").evaluateAll((els) =>
        els.map((el) => getComputedStyle(el.parentElement as Element).overflowX),
      );
      expect(boxes.length).toBeGreaterThan(0);
      for (const overflowX of boxes) expect(["auto", "scroll"]).toContain(overflowX);
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
    // The mock's own print button (the React page's .vt-legal-print never renders here).
    const btn = page.getByRole("button", { name: "Print or save as PDF" });
    await expect(btn).toBeVisible();
    const box = await btn.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await btn.focus();
    await expect(btn).toBeFocused();
  });

  // Last in this serial block, so a red here never hides the tests above. Red on 2026-10-02 for a real
  // reason: the /cookies rail links "08 The previous site" to #legacy and no section has that id
  // (app/pages/cookies.dc.html:170) — an app fix for the control session, not a spec change.
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
      expect(hrefs.sort(), `${route}: every rail link must point at a section on the page`).toEqual(
        ids.map((id) => `#${id}`).sort(),
      );
    }
  });
});

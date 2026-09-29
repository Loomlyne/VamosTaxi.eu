import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";

const PORTS: Record<string, number> = {
  "component-1440": 4280,
  "component-1024": 4281,
  "component-768": 4282,
  "component-390": 4283,
};

const LOCALES = ["en", "de", "fr", "ar"] as const;
const MAIN_NEXT = join("/Users/koss/Developer/VamosTaxi.eu/apps/web/node_modules/.bin/next");
const NEXT = existsSync(NEXT_BIN) ? NEXT_BIN : MAIN_NEXT;

const SECTION_SEL = [
  "[data-hero]",
  "[data-hiw]",
  "[data-svc-sec]",
  "[data-why]",
  "[data-rv]",
  "[data-home-faq]",
] as const;

let devServer: ChildProcess | null = null;
let baseURL = "";

function pathFor(locale: string) {
  return locale === "en" ? "/" : `/${locale}`;
}

async function gotoHome(page: Page, locale: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const res = await page.goto(baseURL + pathFor(locale), { timeout: 60_000, waitUntil: "domcontentloaded" });
  if (!res || res.status() >= 400) {
    throw new Error(`Home ${locale} returned ${res?.status() ?? "no response"}`);
  }
  await expect(page.locator("[data-home]")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-bookcard]")).toBeAttached();
  const reviewState = await page.locator("[data-rv]").getAttribute("data-state");
  const faqState = await page.locator("[data-home-faq]").getAttribute("data-state");
  if (reviewState === "error" || faqState === "error") {
    throw new Error("Local stack is not running. Run `pnpm db:start && pnpm db:reset`.");
  }
}

test.describe("Home page @component", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(240_000);
    const port = PORTS[testInfo.project.name] ?? 4280;
    baseURL = `http://localhost:${port}`;
    devServer = spawn(NEXT, ["dev", "-p", String(port)], {
      cwd: WEB_ROOT,
      stdio: "ignore",
      detached: true,
      env: {
        ...process.env,
        TEST_DIST_DIR: `test-results/.next-home-${port}`,
        CLOUDFLARE_ENV: "staging",
        WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:
          "postgres://vamos_public:vamos_public@127.0.0.1:54322/postgres",
        WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE_NOCACHE:
          "postgres://vamos_edge:vamos_edge@127.0.0.1:54322/postgres",
      },
    });
    await waitForNextServer(baseURL, 180_000);
  });

  test.afterAll(() => {
    if (devServer?.pid) {
      try {
        process.kill(-devServer.pid, "SIGTERM");
      } catch {
        /* gone */
      }
    }
  });

  for (const locale of LOCALES) {
    test(`screenshot ${locale} @component`, async ({ page }) => {
      await gotoHome(page, locale);
      await expect(page).toHaveScreenshot(`home-${locale}.png`, {
        fullPage: true,
        animations: "disabled",
        timeout: 15_000,
      });
    });
  }

  test("booking card is above the fold at every viewport @component", async ({ page }) => {
    await gotoHome(page, "en");
    const box = await page.locator("[data-bookcard]").boundingBox();
    expect(box).toBeTruthy();
    const viewport = page.viewportSize();
    expect(viewport).toBeTruthy();
    expect(box!.y).toBeLessThan(viewport!.height);
    expect(box!.y + box!.height).toBeGreaterThan(0);
  });

  test("six sections appear in the mock order @component", async ({ page }) => {
    await gotoHome(page, "en");
    const tops = await page.evaluate((sels) => {
      return sels.map((sel) => {
        const el = document.querySelector(sel);
        if (!el) return Number.POSITIVE_INFINITY;
        const rect = el.getBoundingClientRect();
        return rect.top + window.scrollY;
      });
    }, [...SECTION_SEL]);
    for (let i = 1; i < tops.length; i++) {
      expect(tops[i]).toBeGreaterThan(tops[i - 1]!);
    }
  });

  test("no sideways scroll at any locale @component", async ({ page }) => {
    for (const locale of LOCALES) {
      await gotoHome(page, locale);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      ).toBe(true);
    }
  });

  test("layout composes exactly one header and one footer @component", async ({ page }) => {
    await gotoHome(page, "en");
    await expect(page.locator("header")).toHaveCount(1);
    await expect(page.locator("footer")).toHaveCount(1);
  });

  test("hreflang alternates plus x-default in the raw response @component", async ({ page }) => {
    const res = await page.goto(baseURL + "/", { timeout: 60_000 });
    expect(res?.ok()).toBe(true);
    const html = (await res!.text()).toLowerCase();
    for (const lang of ["en", "de", "fr", "ar", "x-default"]) {
      expect(html).toContain(`hreflang="${lang}"`);
    }
  });

  test("arabic is rtl and does not overflow inline-start @component", async ({ page }) => {
    await gotoHome(page, "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
  });

  test("no CHF string and no leftover proof images @component", async ({ page }) => {
    await gotoHome(page, "en");
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/CHF\s+[1-9]/);
    expect(body).not.toMatch(/CHF\s+\d+[.,]\d{2}/);
    await expect(page.locator("[data-image-proof]")).toHaveCount(0);
    // 26.4 D-14: the hidden hourly card no longer has its own href; assert by its title id.
    await expect(page.locator("[data-home] #svc-t4")).toHaveCount(0);
  });

  test("german sections do not overflow their containers @component", async ({ page }) => {
    await gotoHome(page, "de");
    const overflow = await page.evaluate((sels) => {
      return sels.some((sel) => {
        const el = document.querySelector(sel);
        if (!el) return true;
        return el.scrollWidth > el.clientWidth + 1;
      });
    }, [...SECTION_SEL]);
    expect(overflow).toBe(false);
  });

  test("overlay header drops CTA while the booking card is on screen @component", async ({ page }) => {
    await gotoHome(page, "en");
    await expect(page.locator("header[data-hd=\"overlay\"]")).toHaveCount(1);
    await expect(page.locator("[data-hd-cta]")).toHaveCount(0);
  });
});

import { test, expect, type Page, emulateMedia } from "../support/test";
import { testPort } from "../support/port";
import { spawn, type ChildProcess } from "node:child_process";
import { NEXT_BIN, settleCloudflareDev, waitForNextServer, WEB_ROOT } from "../support/server-harness";
import { nextDevEnv } from "../support/test-stack";

// The live home page. Since 0f591fa6 ("serve the mock at / and drop the old React homepage") `/` is the DC
// mock app/home/home.dc.html, served by middleware.ts (DC_PAGES); app/[locale]/page.tsx returns null. So this
// spec drives a real `next dev` at `/` and reads the MOCK's markers ([data-hero], [data-hiw], [data-svc-sec],
// [data-rv], [data-faq]). The React-only markers it used to wait for ([data-home], [data-home-faq]) exist
// only on the /dev gallery pages. Why Vamos is hidden on the live home on purpose (commented dc-import in
// home.dc.html), so it is not in the section list. The four full-page pictures were baselined from the
// React home: they differ from the mock until the owner signs new pictures (a session never rebaselines).

const PORTS: Record<string, number> = {
  "component-1440": testPort(4280),
  "component-1024": testPort(4281),
  "component-768": testPort(4282),
  "component-390": testPort(4283),
};

const LOCALES = ["en", "de", "fr", "ar"] as const;

const SECTION_SEL = [
  "[data-hero]",
  "[data-hiw]",
  "[data-svc-sec]",
  "[data-rv]",
  "[data-faq]",
] as const;

let devServer: ChildProcess | null = null;
let baseURL = "";

function pathFor(locale: string) {
  return locale === "en" ? "/" : `/${locale}`;
}

async function gotoHome(page: Page, locale: string) {
  await emulateMedia(page, { reducedMotion: "reduce" });
  const res = await page.goto(baseURL + pathFor(locale), { timeout: 60_000, waitUntil: "domcontentloaded" });
  if (!res || res.status() >= 400) {
    throw new Error(`Home ${locale} returned ${res?.status() ?? "no response"}`);
  }
  // The mock compiles in the browser: the hero is visible and the FAQ section exists once it has mounted.
  await expect(page.locator("[data-hero]")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-bookcard]")).toBeAttached();
  await expect(page.locator("[data-faq]")).toBeAttached();
}

/** The consent banner sits fixed over the hero; a picture of the page is taken without it. Second button = Necessary only (any language). */
async function dismissCookieBanner(page: Page) {
  const banner = page.locator("[data-ck-banner]");
  await banner.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
  if (await banner.isVisible().catch(() => false)) {
    await banner.locator("[data-ck-acts] button").nth(1).click();
    await expect(banner).toBeHidden({ timeout: 10_000 });
  }
}

test.describe("Home page @component", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(240_000);
    const port = PORTS[testInfo.project.name] ?? testPort(4280);
    baseURL = `http://localhost:${port}`;
    devServer = spawn(NEXT_BIN, ["dev", "-p", String(port)], {
      cwd: WEB_ROOT,
      stdio: "ignore",
      detached: true,
      env: nextDevEnv({
        TEST_DIST_DIR: `test-results/.next-home-${port}`,
        CLOUDFLARE_ENV: "staging",
      }),
    });
    await settleCloudflareDev();
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
      await dismissCookieBanner(page);
      await expect(page).toHaveScreenshot(`home-${locale}.png`, {
        fullPage: true,
        animations: "disabled",
        timeout: 15_000,
      });
    });
  }

  test("booking card is above the fold at every viewport @component", async ({ page }) => {
    await gotoHome(page, "en");
    // #book is the laptop box above 1080px and the one-line bar at 1080px and under (26.4 D-01).
    const box = await page.locator("#book").boundingBox();
    expect(box).toBeTruthy();
    const viewport = page.viewportSize();
    expect(viewport).toBeTruthy();
    expect(box!.y).toBeLessThan(viewport!.height);
    expect(box!.y + box!.height).toBeGreaterThan(0);
  });

  test("the live sections appear in the mock order @component", async ({ page }) => {
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
    await expect(page.locator("#svc-t4")).toHaveCount(0);
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

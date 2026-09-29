// apps/web/tests/visual/legal-terms.spec.ts
import { test, expect } from "../support/test";
import { spawn, type ChildProcess } from "node:child_process";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";

const SECTION_IDS = [
  "parties",
  "scope",
  "booking",
  "price",
  "carriers",
  "passenger",
  "luggage",
  "waiting",
  "noshow",
  "changes",
  "payment",
  "complaints",
  "liability",
  "force",
  "data",
  "law",
];

const PORTS: Record<string, number> = {
  "component-1440": 4140,
  "component-1024": 4141,
  "component-768": 4142,
  "component-390": 4143,
};

let devServer: ChildProcess | null = null;
let baseURL = "";

test.describe("Terms page @component", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(90_000);
    const port = PORTS[testInfo.project.name] ?? 4149;
    baseURL = `http://localhost:${port}`;
    devServer = spawn(NEXT_BIN, ["dev", "-p", String(port)], {
      cwd: WEB_ROOT,
      stdio: "ignore",
      detached: true,
    });
    await waitForNextServer(baseURL);
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

  for (const locale of ["en", "de", "fr", "ar"] as const) {
    const path = locale === "en" ? "/terms" : `/${locale}/terms`;

    test(`screenshot ${locale} @component`, async ({ page }) => {
      await page.goto(baseURL + path);
      await expect(page.locator("main")).toBeVisible();
      await expect(page).toHaveScreenshot(`terms-${locale}.png`);
    });
  }

  test("no sideways scroll at 390 @component", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "component-390", "390 only");
    for (const path of ["/terms", "/de/terms", "/fr/terms", "/ar/terms"]) {
      await page.goto(baseURL + path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );
      expect(overflow).toBe(true);
    }
  });

  test("TOC hashes match section ids @component", async ({ page }) => {
    await page.goto(baseURL + "/terms");
    for (const id of SECTION_IDS) {
      await expect(page.locator(`#${id}`)).toHaveCount(1);
    }
    const hrefs = await page.locator("[data-lg-tl]").evaluateAll((els) =>
      els.map((el) => (el as HTMLAnchorElement).getAttribute("href")),
    );
    expect(hrefs.sort()).toEqual(SECTION_IDS.map((id) => `#${id}`).sort());
  });

  test("hreflang in raw response @component", async ({ page }) => {
    const res = await page.goto(baseURL + "/terms");
    const body = (await res?.text()) ?? "";
    expect(body).toMatch(/hreflang="en"/i);
    expect(body).toMatch(/hreflang="de"/i);
    expect(body).toMatch(/hreflang="fr"/i);
    expect(body).toMatch(/hreflang="ar"/i);
    expect(body).toMatch(/hreflang="x-default"/i);
  });

  test("rtl and English data-tok @component", async ({ page }) => {
    await page.goto(baseURL + "/ar/terms");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl"); // dir="rtl"
    const tok = await page.locator("[data-tok]").first().textContent();
    await page.goto(baseURL + "/terms");
    const tokEn = await page.locator("[data-tok]").first().textContent();
    expect(tok).toBe(tokEn);
  });

  test("print control 44px keyboard @component", async ({ page }) => {
    await page.goto(baseURL + "/terms");
    const btn = page.locator(".vt-legal-print");
    await expect(btn).toBeVisible();
    const box = await btn.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await btn.focus();
    await expect(btn).toBeFocused();
  });
});

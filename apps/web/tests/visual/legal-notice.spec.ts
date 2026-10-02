// apps/web/tests/visual/legal-notice.spec.ts
import { test, expect, type Page } from "../support/test";
import { testPort } from "../support/port";
import { spawn, type ChildProcess } from "node:child_process";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";
import { nextDevEnv } from "../support/test-stack";

let devServer: ChildProcess | null = null;
let baseURL = "";

/**
 * Opens a gallery address and waits for it to render. On the 2-core Linux runner `next dev` compiles each
 * locale's first request cold, and the 5 s default of the first assertion ran out (26.0, flaky gallery en/de,
 * red "absent under ar": element not found).
 */
async function open(page: Page, path: string): Promise<void> {
  await page.goto(baseURL + path);
  await page.locator('[data-page="imprint"]').waitFor({ timeout: 60_000 });
}

test.describe("LanguageCoverageNotice @component", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(90_000);
    const ports: Record<string, number> = {
      "component-1440": testPort(4130),
      "component-1024": testPort(4131),
      "component-768": testPort(4132),
      "component-390": testPort(4133),
    };
    const port = ports[testInfo.project.name] ?? testPort(4139);
    baseURL = `http://localhost:${port}`;
    devServer = spawn(NEXT_BIN, ["dev", "-p", String(port)], {
      cwd: WEB_ROOT,
      stdio: "ignore",
      detached: true,
      // Own build folder: with --workers=2 on the Linux runner another spec's `next dev` wrote the shared .next
      // at the same time ("__webpack_modules__[moduleId] is not a function", MODULE_NOT_FOUND, 500 on the gallery).
      env: nextDevEnv({ TEST_DIST_DIR: `.next-legal-notice-${port}` }, { gallery: true }),
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

  for (const locale of ["en", "de", "fr", "ar"] as const) {
    const path = locale === "en" ? "/dev/legal-notice" : `/${locale}/dev/legal-notice`;

    test(`gallery ${locale} @component`, async ({ page }) => {
      await open(page, path);
      await expect(page.locator("main")).toBeVisible();
      await expect(page).toHaveScreenshot(`legal-notice-${locale}.png`);
    });
  }

  // Owner 2026-10-01 (replaces 26.0 D-05): the imprint reads in all four languages.
  test("imprint notice absent under fr @component", async ({ page }) => {
    await open(page, "/fr/dev/legal-notice");
    await expect(page.locator('[data-page="imprint"]')).toHaveAttribute("data-notice", "absent");
    await expect(page.locator('[data-page="terms"]')).toHaveAttribute("data-notice", "absent");
    await expect(page.locator('[data-page="privacy"]')).toHaveAttribute("data-notice", "absent");
    await expect(page.locator('[data-page="cookies"]')).toHaveAttribute("data-notice", "absent");
    await expect(page.locator('[data-page="cancellation"]')).toHaveAttribute("data-notice", "absent");
  });

  test("imprint notice absent under ar @component", async ({ page }) => {
    await open(page, "/ar/dev/legal-notice");
    await expect(page.locator('[data-page="imprint"]')).toHaveAttribute("data-notice", "absent");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl"); // dir="rtl"
  });

  test("imprint notice absent under en and de @component", async ({ page }) => {
    await open(page, "/dev/legal-notice");
    await expect(page.locator('[data-page="imprint"]')).toHaveAttribute("data-notice", "absent");
    await open(page, "/de/dev/legal-notice");
    await expect(page.locator('[data-page="imprint"]')).toHaveAttribute("data-notice", "absent");
  });
});

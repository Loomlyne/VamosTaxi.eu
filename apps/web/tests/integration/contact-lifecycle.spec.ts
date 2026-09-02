import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { waitForNextServer, WEB_ROOT } from "../support/server-harness";

const PORT = 4260;
const LOCALES = ["en", "de", "fr", "ar"] as const;
const LOCAL_NEXT = join(WEB_ROOT, "node_modules", ".bin", "next");
const MAIN_NEXT = join(WEB_ROOT, "..", "..", "..", "..", "apps", "web", "node_modules", ".bin", "next");
const NEXT_BIN = existsSync(LOCAL_NEXT) ? LOCAL_NEXT : MAIN_NEXT;

let devServer: ChildProcess | null = null;
const baseURL = `http://localhost:${PORT}`;

type TurnstileHarness = {
  renders: number;
  removes: number;
  resets: number;
  solve: (id: string) => void;
};

async function gotoContact(page: Page, locale: (typeof LOCALES)[number]) {
  await page.addInitScript((lang) => localStorage.setItem("vamosLang", lang), locale);
  await page.goto(`${baseURL}${locale === "en" ? "" : `/${locale}`}/contact`, { timeout: 60_000 });
  await page.evaluate((lang) => {
    localStorage.setItem("vamosLang", lang);
    (window as Window & typeof globalThis & { VamosLocale?: { setLang: (value: string) => void } })
      .VamosLocale?.setLang(lang);
  }, locale);
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await page.waitForTimeout(400);
}

async function fillValidContact(page: Page) {
  await page.locator("#ct-name").fill("Ada Lovelace");
  await page.locator("#ct-email").fill("ada@example.com");
  await page.locator("#ct-msg").fill("Please move my pickup two hours later than booked.");
}

async function turnstileState(page: Page): Promise<TurnstileHarness | undefined> {
  return page.evaluate(() => (
    window as Window & typeof globalThis & { __vtTurnstileTest?: TurnstileHarness }
  ).__vtTurnstileTest);
}

test.describe("Contact lifecycle @integration", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(240_000);
    const distDir = "test-results/.next-contact-lifecycle";
    rmSync(join(WEB_ROOT, distDir), { recursive: true, force: true });
    devServer = spawn(NEXT_BIN, ["dev", "-p", String(PORT)], {
      cwd: WEB_ROOT,
      stdio: "ignore",
      detached: true,
      env: {
        ...process.env,
        TEST_DIST_DIR: distDir,
        TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
      },
    });
    await waitForNextServer(baseURL, 180_000);
  });

  test.afterAll(() => {
    if (devServer?.pid) {
      try {
        process.kill(-devServer.pid, "SIGTERM");
      } catch {
        /* already exited */
      }
    }
    devServer = null;
  });

  test.beforeEach(async ({ page }) => {
    await page.route("https://challenges.cloudflare.com/**", async (route) => {
      if (!route.request().url().includes("api.js")) {
        await route.abort();
        return;
      }
      await route.fulfill({
        contentType: "application/javascript",
        body: `(()=>{const callbacks={};let next=0;window.__vtTurnstileTest={renders:0,removes:0,resets:0,solve(id){callbacks[id]?.("XXXX.DUMMY.TOKEN."+id);}};window.turnstile={render(el,opts){const id="w"+(++next);callbacks[id]=opts?.callback;window.__vtTurnstileTest.renders++;window.__vtTurnstileTest.solve(id);return id;},remove(id){delete callbacks[id];window.__vtTurnstileTest.removes++;},reset(){window.__vtTurnstileTest.resets++;}};})();`,
      });
    });
  });

  test("served contact routes accept only HTTP 200 { ok: true } and remount a fresh challenge", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "component-1440", "run route semantics once");

    for (const locale of LOCALES) {
      const failedBodies: Array<Record<string, unknown>> = [];
      await page.route("**/api/contact", async (route) => {
        failedBodies.push(route.request().postDataJSON() as Record<string, unknown>);
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ ok: true }),
        });
      });
      await gotoContact(page, locale);
      await fillValidContact(page);
      await page.locator('form button[type="submit"]').click();
      await expect(page.getByRole("alert").last()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole("status")).toHaveCount(0);
      await expect.poll(() => turnstileState(page)).toMatchObject({ resets: 1 });
      expect(failedBodies).toHaveLength(1);
      expect(failedBodies[0]?.locale).toBe(locale);
      await page.unroute("**/api/contact");

      const acceptedBodies: Array<Record<string, unknown>> = [];
      await page.route("**/api/contact", async (route) => {
        acceptedBodies.push(route.request().postDataJSON() as Record<string, unknown>);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true }),
        });
      });
      await gotoContact(page, locale);
      await fillValidContact(page);
      await page.locator('form button[type="submit"]').click();
      const accepted = page.getByRole("status");
      await expect(accepted).toBeVisible({ timeout: 10_000 });
      expect(acceptedBodies).toHaveLength(1);
      expect(acceptedBodies[0]?.locale).toBe(locale);

      await page.unroute("**/api/contact");
    }
  });

  test("a successful contact reset clears its current Turnstile widget before remounting", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "component-1440", "run lifecycle once");

    const bodies: Array<Record<string, unknown>> = [];
    await page.route("**/api/contact", async (route) => {
      bodies.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });
    await gotoContact(page, "en");
    await fillValidContact(page);
    await page.locator('form button[type="submit"]').click();
    const accepted = page.getByRole("status");
    await expect(accepted).toBeVisible({ timeout: 10_000 });
    expect(bodies).toHaveLength(1);
    expect(bodies[0]?.locale).toBe("en");

    await accepted.locator("button").first().click();
    await expect(page.locator("#ct-turnstile")).toBeAttached({ timeout: 10_000 });
    await expect.poll(() => turnstileState(page)).toMatchObject({ removes: 1 });
  });
});

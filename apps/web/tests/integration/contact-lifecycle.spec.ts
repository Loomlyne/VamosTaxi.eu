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
  executes: number;
  executeTarget: string;
  removes: number;
  resets: number;
  callbackType?: string;
  liveWidget: string;
  solve: (id: string) => void;
  solveStale: (id: string) => void;
};

type TestTurnstileApi = {
  render: (element: string, options: { callback?: (token: string) => void }) => string;
  execute: (target: string) => void;
  remove: (id: string) => void;
  reset: (id: string) => void;
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

async function solveTurnstile(page: Page) {
  await page.evaluate(() => {
    const harness = (
      window as Window & typeof globalThis & { __vtTurnstileTest?: TurnstileHarness }
    ).__vtTurnstileTest;
    harness?.solve(harness.liveWidget || "w1");
  });
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
    await page.addInitScript(() => {
      const live: Record<string, ((token: string) => void) | undefined> = {};
      const retained: Record<string, ((token: string) => void) | undefined> = {};
      let next = 0;
      const harness = {
        renders: 0, executes: 0, executeTarget: "", removes: 0, resets: 0, callbackType: "", liveWidget: "",
        solve(id: string) { live[id]?.(`XXXX.DUMMY.TOKEN.${id}`); },
        solveStale(id: string) { retained[id]?.(`XXXX.DUMMY.TOKEN.${id}`); },
      };
      (window as Window & typeof globalThis & { __vtTurnstileTest?: TurnstileHarness }).__vtTurnstileTest = harness;
      (window as unknown as { turnstile: TestTurnstileApi }).turnstile = {
        render(_element: string, options: { callback?: (token: string) => void }) {
          const id = `w${++next}`;
          live[id] = options?.callback;
          retained[id] = options?.callback;
          harness.liveWidget = id;
          harness.callbackType = typeof live[id];
          harness.renders += 1;
          return id;
        },
        execute(target: string) { harness.executes += 1; harness.executeTarget = target; },
        remove(id: string) { delete live[id]; if (harness.liveWidget === id) harness.liveWidget = ""; harness.removes += 1; },
        reset(_id: string) { harness.resets += 1; },
      };
    });
    await page.route("https://challenges.cloudflare.com/**", async (route) => {
      await route.fulfill({ contentType: "application/javascript", body: "void 0;" });
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
      await expect.poll(() => turnstileState(page)).toMatchObject({ executes: 1, executeTarget: "#ct-turnstile" });
      expect(failedBodies).toHaveLength(0);
      await expect.poll(() => turnstileState(page)).toMatchObject({ callbackType: "function" });
      await solveTurnstile(page);
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
      await expect.poll(() => turnstileState(page)).toMatchObject({ executes: 1, executeTarget: "#ct-turnstile" });
      expect(acceptedBodies).toHaveLength(0);
      await solveTurnstile(page);
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
    await expect.poll(() => turnstileState(page)).toMatchObject({ executes: 1, executeTarget: "#ct-turnstile" });
    await solveTurnstile(page);
    const accepted = page.getByRole("status");
    await expect(accepted).toBeVisible({ timeout: 10_000 });
    expect(bodies).toHaveLength(1);
    expect(bodies[0]?.locale).toBe("en");

    await accepted.locator("button").first().click();
    await expect(page.locator("#ct-turnstile")).toBeAttached({ timeout: 10_000 });
    await expect.poll(() => turnstileState(page)).toMatchObject({ removes: 1 });
  });

  test("a second submit while sending does not execute or send again", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "component-1440", "run lifecycle once");

    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const bodies: Array<Record<string, unknown>> = [];
    await page.route("**/api/contact", async (route) => {
      bodies.push(route.request().postDataJSON() as Record<string, unknown>);
      await gate;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });
    await gotoContact(page, "en");
    await fillValidContact(page);
    await page.locator('form button[type="submit"]').click();
    await expect.poll(() => turnstileState(page)).toMatchObject({ executes: 1, executeTarget: "#ct-turnstile" });
    await page.locator('form button[type="submit"]').click();
    await expect.poll(() => turnstileState(page)).toMatchObject({ executes: 1 });
    await solveTurnstile(page);
    await expect.poll(() => bodies.length).toBe(1);
    await page.locator("form").evaluate((form) => (form as HTMLFormElement).requestSubmit());
    await expect.poll(() => turnstileState(page)).toMatchObject({ executes: 1 });
    expect(bodies).toHaveLength(1);
    release();
    await expect(page.getByRole("status")).toBeVisible({ timeout: 10_000 });
    expect(bodies).toHaveLength(1);
  });

  test("a duplicate Turnstile success callback sends only one request", async ({ page }, testInfo) => {
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
    await expect.poll(() => turnstileState(page)).toMatchObject({ executes: 1, executeTarget: "#ct-turnstile" });
    await solveTurnstile(page);
    await solveTurnstile(page);
    await expect(page.getByRole("status")).toBeVisible({ timeout: 10_000 });
    expect(bodies).toHaveLength(1);
    await expect(page.getByRole("status")).toBeVisible();
  });

  test("a stale callback from a removed widget does not send or mutate the next challenge", async ({ page }, testInfo) => {
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
    await expect.poll(() => turnstileState(page)).toMatchObject({ executes: 1, executeTarget: "#ct-turnstile" });
    await solveTurnstile(page);
    const accepted = page.getByRole("status");
    await expect(accepted).toBeVisible({ timeout: 10_000 });
    expect(bodies).toHaveLength(1);
    const staleId = (await turnstileState(page))?.liveWidget ?? "w1";
    await accepted.locator("button").first().click();
    await expect(page.locator("#ct-turnstile")).toBeAttached({ timeout: 10_000 });
    await expect.poll(() => turnstileState(page)).toMatchObject({ removes: 1 });
    await page.evaluate((id) => (
      window as Window & typeof globalThis & { __vtTurnstileTest?: TurnstileHarness }
    ).__vtTurnstileTest?.solveStale(id), staleId);
    expect(bodies).toHaveLength(1);
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect.poll(() => turnstileState(page)).toMatchObject({ executes: 1 });
  });
});

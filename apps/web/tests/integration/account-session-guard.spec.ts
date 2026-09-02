import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";

const RUN_PROJECT = "component-1440";
const PORT = 4290;

let devServer: ChildProcess | null = null;
let baseURL = "";

async function seedCachedAuth(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (location.pathname === "/account") {
      localStorage.setItem(
        "vamosAuth",
        JSON.stringify({ firstName: "Stale", lastName: "Customer", email: "stale@example.com" }),
      );
    }
  });
}

async function expectSignedOut(page: Page): Promise<void> {
  await expect(page).toHaveURL(`${baseURL}/sign-in`);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("vamosAuth")))
    .toBeNull();
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
  test.skip(
    testInfo.project.name !== RUN_PROJECT,
    "Behavioural, not visual — runs once under component-1440.",
  );
});

test.describe("account session guard", () => {
  test.describe.configure({ mode: "serial" });

  test("signed-out snapshot clears stale local auth and redirects", async ({ page }) => {
    await seedCachedAuth(page);
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({ json: { signedIn: false, displayName: null, emailConfirmed: false } }),
    );

    await page.goto(`${baseURL}/account`);
    await expectSignedOut(page);
  });

  test("unavailable snapshot clears stale local auth and redirects", async ({ page }) => {
    await seedCachedAuth(page);
    await page.route("**/api/auth/session", (route) => route.abort("failed"));

    await page.goto(`${baseURL}/account`);
    await expectSignedOut(page);
  });

  test("server session replaces mismatched cached account identity", async ({ page }) => {
    await seedCachedAuth(page);
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({
        json: {
          signedIn: true,
          displayName: "Grace Rider",
          email: "grace.rider@example.com",
          emailConfirmed: true,
        },
      }),
    );

    await page.goto(`${baseURL}/account`);
    await expect
      .poll(() =>
        page.evaluate(() => JSON.parse(localStorage.getItem("vamosAuth") ?? "null")),
      )
      .toMatchObject({
        firstName: "Grace",
        lastName: "Rider",
        email: "grace.rider@example.com",
        emailVerified: true,
      });
  });

  test("expired save clears local auth and redirects instead of showing a generic error", async ({ page }) => {
    await seedCachedAuth(page);
    await page.route("**/api/auth/session", (route) =>
      route.fulfill({ json: { signedIn: true, displayName: "Grace Rider", emailConfirmed: true } }),
    );
    await page.route("**/api/auth", (route) =>
      route.fulfill({ json: { ok: false, reason: "no-user" } }),
    );

    await page.goto(`${baseURL}/account`);
    await page.getByRole("button", { name: "Change" }).first().click();
    await page.getByLabel("First name").fill("Grace");
    await page.getByLabel("Last name").fill("Rider");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expectSignedOut(page);
  });
});

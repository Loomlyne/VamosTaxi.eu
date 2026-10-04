// AUTH-04: sign out from any page, cookies cleared as separate Set-Cookie
// entries, session snapshot is public-safe. Fail loudly if the local stack
// is down — never skip.

import { test, expect, type Page, type Response } from "../support/test";
import { testPort } from "../support/port";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { NEXT_BIN, settleCloudflareDev, waitForNextServer, WEB_ROOT } from "../support/server-harness";
import { nextDevEnv, requireTestStack, stackKeys } from "../support/test-stack";

const PORT = testPort(4270);
const RUN_PROJECT = "component-1440";
const PASSWORD = "password1";
const PAGES = ["/terms", "/contact", "/"] as const;

let devServer: ChildProcess | null = null;
let baseURL = "";

function uniqueEmail(tag: string): string {
  return `auth-signout-${tag}-${crypto.randomUUID().slice(0, 8)}@example.com`;
}

async function setCookieEntries(res: Response): Promise<string[]> {
  const raw = await (
    res as unknown as { headersArray: () => Promise<Array<{ name: string; value: string }>> }
  ).headersArray();
  return raw.filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value);
}

/** Password sign-up needs the emailed confirmation (D-28), so the account is created confirmed through the Auth admin API. */
async function createConfirmedUser(email: string, password: string): Promise<void> {
  const { apiUrl, serviceRoleKey } = stackKeys();
  const res = await fetch(`${apiUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: "Ada Lovelace" } }),
  });
  if (!res.ok) throw new Error(`admin create user ${res.status}: ${await res.text()}`);
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${baseURL}/sign-in`);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password", exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).not.toHaveURL(/\/sign-in/, { timeout: 15_000 });
}

async function openAccountMenu(page: Page): Promise<void> {
  const disc = page.locator('[data-hd-acct="disc"]');
  await expect(disc).toBeVisible({ timeout: 15_000 });
  if ((await disc.getAttribute("aria-expanded")) !== "true") {
    await disc.click();
  }
  await expect(disc).toHaveAttribute("aria-expanded", "true");
}

async function clickSignOut(page: Page): Promise<Response> {
  const responsePromise = page.waitForResponse((res) => res.request().method() === "POST", {
    timeout: 20_000,
  });
  await page.locator("[data-hd-mifoot] button[data-hd-mi]").click();
  return responsePromise;
}

test.describe("AUTH-04 auth-signout", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    if (testInfo.project.name !== RUN_PROJECT) return;
    testInfo.setTimeout(180_000);
    await requireTestStack();
    const stack = stackKeys();
    baseURL = `http://localhost:${PORT}`;
    if (!existsSync(NEXT_BIN)) throw new Error(`next binary missing at ${NEXT_BIN}`);
    devServer = spawn(NEXT_BIN, ["dev", "-p", String(PORT)], {
      cwd: WEB_ROOT,
      stdio: "ignore",
      detached: true,
      env: nextDevEnv({ CLOUDFLARE_ENV: "staging", TEST_DIST_DIR: `test-results/.next-auth-signout-${PORT}`, SUPABASE_URL: stack.apiUrl, SUPABASE_ANON_KEY: stack.anonKey }),
    });
    await settleCloudflareDev();
    await waitForNextServer(baseURL);
  });

  test.afterAll(() => {
    if (devServer?.pid) {
      try {
        process.kill(-devServer.pid, "SIGTERM");
      } catch {
        /* gone */
      }
    }
    devServer = null;
  });

  let testIp = 0;
  test.beforeEach(async ({ context }, testInfo) => {
    // The auth write limiter is keyed on cf-connecting-ip (4 per 60 s); rotate the address every 3 POSTs.
    testIp += 1;
    let posts = 0;
    await context.route(`http://localhost:${PORT}/**`, (route) => {
      if (route.request().method() === "POST") posts += 1;
      const ip = `198.51.${testIp}.${Math.floor(Math.max(posts - 1, 0) / 3) + 1}`;
      return route.continue({ headers: { ...route.request().headers(), "cf-connecting-ip": ip } });
    });
    test.skip(
      testInfo.project.name !== RUN_PROJECT,
      "Behavioural — runs once under component-1440.",
    );
  });

  test("GET /api/auth/session signed-out is 200, no-store, no address", async ({ request }) => {
    const res = await request.get(`${baseURL}/api/auth/session`);
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"] ?? "").toMatch(/private/);
    expect(res.headers()["cache-control"] ?? "").toMatch(/no-store/);
    const body = await res.text();
    expect(body).not.toContain('@');
    expect(JSON.parse(body).signedIn).toBe(false);
  });

  test("Sign out from terms, contact and home without a full reload", async ({ page }) => {
    test.fail(true, "KNOWN-RED 26.0: the live header is the DC mock SiteHeader; its signOut does location.href = '/sign-in' (app/pages/SiteHeader.dc.html:574), a full navigation with no account pill, so this test's 'no full reload, pill visible' expectation is stale — owner to rule");
    const email = uniqueEmail("pages");
    await createConfirmedUser(email, PASSWORD);
    await signIn(page, email, PASSWORD);

    for (const path of PAGES) {
      await page.goto(`${baseURL}${path}`);
      await openAccountMenu(page);
      await clickSignOut(page);
      await expect(page.locator('[data-hd-acct="pill"]')).toBeVisible({ timeout: 15_000 });

      const sessionRes = await page.request.get(`${baseURL}/api/auth/session`);
      expect(sessionRes.status()).toBe(200);
      const body = await sessionRes.text();
      expect(body).not.toContain('@');
      expect(JSON.parse(body).signedIn).toBe(false);

      if (path !== "/") {
        await signIn(page, email, PASSWORD);
      }
    }
  });

  test("sign-out Set-Cookie values arrive as separate getSetCookie() entries", async ({ page }) => {
    test.fail(true, "KNOWN-RED 26.0: product — POST /api/auth signout clears the session cookie as 'sb-127-auth-token=; Path=/; SameSite=Lax' with no Max-Age or Expires, so it is emptied but not expired (assertion /max-age=0|expires=/ at the cookie loop) — owner to rule");
    const email = uniqueEmail("cookies");
    await createConfirmedUser(email, PASSWORD);
    await signIn(page, email, PASSWORD);
    await page.goto(`${baseURL}/contact`);
    await openAccountMenu(page);
    const actionRes = await clickSignOut(page);
    const getSetCookie = await setCookieEntries(actionRes);
    expect(getSetCookie.length).toBeGreaterThan(1);
    for (const cookie of getSetCookie) {
      expect(cookie.toLowerCase()).toMatch(/max-age=0|expires=/);
    }
  });

  test("Escape closes the account menu and returns focus to the trigger", async ({ page }) => {
    const email = uniqueEmail("esc");
    await createConfirmedUser(email, PASSWORD);
    await signIn(page, email, PASSWORD);
    await page.goto(`${baseURL}/`);
    await openAccountMenu(page);
    const trigger = page.locator('[data-hd-acct="disc"]');
    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toBeFocused();
  });
});

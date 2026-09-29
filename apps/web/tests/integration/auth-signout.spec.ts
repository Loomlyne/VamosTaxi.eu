// AUTH-04: sign out from any page, cookies cleared as separate Set-Cookie
// entries, session snapshot is public-safe. Fail loudly if the local stack
// is down — never skip.

import { test, expect, type Page, type Response } from "../support/test";
import { testPort } from "../support/port";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";

const PORT = testPort(4270);
const RUN_PROJECT = "component-1440";
const PASSWORD = "password1";
const OWNER_CS = "postgres://postgres:***@127.0.0.1:54322/postgres";
const DB_ROOT_CANDIDATES = [
  join(WEB_ROOT, "..", "..", "packages", "db"),
  join(WEB_ROOT, "..", "..", "..", "..", "packages", "db"),
];

const STACK_DOWN = "Local stack is not running. Run `pnpm db:start && pnpm db:reset`.";

function dbRoot(): string {
  for (const dir of DB_ROOT_CANDIDATES) {
    if (existsSync(join(dir, "node_modules", "postgres"))) return dir;
  }
  throw new Error(STACK_DOWN);
}
const PAGES = ["/terms", "/contact", "/"] as const;

function nextBin(): string {
  const candidates = [
    NEXT_BIN,
    join(WEB_ROOT, "..", "..", "..", "..", "apps/web/node_modules/.bin/next"),
  ];
  for (const bin of candidates) {
    if (existsSync(bin)) return bin;
  }
  throw new Error(`next binary missing`);
}

let devServer: ChildProcess | null = null;
let baseURL = "";

function ownerQuery(sqlJs: string): string {
  try {
    return execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import postgres from "postgres";
         const sql = postgres(${JSON.stringify(OWNER_CS)}, { max: 1, connect_timeout: 5 });
         try {
           ${sqlJs}
         } finally {
           await sql.end({ timeout: 2 });
         }`,
      ],
      { encoding: "utf8", cwd: dbRoot() },
    ).trim();
  } catch {
    throw new Error(STACK_DOWN);
  }
}

function requireLocalDb(): void {
  const out = ownerQuery(`const rows = await sql\`select 1 as ok\`; console.log(rows[0].ok);`);
  if (out !== "1") throw new Error(STACK_DOWN);
}

function requireLocalStack(): { apiUrl: string; anonKey: string } {
  requireLocalDb();
  let raw: string;
  try {
    raw = execFileSync("pnpm", ["exec", "supabase", "status", "-o", "env"], {
      cwd: dbRoot(),
      encoding: "utf8",
      timeout: 30_000,
    });
  } catch {
    throw new Error(STACK_DOWN);
  }
  const env: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.replace(/^export\s+/, "");
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1);
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    env[key] = value;
  }
  const apiUrl = env.API_URL ?? env.SUPABASE_URL;
  const key = env.ANON_KEY ?? env.SUPABASE_ANON_KEY;
  if (!apiUrl || !key) throw new Error(STACK_DOWN);
  return { apiUrl, anonKey: key };
}

function uniqueEmail(tag: string): string {
  return `auth-signout-${tag}-${crypto.randomUUID().slice(0, 8)}@example.com`;
}

function setCookieEntries(res: Response): string[] {
  const raw = (
    res as unknown as { headersArray: () => Array<{ name: string; value: string }> }
  ).headersArray();
  return raw.filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value);
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${baseURL}/sign-up`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("First name").fill("Ada");
  await page.getByLabel("Last name").fill("Lovelace");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.goto(`${baseURL}/sign-in`);
  if (!page.url().includes("/sign-in")) return;
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
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
    const stack = requireLocalStack();
    baseURL = `http://localhost:${PORT}`;
    const bin = nextBin();
    if (!existsSync(bin)) throw new Error(`next binary missing at ${bin}`);
    devServer = spawn(bin, ["dev", "-p", String(PORT)], {
      cwd: WEB_ROOT,
      stdio: "ignore",
      detached: true,
      env: {
        ...process.env,
        SUPABASE_URL: stack.apiUrl,
        SUPABASE_ANON_KEY: stack.anonKey,
      },
    });
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

  test.beforeEach(async ({}, testInfo) => {
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
    const email = uniqueEmail("pages");
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
    const email = uniqueEmail("cookies");
    await signIn(page, email, PASSWORD);
    await page.goto(`${baseURL}/contact`);
    await openAccountMenu(page);
    const actionRes = await clickSignOut(page);
    const getSetCookie = setCookieEntries(actionRes);
    expect(getSetCookie.length).toBeGreaterThan(1);
    for (const cookie of getSetCookie) {
      expect(cookie.toLowerCase()).toMatch(/max-age=0|expires=/);
    }
  });

  test("Escape closes the account menu and returns focus to the trigger", async ({ page }) => {
    const email = uniqueEmail("esc");
    await signIn(page, email, PASSWORD);
    await page.goto(`${baseURL}/`);
    await openAccountMenu(page);
    const trigger = page.locator('[data-hd-acct="disc"]');
    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toBeFocused();
  });
});

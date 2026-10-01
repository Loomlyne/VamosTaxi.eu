// AUTH-01 / AUTH-02 / AUTH-03 against a real next dev and local Supabase.
// Fail loudly if the stack is down — never skip.
// Queries go through a child process so this file never imports `postgres`
// (D-10 / apps/web restricted-imports).

import { test, expect, type Page } from "../support/test";
import { testPort } from "../support/port";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { NEXT_BIN, settleCloudflareDev, waitForNextServer, WEB_ROOT } from "../support/server-harness";
import { mailUrl, nextDevEnv, ownerDbUrl, REPO_ROOT, requireTestStack, stackKeys } from "../support/test-stack";
import { join } from "node:path";
import { devBindingEnv, ownClientIpHeaders, supabaseStatusArgs, waitForDevBindings, warmAuthPages } from "../support/dev-binding";
import deMessages from "../../i18n/messages/de.json";

const RUN_PROJECT = "component-1440";
const PORT = 4250;
const PASSWORD = "password1";
const NEW_PASSWORD = "password2";
const DB_ROOT = join(WEB_ROOT, "..", "..", "packages", "db");
const STACK_DOWN = "Local stack is not running. Run `pnpm db:start && pnpm db:reset`.";

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
         const sql = postgres(${JSON.stringify(ownerDbUrl())}, { max: 1, connect_timeout: 5 });
         try {
           ${sqlJs}
         } finally {
           await sql.end({ timeout: 2 });
         }`,
      ],
      {
        encoding: "utf8",
        cwd: DB_ROOT,
        env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1", NODE_DISABLE_COLORS: "1" },
      },
    )
      .replace(/\u001b\[[0-9;]*m/g, "")
      .trim();
  } catch {
    throw new Error(STACK_DOWN);
  }
}

function requireLocalDb(): void {
  const out = ownerQuery(`const rows = await sql\`select 1 as ok\`; console.log(String(rows[0].ok));`);
  if (out !== "1") {
    throw new Error(STACK_DOWN);
  }
}

function requireLocalStack(): { apiUrl: string; anonKey: string } {
  requireLocalDb();
  let raw: string;
  try {
    raw = execFileSync("pnpm", supabaseStatusArgs(), {
      cwd: DB_ROOT,
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

async function waitForMail(
  address: string,
  afterIso: string,
  timeoutMs = 25_000,
): Promise<{ html: string; text: string }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const search = await fetch(`${mailUrl()}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`);
    if (search.ok) {
      const data = (await search.json()) as {
        messages?: Array<{ ID: string; Created: string }>;
      };
      const hit = (data.messages ?? []).find((m) => !afterIso || m.Created >= afterIso);
      if (hit?.ID) {
        const msg = await fetch(`${mailUrl()}/api/v1/message/${hit.ID}`);
        if (msg.ok) {
          const body = (await msg.json()) as { HTML?: string; Text?: string };
          return { html: body.HTML ?? "", text: body.Text ?? "" };
        }
      }
    }
    const local = address.split("@")[0] ?? address;
    const ib = await fetch(`${mailUrl()}/api/v1/mailbox/${encodeURIComponent(local)}`);
    if (ib.ok) {
      const list = (await ib.json()) as Array<{ id?: string }>;
      const last = list.at(-1);
      if (last?.id) {
        const msg = await fetch(`${mailUrl()}/api/v1/mailbox/${encodeURIComponent(local)}/${last.id}`);
        if (msg.ok) {
          const body = (await msg.json()) as { body?: { html?: string; text?: string }; html?: string; text?: string };
          return {
            html: body.body?.html ?? body.html ?? "",
            text: body.body?.text ?? body.text ?? "",
          };
        }
      }
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`No auth email for ${address} at ${mailUrl()} (Mailpit/Inbucket).`);
}

function extractLinks(html: string, text: string): string[] {
  const blob = `${html}\n${text}`;
  return [...blob.matchAll(/https?:\/\/[^\s"'<>\\]+/g)].map((m) => m[0].replace(/&amp;/g, "&"));
}

function extractCode(html: string, text: string): string {
  const match = `${text}\n${html}`.match(/\b(\d{6})\b/);
  if (!match?.[1]) throw new Error("Mail catcher message had no 6-digit OTP.");
  return match[1];
}

function uniqueEmail(tag: string): string {
  return `auth-flows-${tag}-${crypto.randomUUID().slice(0, 8)}@example.com`;
}

async function fillSignup(page: Page, email: string, first: string, last: string, password: string) {
  // The page re-renders once its scripts have loaded; fields filled before that are cleared.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("First name").fill(first);
  await page.getByLabel("Last name").fill(last);
  await page.getByRole("textbox", { name: "Password" }).fill(password);
  await tickAccountNotice(page);
}

/** Sign-up needs the account notice ticked (27-16). The design-system input is hidden; its box takes the click. */
async function tickAccountNotice(page: Page) {
  const box = page.locator("[data-af-consent] .vt-check__box");
  await expect(box).toBeVisible({ timeout: 30_000 });
  if (!(await page.locator('[data-af-consent] input[type="checkbox"]').isChecked())) await box.click();
}

function customerRow(email: string): { user_id: string | null; full_name: string | null; n: number } {
  const out = ownerQuery(
    `const email = ${JSON.stringify(email)};
     const rows = await sql\`select user_id::text, full_name from public.customers where email = \${email}\`;
     console.log(JSON.stringify({ n: rows.length, user_id: rows[0]?.user_id ?? null, full_name: rows[0]?.full_name ?? null }));`,
  );
  return JSON.parse(out) as { user_id: string | null; full_name: string | null; n: number };
}

function userLocale(email: string): string | null {
  const out = ownerQuery(
    `const email = ${JSON.stringify(email)};
     const rows = await sql\`select raw_user_meta_data from auth.users where email = \${email}\`;
     console.log(JSON.stringify(rows[0]?.raw_user_meta_data ?? null));`,
  );
  const meta = JSON.parse(out) as { locale?: string } | null;
  return meta?.locale ?? null;
}

function userMetadata(email: string): Record<string, unknown> {
  const out = ownerQuery(
    `const email = ${JSON.stringify(email)};
     const rows = await sql\`select raw_user_meta_data from auth.users where email = \${email}\`;
     console.log(JSON.stringify(rows[0]?.raw_user_meta_data ?? {}));`,
  );
  return JSON.parse(out) as Record<string, unknown>;
}

test.describe("AUTH-01 AUTH-02 AUTH-03 auth-flows", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    if (testInfo.project.name !== RUN_PROJECT) return;
    testInfo.setTimeout(180_000);
    await requireTestStack();
    const stack = stackKeys();
    baseURL = `http://localhost:${PORT}`;
    devServer = spawn(NEXT_BIN, ["dev", "-p", String(PORT)], {
      cwd: WEB_ROOT,
      stdio: "ignore",
      detached: true,
      env: {
        ...process.env,
        ...devBindingEnv(),
        SUPABASE_URL: stack.apiUrl,
        SUPABASE_ANON_KEY: stack.anonKey,
      },
    });
    await settleCloudflareDev();
    await waitForNextServer(baseURL);
    await waitForDevBindings(baseURL);
    await warmAuthPages(baseURL);
  });

  test.beforeEach(async ({ context }, testInfo) => {
    test.skip(testInfo.project.name !== RUN_PROJECT);
    await context.setExtraHTTPHeaders(ownClientIpHeaders());
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

  test("AUTH-01 password signup stays unverified until the emailed link", async ({ page, context }) => {
    const email = uniqueEmail("pw");
    const after = new Date(Date.now() - 1000).toISOString();
    await page.goto(`${baseURL}/sign-up`);
    await fillSignup(page, email, "Ada", "Lovelace", PASSWORD);
    await page.getByRole("button", { name: "CREATE ACCOUNT" }).click();
    await expect(page.locator("[data-af]")).toContainText("Send another link");

    await page.goto(`${baseURL}/sign-in`);
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

    const mail = await waitForMail(email, after);
    const link = extractLinks(mail.html, mail.text).find(
      (u) => u.includes("token") || u.includes("code=") || u.includes("/api/auth/callback"),
    );
    expect(link, "confirmation link in mail").toBeTruthy();
    await page.goto(link!);
    await page.waitForURL((url) => !url.pathname.includes("/api/auth/callback"), { timeout: 15_000 });

    const session = await page.request.get(`${baseURL}/api/auth/session`);
    expect(session.ok()).toBe(true);
    expect((await session.json()).signedIn).toBe(true);

    const row = customerRow(email);
    expect(row.n).toBe(1);
    expect(row.user_id).toBeTruthy();
    expect(row.full_name).toBe("Ada Lovelace");

    await context.clearCookies();
  });

  test("AUTH-01 account name save persists metadata for a live session", async ({ page, context }) => {
    page.setDefaultTimeout(15_000);
    const email = uniqueEmail("account");
    const after = new Date(Date.now() - 1000).toISOString();
    await page.goto(`${baseURL}/sign-up`);
    await fillSignup(page, email, "Ada", "Lovelace", PASSWORD);
    await page.getByRole("button", { name: "CREATE ACCOUNT" }).click();
    await expect(page.locator("[data-af]")).toContainText("Send another link");

    const mail = await waitForMail(email, after);
    const link = extractLinks(mail.html, mail.text).find(
      (u) => u.includes("token") || u.includes("code=") || u.includes("/api/auth/callback"),
    );
    expect(link, "confirmation link in mail").toBeTruthy();
    await page.goto(link!);
    await page.waitForURL((url) => !url.pathname.includes("/api/auth/callback"), { timeout: 15_000 });

    await page.goto(`${baseURL}/account`);
    await page.waitForFunction(() => {
      const raw = localStorage.getItem("vamosAuth");
      if (!raw) return false;
      const auth = JSON.parse(raw) as { firstName?: string; lastName?: string };
      return auth.firstName === "Ada" && auth.lastName === "Lovelace";
    });
    await page.getByRole("button", { name: "Change" }).first().click();
    await page.getByLabel("First name").fill("Grace");
    await page.getByLabel("Last name").fill("Rider");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator("[data-ac-row]").filter({ hasText: "Name" })).toContainText("Grace Rider");

    expect(userMetadata(email)).toMatchObject({
      first_name: "Grace",
      last_name: "Rider",
      full_name: "Grace Rider",
    });
    await context.clearCookies();
  });

  test("AUTH-01 magic sign-in link from the mail catcher establishes a session", async ({ page, context }) => {
    page.setDefaultTimeout(15_000);
    const email = uniqueEmail("otp");
    // A confirmed sign-up account first, so the link signs in without the finish step (27.1).
    const signupAfter = new Date(Date.now() - 1000).toISOString();
    await page.goto(`${baseURL}/sign-up`);
    await fillSignup(page, email, "Ada", "Lovelace", PASSWORD);
    await page.getByRole("button", { name: "CREATE ACCOUNT" }).click();
    await expect(page.locator("[data-af]")).toContainText("Send another link");
    const confirmMail = await waitForMail(email, signupAfter);
    const confirmLink = extractLinks(confirmMail.html, confirmMail.text).find(
      (u) => u.includes("token") || u.includes("code=") || u.includes("/api/auth/callback"),
    );
    expect(confirmLink, "confirmation link in mail").toBeTruthy();
    await page.goto(confirmLink!);
    await page.waitForURL((url) => !url.pathname.includes("/api/auth/callback"), { timeout: 15_000 });
    await context.clearCookies();

    const after = new Date(Date.now() - 1000).toISOString();
    await page.goto(`${baseURL}/sign-in`);
    await page.getByRole("button", { name: "Email me a link instead" }).click();
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Email me a link" }).click();
    await expect(page.locator("[data-af]")).toContainText("Send another link");

    const mail = await waitForMail(email, after);
    const link = extractLinks(mail.html, mail.text).find(
      (url) => url.includes("token") || url.includes("code=") || url.includes("/api/auth/callback"),
    );
    expect(link, "magic sign-in link in mail").toBeTruthy();
    await page.goto(link!);
    await page.waitForURL((url) => !url.pathname.includes("/api/auth/callback"), { timeout: 15_000 });
    const session = await page.request.get(`${baseURL}/api/auth/session`);
    expect(session.ok()).toBe(true);
    expect((await session.json()).signedIn).toBe(true);
    await context.clearCookies();
  });

  test("AUTH-01 sign-in link for a new address shows the same view and makes one unconfirmed account to finish (27.1, 27 D-37)", async ({ page }) => {
    const email = uniqueEmail("newlink");
    await page.goto(`${baseURL}/sign-in`);
    await page.getByRole("button", { name: "Email me a link instead" }).click();
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Email me a link" }).click();
    await expect(page.locator("[data-af]")).toContainText("Send another link");
    const n = ownerQuery(
      `const email = ${JSON.stringify(email)};
       const rows = await sql\`select count(*)::int as n from auth.users u
         join public.account_finish_pending p on p.user_id = u.id
        where u.email = \${email} and u.email_confirmed_at is null and p.finished_at is null\`;
       console.log(String(rows[0].n));`,
    );
    expect(n).toBe("1");
  });

  test("AUTH-01 enumeration: two signups with the same address look the same", async ({ page }) => {
    const email = uniqueEmail("enum");
    await page.goto(`${baseURL}/sign-up`);
    await fillSignup(page, email, "Ada", "Lovelace", PASSWORD);
    await page.getByRole("button", { name: "CREATE ACCOUNT" }).click();
    await expect(page.locator("[data-af]")).toContainText("Send another link");
    const first = (await page.locator("[data-af]").innerText()).replace(email, "");

    await page.goto(`${baseURL}/sign-up`);
    await fillSignup(page, email, "Ada", "Lovelace", PASSWORD);
    await page.getByRole("button", { name: "CREATE ACCOUNT" }).click();
    await expect(page.locator("[data-af]")).toContainText("Send another link");
    const second = (await page.locator("[data-af]").innerText()).replace(email, "");
    expect(second).toBe(first);
  });

  test("AUTH-02 reset password from emailed link, expired without a session", async ({ page, context }) => {
    page.setDefaultTimeout(15_000);
    const email = uniqueEmail("reset");
    await page.goto(`${baseURL}/sign-up`);
    await fillSignup(page, email, "Ada", "Lovelace", PASSWORD);
    await page.getByRole("button", { name: "CREATE ACCOUNT" }).click();
    await expect(page.locator("[data-af]")).toContainText("Send another link");
    const confirmAfter = new Date(Date.now() - 1000).toISOString();
    const confirmMail = await waitForMail(email, confirmAfter);
    const confirmLink = extractLinks(confirmMail.html, confirmMail.text).find(
      (u) => u.includes("token") || u.includes("code=") || u.includes("/api/auth/callback"),
    );
    expect(confirmLink).toBeTruthy();
    await page.goto(confirmLink!);
    await page.waitForURL((url) => !url.pathname.includes("/api/auth/callback"), { timeout: 15_000 });
    await context.clearCookies();

    await page.goto(`${baseURL}/reset-password`);
    await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();

    await page.goto(`${baseURL}/sign-in`);
    await page.getByRole("button", { name: "Forgot password?" }).click();
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.locator("[data-af]")).toContainText("Send another link");

    const resetAfter = new Date(Date.now() - 1000).toISOString();
    const resetMail = await waitForMail(email, resetAfter);
    const resetLink = extractLinks(resetMail.html, resetMail.text).find(
      (u) => u.includes("token") || u.includes("code=") || u.includes("/api/auth/callback") || u.includes("recovery"),
    );
    expect(resetLink).toBeTruthy();
    await page.goto(resetLink!);
    await page.waitForURL(/reset-password/, { timeout: 15_000 });
    await page.getByRole("textbox", { name: "New password", exact: true }).fill(NEW_PASSWORD);
    await page.getByRole("textbox", { name: "Confirm new password", exact: true }).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByRole("heading", { name: "Password updated" })).toBeVisible();

    await context.clearCookies();
    await page.goto(`${baseURL}/sign-in`);
    await page.getByLabel("Email").fill(email);
    await page.getByRole("textbox", { name: "Password", exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("That email and password don't match")).toBeVisible();

    await page.getByRole("textbox", { name: "Password", exact: true }).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).not.toHaveURL(/\/sign-in/, { timeout: 15_000 });
    await page.reload();
    await expect(page).not.toHaveURL(/\/sign-in/);
    await context.clearCookies();
  });

  test("AUTH-03 Set-Cookie folding on a real callback response", async ({ page, context }) => {
    page.setDefaultTimeout(15_000);
    const email = uniqueEmail("cookie");
    const after = new Date(Date.now() - 1000).toISOString();
    await page.goto(`${baseURL}/sign-up`);
    await fillSignup(page, email, "Ada", "Lovelace", PASSWORD);
    await page.getByRole("button", { name: "CREATE ACCOUNT" }).click();
    await expect(page.locator("[data-af]")).toContainText("Send another link");
    const mail = await waitForMail(email, after);
    const link = extractLinks(mail.html, mail.text).find(
      (u) => u.includes("token") || u.includes("code=") || u.includes("/api/auth/callback"),
    );
    expect(link).toBeTruthy();

    const callbackResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/auth/callback",
      { timeout: 15_000 },
    );
    await page.goto(link!);
    const setCookies = await (await callbackResponse).headerValues("set-cookie");
    expect(setCookies.length).toBeGreaterThan(0);
    for (const entry of setCookies) {
      const pair = entry.split(";", 1)[0] ?? "";
      expect(pair.includes("=")).toBe(true);
      expect(pair.includes(",")).toBe(false);
    }
    await context.clearCookies();
  });

  test("open redirect next=//evil.example falls back to home", async ({ page }) => {
    const email = uniqueEmail("evil1");
    const after = new Date(Date.now() - 1000).toISOString();
    await page.goto(`${baseURL}/sign-up`);
    await fillSignup(page, email, "Ada", "Lovelace", PASSWORD);
    await page.getByRole("button", { name: "CREATE ACCOUNT" }).click();
    await expect(page.locator("[data-af]")).toContainText("Send another link");
    const mail = await waitForMail(email, after);
    const link = extractLinks(mail.html, mail.text).find(
      (u) => u.includes("token") || u.includes("code=") || u.includes("/api/auth/callback"),
    );
    expect(link).toBeTruthy();

    let target = link!;
    if (!target.includes("/api/auth/callback")) {
      const bounce = await fetch(target, { redirect: "manual" });
      const location = bounce.headers.get("location");
      expect(location).toBeTruthy();
      target = location!;
    }
    const evil = new URL(target, baseURL);
    evil.searchParams.set("next", "//evil.example");
    const res = await fetch(evil.toString(), { redirect: "manual" });
    const location = res.headers.get("location") ?? "";
    expect(location).not.toContain("evil.example");
  });

  test("open redirect next=https://evil.example falls back to home", async ({ page }) => {
    const email = uniqueEmail("evil2");
    const after = new Date(Date.now() - 1000).toISOString();
    await page.goto(`${baseURL}/sign-up`);
    await fillSignup(page, email, "Ada", "Lovelace", PASSWORD);
    await page.getByRole("button", { name: "CREATE ACCOUNT" }).click();
    await expect(page.locator("[data-af]")).toContainText("Send another link");
    const mail = await waitForMail(email, after);
    const link = extractLinks(mail.html, mail.text).find(
      (u) => u.includes("token") || u.includes("code=") || u.includes("/api/auth/callback"),
    );
    expect(link).toBeTruthy();

    let target = link!;
    if (!target.includes("/api/auth/callback")) {
      const bounce = await fetch(target, { redirect: "manual" });
      const location = bounce.headers.get("location");
      expect(location).toBeTruthy();
      target = location!;
    }
    const evil = new URL(target, baseURL);
    evil.searchParams.set("next", "https://evil.example");
    const res = await fetch(evil.toString(), { redirect: "manual" });
    const location = res.headers.get("location") ?? "";
    expect(location).not.toContain("evil.example");
  });

  test("D-09 signup stores locale in raw_user_meta_data for de", async ({ page }) => {
    const email = uniqueEmail("de");
    await page.goto(`${baseURL}/de/sign-up`);
    await page.waitForFunction(() => typeof (window as Window & {
      VamosLocale?: { setLang: (locale: string) => void };
    }).VamosLocale?.setLang === "function");
    await page.evaluate(() => {
      const locale = (window as Window & {
        VamosLocale?: { setLang: (locale: string) => void };
      }).VamosLocale;
      if (!locale) throw new Error("VamosLocale did not initialise.");
      locale.setLang("de");
    });
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await page.getByLabel(deMessages.common.email).fill(email);
    await page.getByLabel(deMessages.common["first-name"]).fill("Ada");
    await page.getByLabel(deMessages.common["last-name"]).fill("Lovelace");
    await page.getByRole("textbox", { name: deMessages.common.password }).fill(PASSWORD);
    await tickAccountNotice(page);
    const response = page.waitForResponse((res) =>
      new URL(res.url()).pathname === "/api/auth" && res.request().method() === "POST",
    );
    await page.getByRole("button", { name: deMessages.common["create-an-account"] }).click();
    expect((await response).ok()).toBeTruthy();
    await expect.poll(() => userLocale(email)).toBe("de");
  });

  test("/sign-up page serves the DC auth surface (not a sitemap XML entry) (D-31)", async ({ request }) => {
    const html = await (await request.get(`${baseURL}/sign-up`)).text();
    expect(html).toContain('data-auth="1"');
    expect(html).toContain('<dc-import name="AuthForm"');

    const xml = await (await request.get(`${baseURL}/sitemap.xml`)).text();
    expect(xml).not.toContain("/sign-up");
  });
});

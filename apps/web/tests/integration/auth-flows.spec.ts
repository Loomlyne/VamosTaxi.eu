// AUTH-01 / AUTH-02 / AUTH-03 against a real next dev and local Supabase.
// Fail loudly if the stack is down — never skip.
// Queries go through a child process so this file never imports `postgres`
// (D-10 / apps/web restricted-imports).

import { test, expect, type Page } from "@playwright/test";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";
import deMessages from "../../i18n/messages/de.json";

const MAIL_URL = "http://127.0.0.1:54324";
const PORT = 4250;
const PASSWORD = "password1";
const NEW_PASSWORD = "password2";
const OWNER_CS = "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const DB_ROOT = join(WEB_ROOT, "..", "..", "packages", "db");
const STACK_DOWN = "Local stack is not running. Run `pnpm db:start && pnpm db:reset`.";

let devServer: ChildProcess | null = null;
let baseURL = "";
let supabaseUrl = "";
let anonKey = "";

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
      { encoding: "utf8", cwd: DB_ROOT },
    ).trim();
  } catch {
    throw new Error(STACK_DOWN);
  }
}

function requireLocalDb(): void {
  const out = ownerQuery(`const rows = await sql\`select 1 as ok\`; console.log(rows[0].ok);`);
  if (out !== "1") {
    throw new Error(STACK_DOWN);
  }
}

function requireLocalStack(): { apiUrl: string; anonKey: string } {
  requireLocalDb();
  let raw: string;
  try {
    raw = execFileSync("pnpm", ["exec", "supabase", "status", "-o", "env"], {
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
    const search = await fetch(`${MAIL_URL}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`);
    if (search.ok) {
      const data = (await search.json()) as {
        messages?: Array<{ ID: string; Created: string }>;
      };
      const hit = (data.messages ?? []).find((m) => !afterIso || m.Created >= afterIso);
      if (hit?.ID) {
        const msg = await fetch(`${MAIL_URL}/api/v1/message/${hit.ID}`);
        if (msg.ok) {
          const body = (await msg.json()) as { HTML?: string; Text?: string };
          return { html: body.HTML ?? "", text: body.Text ?? "" };
        }
      }
    }
    const local = address.split("@")[0] ?? address;
    const ib = await fetch(`${MAIL_URL}/api/v1/mailbox/${encodeURIComponent(local)}`);
    if (ib.ok) {
      const list = (await ib.json()) as Array<{ id?: string }>;
      const last = list.at(-1);
      if (last?.id) {
        const msg = await fetch(`${MAIL_URL}/api/v1/mailbox/${encodeURIComponent(local)}/${last.id}`);
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
  throw new Error(`No auth email for ${address} at ${MAIL_URL} (Mailpit/Inbucket).`);
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
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("First name").fill(first);
  await page.getByLabel("Last name").fill(last);
  await page.getByLabel("Password").fill(password);
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

test.describe("AUTH-01 AUTH-02 AUTH-03 auth-flows", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(180_000);
    const stack = requireLocalStack();
    supabaseUrl = stack.apiUrl;
    anonKey = stack.anonKey;
    baseURL = `http://localhost:${PORT}`;
    devServer = spawn(NEXT_BIN, ["dev", "-p", String(PORT)], {
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

  test("AUTH-01 password signup stays unverified until the emailed link", async ({ page, context }) => {
    const email = uniqueEmail("pw");
    const after = new Date(Date.now() - 1000).toISOString();
    await page.goto(`${baseURL}/sign-up`);
    await fillSignup(page, email, "Ada", "Lovelace", PASSWORD);
    await page.getByRole("button", { name: "Create an account" }).click();
    await expect(page.locator("[data-af]")).toContainText("Send a new link");

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

    await page.goto(`${baseURL}/sign-in`);
    await expect(page).not.toHaveURL(/\/sign-in/);

    const row = customerRow(email);
    expect(row.n).toBe(1);
    expect(row.user_id).toBeTruthy();
    expect(row.full_name).toBe("Ada Lovelace");

    await context.clearCookies();
  });

  test("AUTH-01 one-time code from the mail catcher establishes a session", async ({ page, context }) => {
    const email = uniqueEmail("otp");
    const after = new Date(Date.now() - 1000).toISOString();
    await page.goto(`${baseURL}/sign-in`);
    await page.locator("button.vt-af-link").first().click();
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("[data-af]")).toContainText("Send a new link");

    const mail = await waitForMail(email, after);
    const code = extractCode(mail.html, mail.text);
    expect(code).toMatch(/^\d{6}$/);

    const verify = await fetch(`${supabaseUrl}/auth/v1/verify`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type: "email", email, token: code }),
    });
    expect(verify.ok, `OTP verify ${verify.status}`).toBe(true);
    const session = (await verify.json()) as { access_token?: string };
    expect(session.access_token).toBeTruthy();
    await context.clearCookies();
  });

  test("AUTH-01 enumeration: two signups with the same address look the same", async ({ page }) => {
    const email = uniqueEmail("enum");
    await page.goto(`${baseURL}/sign-up`);
    await fillSignup(page, email, "Ada", "Lovelace", PASSWORD);
    await page.getByRole("button", { name: "Create an account" }).click();
    await expect(page.locator("[data-af]")).toContainText("Send a new link");
    const first = (await page.locator("[data-af]").innerText()).replace(email, "");

    await page.goto(`${baseURL}/sign-up`);
    await fillSignup(page, email, "Ada", "Lovelace", PASSWORD);
    await page.getByRole("button", { name: "Create an account" }).click();
    await expect(page.locator("[data-af]")).toContainText("Send a new link");
    const second = (await page.locator("[data-af]").innerText()).replace(email, "");
    expect(second).toBe(first);
  });

  test("AUTH-02 reset password from emailed link, expired without a session", async ({ page, context }) => {
    const email = uniqueEmail("reset");
    await page.goto(`${baseURL}/sign-up`);
    await fillSignup(page, email, "Ada", "Lovelace", PASSWORD);
    await page.getByRole("button", { name: "Create an account" }).click();
    await expect(page.locator("[data-af]")).toContainText("Send a new link");
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
    await page.getByRole("button", { name: "Send a new link" }).nth(1).click();
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send a new link" }).click();
    await expect(page.locator("[data-af]")).toContainText("Send a new link");

    const resetAfter = new Date(Date.now() - 1000).toISOString();
    const resetMail = await waitForMail(email, resetAfter);
    const resetLink = extractLinks(resetMail.html, resetMail.text).find(
      (u) => u.includes("token") || u.includes("code=") || u.includes("/api/auth/callback") || u.includes("recovery"),
    );
    expect(resetLink).toBeTruthy();
    await page.goto(resetLink!);
    await page.waitForURL(/reset-password/, { timeout: 15_000 });
    await page.getByLabel("Password").fill(NEW_PASSWORD);
    await page.getByLabel("Confirm new password").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByRole("heading", { name: "Password updated" })).toBeVisible();

    await context.clearCookies();
    await page.goto(`${baseURL}/sign-in`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).not.toHaveURL(/\/sign-in/, { timeout: 15_000 });
    await page.reload();
    await expect(page).not.toHaveURL(/\/sign-in/);
    await context.clearCookies();
  });

  test("AUTH-03 Set-Cookie folding on a real callback response", async ({ page, context }) => {
    const email = uniqueEmail("cookie");
    const after = new Date(Date.now() - 1000).toISOString();
    await page.goto(`${baseURL}/sign-up`);
    await fillSignup(page, email, "Ada", "Lovelace", PASSWORD);
    await page.getByRole("button", { name: "Create an account" }).click();
    await expect(page.locator("[data-af]")).toContainText("Send a new link");
    const mail = await waitForMail(email, after);
    const link = extractLinks(mail.html, mail.text).find(
      (u) => u.includes("token") || u.includes("code=") || u.includes("/api/auth/callback"),
    );
    expect(link).toBeTruthy();

    let callbackUrl = link!;
    if (!callbackUrl.includes("/api/auth/callback")) {
      const bounce = await fetch(callbackUrl, { redirect: "manual" });
      const location = bounce.headers.get("location");
      expect(location).toBeTruthy();
      callbackUrl = location!;
    }
    const res = await fetch(callbackUrl, { redirect: "manual" });
    const setCookies = res.headers.getSetCookie();
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
    await page.getByRole("button", { name: "Create an account" }).click();
    await expect(page.locator("[data-af]")).toContainText("Send a new link");
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
    await page.getByRole("button", { name: "Create an account" }).click();
    await expect(page.locator("[data-af]")).toContainText("Send a new link");
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
    await page.getByLabel(deMessages.common.email).fill(email);
    await page.getByLabel(deMessages.common["first-name"]).fill("Ada");
    await page.getByLabel(deMessages.common["last-name"]).fill("Lovelace");
    await page.getByLabel(deMessages.common.password).fill(PASSWORD);
    await page.getByRole("button", { name: deMessages.common["create-an-account"] }).click();
    await expect(page.locator("[data-af]")).toBeVisible();
    expect(userLocale(email)).toBe("de");
  });

  test("sitemap and hreflang include /sign-up", async ({ request }) => {
    const xml = await (await request.get(`${baseURL}/sitemap.xml`)).text();
    expect(xml).toContain("/sign-up");
    for (const lang of ["en", "de", "fr", "ar"]) {
      expect(xml).toMatch(new RegExp(`hreflang="${lang}"`));
    }

    const html = await (await request.get(`${baseURL}/sign-up`)).text();
    expect(html).toContain('hreflang="en"');
    expect(html).toContain('hreflang="de"');
    expect(html).toContain('hreflang="fr"');
    expect(html).toContain('hreflang="ar"');
    expect(html).toContain('hreflang="x-default"');
  });
});

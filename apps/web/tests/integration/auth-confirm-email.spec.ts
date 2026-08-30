// D-28 / 05-CONTEXT Pitfall 4: a password signup must not yield a usable
// session until the emailed confirmation is exercised.
//
// Negative control: if packages/db/supabase/config.toml has
// enable_confirmations = false (Confirm email off), the signedIn:false
// assertion after signup fails. That is the signal this spec exists to
// produce. Never skip this test. Do not edit config.toml from this spec.

import { test, expect, type Page } from "@playwright/test";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";

const MAIL_URL = "http://127.0.0.1:54324";
const PORT = 4261;
const PASSWORD = "password1";
const STACK_DOWN = "Local stack is not running. Run `pnpm db:start && pnpm db:reset`.";
const MAIN_NEXT = join("/Users/koss/Developer/VamosTaxi.eu/apps/web/node_modules/.bin/next");
const NEXT = existsSync(NEXT_BIN) ? NEXT_BIN : MAIN_NEXT;
const DB_ROOT = join("/Users/koss/Developer/VamosTaxi.eu/packages/db");

let devServer: ChildProcess | null = null;
let baseURL = "";

function requireLocalStack(): { apiUrl: string; anonKey: string } {
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

async function waitForMail(address: string, afterIso: string, timeoutMs = 25_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const search = await fetch(`${MAIL_URL}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`);
    if (search.ok) {
      const data = (await search.json()) as { messages?: Array<{ ID: string; Created: string }> };
      const hit = (data.messages ?? []).find((m) => !afterIso || m.Created >= afterIso);
      if (hit?.ID) {
        const msg = await fetch(`${MAIL_URL}/api/v1/message/${hit.ID}`);
        if (msg.ok) {
          const body = (await msg.json()) as { HTML?: string; Text?: string };
          return { html: body.HTML ?? "", text: body.Text ?? "" };
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

async function sessionSnapshot(page: Page): Promise<{ signedIn: boolean }> {
  const res = await page.request.get(`${baseURL}/api/auth/session`);
  expect(res.status()).toBe(200);
  return (await res.json()) as { signedIn: boolean };
}

test.describe("D-28 Pitfall 4 confirm-email intermediate state", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(180_000);
    const stack = requireLocalStack();
    baseURL = `http://localhost:${PORT}`;
    devServer = spawn(NEXT, ["dev", "-p", String(PORT)], {
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
  });

  test("D-28 Pitfall 4: password signup has no usable session until the emailed confirmation", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const email = `d28-${crypto.randomUUID().slice(0, 8)}@example.com`;
    const after = new Date(Date.now() - 1000).toISOString();
    await page.goto(`${baseURL}/sign-up`, { timeout: 60_000, waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-af]")).toBeVisible({ timeout: 30_000 });
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("First name").fill("Ada");
    await page.getByLabel("Last name").fill("Lovelace");
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create an account" }).click();
    await expect(page.locator("[data-af]")).toContainText("Send a new link");

    const before = await sessionSnapshot(page);
    expect(before.signedIn).toBe(false);

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

    const afterConfirm = await sessionSnapshot(page);
    expect(afterConfirm.signedIn).toBe(true);
  });
});

// apps/web/tests/integration/ops-invite-accept.spec.ts
//
// AUTH-05 invite half: admin POST /api/staff/invite, invitee sets a password
// and enrols TOTP in one flow. Tagged @ops-invite. component-1440 only.
// Skips when local Auth is down.

import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { test, expect } from "@playwright/test";
import { waitForNextServer, WEB_ROOT } from "../support/server-harness";
import {
  createStaffFixture,
  localAuthUp,
  resetStaffFixtures,
  totpCode,
} from "../support/ops-fixtures";

const NEXT_BIN = "/Users/koss/Developer/VamosTaxi.eu/apps/web/node_modules/.bin/next";

const RUN_PROJECT = "component-1440";
const PORT = 4280;
const MAIL_URL = "http://127.0.0.1:54324";
const AUTH_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const STACK_HINT = "run pnpm db:start && pnpm db:reset from packages/db";
const INVITE_PASSWORD = "password1";
const MAIN_WEB_PKG = "/Users/koss/Developer/VamosTaxi.eu/apps/web/package.json";

let devServer: ChildProcess | null = null;
let baseURL = "";

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== RUN_PROJECT,
    "Invite-accept proofs run once under component-1440.",
  );
});

function locationPath(res: { headers: () => Record<string, string>; url: () => string }): string {
  const location = res.headers().location ?? "";
  return new URL(location, res.url()).pathname;
}

async function waitForMail(address: string, afterIso: string, timeoutMs = 25_000): Promise<{ html: string; text: string }> {
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
    const local = address.split("@")[0] ?? address;
    const ib = await fetch(`${MAIL_URL}/api/v1/mailbox/${encodeURIComponent(local)}`);
    if (ib.ok) {
      const list = (await ib.json()) as Array<{ id?: string }>;
      const last = list.at(-1);
      if (last?.id) {
        const msg = await fetch(`${MAIL_URL}/api/v1/mailbox/${encodeURIComponent(local)}/${last.id}`);
        if (msg.ok) {
          const body = (await msg.json()) as {
            body?: { html?: string; text?: string };
            html?: string;
            text?: string;
          };
          return {
            html: body.body?.html ?? body.html ?? "",
            text: body.body?.text ?? body.text ?? "",
          };
        }
      }
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`No invite email for ${address} at ${MAIL_URL}. ${STACK_HINT}`);
}

function extractLinks(html: string, text: string): string[] {
  const blob = `${html}\n${text}`;
  return [...blob.matchAll(/https?:\/\/[^\s"'<>\\]+/g)].map((m) => m[0].replace(/&amp;/g, "&"));
}

function acceptInviteUrl(html: string, text: string): string {
  const links = extractLinks(html, text);
  const verify = links.find((href) => href.includes("/auth/v1/verify") || href.includes("token="));
  if (verify) {
    const url = new URL(verify);
    const token = url.searchParams.get("token") ?? url.searchParams.get("token_hash");
    const type = url.searchParams.get("type") ?? "invite";
    if (token) return `${baseURL}/ops/accept-invite?token_hash=${encodeURIComponent(token)}&type=${encodeURIComponent(type)}`;
  }
  const accept = links.find((href) => href.includes("/ops/accept-invite"));
  if (accept) {
    const url = new URL(accept);
    url.protocol = "http:";
    url.host = `localhost:${PORT}`;
    return url.toString();
  }
  throw new Error(`Invite mail had no accept-invite link. ${STACK_HINT}`);
}

function loadCreateClient() {
  const req = createRequire(MAIN_WEB_PKG);
  const mod = req("@supabase/supabase-js") as {
    createClient: (
      url: string,
      key: string,
      opts?: object,
    ) => {
      auth: {
        signInWithPassword: (creds: { email: string; password: string }) => Promise<{
          error: { message: string } | null;
        }>;
        mfa: {
          listFactors: () => Promise<{
            data: { totp: Array<{ id: string; status: string }> } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
  return mod.createClient;
}

async function signInAndVerify(page: import("@playwright/test").Page, email: string, password: string, secret: string) {
  await page.goto(`${baseURL}/ops/sign-in`);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/ops\/mfa-challenge/);
  await page.locator('input[name="code"]').fill(totpCode(secret));
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.includes("/ops/mfa-challenge") && !url.pathname.includes("/ops/sign-in"));
}

test.describe("ops invite accept @ops-invite", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(180_000);
    const up = await localAuthUp();
    if (!up || !process.env.SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error(STACK_HINT);
    }
    baseURL = `http://localhost:${PORT}`;
    const nextBin = NEXT_BIN;
    devServer = spawn(nextBin, ["dev", "-p", String(PORT)], {
      cwd: WEB_ROOT,
      stdio: "ignore",
      detached: true,
      env: {
        ...process.env,
        NODE_PATH: "/Users/koss/Developer/VamosTaxi.eu/apps/web/node_modules",
      },
    });
    await waitForNextServer(baseURL);
  });

  test.afterAll(async () => {
    await resetStaffFixtures();
    if (devServer?.pid) {
      try {
        process.kill(-devServer.pid, "SIGTERM");
      } catch {
        // gone
      }
    }
  });

  test("dispatcher POST /api/staff/invite is 403", async ({ page }) => {
    const fixture = await createStaffFixture({ role: "dispatcher", enrolTotp: true });
    if (!fixture.factorSecret) throw new Error("expected factor secret");
    await signInAndVerify(page, fixture.email, fixture.password, fixture.factorSecret);
    const res = await page.request.post(`${baseURL}/api/staff/invite`, {
      data: { email: `blocked-${Date.now()}@example.com`, role: "dispatcher" },
    });
    expect(res.status()).toBe(403);
  });

  test("invitee sets password, enrols TOTP, cannot skip, abandoned factor stays one", async ({ page }) => {
    const admin = await createStaffFixture({ role: "admin", enrolTotp: true });
    if (!admin.factorSecret) throw new Error("expected factor secret");
    await signInAndVerify(page, admin.email, admin.password, admin.factorSecret);

    const inviteeEmail = `invitee-${Date.now()}@example.com`;
    const afterIso = new Date(Date.now() - 1000).toISOString();
    const invited = await page.request.post(`${baseURL}/api/staff/invite`, {
      data: { email: inviteeEmail, role: "dispatcher" },
    });
    expect(invited.status()).toBe(200);
    expect(await invited.json()).toEqual({ ok: true });

    const mail = await waitForMail(inviteeEmail, afterIso);
    const acceptUrl = acceptInviteUrl(mail.html, mail.text);

    const invitee = await page.context().newPage();
    await invitee.goto(acceptUrl);
    await invitee.waitForSelector('[data-ops-step="password"]');

    await invitee.locator('input[name="password"]').fill(INVITE_PASSWORD);
    await invitee.locator('input[name="confirm-password"]').fill(INVITE_PASSWORD);
    await invitee.locator('button[type="submit"]').click();
    await invitee.waitForSelector('[data-ops-step="enrol"]');

    const vehicles = await invitee.request.get(`${baseURL}/ops/vehicles`, { maxRedirects: 0 });
    expect([301, 302, 303, 307, 308]).toContain(vehicles.status());
    const redirected = locationPath(vehicles);
    expect(redirected === "/ops/mfa-challenge" || redirected === "/ops/accept-invite").toBe(true);

    await invitee.reload();
    await invitee.waitForSelector("[data-totp-secret]");
    const secret = (await invitee.locator("[data-totp-secret]").innerText()).trim();
    expect(secret.length).toBeGreaterThan(8);

    await invitee.locator('input[name="code"]').fill("000000");
    await invitee.locator('button[type="submit"]').click();
    await expect(invitee.getByText(/did not work|nicht|pas|لم/i)).toBeVisible();
    expect(invitee.url()).toMatch(/accept-invite/);

    await invitee.locator('input[name="code"]').fill(totpCode(secret));
    await invitee.locator('button[type="submit"]').click();
    await invitee.waitForURL((url) => url.pathname === "/ops" || url.pathname.endsWith("/ops"));

    const createClient = loadCreateClient();
    const anonKey = process.env.SUPABASE_ANON_KEY ?? "";
    const supabase = createClient(AUTH_URL, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signedIn = await supabase.auth.signInWithPassword({
      email: inviteeEmail,
      password: INVITE_PASSWORD,
    });
    expect(signedIn.error).toBeNull();
    const factors = await supabase.auth.mfa.listFactors();
    expect(factors.error).toBeNull();
    expect(factors.data?.totp.length).toBe(1);

    await invitee.close();
  });
});

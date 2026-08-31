// apps/web/tests/integration/ops-settings.spec.ts
//
// OPS-09: staff edit the settings singleton; settings_versions is read-only.
// Tagged @ops-settings. component-1440 only. Skips when local Auth is down.

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { test, expect } from "@playwright/test";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";
import {
  createStaffFixture,
  localAuthUp,
  resetStaffFixtures,
  totpCode,
} from "../support/ops-fixtures";

const RUN_PROJECT = "component-1440";
const PORT = 4280;
const MAIN_NEXT = "/Users/koss/Developer/VamosTaxi.eu/apps/web/node_modules/.bin/next";
const MAIN_DB_PKG = "/Users/koss/Developer/VamosTaxi.eu/packages/db/package.json";
const NEXT = existsSync(NEXT_BIN) ? NEXT_BIN : MAIN_NEXT;
const DB_URL = process.env.OPS_FIXTURE_DB_URL ?? "postgres://postgres:***@127.0.0.1:54322/postgres";

let devServer: ChildProcess | null = null;
let baseURL = "";
let snapshot: Record<string, unknown> | null = null;

function loadSql() {
  const req = createRequire(MAIN_DB_PKG);
  const postgres = req("postgres") as (url: string) => {
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
    end: (opts?: { timeout?: number }) => Promise<void>;
  };
  return postgres;
}

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== RUN_PROJECT, "Settings proofs run once under component-1440.");
});

test.describe("ops settings @ops-settings", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(120_000);
    const up = await localAuthUp();
    test.skip(!up, "local auth health is down — run pnpm db:start && pnpm db:reset");
    test.skip(
      !process.env.SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY,
      "SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY unset — live proofs skipped",
    );
    baseURL = `http://localhost:${PORT}`;
    devServer = spawn(NEXT, ["dev", "-p", String(PORT)], {
      cwd: WEB_ROOT,
      stdio: "ignore",
      detached: true,
    });
    await waitForNextServer(baseURL);
    const postgres = loadSql();
    const sql = postgres(DB_URL);
    try {
      const rows = (await sql`select * from public.settings where id = 1`) as Record<string, unknown>[];
      snapshot = rows[0] ?? null;
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  test.afterEach(async () => {
    if (!snapshot) return;
    const postgres = loadSql();
    const sql = postgres(DB_URL);
    try {
      await sql`
        update public.settings set
          company = ${snapshot.company as string},
          address = ${snapshot.address as string},
          uid_number = ${snapshot.uid_number as string},
          phone = ${snapshot.phone as string},
          email = ${snapshot.email as string},
          default_lang = ${snapshot.default_lang as string},
          default_currency = ${snapshot.default_currency as string},
          accepts_cash = ${snapshot.accepts_cash as boolean},
          accepts_card = ${snapshot.accepts_card as boolean},
          accepts_twint = ${snapshot.accepts_twint as boolean},
          accepts_invoice = ${snapshot.accepts_invoice as boolean},
          email_confirmation = ${snapshot.email_confirmation as boolean},
          email_reminder = ${snapshot.email_reminder as boolean},
          sms_reminder = ${snapshot.sms_reminder as boolean},
          ops_alerts = ${snapshot.ops_alerts as boolean},
          chauffeur_turnaround_minutes = ${snapshot.chauffeur_turnaround_minutes as number},
          updated_at = now()
        where id = 1
      `;
    } finally {
      await sql.end({ timeout: 5 });
    }
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

  async function signInDispatcher(page: import("@playwright/test").Page) {
    const fixture = await createStaffFixture({ role: "dispatcher", enrolTotp: true });
    if (!fixture.factorSecret) throw new Error("expected factor secret");
    await page.goto(`${baseURL}/ops/sign-in`);
    await page.locator('input[name="email"]').fill(fixture.email);
    await page.locator('input[name="password"]').fill(fixture.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/ops\/mfa-challenge/);
    await page.locator('input[name="code"]').fill(totpCode(fixture.factorSecret));
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/ops/);
    return fixture;
  }

  test("five panes, no security pane, no editable policy inputs", async ({ page }) => {
    await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/settings`);
    await expect(page.locator('[data-ops-settings="1"]')).toBeVisible();
    await expect(page.locator('[data-pane-id="company"]')).toBeVisible();
    await expect(page.locator('[data-pane-id="locale"]')).toBeVisible();
    await expect(page.locator('[data-pane-id="payments"]')).toBeVisible();
    await expect(page.locator('[data-pane-id="notifications"]')).toBeVisible();
    await expect(page.locator('[data-pane-id="dispatch"]')).toBeVisible();
    await expect(page.locator('[data-pane-id="security"]')).toHaveCount(0);
    await expect(page.locator('[data-pane-id="policy"]')).toHaveCount(0);
    const html = await page.content();
    expect(html.toLowerCase()).not.toMatch(/passkey|deleteaccount|delete_account/);
    expect(html).not.toMatch(/settings_versions/);
    expect(html).not.toMatch(/\bCHF\b/);
  });

  test("dispatcher can save phone; public view and audit follow", async ({ page }) => {
    const fixture = await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/settings`);
    const phone = page.getByLabel("Phone");
    await phone.fill("+41 79 111 22 33");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved")).toBeVisible();

    const postgres = loadSql();
    const sql = postgres(DB_URL);
    try {
      const pub = (await sql`select phone from public.settings_public`) as { phone: string }[];
      expect(pub[0]?.phone).toBe("+41 79 111 22 33");
      const audit = (await sql`
        select actor_kind, actor_id
        from public.audit_log
        where table_name = 'settings'
        order by at desc
        limit 1
      `) as { actor_kind: string; actor_id: string }[];
      expect(audit[0]?.actor_kind).toBe("staff");
      expect(audit[0]?.actor_id).toBe(fixture.userId);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  test("invalid UID stays filled and shows a field error", async ({ page }) => {
    await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/settings`);
    const uid = page.getByLabel("UID");
    await uid.fill("CHE123456789");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("UID must match Swiss UID shape.")).toBeVisible();
    await expect(uid).toHaveValue("CHE123456789");
  });

  test("empty address and uid render labelled gaps", async ({ page }) => {
    await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/settings`);
    await expect(page.locator("[data-tok]")).toHaveCount(await page.locator("[data-tok]").count());
    const toks = page.locator("[data-tok]");
    await expect(toks.first()).toBeVisible();
  });

  test("turnaround counter refuses a negative value", async ({ page }) => {
    await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/settings?pane=dispatch`);
    const fewer = page.getByRole("button", { name: "Fewer minutes" });
    await expect(fewer).toBeDisabled();
  });

  test("policy card is read-only with units, gaps, tiers and LTR night window", async ({ page }) => {
    await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/settings`);
    const card = page.locator("[data-policy-card]");
    await expect(card).toBeVisible();
    await expect(card.getByText("launch-baseline")).toBeVisible();
    await expect(card.getByText("24 hours")).toBeVisible();
    await expect(card.getByText("60 minutes")).toBeVisible();
    await expect(card.getByText("15 minutes")).toBeVisible();
    await expect(card.getByText("30 days")).toBeVisible();
    await expect(card.getByText("10 %")).toBeVisible();
    await expect(card.locator("[data-tok]")).toHaveCount(2);
    await expect(card.getByText(/hours before pickup/)).toBeVisible();
    await expect(card.getByText(/No-show/)).toBeVisible();
    const night = card.locator(".vt-dir-keep").filter({ hasText: "Europe/Zurich" });
    await expect(night).toBeVisible();
    await expect(card.locator("form, button[type=submit]")).toHaveCount(0);
    await expect(page.locator("a").filter({ hasText: "launch-baseline" })).toHaveCount(0);
  });
});

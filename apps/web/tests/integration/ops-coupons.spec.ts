// apps/web/tests/integration/ops-coupons.spec.ts
//
// Coupons CRUD against a local stack. Tagged @ops-coupons. component-1440 only.
// Skips when local Auth is down — this spec never starts supabase.

import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { waitForNextServer, WEB_ROOT } from "../support/server-harness";
import {
  createStaffFixture,
  localAuthUp,
  resetStaffFixtures,
  totpCode,
} from "../support/ops-fixtures";

const RUN_PROJECT = "component-1440";
const PORT = 4280;
const LOCAL_NEXT = join(WEB_ROOT, "node_modules", ".bin", "next");
const NEXT_BIN = LOCAL_NEXT;
const MAIN_DB_PKG = "/Users/koss/Developer/VamosTaxi.eu/packages/db/package.json";
const DB_URL =
  process.env.OPS_FIXTURE_DB_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";

const createdCodes: string[] = [];

let devServer: ChildProcess | null = null;
let baseURL = "";

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== RUN_PROJECT,
    "Coupon proofs run once under component-1440.",
  );
});

function loadSql() {
  const req = createRequire(MAIN_DB_PKG);
  return req("postgres") as (
    url: string,
  ) => {
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
    end: (opts?: { timeout?: number }) => Promise<void>;
  };
}

async function withSql<T>(fn: (sql: ReturnType<ReturnType<typeof loadSql>>) => Promise<T>): Promise<T> {
  const postgres = loadSql();
  const sql = postgres(DB_URL);
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function cleanupCodes(): Promise<void> {
  const codes = createdCodes.splice(0, createdCodes.length);
  if (codes.length === 0) return;
  await withSql(async (sql) => {
    await sql`delete from public.coupons where code = any(${codes}::text[])`;
  });
}

test.describe("ops coupons @ops-coupons", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(120_000);
    const up = await localAuthUp();
    test.skip(!up, "local auth health is down — run pnpm db:start");
    test.skip(
      !existsSync(LOCAL_NEXT),
      "no next binary in this worktree — integration proofs need apps/web/node_modules",
    );
    test.skip(
      !process.env.SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY,
      "SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY unset — live proofs skipped",
    );
    baseURL = `http://localhost:${PORT}`;
    devServer = spawn(NEXT_BIN, ["dev", "-p", String(PORT)], {
      cwd: WEB_ROOT,
      stdio: "ignore",
      detached: true,
    });
    await waitForNextServer(baseURL);
  });

  test.afterAll(async () => {
    await cleanupCodes();
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

  test("empty state renders against the seeded table", async ({ page }) => {
    await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/coupons`);
    await expect(page.locator("[data-page=ops-coupons]")).toBeVisible();
    const empty = page.getByTestId("coupons-empty");
    const codes = page.locator("[data-coupon-code]");
    if ((await codes.count()) === 0) {
      await expect(empty).toBeVisible();
    }
  });

  test("percent and amount are never both editable", async ({ page }) => {
    await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/coupons`);
    await page.getByTestId("coupons-add").click();
    await expect(page.getByTestId("coupons-amount")).toBeDisabled();
    await expect(page.getByTestId("coupons-percent")).toBeEnabled();
    await page.getByTestId("coupons-kind").selectOption("amount");
    await expect(page.getByTestId("coupons-percent")).toBeDisabled();
    await expect(page.getByTestId("coupons-amount")).toBeEnabled();
  });

  test("lower-case code is stored upper-case and attributed in audit_log", async ({ page }) => {
    const fixture = await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/coupons`);
    const stamp = Date.now();
    const typed = `t06a${stamp}`;
    const stored = typed.toUpperCase();
    createdCodes.push(stored);
    await page.getByTestId("coupons-add").click();
    await page.getByTestId("coupons-code").fill(typed);
    await page.getByTestId("coupons-percent").fill("10");
    await page.getByTestId("coupons-save").click();
    await expect(page.locator(`[data-coupon-code="${stored}"]`)).toBeVisible({ timeout: 15_000 });
    const dbCode = await withSql(async (sql) => {
      const rows = (await sql`select code from public.coupons where code = ${stored}`) as { code: string }[];
      return rows[0]?.code ?? null;
    });
    expect(dbCode).toBe(stored);
    const audit = await withSql(async (sql) => {
      const rows = (await sql`
        select actor_kind, actor_id
        from public.audit_log
        where table_name = 'coupons'
        order by created_at desc
        limit 1
      `) as { actor_kind: string; actor_id: string | null }[];
      return rows[0] ?? null;
    });
    expect(audit?.actor_kind).toBe("staff");
    expect(audit?.actor_id).toBe(fixture.userId);
  });

  test("duplicate code surfaces copy and leaves the form filled", async ({ page }) => {
    await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/coupons`);
    const stamp = Date.now();
    const code = `T06B${stamp}`;
    createdCodes.push(code);
    await page.getByTestId("coupons-add").click();
    await page.getByTestId("coupons-code").fill(code);
    await page.getByTestId("coupons-percent").fill("10");
    await page.getByTestId("coupons-save").click();
    await expect(page.locator(`[data-coupon-code="${code}"]`)).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("coupons-add").click();
    await page.getByTestId("coupons-code").fill(code);
    await page.getByTestId("coupons-percent").fill("15");
    await page.getByTestId("coupons-save").click();
    await expect(page.getByTestId("coupons-code")).toHaveValue(code);
    await expect(page.locator(".vt-field__err")).toBeVisible();
  });

  test("deactivating a coupon updates the row without leaving the page", async ({ page }) => {
    await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/coupons`);
    const stamp = Date.now();
    const code = `T06C${stamp}`;
    createdCodes.push(code);
    await page.getByTestId("coupons-add").click();
    await page.getByTestId("coupons-code").fill(code);
    await page.getByTestId("coupons-percent").fill("10");
    await page.getByTestId("coupons-save").click();
    await expect(page.locator(`[data-coupon-code="${code}"]`)).toBeVisible({ timeout: 15_000 });
    const url = page.url();
    await page.getByTestId(`coupons-toggle-${code}`).click();
    await expect(page.locator('[data-coupon-status="paused"]')).toBeVisible({ timeout: 15_000 });
    expect(page.url()).toBe(url);
  });

  test("dispatcher can delete a coupon", async ({ page }) => {
    await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/coupons`);
    const stamp = Date.now();
    const code = `T06D${stamp}`;
    createdCodes.push(code);
    await page.getByTestId("coupons-add").click();
    await page.getByTestId("coupons-code").fill(code);
    await page.getByTestId("coupons-percent").fill("10");
    await page.getByTestId("coupons-save").click();
    await expect(page.locator(`[data-coupon-code="${code}"]`)).toBeVisible({ timeout: 15_000 });
    await page.getByTestId(`coupons-delete-${code}`).click();
    await page.getByTestId("coupons-delete-confirm").click();
    await expect(page.locator(`[data-coupon-code="${code}"]`)).toHaveCount(0, { timeout: 15_000 });
  });

  test("expired coupon is marked without a yellow tint", async ({ page }) => {
    await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/coupons`);
    const stamp = Date.now();
    const code = `T06E${stamp}`;
    createdCodes.push(code);
    await page.getByTestId("coupons-add").click();
    await page.getByTestId("coupons-code").fill(code);
    await page.getByTestId("coupons-percent").fill("10");
    await page.getByTestId("coupons-valid-from").fill("2020-01-01");
    await page.getByTestId("coupons-valid-until").fill("2020-02-01");
    await page.getByTestId("coupons-save").click();
    await expect(page.locator(`[data-coupon-code="${code}"]`)).toBeVisible({ timeout: 15_000 });
    const status = page.locator('[data-coupon-status="expired"]');
    await expect(status).toBeVisible();
    const color = await status.evaluate((el) => getComputedStyle(el).color);
    expect(color).not.toMatch(/255,\s*2[0-9]{2}/);
  });
});

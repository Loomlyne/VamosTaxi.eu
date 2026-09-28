// apps/web/tests/integration/content-string-edit.spec.ts
//
// I18N-07 editor half. Tagged @ops-content. component-1440 only.
// Restores every row it edits. Skips when local Auth is down.

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { spawn, type ChildProcess } from "node:child_process";
import { test, expect } from "@playwright/test";
import { NEXT_BIN as HARNESS_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";
import {
  createStaffFixture,
  localAuthUp,
  resetStaffFixtures,
  totpCode,
} from "../support/ops-fixtures";

const RUN_PROJECT = "component-1440";
const PORT = 4280;
const MAIN_NEXT = "/Users/koss/Developer/VamosTaxi.eu/apps/web/node_modules/.bin/next";
const NEXT_BIN = existsSync(HARNESS_BIN) ? HARNESS_BIN : MAIN_NEXT;
const MAIN_DB_PKG = "/Users/koss/Developer/VamosTaxi.eu/packages/db/package.json";
const DB_URL =
  process.env.OPS_FIXTURE_DB_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";

let devServer: ChildProcess | null = null;
let baseURL = "";

type Snapshot = {
  key: string;
  en: string;
  de: string | null;
  fr: string | null;
  ar: string | null;
  pending_value: boolean;
  non_translatable: boolean;
  no_param_reason: string | null;
  updated_by: string | null;
};

const snapshots: Snapshot[] = [];

function loadSql() {
  const req = createRequire(MAIN_DB_PKG);
  const postgres = req("postgres") as (url: string) => {
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<Snapshot[]>;
    end: (opts?: { timeout?: number }) => Promise<void>;
  };
  return postgres;
}

async function withSql<T>(fn: (sql: ReturnType<ReturnType<typeof loadSql>>) => Promise<T>): Promise<T> {
  const sql = loadSql()(DB_URL);
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== RUN_PROJECT, "Editor proofs run once under component-1440.");
});

test.describe("content string editor @ops-content", () => {
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
    devServer = spawn(NEXT_BIN, ["dev", "-p", String(PORT)], {
      cwd: WEB_ROOT,
      stdio: "ignore",
      detached: true,
    });
    await waitForNextServer(baseURL);
  });

  test.afterEach(async () => {
    if (snapshots.length === 0) return;
    await withSql(async (sql) => {
      for (const row of snapshots.splice(0, snapshots.length)) {
        await sql`
          update public.content_strings
             set en = ${row.en},
                 de = ${row.de},
                 fr = ${row.fr},
                 ar = ${row.ar},
                 pending_value = ${row.pending_value},
                 non_translatable = ${row.non_translatable},
                 no_param_reason = ${row.no_param_reason},
                 updated_by = ${row.updated_by}
           where key = ${row.key}
        `;
      }
    });
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

  // D-16b: only the admin signs in. With TOTP enrolled, the ops sign-in (AuthForm on
  // /login, internal /ops/sign-in) shows its 'mfa' stage after the password (26.1-23);
  // the old separate challenge page is gone (26.1-20).
  async function signInAdmin(page: import("@playwright/test").Page) {
    const fixture = await createStaffFixture({ role: "admin", enrolTotp: true });
    if (!fixture.factorSecret) throw new Error("expected factor secret");
    await page.goto(`${baseURL}/ops/sign-in`);
    await page.getByLabel("Email", { exact: true }).fill(fixture.email);
    await page.getByLabel("Password", { exact: true }).fill(fixture.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Enter the 6-digit code" })).toBeVisible();
    await page.getByLabel("6-digit code", { exact: true }).fill(totpCode(fixture.factorSecret));
    await page.getByRole("button", { name: "Verify", exact: true }).click();
    await page.waitForURL(/\/(dashboard|ops)(\/|$)/);
    return fixture;
  }

  test("table pages 50 rows; namespace rail is present", async ({ page }) => {
    await signInAdmin(page);
    await page.goto(`${baseURL}/ops/content`);
    await expect(page.locator("[data-ops-content]")).toBeVisible();
    const rows = page.locator("[data-ops-content-table] tbody tr[data-content-key]");
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeLessThanOrEqual(50);
    await expect(page.locator("[data-set-rail]")).toBeVisible();
  });

  test("untranslated filter hides pending and non-translatable rows", async ({ page }) => {
    await signInAdmin(page);
    await page.goto(`${baseURL}/ops/content?filter=untranslated`);
    await expect(page.locator("[data-ops-content-table]")).toBeVisible();
    await expect(page.locator('[data-content-key="about.business-bags"]')).toHaveCount(0);
    await expect(page.locator('[data-content-key="common.brandName"]')).toHaveCount(0);
  });

  test("dispatcher can edit de and stamp updated_by; audit is staff", async ({ page }) => {
    const fixture = await signInAdmin(page);
    const target = await withSql(async (sql) => {
      const rows = await sql`
        select key, en, de, fr, ar, pending_value, non_translatable, no_param_reason, updated_by
          from public.content_strings
         where pending_value = false
           and non_translatable = false
           and no_param_reason is null
           and key like 'ops.%'
         order by key
         limit 1
      `;
      return rows[0];
    });
    if (!target) throw new Error("expected an ordinary ops.* row");
    snapshots.push(target);

    await page.goto(`${baseURL}/ops/content?q=${encodeURIComponent(target.key)}`);
    const row = page.locator(`[data-content-key="${target.key}"]`);
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Edit" }).click();
    await row.locator('textarea[aria-label="DE"]').fill("Geändert durch den Dispatcher");
    await row.getByRole("button", { name: "Save" }).click();
    await expect(row).not.toHaveAttribute("data-editing", "1");

    const saved = await withSql(async (sql) => {
      const rows = await sql`
        select key, en, de, fr, ar, pending_value, non_translatable, no_param_reason, updated_by
          from public.content_strings
         where key = ${target.key}
         limit 1
      `;
      return rows[0];
    });
    expect(saved?.de).toBe("Geändert durch den Dispatcher");
    expect(saved?.updated_by).toBe(fixture.userId);

    const audit = await withSql(async (sql) => {
      const rows = await sql`
        select actor_kind, actor_id
          from public.audit_log
         where table_name = 'content_strings'
           and record_id = ${target.key}
         order by created_at desc
         limit 1
      `;
      return rows[0] as unknown as { actor_kind: string; actor_id: string };
    });
    expect(audit.actor_kind).toBe("staff");
    expect(audit.actor_id).toBe(fixture.userId);
  });

  test("pending_value row renders data-tok on language cells", async ({ page }) => {
    await signInAdmin(page);
    await page.goto(`${baseURL}/ops/content?q=${encodeURIComponent("about.business-bags")}`);
    const row = page.locator('[data-content-key="about.business-bags"]');
    await expect(row).toBeVisible();
    await expect(row.locator("[data-tok]").first()).toBeVisible();
  });

  test("three flags are independent controls", async ({ page }) => {
    await signInAdmin(page);
    const target = await withSql(async (sql) => {
      const rows = await sql`
        select key, en, de, fr, ar, pending_value, non_translatable, no_param_reason, updated_by
          from public.content_strings
         where pending_value = false
           and non_translatable = false
           and no_param_reason is null
           and key like 'faq.%'
         order by key
         limit 1
      `;
      return rows[0];
    });
    if (!target) throw new Error("expected an ordinary faq.* row");
    snapshots.push(target);

    await page.goto(`${baseURL}/ops/content?q=${encodeURIComponent(target.key)}`);
    const row = page.locator(`[data-content-key="${target.key}"]`);
    await row.getByRole("button", { name: "Edit" }).click();
    const flags = row.locator("[data-content-flags]");
    await flags.getByRole("switch").nth(0).click();
    await expect(flags.getByRole("switch").nth(0)).toBeChecked();
    await expect(flags.getByRole("switch").nth(1)).not.toBeChecked();
    await flags.getByRole("textbox").fill("booking reference, not a live count");
    await flags.getByRole("button", { name: "Clear reason" }).click();
    await expect(flags.getByRole("textbox")).toHaveValue("");
    await expect(flags.getByRole("switch").nth(0)).toBeChecked();
    await expect(flags.getByRole("switch").nth(1)).not.toBeChecked();
  });

  test("non_translatable with a differing de is refused", async ({ page }) => {
    await signInAdmin(page);
    const target = await withSql(async (sql) => {
      const rows = await sql`
        select key, en, de, fr, ar, pending_value, non_translatable, no_param_reason, updated_by
          from public.content_strings
         where pending_value = false
           and non_translatable = false
           and de is not null
           and de <> en
           and key like 'home.%'
         order by key
         limit 1
      `;
      return rows[0];
    });
    if (!target) throw new Error("expected a translated home.* row");
    snapshots.push(target);

    await page.goto(`${baseURL}/ops/content?q=${encodeURIComponent(target.key)}`);
    const row = page.locator(`[data-content-key="${target.key}"]`);
    await row.getByRole("button", { name: "Edit" }).click();
    await row.locator("[data-content-flags]").getByRole("switch").nth(1).click();
    await row.getByRole("button", { name: "Save" }).click();
    await expect(row.getByRole("alert")).toContainText("identical in every language");
  });

  test("whitespace-only no_param_reason is refused", async ({ page }) => {
    await signInAdmin(page);
    const target = await withSql(async (sql) => {
      const rows = await sql`
        select key, en, de, fr, ar, pending_value, non_translatable, no_param_reason, updated_by
          from public.content_strings
         where pending_value = false
           and non_translatable = false
           and key like 'footer.%'
         order by key
         limit 1
      `;
      return rows[0];
    });
    if (!target) throw new Error("expected a footer.* row");
    snapshots.push(target);

    await page.goto(`${baseURL}/ops/content?q=${encodeURIComponent(target.key)}`);
    const row = page.locator(`[data-content-key="${target.key}"]`);
    await row.getByRole("button", { name: "Edit" }).click();
    await row.locator("[data-content-flags]").getByRole("textbox").fill("   ");
    await row.getByRole("button", { name: "Save" }).click();
    await expect(row.getByRole("alert")).toContainText("real reason");
  });
});

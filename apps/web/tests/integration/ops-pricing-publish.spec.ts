// apps/web/tests/integration/ops-pricing-publish.spec.ts
//
// OPS-06: draft→publish gate, completeness names, CHF placeholder, dispatcher 404.
// Tagged @ops-pricing. component-1440 only.
//
// D-32: this file never writes a CHF figure. The "fully priced" proof uses an
// empty child set inside a rolled-back transaction — that is complete per
// tg_rate_version_transition (no available/active/live rows still NULL). No
// priced column is set to a number, not in this spec and not in seed.sql.

import { createRequire } from "node:module";
import { spawn, type ChildProcess } from "node:child_process";
import { test, expect } from "@playwright/test";
import { NEXT_BIN, waitForNextServer, WEB_ROOT } from "../support/server-harness";
import {
  createStaffFixture,
  localAuthUp,
  resetStaffFixtures,
  totpCode,
} from "../support/ops-fixtures";

const RUN_PROJECT = "component-1440";
const PORT = 4270;
const MAIN_DB_PKG = "/Users/koss/Developer/VamosTaxi.eu/packages/db/package.json";
const DB_URL =
  process.env.OPS_FIXTURE_DB_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";

let devServer: ChildProcess | null = null;
let baseURL = "";

class Rollback extends Error {
  constructor() {
    super("rollback");
    this.name = "Rollback";
  }
}

function loadSql() {
  const req = createRequire(MAIN_DB_PKG);
  const postgres = req("postgres") as (url: string) => {
    begin: <T>(fn: (tx: Sql) => Promise<T>) => Promise<T>;
    end: (opts?: { timeout?: number }) => Promise<void>;
  };
  return postgres;
}

type Sql = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<Record<string, unknown>[]>;
};

function sqlCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  if (!("code" in err)) return undefined;
  const code = (err as { code: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== RUN_PROJECT,
    "Pricing publish proofs run once under component-1440.",
  );
});

test.describe("ops pricing publish @ops-pricing", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(120_000);
    const up = await localAuthUp();
    if (!up) {
      throw new Error("local auth health is down — run pnpm db:start && pnpm db:reset");
    }
    if (!process.env.SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY unset — run pnpm db:start");
    }
    baseURL = `http://localhost:${PORT}`;
    devServer = spawn(NEXT_BIN, ["dev", "-p", String(PORT)], {
      cwd: WEB_ROOT,
      stdio: "ignore",
      detached: true,
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

  async function signInAndClearMfa(
    page: import("@playwright/test").Page,
    email: string,
    password: string,
    secret: string,
  ) {
    await page.goto(`${baseURL}/ops/sign-in`);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/ops\/mfa-challenge/);
    await page.locator('input[name="code"]').fill(totpCode(secret));
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/ops/);
  }

  test("seeded draft is incomplete, publish is inert, amounts stay the placeholder", async ({
    page,
  }) => {
    const fixture = await createStaffFixture({ role: "admin", enrolTotp: true });
    if (!fixture.factorSecret) throw new Error("expected factor secret");
    await signInAndClearMfa(page, fixture.email, fixture.password, fixture.factorSecret);
    await page.goto(`${baseURL}/ops/pricing`);
    await expect(page.locator("[data-ops-pricing]")).toBeVisible();
    await expect(page.locator("[data-ops-version-status=draft]").first()).toBeVisible();
    await expect(page.locator("[data-ops-live-version='']")).toBeVisible();
    await expect(page.locator("[data-ops-gap-name=economy]")).toBeVisible();
    await expect(page.locator("[data-ops-gap-name=business]")).toBeVisible();
    await expect(page.locator("[data-ops-gap-name=van]")).toBeVisible();
    await expect(page.locator("[data-ops-publish]")).toBeDisabled();
    const amounts = await page.locator("[data-ops-amount]").allTextContents();
    expect(amounts.length).toBeGreaterThan(0);
    for (const text of amounts) {
      expect(text).toMatch(/000/);
      expect(text).not.toMatch(/0\.00/);
    }
  });

  test("incomplete publish UPDATE is refused with restrict 23001", async () => {
    const postgres = loadSql();
    const sql = postgres(DB_URL);
    try {
      await sql.begin(async (tx) => {
        try {
          await tx`
            update public.rate_versions
               set status = 'live'
             where slug = 'seed-placeholder'
          `;
          throw new Error("incomplete publish must not succeed");
        } catch (err) {
          if (err instanceof Error && err.message === "incomplete publish must not succeed") {
            throw err;
          }
          expect(sqlCode(err)).toBe("23001");
        }
        throw new Rollback();
      });
    } catch (err) {
      if (!(err instanceof Rollback)) throw err;
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  test("a complete version publishes; a second live version is unique 23505; live→draft is 23001", async () => {
    const postgres = loadSql();
    const sql = postgres(DB_URL);
    const stamp = Date.now();
    const first = `not-a-matrix-${stamp}-a`;
    const second = `not-a-matrix-${stamp}-b`;
    try {
      await sql.begin(async (tx) => {
        await tx`
          insert into public.rate_versions (slug, label, note)
          values (${first}, ${"Not a price matrix"}, null)
        `;
        await tx`
          update public.rate_versions set status = 'live' where slug = ${first}
        `;
        const live = await tx`
          select status, published_at from public.rate_versions where slug = ${first}
        `;
        expect(live[0]?.status).toBe("live");
        expect(live[0]?.published_at).toBeTruthy();

        await tx`
          insert into public.rate_versions (slug, label, note)
          values (${second}, ${"Not a price matrix either"}, null)
        `;
        try {
          await tx`
            update public.rate_versions set status = 'live' where slug = ${second}
          `;
          throw new Error("second live version must not succeed");
        } catch (err) {
          if (err instanceof Error && err.message === "second live version must not succeed") {
            throw err;
          }
          expect(sqlCode(err)).toBe("23505");
        }

        try {
          await tx`
            update public.rate_versions set status = 'draft' where slug = ${first}
          `;
          throw new Error("live to draft must not succeed");
        } catch (err) {
          if (err instanceof Error && err.message === "live to draft must not succeed") {
            throw err;
          }
          expect(sqlCode(err)).toBe("23001");
        }

        throw new Rollback();
      });
    } catch (err) {
      if (!(err instanceof Rollback)) throw err;
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  test("dispatcher session sees no pricing data and no publish control", async ({ page }) => {
    const fixture = await createStaffFixture({ role: "dispatcher", enrolTotp: true });
    if (!fixture.factorSecret) throw new Error("expected factor secret");
    await signInAndClearMfa(page, fixture.email, fixture.password, fixture.factorSecret);
    const res = await page.goto(`${baseURL}/ops/pricing`);
    expect(res?.status()).toBe(404);
    await expect(page.locator("[data-ops-pricing]")).toHaveCount(0);
    await expect(page.locator("[data-ops-publish]")).toHaveCount(0);
  });
});

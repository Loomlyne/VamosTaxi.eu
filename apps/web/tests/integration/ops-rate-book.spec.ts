// apps/web/tests/integration/ops-rate-book.spec.ts
//
// OPS-06 rate book: unpriced CHF placeholder, CHECK refusal, freeze 23001,
// availability carve-out, dispatcher 404, service-zone FK 23503.
// Tagged @ops-pricing. component-1440 only.
//
// D-32: this file never writes a CHF figure. Priced-write plumbing is proven
// by a CHECK refusal (a negative rappen value). Round-trip persistence is
// proven on max_pax / applies_to / availability flags. Priced-value round-trip
// is deliberately unasserted — add it here on the day the owner's matrix lands.

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
const PORT = 4280;
const MAIN_DB_PKG = "/Users/koss/Developer/VamosTaxi.eu/packages/db/package.json";
const DB_URL =
  process.env.OPS_FIXTURE_DB_URL ?? "postgres://postgres:***@127.0.0.1:54322/postgres";
const STACK_HINT = "run pnpm db:start && pnpm db:reset from packages/db";

let devServer: ChildProcess | null = null;
let baseURL = "";
const createdSlugs: string[] = [];

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
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<Record<string, unknown>[]>;
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

async function cleanupCreatedVersions(): Promise<void> {
  if (createdSlugs.length === 0) return;
  const postgres = loadSql();
  const sql = postgres(DB_URL);
  try {
    const slugs = createdSlugs.splice(0, createdSlugs.length);
    for (const slug of slugs) {
      const rows = await sql`select id, status from public.rate_versions where slug = ${slug}`;
      const row = rows[0] as { id: number | string; status: string } | undefined;
      if (!row) continue;
      if (row.status === "live") {
        await sql`update public.rate_versions set status = 'retired' where id = ${row.id}`;
      }
      await sql`delete from public.distance_rates where rate_version_id = ${row.id}`;
      await sql`delete from public.fixed_routes where rate_version_id = ${row.id}`;
      await sql`delete from public.surcharges where rate_version_id = ${row.id}`;
      await sql`delete from public.rate_versions where id = ${row.id}`;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== RUN_PROJECT,
    "Rate-book proofs run once under component-1440.",
  );
});

test.describe("ops rate book @ops-pricing", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(120_000);
    const up = await localAuthUp();
    if (!up) {
      throw new Error(STACK_HINT);
    }
    if (!process.env.SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error(STACK_HINT);
    }
    baseURL = `http://localhost:${PORT}`;
    devServer = spawn(NEXT_BIN, ["dev", "-p", String(PORT)], {
      cwd: WEB_ROOT,
      stdio: "ignore",
      detached: true,
    });
    await waitForNextServer(baseURL);
  });

  test.afterEach(async () => {
    await cleanupCreatedVersions();
    const postgres = loadSql();
    const sql = postgres(DB_URL);
    try {
      const versions = await sql`select slug, status from public.rate_versions`;
      expect(versions).toHaveLength(1);
      expect(versions[0]?.slug).toBe("seed-placeholder");
      expect(versions[0]?.status).toBe("draft");
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  test.afterAll(async () => {
    await cleanupCreatedVersions();
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

  test("seeded draft rappen cells render the placeholder by data", async ({ page }) => {
    const fixture = await createStaffFixture({ role: "admin", enrolTotp: true });
    if (!fixture.factorSecret) throw new Error("expected factor secret");
    await signInAndClearMfa(page, fixture.email, fixture.password, fixture.factorSecret);
    const postgres = loadSql();
    const sql = postgres(DB_URL);
    let versionId: string;
    try {
      const rows = await sql`select id from public.rate_versions where slug = 'seed-placeholder'`;
      versionId = String(rows[0]?.id);
    } finally {
      await sql.end({ timeout: 5 });
    }
    await page.goto(`${baseURL}/ops/pricing/${versionId}`);
    await expect(page.locator("[data-ops-rate-book]")).toBeVisible();
    const amounts = await page.locator("[data-ops-amount]").allTextContents();
    expect(amounts.length).toBeGreaterThan(0);
    for (const text of amounts) {
      expect(text).toMatch(/000/);
      expect(text).not.toMatch(/0\.00/);
    }
  });

  test("negative rappen is refused by CHECK 23514", async () => {
    const postgres = loadSql();
    const sql = postgres(DB_URL);
    const negative = Number("-1");
    try {
      await sql.begin(async (tx) => {
        const version = await tx`select id from public.rate_versions where slug = 'seed-placeholder'`;
        const klass = await tx`select id from public.vehicle_classes where slug = 'economy'`;
        try {
          await tx`
            insert into public.distance_rates (
              rate_version_id, vehicle_class_id, base_fare_rappen, per_km_rappen,
              min_fare_rappen, max_pax, available
            ) values (
              ${version[0]?.id}, ${klass[0]?.id}, ${negative}, ${null}, ${null}, ${3}, ${false}
            )
          `;
          throw new Error("negative rappen must not succeed");
        } catch (err) {
          if (err instanceof Error && err.message === "negative rappen must not succeed") {
            throw err;
          }
          expect(sqlCode(err)).toBe("23514");
        }
        throw new Rollback();
      });
    } catch (err) {
      if (!(err instanceof Rollback)) throw err;
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  test("published version freezes priced edits (23001) and still allows availability", async () => {
    const postgres = loadSql();
    const sql = postgres(DB_URL);
    const slug = `rate-book-freeze-${Date.now()}`;
    createdSlugs.push(slug);
    try {
      await sql`insert into public.rate_versions (slug, label, note) values (${slug}, ${"Not a price matrix"}, ${""})`;
      const version = await sql`select id from public.rate_versions where slug = ${slug}`;
      const versionId = version[0]?.id;
      const klass = await sql`select id from public.vehicle_classes where slug = 'economy'`;
      await sql`
        insert into public.distance_rates (
          rate_version_id, vehicle_class_id, base_fare_rappen, per_km_rappen,
          min_fare_rappen, max_pax, available
        ) values (
          ${versionId}, ${klass[0]?.id}, ${null}, ${null}, ${null}, ${4}, ${false}
        )
      `;
      await sql`update public.rate_versions set status = 'live' where id = ${versionId}`;
      const row = await sql`select id, max_pax, available from public.distance_rates where rate_version_id = ${versionId}`;
      try {
        await sql`update public.distance_rates set max_pax = ${5} where id = ${row[0]?.id}`;
        throw new Error("priced edit on live version must not succeed");
      } catch (err) {
        if (err instanceof Error && err.message === "priced edit on live version must not succeed") {
          throw err;
        }
        expect(sqlCode(err)).toBe("23001");
      }
      await sql`update public.distance_rates set available = ${true} where id = ${row[0]?.id}`;
      const after = await sql`select available, max_pax from public.distance_rates where id = ${row[0]?.id}`;
      expect(after[0]?.available).toBe(true);
      expect(after[0]?.max_pax).toBe(4);
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  test("deleting a zone a fixed route references is 23503", async () => {
    const postgres = loadSql();
    const sql = postgres(DB_URL);
    const slug = `rate-book-fk-${Date.now()}`;
    createdSlugs.push(slug);
    try {
      await sql`insert into public.rate_versions (slug, label, note) values (${slug}, ${"Not a price matrix"}, ${""})`;
      const version = await sql`select id from public.rate_versions where slug = ${slug}`;
      const klass = await sql`select id from public.vehicle_classes where slug = 'economy'`;
      const zones = await sql`select id from public.service_zones order by slug limit 2`;
      await sql`
        insert into public.fixed_routes (
          rate_version_id, origin_zone_id, dest_zone_id, vehicle_class_id, price_rappen, live
        ) values (
          ${version[0]?.id}, ${zones[0]?.id}, ${zones[1]?.id}, ${klass[0]?.id}, ${null}, ${false}
        )
      `;
      try {
        await sql`delete from public.service_zones where id = ${zones[0]?.id}`;
        throw new Error("zone delete must not succeed while a route references it");
      } catch (err) {
        if (
          err instanceof Error &&
          err.message === "zone delete must not succeed while a route references it"
        ) {
          throw err;
        }
        expect(sqlCode(err)).toBe("23503");
      }
    } finally {
      await sql.end({ timeout: 5 });
    }
  });

  test("zones panel lists seeded slugs; non-kebab slug is refused", async ({ page }) => {
    const fixture = await createStaffFixture({ role: "admin", enrolTotp: true });
    if (!fixture.factorSecret) throw new Error("expected factor secret");
    await signInAndClearMfa(page, fixture.email, fixture.password, fixture.factorSecret);
    await page.goto(`${baseURL}/ops/pricing/zones`);
    await expect(page.locator("[data-ops-zones]")).toBeVisible();
    await expect(page.locator("[data-zone-slug=zrh-airport]")).toBeVisible();
    await expect(page.locator("[data-zone-slug=gva-airport]")).toBeVisible();
    await page.locator("[data-ops-add-zone]").click();
    await page.locator("[data-ops-zone-slug]").fill("Not Kebab");
    await page.locator("[data-ops-save-zone]").click();
    await expect(page.locator(".vt-rate-book__error")).toBeVisible();
  });

  test("dispatcher cannot reach the version route", async ({ page }) => {
    const fixture = await createStaffFixture({ role: "dispatcher", enrolTotp: true });
    if (!fixture.factorSecret) throw new Error("expected factor secret");
    await signInAndClearMfa(page, fixture.email, fixture.password, fixture.factorSecret);
    const postgres = loadSql();
    const sql = postgres(DB_URL);
    let versionId: string;
    try {
      const rows = await sql`select id from public.rate_versions where slug = 'seed-placeholder'`;
      versionId = String(rows[0]?.id);
    } finally {
      await sql.end({ timeout: 5 });
    }
    const res = await page.goto(`${baseURL}/ops/pricing/${versionId}`);
    expect(res?.status()).toBe(404);
    await expect(page.locator("[data-ops-rate-book]")).toHaveCount(0);
  });
});

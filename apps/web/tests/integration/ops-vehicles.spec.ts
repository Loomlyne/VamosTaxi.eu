// apps/web/tests/integration/ops-vehicles.spec.ts
//
// OPS-06 fleet half against a local stack. Tagged @ops-fleet. component-1440 only.
// Skips when local Auth is down — this spec never starts Docker or supabase.
// Zero-photo fallback is asserted before any upload (D-22).

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
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
const PORT = 4292;
const LOCAL_NEXT = join(WEB_ROOT, "node_modules", ".bin", "next");
const NEXT_BIN = LOCAL_NEXT;
const MAIN_DB_PKG = "/Users/koss/Developer/VamosTaxi.eu/packages/db/package.json";
const DB_URL = process.env.OPS_FIXTURE_DB_URL ?? "postgres://postgres:***@127.0.0.1:54322/postgres";
const STACK_HINT = "run pnpm db:start && pnpm db:reset from packages/db";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const createdPlates: string[] = [];

let devServer: ChildProcess | null = null;
let baseURL = "";

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== RUN_PROJECT, "Fleet proofs run once under component-1440.");
});

function loadSql() {
  const req = createRequire(MAIN_DB_PKG);
  return req("postgres") as (url: string) => {
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

async function cleanupVehicles(): Promise<void> {
  const plates = createdPlates.splice(0, createdPlates.length);
  await withSql(async (sql) => {
    if (plates.length > 0) {
      await sql`delete from public.vehicles where plate = any(${plates}::text[])`;
    }
    await sql`
      update public.vehicle_classes
      set passenger_capacity = 3, luggage_capacity = 3
      where slug = 'economy'
    `;
    await sql`
      update public.vehicle_classes
      set passenger_capacity = 3, luggage_capacity = 3
      where slug = 'business'
    `;
    await sql`
      update public.vehicle_classes
      set passenger_capacity = 8, luggage_capacity = 8
      where slug = 'van'
    `;
  });
}

test.describe("ops vehicles @ops-fleet", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(120_000);
    const up = await localAuthUp();
    test.skip(!up, STACK_HINT);
    test.skip(
      !existsSync(LOCAL_NEXT),
      STACK_HINT,
    );
    test.skip(
      !process.env.SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY,
      STACK_HINT,
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
    if (!baseURL) return;
    try {
      await cleanupVehicles();
    } catch {
      throw new Error(STACK_HINT);
    }
  });

  test.afterAll(async () => {
    try {
      await cleanupVehicles();
    } catch {
      // stack already gone
    }
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

  test("empty state is the designed seed, not a blank body", async ({ page }) => {
    await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/vehicles`);
    await expect(page.locator("[data-page=ops-vehicles]")).toBeVisible();
    const empty = page.getByTestId("vehicles-empty");
    const plates = page.locator("[data-vehicle-plate]");
    if ((await plates.count()) === 0) {
      await expect(empty).toBeVisible();
      await expect(empty).toContainText("No vehicles yet");
    }
  });

  test("zero-photo fallback renders on a NULL photo_path row before any upload", async ({
    page,
  }) => {
    await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/vehicles`);
    const plate = `T12A${Date.now()}`;
    createdPlates.push(plate);
    await page.getByTestId("vehicles-add").click();
    await page.getByTestId("vehicles-model").fill("Test Economy");
    await page.getByTestId("vehicles-plate").fill(plate);
    await page.getByTestId("vehicles-save").click();
    await expect(page.locator(`[data-vehicle-plate="${plate}"]`)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("vehicle-photo-fallback")).toBeVisible();
    const stored = await withSql(async (sql) => {
      const rows = (await sql`
        select photo_path from public.vehicles where plate = ${plate}
      `) as { photo_path: string | null }[];
      return rows[0]?.photo_path ?? null;
    });
    expect(stored).toBeNull();
  });

  test("duplicate plate surfaces copy and leaves the form filled", async ({ page }) => {
    await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/vehicles`);
    const plate = `T12B${Date.now()}`;
    createdPlates.push(plate);
    await page.getByTestId("vehicles-add").click();
    await page.getByTestId("vehicles-model").fill("First Car");
    await page.getByTestId("vehicles-plate").fill(plate);
    await page.getByTestId("vehicles-save").click();
    await expect(page.locator(`[data-vehicle-plate="${plate}"]`)).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("vehicles-add").click();
    await page.getByTestId("vehicles-model").fill("Second Car");
    await page.getByTestId("vehicles-plate").fill(plate);
    await page.getByTestId("vehicles-save").click();
    await expect(page.getByTestId("vehicles-plate")).toHaveValue(plate);
    await expect(page.getByTestId("vehicles-model")).toHaveValue("Second Car");
    await expect(page.locator(".vt-field__err")).toBeVisible();
  });

  test("seats Counter refuses 20 before a statement is issued", async ({ page }) => {
    await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/vehicles`);
    await page.getByTestId("vehicles-add").click();
    const more = page.getByTestId("vehicles-seats").getByRole("button", { name: "More" });
    for (let i = 0; i < 20; i += 1) {
      if (await more.isDisabled()) break;
      await more.click();
    }
    await expect(page.getByTestId("vehicles-seats").locator(".vt-dir-keep")).toHaveText("16");
    await expect(more).toBeDisabled();
  });

  test("setting a vehicle to workshop updates the row without a reload", async ({ page }) => {
    await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/vehicles`);
    const plate = `T12C${Date.now()}`;
    createdPlates.push(plate);
    await page.getByTestId("vehicles-add").click();
    await page.getByTestId("vehicles-model").fill("Workshop Car");
    await page.getByTestId("vehicles-plate").fill(plate);
    await page.getByTestId("vehicles-save").click();
    await expect(page.locator(`[data-vehicle-plate="${plate}"]`)).toBeVisible({ timeout: 15_000 });
    const url = page.url();
    await page.getByTestId(`vehicles-workshop-${plate}`).click();
    await expect(page.locator('[data-vehicle-status="workshop"]')).toBeVisible({ timeout: 15_000 });
    expect(page.url()).toBe(url);
  });

  test("create is attributed in audit_log to the dispatcher", async ({ page }) => {
    const fixture = await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/vehicles`);
    const plate = `T12D${Date.now()}`;
    createdPlates.push(plate);
    await page.getByTestId("vehicles-add").click();
    await page.getByTestId("vehicles-model").fill("Audit Car");
    await page.getByTestId("vehicles-plate").fill(plate);
    await page.getByTestId("vehicles-save").click();
    await expect(page.locator(`[data-vehicle-plate="${plate}"]`)).toBeVisible({ timeout: 15_000 });
    const audit = await withSql(async (sql) => {
      const rows = (await sql`
        select actor_kind, actor_id
        from public.audit_log
        where table_name = 'vehicles'
        order by created_at desc
        limit 1
      `) as { actor_kind: string; actor_id: string | null }[];
      return rows[0] ?? null;
    });
    expect(audit?.actor_kind).toBe("staff");
    expect(audit?.actor_id).toBe(fixture.userId);
  });

  test("photo upload stores an R2 key, never a data URI", async ({ page }) => {
    await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/vehicles`);
    const plate = `T12E${Date.now()}`;
    createdPlates.push(plate);
    const imagePath = join(tmpdir(), `ops-vehicles-${plate}.png`);
    writeFileSync(imagePath, PNG_1X1);
    try {
      await page.getByTestId("vehicles-add").click();
      await page.getByTestId("vehicles-model").fill("Photo Car");
      await page.getByTestId("vehicles-plate").fill(plate);
      await page.locator(".ops-photo__file").setInputFiles(imagePath);
      await expect(page.locator('[data-ops-photo][data-state="present"]')).toBeVisible({
        timeout: 15_000,
      });
      await page.getByTestId("vehicles-save").click();
      await expect(page.locator(`[data-vehicle-plate="${plate}"]`)).toBeVisible({ timeout: 15_000 });
    } finally {
      try {
        unlinkSync(imagePath);
      } catch {
        // already gone
      }
    }
    const stored = await withSql(async (sql) => {
      const rows = (await sql`
        select photo_path from public.vehicles where plate = ${plate}
      `) as { photo_path: string | null }[];
      return rows[0]?.photo_path ?? null;
    });
    expect(stored).toBeTruthy();
    expect(stored?.startsWith("vehicles/")).toBe(true);
    expect(stored?.startsWith("data:")).toBe(false);
  });

  test("class panel states the quote clamp and persists a Van capacity edit", async ({ page }) => {
    await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/vehicles?tab=classes`);
    await expect(page.getByTestId("vehicle-class-panel")).toBeVisible();
    await expect(page.getByTestId("vehicle-class-panel")).toContainText(
      "limits the booking widget clamps",
    );
    const van = page.getByTestId("vehicle-class-van");
    await expect(van).toBeVisible();
    await van.getByTestId("vehicle-class-passengers-van").getByRole("button", { name: "Fewer" }).click();
    await van.getByTestId("vehicle-class-save-van").click();
    await expect(van.getByTestId("vehicle-class-passengers-van").locator(".vt-dir-keep")).toHaveText(
      "7",
    );
    const stored = await withSql(async (sql) => {
      const rows = (await sql`
        select passenger_capacity from public.vehicle_classes where slug = 'van'
      `) as { passenger_capacity: number }[];
      return rows[0]?.passenger_capacity ?? null;
    });
    expect(stored).toBe(7);
  });

  test("deleting a class that still has vehicles is refused with SQLSTATE 23503", async ({
    page,
  }) => {
    await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/vehicles`);
    const plate = `T12F${Date.now()}`;
    createdPlates.push(plate);
    await page.getByTestId("vehicles-add").click();
    await page.getByTestId("vehicles-model").fill("Restrict Car");
    await page.getByTestId("vehicles-plate").fill(plate);
    await page.getByTestId("vehicles-save").click();
    await expect(page.locator(`[data-vehicle-plate="${plate}"]`)).toBeVisible({ timeout: 15_000 });
    const classId = await withSql(async (sql) => {
      const rows = (await sql`
        select vehicle_class_id from public.vehicles where plate = ${plate}
      `) as { vehicle_class_id: string }[];
      return rows[0]?.vehicle_class_id ?? null;
    });
    expect(classId).toBeTruthy();
    const code = await withSql(async (sql) => {
      try {
        await sql`delete from public.vehicle_classes where id = ${classId}`;
        return null;
      } catch (err) {
        if (typeof err === "object" && err !== null && "code" in err) {
          return String((err as { code: unknown }).code);
        }
        throw err;
      }
    });
    expect(code).toBe("23503");
  });

  test("dispatcher can delete a vehicle", async ({ page }) => {
    await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/vehicles`);
    const plate = `T12G${Date.now()}`;
    createdPlates.push(plate);
    await page.getByTestId("vehicles-add").click();
    await page.getByTestId("vehicles-model").fill("Gone Car");
    await page.getByTestId("vehicles-plate").fill(plate);
    await page.getByTestId("vehicles-save").click();
    await expect(page.locator(`[data-vehicle-plate="${plate}"]`)).toBeVisible({ timeout: 15_000 });
    await page.getByTestId(`vehicles-delete-${plate}`).click();
    await page.getByTestId("vehicles-delete-confirm").click();
    await expect(page.locator(`[data-vehicle-plate="${plate}"]`)).toHaveCount(0, { timeout: 15_000 });
  });
});

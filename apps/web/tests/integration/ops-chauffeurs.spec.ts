// apps/web/tests/integration/ops-chauffeurs.spec.ts
//
// OPS-06 chauffeur half against a local stack. Tagged @ops-fleet. component-1440 only.
// Skips when local Auth is down — this spec never starts Docker or supabase.
// Initials fallback is asserted before any upload (D-22). Licence numbers stay
// out of the list HTML and the URL. ON DELETE SET NULL is proven through the
// vehicles screen.

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
const PORT = 4295;
const LOCAL_NEXT = join(WEB_ROOT, "node_modules", ".bin", "next");
const NEXT_BIN = LOCAL_NEXT;
const MAIN_DB_PKG = "/Users/koss/Developer/VamosTaxi.eu/packages/db/package.json";
const DB_URL = process.env.OPS_FIXTURE_DB_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const STACK_HINT = "run pnpm db:start && pnpm db:reset from packages/db";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const createdNames: string[] = [];
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

async function cleanupChauffeurs(): Promise<void> {
  const names = createdNames.splice(0, createdNames.length);
  const plates = createdPlates.splice(0, createdPlates.length);
  await withSql(async (sql) => {
    if (names.length > 0) {
      await sql`delete from public.chauffeurs where full_name = any(${names}::text[])`;
    }
    if (plates.length > 0) {
      await sql`delete from public.vehicles where plate = any(${plates}::text[])`;
    }
  });
}

test.describe("ops chauffeurs @ops-fleet", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(120_000);
    const up = await localAuthUp();
    test.skip(!up, STACK_HINT);
    test.skip(!existsSync(LOCAL_NEXT), STACK_HINT);
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
      await cleanupChauffeurs();
    } catch {
      throw new Error(STACK_HINT);
    }
  });

  test.afterAll(async () => {
    try {
      await cleanupChauffeurs();
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

  async function addVehicle(page: import("@playwright/test").Page, plate: string, model: string) {
    createdPlates.push(plate);
    await page.goto(`${baseURL}/ops/vehicles`);
    await page.getByTestId("vehicles-add").click();
    await page.getByTestId("vehicles-model").fill(model);
    await page.getByTestId("vehicles-plate").fill(plate);
    await page.getByTestId("vehicles-save").click();
    await expect(page.locator(`[data-vehicle-plate="${plate}"]`)).toBeVisible({ timeout: 15_000 });
  }

  async function fillChauffeur(
    page: import("@playwright/test").Page,
    opts: {
      name: string;
      phone: string;
      licence: string;
      vehiclePlate?: string;
      languages?: string[];
    },
  ) {
    createdNames.push(opts.name);
    await page.getByTestId("chauffeurs-add").click();
    await page.getByTestId("chauffeurs-name").fill(opts.name);
    await page.getByTestId("chauffeurs-phone").fill(opts.phone);
    await page.getByTestId("chauffeurs-licence").fill(opts.licence);
    if (opts.vehiclePlate) {
      const select = page.getByTestId("chauffeurs-vehicle");
      const option = select.locator("option", { hasText: opts.vehiclePlate });
      const value = await option.getAttribute("value");
      if (value) await select.selectOption(value);
    }
    for (const code of opts.languages ?? []) {
      await page.getByTestId(`chauffeurs-lang-${code}`).click();
    }
    await page.getByTestId("chauffeurs-save").click();
    await expect(page.locator(`[data-chauffeur-name="${opts.name}"]`)).toBeVisible({
      timeout: 15_000,
    });
  }

  test("empty state is the designed seed, not a blank body", async ({ page }) => {
    await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/chauffeurs`);
    await expect(page.locator("[data-page=ops-chauffeurs]")).toBeVisible();
    const empty = page.getByTestId("chauffeurs-empty");
    const rows = page.locator("[data-chauffeur-name]");
    if ((await rows.count()) === 0) {
      await expect(empty).toBeVisible();
      await expect(empty).toContainText("No chauffeurs yet");
    }
  });

  test("zero-photo initials fallback renders before any upload", async ({ page }) => {
    await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/chauffeurs`);
    const stamp = String(Date.now()).slice(-6);
    const name = `C13 ${stamp} Ada`;
    await fillChauffeur(page, {
      name,
      phone: `+4179${stamp}1`,
      licence: `LIC-06-13-${stamp}-A`,
    });
    const row = page.locator(`[data-chauffeur-name="${name}"]`);
    await expect(row.getByTestId("chauffeur-photo-fallback")).toBeVisible();
    await expect(row.getByTestId("chauffeur-photo-fallback")).toContainText("C1");
    const stored = await withSql(async (sql) => {
      const rows = (await sql`
        select photo_path from public.chauffeurs where full_name = ${name}
      `) as { photo_path: string | null }[];
      return rows[0]?.photo_path ?? null;
    });
    expect(stored).toBeNull();
  });

  test("creating a chauffeur with a default vehicle stores the FK and shows the plate", async ({
    page,
  }) => {
    await signInDispatcher(page);
    const stamp = String(Date.now()).slice(-6);
    const plate = `C13P${stamp}`;
    await addVehicle(page, plate, "Chauffeur Car");
    await page.goto(`${baseURL}/ops/chauffeurs`);
    const name = `C13 ${stamp} Bea`;
    await fillChauffeur(page, {
      name,
      phone: `+4179${stamp}2`,
      licence: `LIC-06-13-${stamp}-B`,
      vehiclePlate: plate,
    });
    const row = page.locator(`[data-chauffeur-name="${name}"]`);
    await expect(row.locator(`[data-chauffeur-plate="${plate}"]`)).toBeVisible();
    const stored = await withSql(async (sql) => {
      const rows = (await sql`
        select default_vehicle_id from public.chauffeurs where full_name = ${name}
      `) as { default_vehicle_id: string | null }[];
      return rows[0]?.default_vehicle_id ?? null;
    });
    expect(stored).toBeTruthy();
  });

  test("licence number stays out of the list HTML and the URL", async ({ page }) => {
    await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/chauffeurs`);
    const stamp = String(Date.now()).slice(-6);
    const name = `C13 ${stamp} Cal`;
    const licence = `LIC-SECRET-${stamp}`;
    await fillChauffeur(page, {
      name,
      phone: `+4179${stamp}3`,
      licence,
    });
    const list = page.getByTestId("chauffeurs-table");
    await expect(list).not.toContainText(licence);
    expect(page.url()).not.toContain(licence);
    const requests: string[] = [];
    page.on("request", (req) => requests.push(req.url()));
    await page.reload();
    await expect(page.locator(`[data-chauffeur-name="${name}"]`)).toBeVisible({ timeout: 15_000 });
    expect(page.url()).not.toContain(licence);
    expect(requests.some((url) => url.includes(licence))).toBe(false);
    await expect(page.getByTestId("chauffeurs-table")).not.toContainText(licence);
  });

  test("spoken languages store a de-duplicated sorted ISO array and render translated names", async ({
    page,
  }) => {
    await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/chauffeurs`);
    const stamp = String(Date.now()).slice(-6);
    const name = `C13 ${stamp} Dia`;
    await fillChauffeur(page, {
      name,
      phone: `+4179${stamp}4`,
      licence: `LIC-06-13-${stamp}-D`,
      languages: ["de", "en"],
    });
    const row = page.locator(`[data-chauffeur-name="${name}"]`);
    await expect(row.getByTestId("chauffeurs-langs")).toContainText("German");
    await expect(row.getByTestId("chauffeurs-langs")).toContainText("English");
    await expect(row.getByTestId("chauffeurs-langs")).toContainText("de");
    await expect(row.getByTestId("chauffeurs-langs")).toContainText("en");
    const stored = await withSql(async (sql) => {
      const rows = (await sql`
        select languages from public.chauffeurs where full_name = ${name}
      `) as { languages: string[] }[];
      return rows[0]?.languages ?? [];
    });
    expect(stored).toEqual(["de", "en"]);
  });

  test("an expired licence is marked in danger and sorts to the top of the active group", async ({
    page,
  }) => {
    await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/chauffeurs`);
    const stamp = String(Date.now()).slice(-6);
    const later = `C13 ${stamp} Eve`;
    const expired = `C13 ${stamp} Fay`;
    await fillChauffeur(page, {
      name: later,
      phone: `+4179${stamp}5`,
      licence: `LIC-06-13-${stamp}-E`,
    });
    await fillChauffeur(page, {
      name: expired,
      phone: `+4179${stamp}6`,
      licence: `LIC-06-13-${stamp}-F`,
    });
    await withSql(async (sql) => {
      await sql`
        update public.chauffeurs
        set licence_expires_on = current_date - 1, updated_at = now()
        where full_name = ${expired}
      `;
    });
    await page.reload();
    const names = page.locator("[data-chauffeur-name]");
    await expect(names.first()).toHaveAttribute("data-chauffeur-name", expired);
    await expect(page.locator(`[data-chauffeur-name="${expired}"] [data-licence-state="expired"]`)).toBeVisible();
    const color = await page
      .locator(`[data-chauffeur-name="${expired}"] [data-licence-state="expired"]`)
      .evaluate((el) => getComputedStyle(el).color);
    expect(color).not.toMatch(/255,\s*2(0|1)\d/);
  });

  test("deactivating a chauffeur keeps the row, marks it, and drops it out of the active group", async ({
    page,
  }) => {
    await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/chauffeurs`);
    const stamp = String(Date.now()).slice(-6);
    const active = `C13 ${stamp} Gia`;
    const parked = `C13 ${stamp} Hal`;
    await fillChauffeur(page, {
      name: active,
      phone: `+4179${stamp}7`,
      licence: `LIC-06-13-${stamp}-G`,
    });
    await fillChauffeur(page, {
      name: parked,
      phone: `+4179${stamp}8`,
      licence: `LIC-06-13-${stamp}-H`,
    });
    await page.getByTestId(`chauffeurs-deactivate-${parked}`).click();
    const parkedRow = page.locator(`[data-chauffeur-name="${parked}"]`);
    await expect(parkedRow).toHaveAttribute("data-active", "false", { timeout: 15_000 });
    const names = await page.locator("[data-chauffeur-name]").allTextContents();
    expect(names.indexOf(active)).toBeLessThan(names.indexOf(parked));
  });

  test("deleting the default vehicle through the vehicles screen clears the chauffeur FK", async ({
    page,
  }) => {
    await signInDispatcher(page);
    const stamp = String(Date.now()).slice(-6);
    const plate = `C13Q${stamp}`;
    await addVehicle(page, plate, "Set-null Car");
    await page.goto(`${baseURL}/ops/chauffeurs`);
    const name = `C13 ${stamp} Ivy`;
    await fillChauffeur(page, {
      name,
      phone: `+4179${stamp}9`,
      licence: `LIC-06-13-${stamp}-I`,
      vehiclePlate: plate,
    });
    await expect(page.locator(`[data-chauffeur-plate="${plate}"]`)).toBeVisible();
    await page.goto(`${baseURL}/ops/vehicles`);
    await page.getByTestId(`vehicles-delete-${plate}`).click();
    await page.getByTestId("vehicles-delete-confirm").click();
    await expect(page.locator(`[data-vehicle-plate="${plate}"]`)).toHaveCount(0, { timeout: 15_000 });
    await page.goto(`${baseURL}/ops/chauffeurs`);
    const row = page.locator(`[data-chauffeur-name="${name}"]`);
    await expect(row).toBeVisible();
    await expect(row.locator(`[data-chauffeur-plate="${plate}"]`)).toHaveCount(0);
    const stored = await withSql(async (sql) => {
      const rows = (await sql`
        select default_vehicle_id from public.chauffeurs where full_name = ${name}
      `) as { default_vehicle_id: string | null }[];
      return rows[0]?.default_vehicle_id ?? null;
    });
    expect(stored).toBeNull();
  });

  test("photo upload stores an R2 key, never a data URI", async ({ page }) => {
    await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/chauffeurs`);
    const stamp = String(Date.now()).slice(-6);
    const name = `C13 ${stamp} Jay`;
    createdNames.push(name);
    const imagePath = join(tmpdir(), `ops-chauffeurs-${stamp}.png`);
    writeFileSync(imagePath, PNG_1X1);
    try {
      await page.getByTestId("chauffeurs-add").click();
      await page.getByTestId("chauffeurs-name").fill(name);
      await page.getByTestId("chauffeurs-phone").fill(`+4179${stamp}0`);
      await page.getByTestId("chauffeurs-licence").fill(`LIC-06-13-${stamp}-J`);
      await page.locator(".ops-photo__file").setInputFiles(imagePath);
      await expect(page.locator('[data-ops-photo][data-state="present"]')).toBeVisible({
        timeout: 15_000,
      });
      await page.getByTestId("chauffeurs-save").click();
      await expect(page.locator(`[data-chauffeur-name="${name}"]`)).toBeVisible({ timeout: 15_000 });
    } finally {
      try {
        unlinkSync(imagePath);
      } catch {
        // already gone
      }
    }
    const stored = await withSql(async (sql) => {
      const rows = (await sql`
        select photo_path from public.chauffeurs where full_name = ${name}
      `) as { photo_path: string | null }[];
      return rows[0]?.photo_path ?? null;
    });
    expect(stored).toBeTruthy();
    expect(stored?.startsWith("chauffeurs/")).toBe(true);
    expect(stored?.startsWith("data:")).toBe(false);
  });

  test("dispatcher can delete a chauffeur", async ({ page }) => {
    await signInDispatcher(page);
    await page.goto(`${baseURL}/ops/chauffeurs`);
    const stamp = String(Date.now()).slice(-6);
    const name = `C13 ${stamp} Kit`;
    await fillChauffeur(page, {
      name,
      phone: `+4179111${stamp.slice(-4)}`,
      licence: `LIC-06-13-${stamp}-K`,
    });
    await page.getByTestId(`chauffeurs-delete-${name}`).click();
    await page.getByTestId("chauffeurs-delete-confirm").click();
    await expect(page.locator(`[data-chauffeur-name="${name}"]`)).toHaveCount(0, { timeout: 15_000 });
  });
});

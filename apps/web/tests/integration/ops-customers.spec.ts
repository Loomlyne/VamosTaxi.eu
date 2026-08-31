// apps/web/tests/integration/ops-customers.spec.ts
//
// OPS-07: staff can search customers and read booking history. Tagged
// @ops-customers. component-1440 only. Skips when local Auth is down.

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
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
const MAIN_WEB = "/Users/koss/Developer/VamosTaxi.eu/apps/web";
const NEXT_JS = join(MAIN_WEB, "node_modules", "next", "dist", "bin", "next");
const MAIN_DB_PKG = "/Users/koss/Developer/VamosTaxi.eu/packages/db/package.json";
const DB_URL = process.env.OPS_FIXTURE_DB_URL ?? "postgres://postgres:***@127.0.0.1:54322/postgres";

const ANNIKA_NAME = "Annika-0609";
const ANNIKA_EMAIL = "annika.0609@vamos.test";
const REDACTED_NAME = "Redacted-0609";
const REDACTED_EMAIL = "redacted.0609@vamos.test";
const MISS_QUERY = "no-such-customer-0609-zzzz";

let devServer: ChildProcess | null = null;
let baseURL = "";
const createdCustomerIds: string[] = [];
const createdBookingIds: string[] = [];

function loadSql() {
  const req = createRequire(MAIN_DB_PKG);
  const postgres = req("postgres") as (url: string) => {
    (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
    end: (opts?: { timeout?: number }) => Promise<void>;
  };
  return postgres;
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

async function seedCustomers(): Promise<{ ordinaryId: string; redactedId: string }> {
  return withSql(async (sql) => {
    const classes = (await sql`
      select id from public.vehicle_classes where slug = 'economy' limit 1
    `) as { id: string }[];
    const vehicleClassId = classes[0]?.id;
    if (!vehicleClassId) throw new Error("seed vehicle_classes.economy missing — run pnpm db:reset");

    const ordinary = (await sql`
      insert into public.customers (full_name, email, phone, type, company, note)
      values (${ANNIKA_NAME}, ${ANNIKA_EMAIL}, '+41 79 000 00 09', 'private', 'Vamos Test GmbH', 'ops-0609 note')
      returning id
    `) as { id: string }[];
    const ordinaryId = ordinary[0]!.id;
    createdCustomerIds.push(ordinaryId);

    const redacted = (await sql`
      insert into public.customers (full_name, email, phone, type, erased_at)
      values (${REDACTED_NAME}, ${REDACTED_EMAIL}, '+41 79 000 00 10', 'private', now())
      returning id
    `) as { id: string }[];
    const redactedId = redacted[0]!.id;
    createdCustomerIds.push(redactedId);

    const older = (await sql`
      insert into public.bookings (
        customer_id, contact_name, contact_email, contact_phone, status, created_at
      )
      values (
        ${ordinaryId}::uuid, ${ANNIKA_NAME}, ${ANNIKA_EMAIL}, '+41 79 000 00 09',
        'confirmed', now() - interval '2 days'
      )
      returning id, reference
    `) as { id: string; reference: string }[];
    const olderId = older[0]!.id;
    createdBookingIds.push(olderId);

    const newer = (await sql`
      insert into public.bookings (
        customer_id, contact_name, contact_email, contact_phone, status,
        price_total_rappen, created_at
      )
      values (
        ${ordinaryId}::uuid, ${ANNIKA_NAME}, ${ANNIKA_EMAIL}, '+41 79 000 00 09',
        'paid', 18500, now() - interval '1 day'
      )
      returning id, reference
    `) as { id: string; reference: string }[];
    const newerId = newer[0]!.id;
    createdBookingIds.push(newerId);

    await sql`
      insert into public.booking_legs (
        booking_id, leg_seq, direction, pickup_text, dropoff_text,
        scheduled_at, scheduled_local, flight_no, vehicle_class_id, pax, bags, status
      )
      values
        (
          ${olderId}::uuid, 1, 'outbound', 'Zürich Airport', 'Bahnhofstrasse 1, Zürich',
          timestamptz '2026-09-15 08:10:00+02', '2026-09-15T08:10', 'LX1234',
          ${vehicleClassId}::uuid, 2, 2, 'confirmed'
        ),
        (
          ${newerId}::uuid, 1, 'outbound', 'Hotel Baur au Lac', 'Zürich Airport',
          timestamptz '2026-09-20 14:40:00+02', '2026-09-20T14:40', null,
          ${vehicleClassId}::uuid, 1, 1, 'paid'
        )
    `;

    return { ordinaryId, redactedId };
  });
}

async function cleanupCustomers(): Promise<void> {
  const bookingIds = createdBookingIds.splice(0, createdBookingIds.length);
  const customerIds = createdCustomerIds.splice(0, createdCustomerIds.length);
  if (bookingIds.length === 0 && customerIds.length === 0) return;
  await withSql(async (sql) => {
    if (bookingIds.length > 0) {
      await sql`delete from public.booking_legs where booking_id = any(${bookingIds}::uuid[])`;
      await sql`delete from public.bookings where id = any(${bookingIds}::uuid[])`;
    }
    if (customerIds.length > 0) {
      await sql`delete from public.customers where id = any(${customerIds}::uuid[])`;
    }
  });
}

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== RUN_PROJECT,
    "Customer proofs run once under component-1440.",
  );
});

test.describe("ops customers @ops-customers", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(180_000);
    const up = await localAuthUp();
    test.skip(!up, "local auth health is down — run pnpm db:start");
    test.skip(
      !process.env.SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY,
      "SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY unset — live proofs skipped",
    );
    test.skip(!existsSync(NEXT_JS), "Next binary missing — live proofs skipped");
    baseURL = `http://localhost:${PORT}`;
    devServer = spawn(process.execPath, [NEXT_JS, "dev", "-p", String(PORT)], {
      cwd: WEB_ROOT,
      stdio: "ignore",
      detached: true,
      env: {
        ...process.env,
        NODE_PATH: join(MAIN_WEB, "node_modules"),
      },
    });
    try {
      await waitForNextServer(`${baseURL}/ops/sign-in`, 25_000);
    } catch (error) {
      test.skip(true, `local next did not become ready — ${String(error)}`);
    }
  });

  test.afterAll(async () => {
    await cleanupCustomers().catch(() => undefined);
    await resetStaffFixtures();
    if (devServer?.pid) {
      try {
        process.kill(-devServer.pid, "SIGTERM");
      } catch {
        // gone
      }
    }
  });

  test("empty search miss, list, history, redaction, CHF 000, no booking write form", async ({
    page,
  }) => {
    const fixture = await createStaffFixture({ role: "dispatcher", enrolTotp: true });
    if (!fixture.factorSecret) throw new Error("expected factor secret");

    await page.goto(`${baseURL}/ops/sign-in`);
    await page.locator('input[name="email"]').fill(fixture.email);
    await page.locator('input[name="password"]').fill(fixture.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/ops\/mfa-challenge/);
    await page.locator('input[name="code"]').fill(totpCode(fixture.factorSecret));
    await page.locator('button[type="submit"]').click();
    await page.waitForURL((url) => !url.pathname.includes("/ops/mfa-challenge"));

    await page.goto(`${baseURL}/ops/customers?q=${encodeURIComponent(MISS_QUERY)}`);
    await expect(page.locator("[data-page='ops-customers']")).toBeVisible();
    await expect(page.locator("[data-customers-empty]")).toBeVisible();
    expect(page.url()).toContain(`q=${encodeURIComponent(MISS_QUERY)}`);

    const ids = await seedCustomers();

    await page.goto(`${baseURL}/ops/customers`);
    await page.locator('input[name="q"]').fill(ANNIKA_NAME);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/q=/);
    expect(new URL(page.url()).searchParams.get("q")).toBe(ANNIKA_NAME);
    await expect(page.locator(`[data-customer-id='${ids.ordinaryId}']`)).toBeVisible();
    await expect(page.locator(`[data-customer-id='${ids.ordinaryId}']`)).toContainText(ANNIKA_NAME);

    await page.reload();
    expect(new URL(page.url()).searchParams.get("q")).toBe(ANNIKA_NAME);
    await expect(page.locator(`[data-customer-id='${ids.ordinaryId}']`)).toBeVisible();

    await page.locator(`[data-customer-id='${ids.ordinaryId}']`).click();
    await page.waitForURL(new RegExp(`/ops/customers/${ids.ordinaryId}`));
    await expect(page.locator("[data-page='ops-customer-detail']")).toBeVisible();
    await expect(page.locator("[data-customer-detail]")).toContainText(ANNIKA_NAME);
    await expect(page.locator("[data-booking-history] [data-booking-id]")).toHaveCount(2);
    await expect(page.locator("[data-price-null='1'] [data-booking-total]")).toHaveText("CHF 000");
    await expect(page.locator("[data-booking-history]")).toContainText("Zürich Airport");
    await expect(page.locator("[data-booking-history]")).toContainText("2026-09-15T08:10");

    const detailHtml = await page.content();
    expect(detailHtml.match(/<form[^>]+action=["'][^"']*booking/i)).toBeNull();

    await page.goto(`${baseURL}/ops/customers/${ids.redactedId}`);
    await expect(page.locator("[data-redacted-notice]")).toBeVisible();
    await expect(page.locator("[data-customer-detail]")).not.toContainText(REDACTED_EMAIL);
    const redactedHtml = await page.content();
    expect(redactedHtml).not.toContain(REDACTED_EMAIL);
    expect(redactedHtml.match(/<form[^>]+action=["'][^"']*booking/i)).toBeNull();
  });
});

// apps/web/tests/integration/ops-dc-customers.spec.ts
//
// Customers JSON hydrates from GET; delete is a tombstone. Empty stays
// empty until the API returns rows. Unauthenticated envelope matches
// staff-json (JSON 401). Dual mount + DC sync are file proofs.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { jsonErr, jsonOk, staffStatus } from "../../lib/ops/staff-json";

const RUN_PROJECT = "component-1440";
const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");
const repoRoot = join(webRoot, "../..");

function readWeb(rel: string): string {
  return readFileSync(join(webRoot, rel), "utf8");
}

function readRepo(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== RUN_PROJECT,
    "Customers proofs do not vary by breakpoint — this spec runs once, under component-1440.",
  );
});

test.describe("GET /api/staff/customers @ops-dc-customers", () => {
  test("unauthenticated envelope is JSON 401 { ok: false, code: no-session }", async () => {
    expect(staffStatus("no-session")).toEqual({ code: "no-session", status: 401 });
    const response = jsonErr("no-session", 401);
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    expect(await response.json()).toEqual({ ok: false, code: "no-session" });
  });

  test("empty loadCustomers result is JSON { ok: true, data: [] }", async () => {
    const response = jsonOk([]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: [] });
  });

  test("list is GET; detail is GET + DELETE", () => {
    const list = readWeb("app/[locale]/(ops)/api/staff/customers/route.ts");
    const detail = readWeb("app/[locale]/(ops)/api/staff/customers/[id]/route.ts");
    expect(list).toMatch(/export const GET/);
    expect(list).toMatch(/loadCustomers/);
    expect(detail).toMatch(/export async function GET/);
    expect(detail).toMatch(/loadCustomerHistory/);
    expect(detail).toMatch(/export async function PATCH/);
    expect(detail).toMatch(/upsertCustomer/);
    expect(detail).toMatch(/export async function DELETE/);
    expect(detail).toMatch(/eraseCustomer/);
    expect(list + detail).not.toMatch(/Traveller/);
  });

  test("booking-sourced customer id uses array_agg, not min(uuid)", () => {
    const src = readWeb("lib/ops/customers.ts");
    expect(src).toMatch(/array_agg\(b\.id order by b\.created_at desc\)/);
    expect(src).not.toMatch(/min\(b\.id\)/);
    expect(src).toMatch(/export async function eraseCustomer/);
  });

  test("app/api/staff/customers dual-re-exports the (ops) GET and DELETE", () => {
    const publicList = readWeb("app/api/staff/customers/route.ts");
    const publicOne = readWeb("app/api/staff/customers/[id]/route.ts");
    expect(publicList).toMatch(/export\s*\{\s*GET\s*\}/);
    expect(publicList).toMatch(/\[locale\]\/\(ops\)\/api\/staff\/customers\/route/);
    expect(publicOne).toMatch(/export\s*\{\s*GET,\s*PATCH,\s*DELETE\s*\}/);
    expect(publicOne).toMatch(/\[locale\]\/\(ops\)\/api\/staff\/customers\/\[id\]\/route/);
  });

  test("OpsCustomers.dc.html saves, lists History under Notes, deletes via remove", () => {
    const html = readRepo("app/ops/OpsCustomers.dc.html");
    const twin = readWeb("public/app/ops/OpsCustomers.dc.html");
    expect(html).toBe(twin);
    expect(html).not.toMatch(/Traveller/);
    expect(html).toMatch(/customers\.remove/);
    expect(html).toMatch(/customers\.update/);
    expect(html).toMatch(/onSave="/);
    expect(html).toMatch(/historyRows/);
    expect(html).toMatch(/history-label/);
    expect(html).not.toMatch(/api\.request\(['"]POST/);
  });

  test("bookings item route cancels on PATCH and tombstones on DELETE", () => {
    const item = readWeb("app/[locale]/(ops)/api/staff/bookings/[id]/route.ts");
    const pub = readWeb("app/api/staff/bookings/[id]/route.ts");
    const write = readWeb("lib/ops/bookings-write.ts");
    expect(item).toMatch(/export const PATCH/);
    expect(item).toMatch(/export const DELETE/);
    expect(item).toMatch(/cancelBooking/);
    expect(item).toMatch(/markRefunded/);
    expect(item).toMatch(/updateBooking/);
    expect(item).toMatch(/eraseBooking/);
    expect(write).toMatch(/status = 'cancelled'/);
    expect(write).toMatch(/erased_at = now\(\)/);
    expect(pub).toMatch(/export\s*\{\s*PATCH,\s*DELETE\s*\}/);
  });

  test("OpsDetail Cancel opens a recap dialog; History tab is gone", () => {
    const html = readRepo("app/ops/OpsDetail.dc.html");
    const twin = readWeb("public/app/ops/OpsDetail.dc.html");
    expect(html).toBe(twin);
    expect(html).toMatch(/openCancel/);
    expect(html).toMatch(/confirmCancel/);
    expect(html).toMatch(/status: 'cancelled'/);
    expect(html).toMatch(/openEdit/);
    expect(html).toMatch(/saveEdit/);
    expect(html).not.toMatch(/vamosOpsEdit/);
    expect(html).not.toMatch(/tabItems: \[t\.details, t\.history\]/);
    expect(html).not.toMatch(/isHistory/);
  });
});

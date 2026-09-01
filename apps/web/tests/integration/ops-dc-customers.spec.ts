// apps/web/tests/integration/ops-dc-customers.spec.ts
//
// OPS-07 / D-26 / D-35: customers JSON is GET-only, empty stays empty,
// OpsCustomers.dc.html does not write. Database-free. Unauthenticated
// envelope matches staff-json (JSON 401). Dual mount + DC sync are
// file proofs — the GET handler hits Hyperdrive via loadCustomers.

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

  test("list and detail routes export GET only — no POST/PATCH/DELETE", () => {
    const list = readWeb("app/[locale]/(ops)/api/staff/customers/route.ts");
    const detail = readWeb("app/[locale]/(ops)/api/staff/customers/[id]/route.ts");
    for (const src of [list, detail]) {
      expect(src).toMatch(/export const GET|export async function GET/);
      expect(src).not.toMatch(/export const POST/);
      expect(src).not.toMatch(/export async function POST/);
      expect(src).not.toMatch(/export const PATCH/);
      expect(src).not.toMatch(/export async function PATCH/);
      expect(src).not.toMatch(/export const PUT/);
      expect(src).not.toMatch(/export const DELETE/);
      expect(src).not.toMatch(/export async function DELETE/);
    }
    expect(list).toMatch(/loadCustomers/);
    expect(detail).toMatch(/loadCustomerHistory/);
    expect(list + detail).not.toMatch(/Traveller/);
  });

  test("app/api/staff/customers dual-re-exports the (ops) GET", () => {
    const publicList = readWeb("app/api/staff/customers/route.ts");
    const publicOne = readWeb("app/api/staff/customers/[id]/route.ts");
    expect(publicList).toMatch(/export\s*\{\s*GET\s*\}/);
    expect(publicList).toMatch(/\[locale\]\/\(ops\)\/api\/staff\/customers\/route/);
    expect(publicList).not.toMatch(/export\s*\{\s*GET\s*,\s*POST/);
    expect(publicOne).toMatch(/export\s*\{\s*GET\s*\}/);
    expect(publicOne).toMatch(/\[locale\]\/\(ops\)\/api\/staff\/customers\/\[id\]\/route/);
  });

  test("OpsCustomers.dc.html is GET-only — no upsert/remove, no Traveller seed", () => {
    const html = readRepo("app/ops/OpsCustomers.dc.html");
    expect(html).not.toMatch(/Traveller/);
    expect(html).not.toMatch(/customers\.upsert/);
    expect(html).not.toMatch(/customers\.remove/);
    expect(html).not.toMatch(/customers\.add\(/);
    expect(html).not.toMatch(/onSave="/);
    expect(html).not.toMatch(/onDelete="/);
    expect(html).toMatch(/api\.request\('GET'/);
    expect(html).toMatch(/\/api\/staff\/customers\//);
    expect(html).not.toMatch(/api\.request\(['"]POST/);
    expect(html).not.toMatch(/api\.request\(['"]PATCH/);
    expect(html).not.toMatch(/api\.request\(['"]DELETE/);
  });
});

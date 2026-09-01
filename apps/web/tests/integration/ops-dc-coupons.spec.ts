// apps/web/tests/integration/ops-dc-coupons.spec.ts
//
// Unauthenticated GET /api/staff/coupons is JSON 401. Dual mount + empty DC
// table. Database-free — the GET door is withStaff (staff-json.test.ts).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { jsonErr, jsonOk, staffStatus } from "../../lib/ops/staff-json";

const RUN_PROJECT = "component-1440";
const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");
const repoRoot = join(webRoot, "../..");

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== RUN_PROJECT,
    "Coupons proofs do not vary by breakpoint — this spec runs once, under component-1440.",
  );
});

test.describe("GET /api/staff/coupons @ops-dc-coupons", () => {
  test("unauthenticated envelope is JSON 401 { ok: false, code: no-session }", async () => {
    expect(staffStatus("no-session")).toEqual({ code: "no-session", status: 401 });
    const response = jsonErr("no-session", 401);
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    expect(await response.json()).toEqual({ ok: false, code: "no-session" });
  });

  test("empty list envelope is JSON { ok: true, data: [] }", async () => {
    const response = jsonOk([]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: [] });
  });

  test("app/api/staff/coupons re-exports the (ops) GET and POST", () => {
    const publicRoute = readFileSync(join(webRoot, "app/api/staff/coupons/route.ts"), "utf8");
    expect(publicRoute).toMatch(/export\s*\{\s*GET\s*,\s*POST\s*\}/);
    expect(publicRoute).toMatch(/\[locale\]\/\(ops\)\/api\/staff\/coupons\/route/);
  });

  test("ops coupons routes wrap loadCoupons / insertCoupon / withStaff", () => {
    const list = readFileSync(
      join(webRoot, "app/[locale]/(ops)/api/staff/coupons/route.ts"),
      "utf8",
    );
    const item = readFileSync(
      join(webRoot, "app/[locale]/(ops)/api/staff/coupons/[id]/route.ts"),
      "utf8",
    );
    expect(list).toMatch(/withStaff/);
    expect(list).toMatch(/loadCoupons/);
    expect(list).toMatch(/insertCoupon/);
    expect(item).toMatch(/withStaff/);
    expect(item).toMatch(/updateCouponRecord/);
    expect(item).toMatch(/setCouponActiveRecord/);
    expect(item).toMatch(/deleteCouponRecord/);
    const lib = readFileSync(join(webRoot, "lib/ops/coupons.ts"), "utf8");
    expect(lib).toMatch(/assertCouponInput/);
    expect(lib).toMatch(/asStaff/);
  });

  test("app/api/staff/coupons/[id] re-exports PATCH and DELETE", () => {
    const publicRoute = readFileSync(join(webRoot, "app/api/staff/coupons/[id]/route.ts"), "utf8");
    expect(publicRoute).toMatch(/export\s*\{\s*PATCH\s*,\s*DELETE\s*\}/);
    expect(publicRoute).toMatch(/\[locale\]\/\(ops\)\/api\/staff\/coupons\/\[id\]\/route/);
  });

  test("OpsCoupons.dc.html uses VamosOps.coupons and not localStorage", () => {
    const html = readFileSync(join(repoRoot, "app/ops/OpsCoupons.dc.html"), "utf8");
    expect(html).toMatch(/VamosOps\.coupons/);
    expect(html).not.toMatch(/localStorage/);
  });

  test("does not seed WELCOME / CORPORATE / SKI rows", () => {
    const html = readFileSync(join(repoRoot, "app/ops/OpsCoupons.dc.html"), "utf8");
    const data = readFileSync(join(repoRoot, "app/vamos-ops-data.js"), "utf8");
    expect(html).not.toMatch(/code:\s*['\"]WELCOME['\"]/);
    expect(html).not.toMatch(/code:\s*['\"]CORPORATE['\"]/);
    expect(html).not.toMatch(/code:\s*['\"]SKI['\"]/);
    expect(data).not.toMatch(/code:\s*['\"]WELCOME['\"]/);
    expect(data).not.toMatch(/WELCOME.*CORPORATE.*SKI/);
  });
});

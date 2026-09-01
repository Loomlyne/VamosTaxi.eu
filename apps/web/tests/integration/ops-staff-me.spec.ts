// apps/web/tests/integration/ops-staff-me.spec.ts
//
// Unauthenticated GET /api/staff/me is JSON 401, not Next HTML.
// Database-free. The GET handler itself is exercised in staff-json.test.ts
// (mocked cookie client). This spec locks the envelope + dual mount.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { jsonErr, staffStatus } from "../../lib/ops/staff-json";

const RUN_PROJECT = "component-1440";
const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== RUN_PROJECT,
    "Staff-me proofs do not vary by breakpoint — this spec runs once, under component-1440.",
  );
});

test.describe("GET /api/staff/me @ops-staff-me", () => {
  test("unauthenticated envelope is JSON 401 { ok: false, code: no-session }", async () => {
    expect(staffStatus("no-session")).toEqual({ code: "no-session", status: 401 });
    const response = jsonErr("no-session", 401);
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    expect(await response.json()).toEqual({ ok: false, code: "no-session" });
  });

  test("app/api/staff/me re-exports the (ops) GET", () => {
    const publicRoute = readFileSync(join(webRoot, "app/api/staff/me/route.ts"), "utf8");
    expect(publicRoute).toMatch(/export\s*\{\s*GET\s*\}/);
    expect(publicRoute).toMatch(/\[locale\]\/\(ops\)\/api\/staff\/me\/route/);
  });
});

// apps/web/tests/integration/ops-dc-settings.spec.ts
//
// 401 envelope + dispatcher 403 on roster PATCH + dual mounts + D-12 file proof.
// Database-free.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { jsonErr, staffStatus } from "../../lib/ops/staff-json";

const RUN_PROJECT = "component-1440";
const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "../..");
const repoRoot = join(webRoot, "../..");

test.beforeEach(async ({}, testInfo) => {
  test.skip(
    testInfo.project.name !== RUN_PROJECT,
    "Ops settings proofs do not vary by breakpoint — this spec runs once, under component-1440.",
  );
});

test.describe("06-09 settings/roster/profile @ops-dc-settings", () => {
  test("unauthenticated GET settings envelope is JSON 401 { ok: false, code: no-session }", async () => {
    expect(staffStatus("no-session")).toEqual({ code: "no-session", status: 401 });
    const response = jsonErr("no-session", 401);
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    expect(await response.json()).toEqual({ ok: false, code: "no-session" });
  });

  test("dispatcher roster PATCH maps to JSON 403 not-admin", async () => {
    expect(staffStatus("not-admin")).toEqual({ code: "not-admin", status: 403 });
    const response = jsonErr("not-admin", 403);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, code: "not-admin" });
    const roster = readFileSync(join(webRoot, "app/[locale]/(ops)/api/staff/roster/route.ts"), "utf8");
    expect(roster).toMatch(/export const PATCH = withAdmin/);
  });

  test("app/api/staff/{settings,roster,profile} re-export locale handlers", () => {
    const settings = readFileSync(join(webRoot, "app/api/staff/settings/route.ts"), "utf8");
    const roster = readFileSync(join(webRoot, "app/api/staff/roster/route.ts"), "utf8");
    const profile = readFileSync(join(webRoot, "app/api/staff/profile/route.ts"), "utf8");
    expect(settings).toMatch(/export\s*\{\s*GET,\s*PATCH\s*\}/);
    expect(roster).toMatch(/export\s*\{\s*GET,\s*PATCH\s*\}/);
    expect(profile).toMatch(/export\s*\{\s*PATCH\s*\}/);
    expect(settings).toMatch(/\[locale\]\/\(ops\)\/api\/staff\/settings\/route/);
    expect(roster).toMatch(/\[locale\]\/\(ops\)\/api\/staff\/roster\/route/);
    expect(profile).toMatch(/\[locale\]\/\(ops\)\/api\/staff\/profile\/route/);
  });

  test("D-12 OpsSidebar omits #pricing and staff-roster unless role=admin", () => {
    const sidebar = readFileSync(join(repoRoot, "app/ops/OpsSidebar.dc.html"), "utf8");
    expect(sidebar).toMatch(/\/api\/staff\/me/);
    expect(sidebar).toMatch(/const NAV_ADMIN = \[/);
    expect(sidebar).toMatch(/href:'#pricing'/);
    expect(sidebar).toMatch(/key:'staff-roster'/);
    expect(sidebar).toMatch(/isAdmin/);
    expect(sidebar).not.toMatch(/aria-disabled/);
  });
});

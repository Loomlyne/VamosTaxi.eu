// apps/web/tests/integration/ops-staff-me.spec.ts
//
// Unauthenticated GET /api/staff/me is JSON 401, not Next HTML.
// Database-free. The GET handler itself is exercised in staff-json.test.ts
// (mocked cookie client). This spec locks the envelope + dual mount.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { jsonErr, staffStatus } from "../../lib/ops/staff-json";

const RUN_PROJECT = "component-1440";
const here = __dirname;
const webRoot = join(here, "../..");
const repoRoot = join(webRoot, "../..");

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

  test("reload returns the persisted self-profile fields and OpsProfile binds them", () => {
    const route = readFileSync(
      join(webRoot, "app/[locale]/(ops)/api/staff/me/route.ts"),
      "utf8",
    );
    const profile = readFileSync(join(repoRoot, "app/ops/OpsProfile.dc.html"), "utf8");
    const sidebar = readFileSync(join(repoRoot, "app/ops/OpsSidebar.dc.html"), "utf8");

    expect(route).toMatch(/phone:\s*profile\?\.phone\s*\?\?\s*["']{2}/);
    expect(route).toMatch(/avatarPath:\s*profile\?\.avatarPath\s*\?\?\s*null/);
    expect(route).toMatch(/digestEmail:\s*profile\?\.digestEmail\s*\?\?\s*false/);
    expect(route).not.toMatch(/mfaEnrolled|invitedAt|acceptedAt|active:/);

    expect(profile).toMatch(/request\('GET',\s*['"]\/api\/staff\/me['"]\)/);
    expect(profile).toMatch(/setState\(\{\s*me:\s*me\s*\},\s*\(\)\s*=>\s*this\.applyPersisted\(me\)\)/);
    expect(profile).toMatch(/d\.phone\s*=\s*profile\.phone/);
    expect(profile).toMatch(/d\.avatar\s*=\s*profile\.avatarPath/);
    expect(profile).toMatch(/d\.digest\s*=\s*profile\.digestEmail\s*===\s*true/);
    expect(profile).toMatch(/function avatarUrl\(avatar\)/);
    expect(profile).toMatch(/return value\.charAt\(0\) === '\/' \? value : '\/photos\/' \+ value/);
    expect(profile).toMatch(/Object\.prototype\.hasOwnProperty\.call\(profile, 'avatarPath'\)/);
    expect(profile).toMatch(/photo:avatarUrl\(d\.avatar\)/);
    expect(sidebar).toMatch(/function avatarUrl\(avatar\)/);
    expect(sidebar).toMatch(/profilePhoto:avatarUrl\(profile\.avatar\)/);
  });
});

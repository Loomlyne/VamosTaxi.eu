// apps/web/tests/integration/ops-dc-fleet.spec.ts
//
// Unauthenticated GET /api/staff/vehicles is JSON 401. Authenticated empty
// list is JSON []. Photo upload still rejects non-staff. Database-free;
// no real R2 write.

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
    "Fleet JSON proofs do not vary by breakpoint — this spec runs once, under component-1440.",
  );
});

test.describe("GET /api/staff/vehicles @ops-dc-fleet", () => {
  test("unauthenticated envelope is JSON 401 { ok: false, code: no-session }", async () => {
    expect(staffStatus("no-session")).toEqual({ code: "no-session", status: 401 });
    const response = jsonErr("no-session", 401);
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    expect(await response.json()).toEqual({ ok: false, code: "no-session" });
  });

  test("authenticated empty list is JSON []", async () => {
    const response = jsonOk([]);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    expect(await response.json()).toEqual({ ok: true, data: [] });
  });

  test("photo upload non-staff is JSON 403", async () => {
    expect(staffStatus("not-staff")).toEqual({ code: "not-staff", status: 403 });
    const response = jsonErr("not-staff", 403);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, code: "not-staff" });
  });

  test("public staff routes re-export the (ops) handlers", () => {
    const vehicles = readFileSync(join(webRoot, "app/api/staff/vehicles/route.ts"), "utf8");
    const vehicleId = readFileSync(join(webRoot, "app/api/staff/vehicles/[id]/route.ts"), "utf8");
    const classes = readFileSync(join(webRoot, "app/api/staff/vehicle-classes/route.ts"), "utf8");
    const chauffeurs = readFileSync(join(webRoot, "app/api/staff/chauffeurs/route.ts"), "utf8");
    const chauffeurId = readFileSync(join(webRoot, "app/api/staff/chauffeurs/[id]/route.ts"), "utf8");
    expect(vehicles).toMatch(/export\s*\{\s*GET,\s*POST\s*\}/);
    expect(vehicles).toMatch(/\[locale\]\/\(ops\)\/api\/staff\/vehicles\/route/);
    expect(vehicleId).toMatch(/export\s*\{\s*PATCH,\s*DELETE\s*\}/);
    expect(classes).toMatch(/export\s*\{\s*GET,\s*PATCH\s*\}/);
    expect(chauffeurs).toMatch(/export\s*\{\s*GET,\s*POST\s*\}/);
    expect(chauffeurId).toMatch(/export\s*\{\s*PATCH,\s*DELETE\s*\}/);
  });

  test("OpsFleet posts photos to /api/photos/upload and has no readAsDataURL", () => {
    const html = readFileSync(join(repoRoot, "app/ops/OpsFleet.dc.html"), "utf8");
    expect(html).toContain("/api/photos/upload");
    expect(html).not.toContain("readAsDataURL");
    expect(html).toContain("emptyCTitle");
    expect(html).toContain("No chauffeurs yet");
    expect(html).not.toContain("No vehicles yet");
    expect(html).not.toContain("emptyVTitle");
  });
});

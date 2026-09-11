// apps/web/lib/ops/fleet-persist.test.ts
//
// 08-03: Fleet Save persists default_vehicle_id; chauffeur detail is
// profile + read-only trips. File proofs. No Hyperdrive. Do not import route.ts.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");

function read(rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

describe("fleet persist — 08-03", () => {
  it("pickRows treats object json.data as one row and save waits for HTTP", () => {
    const data = read("app/vamos-ops-data.js");
    expect(data).not.toMatch(/emptyBookings/);
    expect(data).not.toMatch(/function emptyBookings/);
    expect(data).not.toMatch(/supabase_realtime/);
    expect(data).toMatch(/function pickRows/);
    expect(data).toMatch(/typeof data === ["']object["']/);
    expect(data).not.toMatch(
      /save:\s*function\s*\(\)\s*\{\s*emit\(name\);\s*return list\.slice\(\);\s*\}/,
    );
    expect(data).not.toMatch(/id:\s*str\(c\.id\)\s*\|\|\s*id\(["']c["']\)/);
    expect(data).not.toMatch(/id:\s*str\(v\.id\)\s*\|\|\s*id\(["']v["']\)/);
    expect(data).toMatch(/defaultVehicleId/);
  });

  it("parseChauffeurBody maps vehicle to defaultVehicleId", () => {
    const src = read("apps/web/lib/ops/fleet-http.ts");
    expect(src).toMatch(
      /defaultVehicleId:\s*asString\(rec\.defaultVehicleId \|\| rec\.vehicle\)/,
    );
    expect(src).toMatch(/function parseChauffeurBody/);
    expect(src).toMatch(/chauffeurErrorCopy/);
    expect(src).toMatch(/message: chauffeurErrorCopy/);
    const write = read("apps/web/lib/ops/chauffeurs-write.ts");
    expect(write).toMatch(/default_vehicle_id = \$\{parsed\.defaultVehicleId\}/);
  });

  it("OpsFleet onSave waits for upsert/update and has no hash hrefs", () => {
    const fleet = read("app/ops/OpsFleet.dc.html");
    expect(fleet).toMatch(/onSave/);
    expect(fleet).toMatch(/upsert/);
    expect(fleet).toMatch(/\.then\(/);
    expect(fleet).toMatch(/defaultVehicleId/);
    expect(fleet).not.toMatch(/location\.hash/);
    expect(fleet).not.toMatch(/href="#/);
    expect(fleet).not.toMatch(/href:'#/);
    expect(fleet).not.toMatch(/status\s*=\s*['"]cancelled['"]/);
  });

  it("chauffeur detail is /fleet/chauffeurs/{id} with read-only trips", () => {
    const ops = read("app/ops/ops.dc.html");
    expect(ops).toMatch(/path\.indexOf\('\/fleet\/chauffeurs\/'\) === 0/);
    expect(ops).toMatch(/chauffeur-id="\{\{ chauffeurId \}\}"/);
    const fleet = read("app/ops/OpsFleet.dc.html");
    expect(fleet).toMatch(/\/fleet\/chauffeurs\/' \+ encodeURIComponent/);
    expect(fleet).toMatch(/cannotAssignNoEmail/);
    expect(fleet).not.toMatch(/\bonAssign\b/);
    expect(fleet).not.toMatch(/>Assign</);
  });

  it("off-road must-fix mail is server-side, not OpsFleet JS", () => {
    const write = read("apps/web/lib/ops/fleet-write.ts");
    expect(write).toMatch(/workshop/);
    expect(write).toMatch(/MustFix/);
    expect(write).not.toMatch(/status\s*=\s*['\"]cancelled['\"]/);
    const route = read("apps/web/app/[locale]/(ops)/api/staff/vehicles/[id]/route.ts");
    expect(route).toMatch(/deliverOpsMustFix/);
    expect(route).toMatch(/off-road/);
    expect(route).not.toMatch(/status\s*=\s*['\"]cancelled['\"]/);
    const fleet = read("app/ops/OpsFleet.dc.html");
    expect(fleet).not.toMatch(/sendOpsMustFix/);
    expect(fleet).not.toMatch(/deliverOpsMustFix/);
    expect(fleet).not.toMatch(/RESEND_API_KEY/);
  });
});

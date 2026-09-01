// apps/web/app/[locale]/(ops)/api/staff/vehicle-classes/route.ts
//
// GET list + PATCH capacities. Refuses a slug field. Dual-mounted at
// app/api/staff/vehicle-classes.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { assertVehicleClassInput, loadVehicleClasses } from "@/lib/ops/fleet";
import {
  fleetJsonError,
  parseVehicleClassPatch,
  presentVehicleClass,
  readJsonBody,
} from "@/lib/ops/fleet-http";
import { updateVehicleClassCapacities } from "@/lib/ops/fleet-write";
import { jsonOk, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

export const GET = withStaff(async (claims) => {
  const { env } = getCloudflareContext();
  const rows = await loadVehicleClasses(env, claims);
  return jsonOk(rows.map(presentVehicleClass));
});

export const PATCH = withStaff(async (claims, request) => {
  try {
    const parsed = parseVehicleClassPatch(await readJsonBody(request));
    const input = assertVehicleClassInput(parsed.input);
    const { env } = getCloudflareContext();
    await updateVehicleClassCapacities(env, claims, parsed.id, input);
    const rows = await loadVehicleClasses(env, claims);
    const updated = rows.find((row) => row.id === parsed.id);
    return jsonOk(updated ? presentVehicleClass(updated) : { id: parsed.id });
  } catch (err) {
    return fleetJsonError(err);
  }
});

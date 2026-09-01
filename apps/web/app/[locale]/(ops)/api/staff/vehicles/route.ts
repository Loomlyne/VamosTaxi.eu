// apps/web/app/[locale]/(ops)/api/staff/vehicles/route.ts
//
// GET list + POST create. Dual-mounted at app/api/staff/vehicles.
// asStaff via loadVehicles / insertVehicle. Empty table → [].

import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  assertVehicleInput,
  loadVehicleClasses,
  loadVehicles,
} from "@/lib/ops/fleet";
import {
  fleetJsonError,
  parseVehicleBody,
  presentVehicle,
  presentVehicles,
  readJsonBody,
} from "@/lib/ops/fleet-http";
import { insertVehicle } from "@/lib/ops/fleet-write";
import { jsonErr, jsonOk, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

export const GET = withStaff(async (claims) => {
  const { env } = getCloudflareContext();
  const rows = await loadVehicles(env, claims);
  return jsonOk(presentVehicles(rows));
});

export const POST = withStaff(async (claims, request) => {
  try {
    const parsed = parseVehicleBody(await readJsonBody(request));
    const { env } = getCloudflareContext();
    let vehicleClassId = parsed.input.vehicleClassId.trim();
    if (!vehicleClassId) {
      if (!parsed.classSlug) {
        return jsonErr("fleet-failure-class-required", 400);
      }
      const classes = await loadVehicleClasses(env, claims);
      const match = classes.find((row) => row.slug === parsed.classSlug);
      if (!match) {
        return jsonErr("fleet-failure-class-required", 400);
      }
      vehicleClassId = match.id;
    }
    const input = assertVehicleInput({ ...parsed.input, vehicleClassId });
    const id = await insertVehicle(env, claims, parsed.id, input);
    const rows = await loadVehicles(env, claims);
    const created = rows.find((row) => row.id === id);
    return jsonOk(created ? presentVehicle(created) : { id }, 201);
  } catch (err) {
    return fleetJsonError(err);
  }
});

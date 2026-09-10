// apps/web/app/[locale]/(ops)/api/staff/vehicles/[id]/route.ts
//
// PATCH + DELETE /api/staff/vehicles/:id. Dual-mounted at app/api/staff/vehicles/[id].

import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  assertVehicleInput,
  loadVehicleClasses,
  loadVehicles,
} from "@/lib/ops/fleet";
import {
  fleetJsonError,
  isUuid,
  parseVehicleBody,
  presentVehicle,
  readJsonBody,
} from "@/lib/ops/fleet-http";
import { deleteVehicleRow, updateVehicleRow } from "@/lib/ops/fleet-write";
import { deliverOpsMustFix } from "@/lib/ops/must-fix-mail";
import { jsonErr, jsonOk, withStaff } from "@/lib/ops/staff-json";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return withStaff(async (claims) => {
    if (!isUuid(id)) return jsonErr("fleet-failure-error", 400);
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
        if (!match) return jsonErr("fleet-failure-class-required", 400);
        vehicleClassId = match.id;
      }
      const input = assertVehicleInput({ ...parsed.input, vehicleClassId });
      const mustFixTrips = await updateVehicleRow(env, claims, id, input);
      if (mustFixTrips.length > 0) {
        try {
          await deliverOpsMustFix(env, "off-road", mustFixTrips);
        } catch {
          // Vehicle is already off the road. Mail is best-effort. Do not cancel.
        }
      }
      const rows = await loadVehicles(env, claims);
      const updated = rows.find((row) => row.id === id);
      return jsonOk(updated ? presentVehicle(updated) : { id });
    } catch (err) {
      return fleetJsonError(err);
    }
  })(request);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return withStaff(async (claims) => {
    if (!isUuid(id)) return jsonErr("fleet-failure-error", 400);
    try {
      const { env } = getCloudflareContext();
      await deleteVehicleRow(env, claims, id);
      return jsonOk({ id });
    } catch (err) {
      return fleetJsonError(err);
    }
  })(request);
}

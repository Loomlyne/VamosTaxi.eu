// apps/web/lib/ops/fleet-write.ts
//
// Vehicle / vehicle_class mutations used by the JSON door. SQL stays here so
// the route files never import postgres (D-08). Every write is asStaff (D-02).

import { asStaff, type VamosClaims } from "../db/identity";
import type { AssertedVehicleClassInput, AssertedVehicleInput } from "./fleet";

export async function insertVehicle(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string | null,
  parsed: AssertedVehicleInput,
): Promise<string> {
  return asStaff(env, claims, async (sql) => {
    if (id) {
      const rows = await sql<{ id: string }[]>`
        insert into public.vehicles (
          id, vehicle_class_id, model, plate, first_registered,
          seats, bags, status, photo_path, note, updated_at
        ) values (
          ${id},
          ${parsed.vehicleClassId},
          ${parsed.model},
          ${parsed.plate},
          ${parsed.firstRegistered},
          ${parsed.seats},
          ${parsed.bags},
          ${parsed.status},
          ${parsed.photoPath},
          ${parsed.note},
          now()
        )
        returning id
      `;
      const row = rows[0];
      if (!row) throw new Error("insertVehicle");
      return row.id;
    }
    const rows = await sql<{ id: string }[]>`
      insert into public.vehicles (
        vehicle_class_id, model, plate, first_registered,
        seats, bags, status, photo_path, note, updated_at
      ) values (
        ${parsed.vehicleClassId},
        ${parsed.model},
        ${parsed.plate},
        ${parsed.firstRegistered},
        ${parsed.seats},
        ${parsed.bags},
        ${parsed.status},
        ${parsed.photoPath},
        ${parsed.note},
        now()
      )
      returning id
    `;
    const row = rows[0];
    if (!row) throw new Error("insertVehicle");
    return row.id;
  });
}

export async function updateVehicleRow(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
  parsed: AssertedVehicleInput,
): Promise<void> {
  await asStaff(env, claims, async (sql) => {
    await sql`
      update public.vehicles set
        vehicle_class_id = ${parsed.vehicleClassId},
        model = ${parsed.model},
        plate = ${parsed.plate},
        first_registered = ${parsed.firstRegistered},
        seats = ${parsed.seats},
        bags = ${parsed.bags},
        status = ${parsed.status},
        photo_path = ${parsed.photoPath},
        note = ${parsed.note},
        updated_at = now()
      where id = ${id}
    `;
    return null;
  });
}

export async function deleteVehicleRow(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
): Promise<void> {
  await asStaff(env, claims, async (sql) => {
    await sql`
      delete from public.vehicles where id = ${id}
    `;
    return null;
  });
}

export async function updateVehicleClassCapacities(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
  parsed: AssertedVehicleClassInput,
): Promise<void> {
  await asStaff(env, claims, async (sql) => {
    await sql`
      update public.vehicle_classes set
        passenger_capacity = ${parsed.passengerCapacity},
        luggage_capacity = ${parsed.luggageCapacity}
      where id = ${id}
    `;
    return null;
  });
}

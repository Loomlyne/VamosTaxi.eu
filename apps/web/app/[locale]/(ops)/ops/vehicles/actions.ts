"use server";

// dynamic = "force-dynamic" — colocated with the vehicles page (D-06 fence).
// A real export is illegal in a "use server" module.

import { revalidatePath } from "next/cache";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asStaff } from "@/lib/db/identity";
import {
  assertVehicleClassInput,
  assertVehicleInput,
  mapFleetSqlState,
  VehicleClassInputError,
  VehicleInputError,
  type VehicleClassInput,
  type VehicleInput,
  type VehicleStatus,
} from "@/lib/ops/fleet";
import { OpsAuthError, requireStaffClaims, type StaffAuthClient } from "@/lib/ops/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const VEHICLES_PATH = "/ops/vehicles";

export type VehicleActionResult = { ok: true } | { ok: false; key: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STATUSES: readonly VehicleStatus[] = ["service", "idle", "workshop"];

async function staffDoor() {
  const supabase = (await createServerSupabaseClient()) as StaffAuthClient;
  const claims = await requireStaffClaims(supabase);
  const { env } = getCloudflareContext();
  return { env, claims };
}

function fail(err: unknown): VehicleActionResult {
  if (err instanceof VehicleInputError) return { ok: false, key: err.key };
  if (err instanceof VehicleClassInputError) return { ok: false, key: err.key };
  if (err instanceof OpsAuthError) return { ok: false, key: "fleet-failure-error" };
  const mapped = mapFleetSqlState(err);
  if (mapped.kind === "unique") return { ok: false, key: "fleet-failure-duplicate" };
  if (mapped.kind === "check") return { ok: false, key: "fleet-failure-check" };
  if (mapped.kind === "fk") return { ok: false, key: mapped.key };
  return { ok: false, key: "fleet-failure-error" };
}

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function revalidateVehicles(): void {
  revalidatePath(VEHICLES_PATH);
}

function revalidatePublicClasses(): void {
  revalidatePath("/");
  revalidatePath("/de");
  revalidatePath("/fr");
  revalidatePath("/ar");
}

export async function createVehicle(id: string, input: VehicleInput): Promise<VehicleActionResult> {
  try {
    if (!isUuid(id)) return { ok: false, key: "fleet-failure-error" };
    const parsed = assertVehicleInput(input);
    const { env, claims } = await staffDoor();
    await asStaff(env, claims, async (sql) => {
      await sql`
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
      `;
      return null;
    });
    revalidateVehicles();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function updateVehicle(id: string, input: VehicleInput): Promise<VehicleActionResult> {
  try {
    if (!isUuid(id)) return { ok: false, key: "fleet-failure-error" };
    const parsed = assertVehicleInput(input);
    const { env, claims } = await staffDoor();
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
    revalidateVehicles();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setVehicleStatus(
  id: string,
  status: VehicleStatus,
): Promise<VehicleActionResult> {
  try {
    if (!isUuid(id)) return { ok: false, key: "fleet-failure-error" };
    if (!STATUSES.includes(status)) return { ok: false, key: "fleet-failure-error" };
    const { env, claims } = await staffDoor();
    await asStaff(env, claims, async (sql) => {
      await sql`
        update public.vehicles set
          status = ${status},
          updated_at = now()
        where id = ${id}
      `;
      return null;
    });
    revalidateVehicles();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteVehicle(id: string): Promise<VehicleActionResult> {
  try {
    if (!isUuid(id)) return { ok: false, key: "fleet-failure-error" };
    const { env, claims } = await staffDoor();
    await asStaff(env, claims, async (sql) => {
      await sql`
        delete from public.vehicles where id = ${id}
      `;
      return null;
    });
    revalidateVehicles();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function updateVehicleClass(
  id: string,
  input: VehicleClassInput,
): Promise<VehicleActionResult> {
  try {
    if (!isUuid(id)) return { ok: false, key: "fleet-failure-error" };
    const parsed = assertVehicleClassInput(input);
    const { env, claims } = await staffDoor();
    await asStaff(env, claims, async (sql) => {
      await sql`
        update public.vehicle_classes set
          passenger_capacity = ${parsed.passengerCapacity},
          luggage_capacity = ${parsed.luggageCapacity},
          sort_order = ${parsed.sortOrder},
          active = ${parsed.active}
        where id = ${id}
      `;
      return null;
    });
    revalidateVehicles();
    revalidatePublicClasses();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

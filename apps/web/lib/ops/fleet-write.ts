// apps/web/lib/ops/fleet-write.ts
//
// Vehicle / vehicle_class mutations used by the JSON door. SQL stays here so
// the route files never import postgres (D-08). Every write is asStaff (D-02).

import { asStaff, type VamosClaims } from "../db/identity";
import type { AssertedVehicleClassInput, AssertedVehicleInput } from "./fleet";
import { persistVehicleSeats } from "./chauffeur-desk";
import { tripsFromRows, type OpsMustFixTrip } from "./must-fix-mail";

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
      await persistVehicleSeats(sql, row.id, parsed.morningChauffeurId, parsed.nightChauffeurId);
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
    await persistVehicleSeats(sql, row.id, parsed.morningChauffeurId, parsed.nightChauffeurId);
    return row.id;
  });
}

export async function updateVehicleRow(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
  parsed: AssertedVehicleInput,
): Promise<OpsMustFixTrip[]> {
  return asStaff(env, claims, async (sql) => {
    const before = await sql<{ status: string }[]>`
      select status::text as status
        from public.vehicles
       where id = ${id}::uuid
    `;
    const previous = before[0]?.status ?? "";
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
    await persistVehicleSeats(sql, id, parsed.morningChauffeurId, parsed.nightChauffeurId);
    if (parsed.status !== "workshop" || previous === "workshop") return [];
    const rows = await sql<
      {
        reference: string;
        locale: string | null;
        pickup_text: string | null;
        dropoff_text: string | null;
        scheduled_local: string | null;
      }[]
    >`
      select
        b.reference,
        b.locale,
        l.pickup_text,
        l.dropoff_text,
        l.scheduled_local
        from public.booking_legs as l
        join public.bookings as b on b.id = l.booking_id
       where l.assigned_vehicle_id = ${id}::uuid
         and l.assigned_chauffeur_id is not null
         and l.status not in ('cancelled', 'completed', 'no_show')
         and b.erased_at is null
         and b.status not in (
           'cancelled',
           'completed',
           'refunded',
           'no_show',
           'partially_cancelled',
           'partially_completed'
         )
         and l.scheduled_at > now()
       order by l.scheduled_at
    `;
    return tripsFromRows(rows);
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

export async function insertVehicleClassOnDraft(
  env: CloudflareEnv,
  claims: VamosClaims,
  parsed: AssertedVehicleClassInput & { slug: string; name?: string; photoPath?: string | null },
  draftVersionId: number,
): Promise<string> {
  return asStaff(env, claims, async (sql) => {
    const rows = await sql<{ id: string }[]>`
      insert into public.vehicle_classes (
        slug, passenger_capacity, luggage_capacity, sort_order, active, name, photo_path
      ) values (
        ${parsed.slug},
        ${parsed.passengerCapacity},
        ${parsed.luggageCapacity},
        ${parsed.sortOrder},
        ${parsed.active},
        ${parsed.name ?? parsed.slug},
        ${parsed.photoPath ?? null}
      )
      returning id
    `;
    const id = rows[0]?.id;
    if (!id) throw new Error("insertVehicleClass");
    await sql`
      insert into public.distance_rates (
        rate_version_id, vehicle_class_id, max_pax, available, hide_from_public
      ) values (
        ${draftVersionId}, ${id}, ${parsed.passengerCapacity}, true, false
      )
    `;
    return id;
  });
}

export async function patchDraftClass(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
  draftVersionId: number,
  patch: {
    hideFromPublic?: boolean;
    maxPax?: number;
    name?: string;
    photoPath?: string | null;
    luggageCapacity?: number;
  },
): Promise<void> {
  await asStaff(env, claims, async (sql) => {
    if (patch.name) {
      const slug = patch.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      if (slug) {
        await sql`
          update public.vehicle_classes set slug = ${slug}, name = ${patch.name.trim()} where id = ${id}
        `;
      } else {
        await sql`
          update public.vehicle_classes set name = ${patch.name.trim()} where id = ${id}
        `;
      }
    }
    if (patch.photoPath !== undefined) {
      await sql`
        update public.vehicle_classes set photo_path = ${patch.photoPath} where id = ${id}
      `;
    }
    if (patch.luggageCapacity !== undefined) {
      await sql`
        update public.vehicle_classes set luggage_capacity = ${patch.luggageCapacity} where id = ${id}
      `;
    }
    if (patch.hideFromPublic !== undefined || patch.maxPax !== undefined) {
      await sql`
        update public.distance_rates set
          hide_from_public = coalesce(${patch.hideFromPublic ?? null}, hide_from_public),
          max_pax = coalesce(${patch.maxPax ?? null}, max_pax)
        where vehicle_class_id = ${id} and rate_version_id = ${draftVersionId}
      `;
    }
    return null;
  });
}

/**
 * Phase 30: the only door to a class state change. The database checks admin rights, the
 * transition and the Go-live checklist (public.ops_vehicle_class_set_status) and raises on
 * refusal; callers catch OUTSIDE this function (postgres.js begin() rethrows caught errors).
 */
export async function setVehicleClassStatus(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
  to: "draft" | "live" | "retired",
  reason: string | null,
): Promise<"draft" | "live" | "retired"> {
  return asStaff(env, claims, async (sql) => {
    const rows = await sql<{ state: string }[]>`
      select public.ops_vehicle_class_set_status(${id}::uuid, ${to}, ${reason}) as state
    `;
    const state = rows[0]?.state;
    if (state === "draft" || state === "live" || state === "retired") return state;
    throw new Error("ops_vehicle_class_set_status");
  });
}

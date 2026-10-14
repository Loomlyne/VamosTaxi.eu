// apps/web/lib/ops/fleet-write.ts
//
// Vehicle / vehicle_class mutations used by the JSON door. SQL stays here so
// the route files never import postgres (D-08). Every write is asStaff (D-02).

import { asStaff, type VamosClaims } from "../db/identity";
import {
  VehicleClassInputError,
  type AssertedVehicleClassInput,
  type AssertedVehicleInput,
} from "./fleet";
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

/**
 * Decision 6: a class's state (Draft = not active and not retired), read in the same callback
 * as the write that depends on it. Undefined when the class does not exist.
 */
async function classIsDraft(
  sql: Parameters<Parameters<typeof asStaff>[2]>[0],
  id: string,
): Promise<boolean | undefined> {
  const rows = await sql<{ active: boolean; hidden_at: Date | string | null }[]>`
    select active, hidden_at from public.vehicle_classes where id = ${id}
  `;
  const row = rows[0];
  if (!row) return undefined;
  return row.active !== true && row.hidden_at == null;
}

/**
 * Keeps a Draft class's open draft price row in step with its seats and bags (decision 5/6):
 * `max_pax` follows the seat count, and the row counts (available) only while start fare,
 * per-km, seats and bags are all set, so it never sits available with an empty `max_pax`.
 */
async function syncDraftRowToClass(
  sql: Parameters<Parameters<typeof asStaff>[2]>[0],
  id: string,
  draftVersionId: number,
): Promise<void> {
  await sql`
    update public.distance_rates dr set
      max_pax = vc.passenger_capacity,
      available = (
        dr.base_fare_rappen is not null and dr.per_km_rappen is not null
        and vc.passenger_capacity is not null and vc.luggage_capacity is not null
      )
    from public.vehicle_classes vc
    where vc.id = ${id} and dr.vehicle_class_id = vc.id and dr.rate_version_id = ${draftVersionId}
  `;
}

export async function updateVehicleClassCapacities(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
  parsed: AssertedVehicleClassInput,
  opts: {
    present?: { passengerCapacity: boolean; luggageCapacity: boolean };
    draftVersionId?: number | null;
  } = {},
): Promise<void> {
  const present = opts.present ?? { passengerCapacity: true, luggageCapacity: true };
  await asStaff(env, claims, async (sql) => {
    const draft = await classIsDraft(sql, id);
    if (draft === undefined) return null;
    // Decision 6: seats and bags can be emptied only while the class is a Draft. The CHECK
    // vehicle_classes_live_has_seats_bags (23514) is the second wall.
    if (!draft && present.passengerCapacity && parsed.passengerCapacity === null) {
      throw new VehicleClassInputError("fleet-failure-passengers");
    }
    if (!draft && present.luggageCapacity && parsed.luggageCapacity === null) {
      throw new VehicleClassInputError("fleet-failure-luggage");
    }
    await sql`
      update public.vehicle_classes set
        passenger_capacity = case when ${present.passengerCapacity}::boolean
          then ${parsed.passengerCapacity}::int else passenger_capacity end,
        luggage_capacity = case when ${present.luggageCapacity}::boolean
          then ${parsed.luggageCapacity}::int else luggage_capacity end
      where id = ${id}
    `;
    if (draft && opts.draftVersionId != null) await syncDraftRowToClass(sql, id, opts.draftVersionId);
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
    // Phase 30 CLS-01: a new class starts as a Draft (active false); Go live turns it on.
    const rows = await sql<{ id: string }[]>`
      insert into public.vehicle_classes (
        slug, passenger_capacity, luggage_capacity, sort_order, active, name, photo_path
      ) values (
        ${parsed.slug},
        ${parsed.passengerCapacity},
        ${parsed.luggageCapacity},
        ${parsed.sortOrder},
        false,
        ${parsed.name ?? parsed.slug},
        ${parsed.photoPath ?? null}
      )
      returning id
    `;
    const id = rows[0]?.id;
    if (!id) throw new Error("insertVehicleClass");
    // Phase 30 decision 5: the empty draft price row is parked (not available) so it never blocks
    // Publish; saving a price on Pricing makes it count.
    await sql`
      insert into public.distance_rates (
        rate_version_id, vehicle_class_id, max_pax, available, hide_from_public
      ) values (
        ${draftVersionId}, ${id}, ${parsed.passengerCapacity}, false, false
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
    /** null empties the seat count (Draft only); undefined leaves it. */
    maxPax?: number | null;
    name?: string;
    photoPath?: string | null;
    /** null empties the bag count (Draft only); undefined leaves it. */
    luggageCapacity?: number | null;
  },
): Promise<void> {
  await asStaff(env, claims, async (sql) => {
    if (patch.maxPax === null || patch.luggageCapacity === null) {
      // Decision 6: emptying only while the class is a Draft; refused before any write.
      const draft = await classIsDraft(sql, id);
      if (draft === false) {
        throw new VehicleClassInputError(
          patch.maxPax === null ? "fleet-failure-passengers" : "fleet-failure-luggage",
        );
      }
    }
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
    if (patch.hideFromPublic !== undefined) {
      await sql`
        update public.distance_rates set hide_from_public = ${patch.hideFromPublic}
        where vehicle_class_id = ${id} and rate_version_id = ${draftVersionId}
      `;
    }
    if (patch.maxPax !== undefined) {
      await sql`
        update public.distance_rates set max_pax = ${patch.maxPax}
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

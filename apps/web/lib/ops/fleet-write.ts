// apps/web/lib/ops/fleet-write.ts
//
// Vehicle / vehicle_class mutations used by the JSON door. SQL stays here so
// the route files never import postgres (D-08). Every write is asStaff (D-02).

import { asStaff, type VamosClaims } from "../db/identity";
import type { AssertedVehicleClassInput, AssertedVehicleInput } from "./fleet";
import { persistVehicleSeats } from "./chauffeur-desk";
import { tripsFromRows, type OpsMustFixTrip } from "./must-fix-mail";
import type { ClassDeleteResult } from "./vehicle-class-write";

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

/**
 * What a car save did. `found: false` — no car with that id (nothing written; before 261001 a
 * PATCH on a missing id answered "saved"). `oldPhoto` — the stored photo key the car pointed at
 * before and no longer does (replaced or removed), for the caller to delete from storage.
 */
export type VehicleUpdateResult =
  | { found: false }
  | { found: true; mustFix: OpsMustFixTrip[]; oldPhoto: string | null };

export async function updateVehicleRow(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
  parsed: AssertedVehicleInput,
): Promise<VehicleUpdateResult> {
  return asStaff(env, claims, async (sql) => {
    const before = await sql<{ status: string; photo_path: string | null }[]>`
      select status::text as status, photo_path
        from public.vehicles
       where id = ${id}::uuid
       for update
    `;
    const row = before[0];
    if (!row) return { found: false as const };
    const previous = row.status ?? "";
    const oldPhoto = row.photo_path && row.photo_path !== parsed.photoPath ? row.photo_path : null;
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
    if (parsed.status !== "workshop" || previous === "workshop") {
      return { found: true as const, mustFix: [], oldPhoto };
    }
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
    return { found: true as const, mustFix: tripsFromRows(rows), oldPhoto };
  });
}

/**
 * What a car delete did (quick 261001-cars-page, the owner's rule of 2026-10-01).
 * `in-use` — a driver has the car or a trip that is not finished uses it; nothing written.
 * `deleted` — the car row is gone (its seat rows by cascade); `photoPath` is its stored photo for
 * the caller to delete from storage; `clearedLegs` finished trip legs no longer name the car.
 */
export type VehicleDeleteResult =
  | { kind: "deleted"; photoPath: string | null; clearedLegs: number }
  | { kind: "gone" }
  | { kind: "in-use"; drivers: string[]; references: string[] };

function uniqueStrings(values: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    const s = typeof value === "string" ? value.trim() : "";
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

/**
 * Owner's rule (2026-10-01): refuse while a driver has this car (chauffeurs.default_vehicle_id —
 * the FK would silently set it null) or a trip that is not finished is assigned to it; otherwise
 * delete completely. booking_legs.assigned_vehicle_id is ON DELETE RESTRICT, so the finished legs
 * that drove the car drop it first (their driver stays). The car row is locked first: Assign and a
 * driver's Car save take a key-share lock on it, so neither can slip in between check and delete.
 */
export async function deleteVehicleRow(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
): Promise<VehicleDeleteResult> {
  return asStaff(env, claims, async (sql) => {
    const car = await sql<{ id: string; photo_path: string | null }[]>`
      select id, photo_path
        from public.vehicles
       where id = ${id}::uuid
       for update
    `;
    const row = car[0];
    if (!row) return { kind: "gone" as const };
    const drivers = await sql<{ full_name: string }[]>`
      select full_name
        from public.chauffeurs
       where default_vehicle_id = ${id}::uuid
       order by full_name
    `;
    const open = await sql<{ reference: string }[]>`
      select b.reference
        from public.booking_legs as l
        join public.bookings as b on b.id = l.booking_id
       where l.assigned_vehicle_id = ${id}::uuid
         and l.status not in ('cancelled', 'completed', 'no_show', 'refunded')
         and b.status not in ('cancelled', 'completed', 'no_show', 'refunded')
         and b.erased_at is null
       order by l.scheduled_at
    `;
    if (drivers.length > 0 || open.length > 0) {
      return {
        kind: "in-use" as const,
        drivers: uniqueStrings(drivers.map((d) => d.full_name)),
        references: uniqueStrings(open.map((o) => o.reference)),
      };
    }
    const cleared = await sql<{ id: string }[]>`
      update public.booking_legs
         set assigned_vehicle_id = null
       where assigned_vehicle_id = ${id}::uuid
      returning id
    `;
    await sql`delete from public.vehicles where id = ${id}::uuid`;
    return { kind: "deleted" as const, photoPath: row.photo_path ?? null, clearedLegs: cleared.length };
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
 * 26.1-19 D-15: hard delete when nothing but draft rate rows references the class;
 * otherwise `in-use` (no reason) or `hidden` (reason given). The database checks every
 * FK and admin rights (public.ops_vehicle_class_delete_or_hide) and removes the class's
 * draft rate rows itself on a delete.
 */
export async function deleteVehicleClassIfUnreferenced(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
  reason: string | null,
): Promise<ClassDeleteResult> {
  return asStaff(env, claims, async (sql) => {
    const rows = await sql<{ result: string }[]>`
      select public.ops_vehicle_class_delete_or_hide(${id}::uuid, ${reason}) as result
    `;
    const result = rows[0]?.result;
    if (result === "deleted" || result === "in-use" || result === "hidden") return result;
    throw new Error("ops_vehicle_class_delete_or_hide");
  });
}

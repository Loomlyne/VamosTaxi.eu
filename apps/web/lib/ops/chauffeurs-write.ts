// apps/web/lib/ops/chauffeurs-write.ts
//
// Chauffeur mutations for the JSON door. SQL stays here so the route never
// imports postgres. Every write is asStaff (D-02).

import { asStaff, type VamosClaims } from "../db/identity";
import type { AssertedChauffeurInput, ChauffeurDeleteResult } from "./chauffeurs-model";
import { persistChauffeurDesk } from "./chauffeur-desk";

/** Postgres `text[]` literal. A JS array can bind as a scalar and throw 22P02. */
function pgTextArrayLiteral(values: string[]): string {
  return `{${values.map((value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
}

export async function insertChauffeur(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string | null,
  parsed: AssertedChauffeurInput,
): Promise<string> {
  return asStaff(env, claims, async (sql) => {
    if (id) {
      const rows = await sql<{ id: string }[]>`
        insert into public.chauffeurs (
          id, full_name, phone, email, default_vehicle_id, vehicle_class_id, plate,
          licence_number, licence_expires_on, languages, status,
          photo_path, note, active, updated_at
        ) values (
          ${id},
          ${parsed.fullName},
          ${parsed.phone},
          ${parsed.email},
          ${parsed.defaultVehicleId},
          ${parsed.vehicleClassId ?? null},
          ${parsed.plate ?? null},
          ${parsed.licenceNumber},
          ${parsed.licenceExpiresOn},
          ${pgTextArrayLiteral(parsed.languages)}::text[],
          ${parsed.status},
          ${parsed.photoPath},
          ${parsed.note},
          true,
          now()
        )
        ON CONFLICT (id) DO NOTHING
        returning id
      `;
      const row = rows[0];
      const wrote = row?.id ?? id;
      await persistChauffeurDesk(sql, wrote, parsed);
      return wrote;
    }
    const rows = await sql<{ id: string }[]>`
      insert into public.chauffeurs (
        full_name, phone, email, default_vehicle_id, vehicle_class_id, plate,
        licence_number, licence_expires_on, languages, status,
        photo_path, note, active, updated_at
      ) values (
        ${parsed.fullName},
        ${parsed.phone},
        ${parsed.email},
        ${parsed.defaultVehicleId},
        ${parsed.vehicleClassId ?? null},
        ${parsed.plate ?? null},
        ${parsed.licenceNumber},
        ${parsed.licenceExpiresOn},
        ${pgTextArrayLiteral(parsed.languages)}::text[],
        ${parsed.status},
        ${parsed.photoPath},
        ${parsed.note},
        true,
        now()
      )
      returning id
    `;
    const row = rows[0];
    if (!row) throw new Error("insertChauffeur");
    await persistChauffeurDesk(sql, row.id, parsed);
    return row.id;
  });
}

export async function updateChauffeurRow(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
  parsed: AssertedChauffeurInput,
): Promise<boolean> {
  return asStaff(env, claims, async (sql) => {
    const rows = await sql<{ id: string }[]>`
      update public.chauffeurs set
        full_name = ${parsed.fullName},
        phone = ${parsed.phone},
        email = ${parsed.email},
        default_vehicle_id = ${parsed.defaultVehicleId},
        vehicle_class_id = case when ${parsed.vehicleClassId === undefined}::boolean then vehicle_class_id else ${parsed.vehicleClassId ?? null}::uuid end,
        plate = case when ${parsed.plate === undefined}::boolean then plate else ${parsed.plate ?? null}::text end,
        licence_number = ${parsed.licenceNumber},
        licence_expires_on = ${parsed.licenceExpiresOn},
        languages = ${pgTextArrayLiteral(parsed.languages)}::text[],
        status = ${parsed.status},
        photo_path = ${parsed.photoPath},
        note = ${parsed.note},
        updated_at = now()
      where id = ${id}
      returning id
    `;
    if (!rows[0]) return false;
    await persistChauffeurDesk(sql, id, parsed);
    return true;
  });
}

function uniqueStrings(values: string[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}

/**
 * Owner, 2026-10-01 ("anything deleted should be deleted completely"). One staff transaction:
 * lock the chauffeur; a trip that is not finished (leg and booking not closed — a trip whose pickup
 * has passed but is not Complete, No-show or Cancelled still counts) refuses the delete with his
 * name and the references, nothing written; otherwise every finished leg lets go of him (the trip
 * keeps its record without a driver; booking_legs.assigned_chauffeur_id is on delete restrict) and
 * the chauffeur row is deleted (shift and leave rows go by cascade). No vehicle row is read or
 * written.
 */
export async function deleteChauffeurRow(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
): Promise<ChauffeurDeleteResult> {
  return asStaff(env, claims, async (sql) => {
    const found = await sql<{ id: string; full_name: string }[]>`
      select id, full_name from public.chauffeurs where id = ${id}::uuid for update
    `;
    const row = found[0];
    if (!row) return { kind: "gone" as const };
    const open = await sql<{ reference: string }[]>`
      select b.reference
        from public.booking_legs as l
        join public.bookings as b on b.id = l.booking_id
       where l.assigned_chauffeur_id = ${id}::uuid
         and l.status not in ('cancelled', 'completed', 'no_show', 'refunded')
         and b.status not in ('cancelled', 'completed', 'no_show', 'refunded')
         and b.erased_at is null
       order by l.scheduled_at
    `;
    if (open.length > 0) {
      return {
        kind: "in-use" as const,
        name: String(row.full_name ?? "").trim(),
        references: uniqueStrings(open.map((o) => o.reference)),
      };
    }
    const cleared = await sql<{ id: string }[]>`
      update public.booking_legs set assigned_chauffeur_id = null where assigned_chauffeur_id = ${id}::uuid returning id
    `;
    await sql`delete from public.chauffeurs where id = ${id}::uuid`;
    return { kind: "deleted" as const, clearedLegs: cleared.length };
  });
}

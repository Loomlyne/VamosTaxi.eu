// apps/web/lib/ops/chauffeurs-write.ts
//
// Chauffeur mutations for the JSON door. SQL stays here so the route never
// imports postgres. Every write is asStaff (D-02).

import { asStaff, type VamosClaims } from "../db/identity";
import type { AssertedChauffeurInput } from "./chauffeurs-model";

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
          id, full_name, phone, email, default_vehicle_id,
          licence_number, licence_expires_on, languages, status,
          photo_path, note, active, updated_at
        ) values (
          ${id},
          ${parsed.fullName},
          ${parsed.phone},
          ${parsed.email},
          ${parsed.defaultVehicleId},
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
      return row.id;
    }
    const rows = await sql<{ id: string }[]>`
      insert into public.chauffeurs (
        full_name, phone, email, default_vehicle_id,
        licence_number, licence_expires_on, languages, status,
        photo_path, note, active, updated_at
      ) values (
        ${parsed.fullName},
        ${parsed.phone},
        ${parsed.email},
        ${parsed.defaultVehicleId},
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
    return Boolean(rows[0]);
  });
}

export async function deleteChauffeurRow(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
): Promise<void> {
  await asStaff(env, claims, async (sql) => {
    await sql`
      delete from public.chauffeurs where id = ${id}
    `;
    return null;
  });
}

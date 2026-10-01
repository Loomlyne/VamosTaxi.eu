// apps/web/lib/ops/chauffeurs-write.ts
//
// Chauffeur mutations for the JSON door. SQL stays here so the route never
// imports postgres. Every write is asStaff (D-02).

import { asStaff, asSystem, type VamosClaims } from "../db/identity";
import { ChauffeurInputError, type AssertedChauffeurInput, type ChauffeurDeleteResult } from "./chauffeurs-model";
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
  // Owner, decision 7 (2026-10-01): a new chauffeur needs a plate number.
  if (!parsed.plate) throw new ChauffeurInputError("chauffeurs-failure-plate-required");
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
      where id = ${id} and deleted_at is null
      returning id
    `;
    if (!rows[0]) return false;
    await persistChauffeurDesk(sql, id, parsed);
    return true;
  });
}

function sqlCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || !("code" in err)) return undefined;
  const code = (err as { code: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/**
 * Owner, decision 7 (2026-10-01): deleting a chauffeur keeps his row for his finished trips;
 * his trips that are not finished (a passed pickup nobody closed included) go back to unassigned,
 * with an assignment.cleared event each; he leaves every list and Assign. One transaction in
 * public.ops_delete_chauffeur (20261007160000, definer, vamos_system only), run asSystem after
 * withStaff. The refusal is mapped AROUND asSystem (postgres.js begin() rethrows a caught query
 * error). No mail: he is gone, and a customer gets none for an unassign.
 */
export async function deleteChauffeurRow(
  env: CloudflareEnv,
  claims: VamosClaims,
  id: string,
): Promise<ChauffeurDeleteResult> {
  try {
    const rows = await asSystem(env, async (sql) => {
      return sql<{ reference: string }[]>`
        select reference from public.ops_delete_chauffeur(${id}::uuid, ${claims.sub}::uuid)
      `;
    });
    return { kind: "deleted", unassigned: rows.map((r) => String(r.reference)) };
  } catch (err) {
    if (sqlCode(err) === "P0002") return { kind: "gone" };
    throw err;
  }
}

"use server";

// dynamic = "force-dynamic" — colocated with the chauffeurs page (D-06 fence).
// A real export is illegal in a "use server" module.

import { revalidatePath } from "next/cache";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asStaff } from "@/lib/db/identity";
import {
  assertChauffeurInput,
  ChauffeurInputError,
  mapChauffeurSqlState,
  type ChauffeurInput,
  type ChauffeurStatus,
} from "@/lib/ops/chauffeurs";
import { OpsAuthError, requireStaffClaims, type StaffAuthClient } from "@/lib/ops/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const CHAUFFEURS_PATH = "/ops/chauffeurs";

export type ChauffeurActionResult = { ok: true } | { ok: false; key: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STATUSES: readonly ChauffeurStatus[] = ["shift", "off", "leave"];

async function staffDoor() {
  const supabase = (await createServerSupabaseClient()) as StaffAuthClient;
  const claims = await requireStaffClaims(supabase);
  const { env } = getCloudflareContext();
  return { env, claims };
}

function fail(err: unknown): ChauffeurActionResult {
  if (err instanceof ChauffeurInputError) return { ok: false, key: err.key };
  if (err instanceof OpsAuthError) return { ok: false, key: "chauffeurs-failure-error" };
  const mapped = mapChauffeurSqlState(err);
  if (mapped.kind === "fk") return { ok: false, key: mapped.key };
  if (mapped.kind === "check") return { ok: false, key: "chauffeurs-failure-error" };
  return { ok: false, key: "chauffeurs-failure-error" };
}

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function revalidateChauffeurs(): void {
  revalidatePath(CHAUFFEURS_PATH);
}

export async function createChauffeur(
  id: string,
  input: ChauffeurInput,
): Promise<ChauffeurActionResult> {
  try {
    if (!isUuid(id)) return { ok: false, key: "chauffeurs-failure-error" };
    const parsed = assertChauffeurInput(input);
    const { env, claims } = await staffDoor();
    await asStaff(env, claims, async (sql) => {
      await sql`
        insert into public.chauffeurs (
          id, full_name, phone, email, default_vehicle_id, vehicle_class_id,
          licence_number, licence_expires_on, languages, status,
          photo_path, note, active, updated_at
        ) values (
          ${id},
          ${parsed.fullName},
          ${parsed.phone},
          ${parsed.email},
          ${parsed.defaultVehicleId},
          ${parsed.vehicleClassId},
          ${parsed.licenceNumber},
          ${parsed.licenceExpiresOn},
          ${parsed.languages},
          ${parsed.status},
          ${parsed.photoPath},
          ${parsed.note},
          true,
          now()
        )
      `;
      return null;
    });
    revalidateChauffeurs();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function updateChauffeur(
  id: string,
  input: ChauffeurInput,
): Promise<ChauffeurActionResult> {
  try {
    if (!isUuid(id)) return { ok: false, key: "chauffeurs-failure-error" };
    const parsed = assertChauffeurInput(input);
    const { env, claims } = await staffDoor();
    await asStaff(env, claims, async (sql) => {
      await sql`
        update public.chauffeurs set
          full_name = ${parsed.fullName},
          phone = ${parsed.phone},
          email = ${parsed.email},
          default_vehicle_id = ${parsed.defaultVehicleId},
          vehicle_class_id = ${parsed.vehicleClassId},
          licence_number = ${parsed.licenceNumber},
          licence_expires_on = ${parsed.licenceExpiresOn},
          languages = ${parsed.languages},
          status = ${parsed.status},
          photo_path = ${parsed.photoPath},
          note = ${parsed.note},
          updated_at = now()
        where id = ${id}
      `;
      return null;
    });
    revalidateChauffeurs();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setChauffeurStatus(
  id: string,
  status: ChauffeurStatus,
): Promise<ChauffeurActionResult> {
  try {
    if (!isUuid(id)) return { ok: false, key: "chauffeurs-failure-error" };
    if (!STATUSES.includes(status)) return { ok: false, key: "chauffeurs-failure-error" };
    const { env, claims } = await staffDoor();
    await asStaff(env, claims, async (sql) => {
      await sql`
        update public.chauffeurs set
          status = ${status},
          updated_at = now()
        where id = ${id}
      `;
      return null;
    });
    revalidateChauffeurs();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setChauffeurActive(
  id: string,
  active: boolean,
): Promise<ChauffeurActionResult> {
  try {
    if (!isUuid(id)) return { ok: false, key: "chauffeurs-failure-error" };
    const { env, claims } = await staffDoor();
    await asStaff(env, claims, async (sql) => {
      await sql`
        update public.chauffeurs set
          active = ${active},
          updated_at = now()
        where id = ${id}
      `;
      return null;
    });
    revalidateChauffeurs();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteChauffeur(id: string): Promise<ChauffeurActionResult> {
  try {
    if (!isUuid(id)) return { ok: false, key: "chauffeurs-failure-error" };
    const { env, claims } = await staffDoor();
    await asStaff(env, claims, async (sql) => {
      await sql`
        delete from public.chauffeurs where id = ${id}
      `;
      return null;
    });
    revalidateChauffeurs();
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

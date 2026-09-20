"use server";

// dynamic = "force-dynamic" — D-06 fence. A real export is illegal in a "use server" module.

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asStaff } from "@/lib/db/identity";
import { INVITE_ERROR } from "@/lib/ops/invite";
import {
  assertInviteInput,
  assertRoleChange,
  loadStaff,
  mapSqlState,
  StaffInputError,
  type StaffRole,
} from "@/lib/ops/staff";
import { OpsAuthError, requireAdminClaims, type StaffAuthClient } from "@/lib/ops/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { trustedSiteOrigin } from "@/lib/security/origin";


const STAFF_PATH = "/ops/staff";

export type StaffActionResult = { ok: true } | { ok: false; key: string };

function inviteKey(code: string | undefined): string {
  switch (code) {
    case INVITE_ERROR.invalid_input:
      return "staffRoster.error-invalid";
    case INVITE_ERROR.invite_delivery_unconfigured:
      return "staffRoster.error-delivery";
    case INVITE_ERROR.already_invited:
      return "staffRoster.error-already";
    case INVITE_ERROR.staff_row_failed:
      return "staffRoster.error-row";
    default:
      return "staffRoster.error-failed";
  }
}

function fail(err: unknown): StaffActionResult {
  if (err instanceof StaffInputError) return { ok: false, key: err.key };
  if (err instanceof OpsAuthError) {
    return { ok: false, key: err.reason === "not-admin" ? "staffRoster.refused" : "staffRoster.error-failed" };
  }
  const mapped = mapSqlState(err);
  if (mapped.kind === "privilege") return { ok: false, key: "staffRoster.refused" };
  return { ok: false, key: "staffRoster.error-failed" };
}

export async function inviteStaff(input: { email: string; role: string }): Promise<StaffActionResult> {
  try {
    const parsed = assertInviteInput(input);
    const supabase = (await createServerSupabaseClient()) as StaffAuthClient;
    await requireAdminClaims(supabase);
    const headerList = await headers();
    const cookie = headerList.get("cookie") ?? "";
    const originHeader = headerList.get("origin");
    let origin: string | null = null;
    if (originHeader) {
      try {
        origin = trustedSiteOrigin(new URL(originHeader).host);
      } catch {
        origin = null;
      }
    }
    if (!origin) return { ok: false, key: "staffRoster.error-failed" };
    const locale = await getLocale();
    const prefix = locale === "en" ? "" : `/${locale}`;
    const res = await fetch(`${origin}${prefix}/api/staff/invite`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie, Origin: origin },
      body: JSON.stringify({ email: parsed.email, role: parsed.role }),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; code?: string } | null;
    if (!res.ok || !body?.ok) return { ok: false, key: inviteKey(body?.code) };
    revalidatePath(STAFF_PATH);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setStaffRole(userId: string, role: StaffRole): Promise<StaffActionResult> {
  try {
    if (!userId) return { ok: false, key: "staffRoster.error-failed" };
    const supabase = (await createServerSupabaseClient()) as StaffAuthClient;
    const claims = await requireAdminClaims(supabase);
    const { env } = getCloudflareContext();
    const roster = await loadStaff(env, claims);
    if (roster.access !== "ok") return { ok: false, key: "staffRoster.refused" };
    assertRoleChange(roster.rows, { userId, role });
    await asStaff(env, claims, async (sql) => {
      await sql`update public.staff set "role" = ${role} where user_id = ${userId}`;
      return null;
    });
    revalidatePath(STAFF_PATH);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function setStaffActive(userId: string, active: boolean): Promise<StaffActionResult> {
  try {
    if (!userId) return { ok: false, key: "staffRoster.error-failed" };
    const supabase = (await createServerSupabaseClient()) as StaffAuthClient;
    const claims = await requireAdminClaims(supabase);
    const { env } = getCloudflareContext();
    const roster = await loadStaff(env, claims);
    if (roster.access !== "ok") return { ok: false, key: "staffRoster.refused" };
    assertRoleChange(roster.rows, { userId, active });
    await asStaff(env, claims, async (sql) => {
      await sql`update public.staff set active = ${active} where user_id = ${userId}`;
      return null;
    });
    revalidatePath(STAFF_PATH);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

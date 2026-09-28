"use server";

// dynamic = "force-dynamic" — D-06 fence. A real export is illegal in a "use server" module.

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { asStaff } from "@/lib/db/identity";
import {
  assertProfileInput,
  mapSqlState,
  StaffInputError,
  type ProfileInput,
} from "@/lib/ops/staff";
import { OpsAuthError, requireStaffClaims, type StaffAuthClient } from "@/lib/ops/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { reauthGate, reauthSecret } from "@/lib/auth/reauth";


const PROFILE_PATH = "/ops/profile";

export type ProfileActionResult = { ok: true } | { ok: false; key: string };

function fail(err: unknown): ProfileActionResult {
  if (err instanceof StaffInputError) return { ok: false, key: err.key };
  if (err instanceof OpsAuthError) return { ok: false, key: "profile.error" };
  const mapped = mapSqlState(err);
  if (mapped.kind === "check") return { ok: false, key: "staff-invalid-lang" };
  if (mapped.kind === "no-data") return { ok: false, key: "profile.error" };
  return { ok: false, key: "profile.error" };
}

/**
 * D-17 / S2: enforced here as well as in the PATCH route, so these Server
 * Actions can never change a password or e-mail without a fresh re-auth bound
 * to the caller's session.
 */
async function reauthRefusal(claims: {
  sub: string;
  session_id?: string;
}): Promise<ProfileActionResult | null> {
  const { env } = getCloudflareContext();
  const cookieHeader = (await cookies())
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const gate = await reauthGate({
    secret: reauthSecret(env),
    cookieHeader,
    userId: claims.sub,
    sessionId: claims.session_id,
  });
  return gate.ok ? null : { ok: false, key: gate.code };
}

function authErrorKey(error: { message?: string; code?: string; status?: number } | null): string {
  const message = (error?.message ?? "").toLowerCase();
  const code = (error?.code ?? "").toLowerCase();
  if (
    error?.status === 403 ||
    code.includes("reauth") ||
    message.includes("reauth") ||
    message.includes("reauthentication")
  ) {
    return "profile.security.reauth-needed";
  }
  if (code.includes("same_password") || message.includes("same password")) {
    return "profile.security.password-same";
  }
  return "profile.error";
}

export async function updateOwnProfile(input: ProfileInput): Promise<ProfileActionResult> {
  try {
    const parsed = assertProfileInput(input);
    const supabase = await createServerSupabaseClient();
    const claims = await requireStaffClaims(supabase as StaffAuthClient);
    const { env } = getCloudflareContext();
    await asStaff(env, claims, async (sql) => {
      await sql`
        select public.staff_update_self(
          ${parsed.fullName},
          ${parsed.phone},
          ${parsed.lang},
          ${parsed.digestEmail},
          ${parsed.avatarPath}
        )
      `;
      return null;
    });
    revalidatePath(PROFILE_PATH);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function changeOwnPassword(password: string): Promise<ProfileActionResult> {
  try {
    const supabase = await createServerSupabaseClient();
    const claims = await requireStaffClaims(supabase as StaffAuthClient);
    if (typeof password !== "string" || password.length < 8) {
      return { ok: false, key: "profile.security.password-short" };
    }
    const refused = await reauthRefusal(claims);
    if (refused) return refused;
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { ok: false, key: authErrorKey(error) };
    revalidatePath(PROFILE_PATH);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function changeOwnEmail(email: string): Promise<ProfileActionResult> {
  try {
    const supabase = await createServerSupabaseClient();
    const claims = await requireStaffClaims(supabase as StaffAuthClient);
    const trimmed = email.trim();
    if (!trimmed.includes("@")) return { ok: false, key: "staff-invalid-email" };
    const refused = await reauthRefusal(claims);
    if (refused) return refused;
    const { error } = await supabase.auth.updateUser({ email: trimmed });
    if (error) return { ok: false, key: authErrorKey(error) };
    revalidatePath(PROFILE_PATH);
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// apps/web/lib/auth/staff-sign-in-method.ts
//
// Adapter over `staff.sign_in_method` and `public.staff_set_sign_in_method(p_method)`,
// both added by 26.1-20 (migration 20260928170000_staff_aal2_when_enrolled.sql).
// Kept to raw SQL behind this one file so the generated database types are not
// needed here; the orchestrator reconciles at merge.
//
// RLS: the read runs as vamos_staff, so it returns zero rows while the admin has a
// verified factor and the session is still aal1 (26.1-20 S1). Callers treat
// `null` as "not known yet" and check again after the TOTP step-up.

import { asStaff, type VamosClaims } from "@/lib/db/identity";
import type { SignInMethod } from "./staff-mfa";

// Library module — D-06 greps identity importers for this export.
export const dynamic = "force-dynamic";

export function parseSignInMethod(value: unknown): SignInMethod | null {
  return value === "password" || value === "magic_link" ? value : null;
}

/** The caller's stored sign-in method, or null when the row is not readable. */
export async function readOwnSignInMethod(
  env: CloudflareEnv,
  claims: VamosClaims,
): Promise<SignInMethod | null> {
  return asStaff(env, claims, async (sql) => {
    const rows = await sql<{ sign_in_method: string | null }[]>`
      select s.sign_in_method
        from public.staff s
       where s.user_id = app.uid()
    `;
    return parseSignInMethod(rows[0]?.sign_in_method);
  });
}

/** Stores the caller's own sign-in method (the SQL setter only touches the caller's row). */
export async function setOwnSignInMethod(
  env: CloudflareEnv,
  claims: VamosClaims,
  method: SignInMethod,
): Promise<void> {
  await asStaff(env, claims, async (sql) => {
    await sql`select public.staff_set_sign_in_method(${method})`;
    return null;
  });
}

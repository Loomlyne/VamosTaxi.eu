// packages/db/src/claims.ts
//
// D-09 / Phase 2 D-04: `claimsForSql` is the one place a caller-supplied token payload becomes
// SQL-visible state — its output becomes the `request.jwt.claims` GUC that `app.jwt()` /
// `app.uid()` read (packages/db/supabase/migrations/20260823000002_roles_and_helpers.sql,
// lines 124-133). It builds that JSON by LISTING the allowed fields explicitly, never by
// spreading the input object, so `user_metadata` — writable by a customer through the
// Supabase client SDK (Phase 2 D-04) — is stripped rather than trusted not to be read. `aal`
// defaults to `"aal1"` and `app_metadata` to `{}` so `app.jwt()`'s shape is stable regardless
// of what the caller's token actually carried.

export interface VamosClaims {
  sub: string;
  role: "anon" | "authenticated";
  aal?: "aal1" | "aal2" | "aal3";
  email?: string;
  session_id?: string;
  app_metadata?: { vamos_role?: "dispatcher" | "admin"; [key: string]: unknown };
}

/**
 * Builds the JSON payload for the `request.jwt.claims` GUC. Enumerates fields by name — the
 * input object is never spread wholesale into the output — so a field this function does not
 * name (most importantly `user_metadata`) can never reach SQL, no matter what the caller's
 * object carries.
 */
export function claimsForSql(c: VamosClaims): string {
  return JSON.stringify({
    sub: c.sub,
    role: c.role,
    aal: c.aal ?? "aal1",
    email: c.email,
    session_id: c.session_id,
    app_metadata: c.app_metadata ?? {},
  });
}

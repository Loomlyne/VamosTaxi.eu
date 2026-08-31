// apps/web/lib/ops/session.ts
//
// The session → VamosClaims bridge every ops Server Action calls before asStaff.
// A claims object missing `aal` or `vamos_role` produces zero rows from every
// RLS-gated staff query with no error, which is undiagnosable from a stack
// trace. Fields are enumerated by name (mirroring claimsForSql); the user
// object is never spread.

import type { VamosClaims } from "@vamos/db/claims";

export type StaffSession = VamosClaims;

export type OpsAuthReason = "no-session" | "not-staff" | "needs-mfa" | "not-admin";

export class OpsAuthError extends Error {
  readonly reason: OpsAuthReason;

  constructor(reason: OpsAuthReason) {
    super(reason);
    this.name = "OpsAuthError";
    this.reason = reason;
  }
}

type StaffAuthUser = {
  id: string;
  email?: string | null;
  app_metadata?: { vamos_role?: unknown };
};

export type StaffAuthClient = {
  auth: {
    getUser: () => Promise<{ data: { user: StaffAuthUser | null }; error: unknown }>;
    getSession: () => Promise<{ data: { session: { access_token: string } | null } }>;
    mfa: {
      getAuthenticatorAssuranceLevel: () => Promise<{
        data: { currentLevel: string | null } | null;
      }>;
    };
  };
};

function mapAal(level: string | null | undefined): VamosClaims["aal"] | undefined {
  if (level === "aal1" || level === "aal2" || level === "aal3") return level;
  return undefined;
}

function staffRole(value: unknown): "dispatcher" | "admin" | undefined {
  if (value === "dispatcher" || value === "admin") return value;
  return undefined;
}

/**
 * `session_id` is a JWT payload field `getUser()` does not return. Authenticity
 * was already decided by `getUser()` above; this decode is transport-format
 * parsing of `getSession()`'s `access_token`, not trust. No JWT library.
 */
function sessionIdFromAccessToken(accessToken: string): string | undefined {
  const parts = accessToken.split(".");
  if (parts.length < 2) return undefined;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const json = atob(b64 + pad);
    const payload = JSON.parse(json) as { session_id?: unknown };
    return typeof payload.session_id === "string" ? payload.session_id : undefined;
  } catch {
    return undefined;
  }
}

export async function getStaffClaims(supabase: StaffAuthClient): Promise<StaffSession | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const user = data.user;
  const aalResult = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const aal = mapAal(aalResult.data?.currentLevel);

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  const sessionId = accessToken ? sessionIdFromAccessToken(accessToken) : undefined;

  const claims: StaffSession = {
    sub: user.id,
    role: "authenticated",
  };
  if (aal) claims.aal = aal;
  if (typeof user.email === "string" && user.email.length > 0) claims.email = user.email;
  if (sessionId) claims.session_id = sessionId;
  const vamosRole = staffRole(user.app_metadata?.vamos_role);
  if (vamosRole) claims.app_metadata = { vamos_role: vamosRole };
  return claims;
}

export async function requireStaffClaims(supabase: StaffAuthClient): Promise<StaffSession> {
  const claims = await getStaffClaims(supabase);
  if (!claims) throw new OpsAuthError("no-session");
  const role = staffRole(claims.app_metadata?.vamos_role);
  if (!role) throw new OpsAuthError("not-staff");
  if (claims.aal !== "aal2") throw new OpsAuthError("needs-mfa");
  return claims;
}

export async function requireAdminClaims(supabase: StaffAuthClient): Promise<StaffSession> {
  const claims = await requireStaffClaims(supabase);
  if (claims.app_metadata?.vamos_role !== "admin") throw new OpsAuthError("not-admin");
  return claims;
}

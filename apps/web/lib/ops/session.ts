// apps/web/lib/ops/session.ts
//
// The session → VamosClaims bridge every ops Server Action calls before asStaff.
// A claims object missing `aal` or `vamos_role` produces zero rows from every
// RLS-gated staff query with no error, which is undiagnosable from a stack
// trace. Fields are enumerated by name (mirroring claimsForSql); the user
// object is never spread.

import type { VamosClaims } from "@/lib/db/identity";
import {
  amrMethodsOf,
  effectiveNextLevel,
  staffGateDecision,
  type AmrLike,
  type StaffGateDecision,
} from "./staff-gate";

// Library module — D-06 greps asStaff/identity importers for this export.
export const dynamic = "force-dynamic";

/**
 * VamosClaims plus `nextLevel` ("aal2" once a verified factor exists) and `amrMethods` (from
 * the verified access token). None of them reaches SQL — claimsForSql enumerates its fields by name.
 */
export type StaffSession = VamosClaims & {
  nextLevel?: "aal1" | "aal2";
  amrMethods?: string[];
};

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
  app_metadata?: Record<string, unknown>;
  /** Server-answered factor list from getUser(); only `status` is read. */
  factors?: ReadonlyArray<{ status?: unknown }> | null;
};

export type StaffAuthClient = {
  auth: {
    getUser: () => Promise<{ data: { user: StaffAuthUser | null }; error: unknown }>;
    getSession: () => Promise<{ data: { session: { access_token: string } | null } }>;
    mfa: {
      getAuthenticatorAssuranceLevel: () => Promise<{
        data: { currentLevel: string | null; nextLevel?: string | null } | null;
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
 * `session_id` / hook claims live on the JWT. `getUser()` returns DB
 * `raw_app_meta_data` (vamos_role is NULL there — the access-token hook
 * injects it at mint and does not persist it). Authenticity was already
 * decided by `getUser()`; this decode is transport-format parsing, not trust.
 * No JWT library.
 */
function jwtPayload(accessToken: string): Record<string, unknown> | null {
  const parts = accessToken.split(".");
  const payloadB64 = parts[1];
  if (!payloadB64) return null;
  try {
    const b64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const json = atob(b64 + pad);
    const payload = JSON.parse(json) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

function sessionIdFromAccessToken(accessToken: string): string | undefined {
  const payload = jwtPayload(accessToken);
  return typeof payload?.session_id === "string" ? payload.session_id : undefined;
}

/** Hook-minted `app_metadata.vamos_role` from the access token. */
export function vamosRoleFromAccessToken(
  accessToken: string | undefined,
): "dispatcher" | "admin" | undefined {
  if (!accessToken) return undefined;
  const payload = jwtPayload(accessToken);
  const meta = payload?.app_metadata;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return undefined;
  return staffRole((meta as Record<string, unknown>).vamos_role);
}

/** `amr[].method` values from the access token (authenticity already decided by getUser()). */
export function amrMethodsFromAccessToken(accessToken: string | undefined): string[] {
  if (!accessToken) return [];
  const amr = jwtPayload(accessToken)?.amr;
  return Array.isArray(amr) ? amrMethodsOf(amr as AmrLike[]) : [];
}

/**
 * The amr half of the gate input, shared by getStaffClaims and both middleware gates so every
 * door decides the same way. The amr comes from the access token that getUser() just had the
 * auth server verify (T-26.1-77). A registered passkey no longer changes the decision (quick
 * 260928-wg9), so the passkey list is not fetched here.
 */
export async function passkeyGateInputs(
  _supabase: StaffAuthClient,
  input: {
    role: unknown;
    currentLevel: string | null | undefined;
    nextLevel: string | null | undefined;
    accessToken: string | undefined;
  },
): Promise<{ amrMethods: string[] }> {
  return { amrMethods: amrMethodsFromAccessToken(input.accessToken) };
}

export async function getStaffClaims(supabase: StaffAuthClient): Promise<StaffSession | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const user = data.user;
  const aalResult = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const aal = mapAal(aalResult.data?.currentLevel);
  const nextLevel = effectiveNextLevel(aalResult.data?.nextLevel, user.factors);

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  const sessionId = accessToken ? sessionIdFromAccessToken(accessToken) : undefined;

  const claims: StaffSession = {
    sub: user.id,
    role: "authenticated",
  };
  if (aal) claims.aal = aal;
  claims.nextLevel = nextLevel;
  if (typeof user.email === "string" && user.email.length > 0) claims.email = user.email;
  if (sessionId) claims.session_id = sessionId;
  const vamosRole =
    staffRole(user.app_metadata?.vamos_role) ?? vamosRoleFromAccessToken(accessToken);
  if (vamosRole) claims.app_metadata = { vamos_role: vamosRole };
  const passkey = await passkeyGateInputs(supabase, {
    role: vamosRole,
    currentLevel: aal,
    nextLevel,
    accessToken,
  });
  if (passkey.amrMethods.length > 0) claims.amrMethods = passkey.amrMethods;
  return claims;
}

/**
 * INT-09 / D-16 / D-16a / D-16b: applies staffGateDecision on every call — only the admin, and
 * aal2 once a verified factor exists. Mirrors app.is_staff()/app.is_admin() in SQL.
 */
/** staffGateDecision for claims from getStaffClaims (amr included). */
export function staffDecisionOf(claims: StaffSession): StaffGateDecision {
  return staffGateDecision({
    role: claims.app_metadata?.vamos_role,
    currentLevel: claims.aal,
    nextLevel: claims.nextLevel,
    amrMethods: claims.amrMethods,
  });
}

function gateClaims(claims: StaffSession | null): StaffSession {
  if (!claims) throw new OpsAuthError("no-session");
  const decision = staffDecisionOf(claims);
  if (decision === "deny") throw new OpsAuthError("not-staff");
  if (decision === "step-up") throw new OpsAuthError("needs-mfa");
  return claims;
}

export async function requireStaffClaims(supabase: StaffAuthClient): Promise<StaffSession> {
  return gateClaims(await getStaffClaims(supabase));
}

export async function requireAdminClaims(supabase: StaffAuthClient): Promise<StaffSession> {
  const claims = await getStaffClaims(supabase);
  // A dispatcher is a known staff role that is not admin: keep the precise reason.
  if (claims && staffRole(claims.app_metadata?.vamos_role) === "dispatcher") {
    throw new OpsAuthError("not-admin");
  }
  return gateClaims(claims);
}

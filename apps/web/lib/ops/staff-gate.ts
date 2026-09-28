// apps/web/lib/ops/staff-gate.ts
//
// INT-09 / D-16 / D-16a / D-16b: the one decision every staff door makes — requireStaffClaims
// (Server Actions and /api/staff/*), the dashboard host gate and the local /ops gate in
// middleware.ts. It mirrors app.is_staff()/app.is_admin() in SQL (20260928180000), which stays
// the authoritative check on every staff RLS read and write.
//
//   * Only the admin role enters the console (D-16, D-16b). A dispatcher is denied.
//   * No verified second factor → aal1 (password or magic link) is enough (D-16).
//   * A verified factor → aal2 is required on every request, not only at sign-in (D-16a).
//   * A registered passkey (26.1-25) → the session must be aal2 or a passkey sign-in. GoTrue keeps
//     passkeys in auth.webauthn_credentials, not auth.mfa_factors, and a passkey sign-in is aal1
//     with amr "passkey" (checked on GoTrue v2.195.0), so neither nextLevel nor SQL sees them —
//     this app gate is the passkey control. A passkey session never replaces an enrolled
//     authenticator app: SQL still needs aal2 for that.
//
// Pure: no I/O, no module state.

export type StaffGateDecision = "allow" | "step-up" | "deny";

export type StaffGateInput = {
  /** Hook-minted `app_metadata.vamos_role` from the access token. */
  role: unknown;
  /** AAL of the current session (`aal` claim of the verified access token). */
  currentLevel: string | null | undefined;
  /** "aal2" when the user has a verified factor (see effectiveNextLevel). */
  nextLevel: string | null | undefined;
  /** True when the auth server lists a passkey for this user (see passkeyCheckNeeded). */
  hasPasskey?: boolean;
  /** `amr[].method` values from the verified access token. */
  amrMethods?: ReadonlyArray<string> | null;
};

/** One AMR entry as GoTrue writes it (`{ method, timestamp }`) or a bare method string. */
export type AmrLike = { method?: unknown; timestamp?: unknown } | string;

function isAal2OrAbove(level: string | null | undefined): boolean {
  return level === "aal2" || level === "aal3";
}

/** The `method` of each AMR entry; anything that is not a string is dropped. */
export function amrMethodsOf(amr: ReadonlyArray<AmrLike> | null | undefined): string[] {
  if (!Array.isArray(amr)) return [];
  const out: string[] = [];
  for (const entry of amr) {
    const method = typeof entry === "string" ? entry : entry?.method;
    if (typeof method === "string") out.push(method);
  }
  return out;
}

/** The session was signed in with a passkey. Only GoTrue's exact `passkey` method counts. */
export function isPasskeySession(amr: ReadonlyArray<AmrLike> | null | undefined): boolean {
  return amrMethodsOf(amr).includes("passkey");
}

/** The gate decision for one request. See the file header for the rules. */
export function staffGateDecision(input: StaffGateInput): StaffGateDecision {
  if (input.role !== "admin") return "deny";
  const strong = isAal2OrAbove(input.currentLevel);
  if (isAal2OrAbove(input.nextLevel)) return strong ? "allow" : "step-up";
  if (input.hasPasskey !== true) return "allow";
  return strong || isPasskeySession(input.amrMethods) ? "allow" : "step-up";
}

/**
 * Whether listing the user's passkeys can change the decision. Saves an auth-server call on
 * every request that is already decided: not the admin, an enrolled factor (aal2 rules), an
 * aal2 session, or a passkey sign-in.
 */
export function passkeyCheckNeeded(input: Omit<StaffGateInput, "hasPasskey">): boolean {
  if (input.role !== "admin") return false;
  if (isAal2OrAbove(input.nextLevel) || isAal2OrAbove(input.currentLevel)) return false;
  return !isPasskeySession(input.amrMethods);
}

/**
 * The level the session must reach. `reported` is supabase-js's
 * `getAuthenticatorAssuranceLevel().nextLevel`, which reads factors from the cookie-stored
 * session user — client-held data. `factors` comes from `getUser()`, which the auth server
 * answered. Either one showing a verified factor means aal2 is required; an unverified
 * (half-finished) enrolment never is (T-26.1-64).
 */
export function effectiveNextLevel(
  reported: string | null | undefined,
  factors: ReadonlyArray<{ status?: unknown }> | null | undefined,
): "aal1" | "aal2" {
  if (isAal2OrAbove(reported)) return "aal2";
  if (Array.isArray(factors) && factors.some((f) => f?.status === "verified")) return "aal2";
  return "aal1";
}

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
};

function isAal2OrAbove(level: string | null | undefined): boolean {
  return level === "aal2" || level === "aal3";
}

/** The gate decision for one request. See the file header for the rules. */
export function staffGateDecision(input: StaffGateInput): StaffGateDecision {
  if (input.role !== "admin") return "deny";
  if (!isAal2OrAbove(input.nextLevel)) return "allow";
  return isAal2OrAbove(input.currentLevel) ? "allow" : "step-up";
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

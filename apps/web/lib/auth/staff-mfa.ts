// apps/web/lib/auth/staff-mfa.ts
//
// Admin sign-in options, server side (26.1 D-16a): TOTP enrol / verify / remove,
// the TOTP step-up to aal2, and the password ↔ magic-link rule. Deps-injected
// over `supabase.auth.mfa` (supabase-js 2.112.4, auth-js GoTrueMFAApi:
// enroll / challenge / verify / unenroll / listFactors) so every branch is
// unit-testable without a network.
//
// Never log a code, a TOTP secret or a QR payload. The secret leaves this module
// exactly once — in the enrolment result handed to the enrolling admin.

import type { VamosClaims } from "@/lib/db/identity";
import type { StaffGateDecision } from "@/lib/ops/staff-gate";

// Library module — D-06 greps identity importers for this export.
export const dynamic = "force-dynamic";

export type MfaError = { code?: string; message?: string; status?: number } | null;

export type MfaFactor = { id: string; factor_type: string; status: string };

/** One AMR entry from getAuthenticatorAssuranceLevel().currentAuthenticationMethods. */
export type AmrEntry = { method: string; timestamp?: number } | string;

/** The narrow slice of `supabase.auth` this module drives. */
export type MfaClient = {
  auth: {
    mfa: {
      enroll(params: { factorType: "totp" }): Promise<{
        data: { id: string; totp: { qr_code: string; secret: string; uri: string } } | null;
        error: MfaError;
      }>;
      challenge(params: { factorId: string }): Promise<{ data: { id: string } | null; error: MfaError }>;
      verify(params: { factorId: string; challengeId: string; code: string }): Promise<{
        data: unknown;
        error: MfaError;
      }>;
      unenroll(params: { factorId: string }): Promise<{ data: unknown; error: MfaError }>;
      listFactors(): Promise<{ data: { all: MfaFactor[] } | null; error: MfaError }>;
    };
    passkey?: {
      list(): Promise<{ data: readonly unknown[] | null; error: MfaError }>;
      delete?(params: { passkeyId: string }): Promise<{ data: unknown; error: MfaError }>;
    };
  };
};

export type MfaCode =
  | "mfa-invalid-input"
  | "mfa-enroll-failed"
  | "mfa-already-enrolled"
  | "mfa-challenge-failed"
  | "mfa-code-mismatch"
  | "mfa-no-factor"
  | "mfa-aal2-required"
  | "mfa-unenroll-failed"
  | "mfa-status-failed"
  | "reauth-required"
  | "reauth-unavailable";

export type MfaFail = { ok: false; code: MfaCode };

export type SignInMethod = "password" | "magic_link";

export type StaffMfaAccess =
  | { ok: true; claims: VamosClaims & { session_id: string } }
  | { ok: false; status: 401 | 403; code: "no-session" | "not-staff" };

/**
 * Only the admin signs in to the dashboard (D-16, D-16b). A session with no
 * `session_id` cannot carry a session-bound re-auth, so it is treated as none.
 * This deliberately does NOT look at aal: step-up must work at aal1.
 */
export function staffMfaAccess(claims: VamosClaims | null): StaffMfaAccess {
  if (!claims || !claims.sub || !claims.session_id) {
    return { ok: false, status: 401, code: "no-session" };
  }
  if (claims.app_metadata?.vamos_role !== "admin") {
    return { ok: false, status: 403, code: "not-staff" };
  }
  return { ok: true, claims: claims as VamosClaims & { session_id: string } };
}

/** Six digits, spaces stripped; anything else is null. */
export function normalizeTotpCode(code: unknown): string | null {
  if (typeof code !== "string") return null;
  const trimmed = code.replace(/\s+/g, "");
  return /^\d{6}$/.test(trimmed) ? trimmed : null;
}

function validFactorId(factorId: unknown): factorId is string {
  return typeof factorId === "string" && factorId.length > 0 && factorId.length <= 64;
}

async function factorsOf(client: MfaClient): Promise<MfaFactor[] | null> {
  const { data, error } = await client.auth.mfa.listFactors();
  if (error || !data) return null;
  return data.all ?? [];
}

function verifiedTotpOf(factors: MfaFactor[]): MfaFactor | undefined {
  return factors.find((f) => f.factor_type === "totp" && f.status === "verified");
}

type ReauthResult = { ok: true } | { ok: false; code: "reauth-required" | "reauth-unavailable" };

/**
 * Starts a TOTP enrolment. Needs a fresh, session-bound re-auth first (D-17b):
 * a stolen session must not add its own factor and lock the admin out of aal2.
 * Stale unverified TOTP factors from an abandoned attempt are cleared so they
 * cannot pile up. A second TOTP is refused while one is verified — the UI shows
 * one authenticator app.
 */
export async function enrolTotp(
  client: MfaClient,
  input: { reauth: ReauthResult },
): Promise<{ ok: true; factorId: string; qrSvg: string; secret: string } | MfaFail> {
  if (!input.reauth.ok) return { ok: false, code: input.reauth.code };
  const factors = await factorsOf(client);
  if (!factors) return { ok: false, code: "mfa-enroll-failed" };
  if (verifiedTotpOf(factors)) return { ok: false, code: "mfa-already-enrolled" };
  for (const stale of factors) {
    if (stale.factor_type === "totp" && stale.status !== "verified") {
      await client.auth.mfa.unenroll({ factorId: stale.id });
    }
  }
  const { data, error } = await client.auth.mfa.enroll({ factorType: "totp" });
  if (error || !data?.id || !data.totp?.secret) return { ok: false, code: "mfa-enroll-failed" };
  // qr_code is Supabase's `data:image/svg+xml` URI — rendered as an <img>, never injected as HTML.
  return { ok: true, factorId: data.id, qrSvg: data.totp.qr_code, secret: data.totp.secret };
}

export async function challengeTotp(
  client: MfaClient,
  factorId: string,
): Promise<{ ok: true; challengeId: string } | MfaFail> {
  if (!validFactorId(factorId)) return { ok: false, code: "mfa-invalid-input" };
  const { data, error } = await client.auth.mfa.challenge({ factorId });
  if (error || !data?.id) return { ok: false, code: "mfa-challenge-failed" };
  return { ok: true, challengeId: data.id };
}

export async function verifyTotpChallenge(
  client: MfaClient,
  input: { factorId: string; challengeId: string; code: unknown },
): Promise<{ ok: true } | MfaFail> {
  const code = normalizeTotpCode(input.code);
  if (!validFactorId(input.factorId) || !validFactorId(input.challengeId) || !code) {
    return { ok: false, code: "mfa-invalid-input" };
  }
  const { error } = await client.auth.mfa.verify({
    factorId: input.factorId,
    challengeId: input.challengeId,
    code,
  });
  // Every verify failure reads as "that code didn't match" — instructive, and it
  // tells an attacker nothing about why.
  if (error) return { ok: false, code: "mfa-code-mismatch" };
  return { ok: true };
}

async function challengeAndVerify(
  client: MfaClient,
  factorId: string,
  code: string,
): Promise<{ ok: true; factorId: string } | MfaFail> {
  const challenge = await challengeTotp(client, factorId);
  if (!challenge.ok) return challenge;
  const verified = await verifyTotpChallenge(client, {
    factorId,
    challengeId: challenge.challengeId,
    code,
  });
  if (!verified.ok) return verified;
  return { ok: true, factorId };
}

/** Confirms a just-enrolled factor. The session is aal2 afterwards (cookies change). */
export async function verifyTotpEnrolment(
  client: MfaClient,
  input: { factorId: unknown; code: unknown },
): Promise<{ ok: true; factorId: string } | MfaFail> {
  const code = normalizeTotpCode(input.code);
  if (!validFactorId(input.factorId) || !code) return { ok: false, code: "mfa-invalid-input" };
  return challengeAndVerify(client, input.factorId, code);
}

/** Step-up: challenge + verify the admin's verified TOTP factor → aal2. */
export async function stepUpTotp(
  client: MfaClient,
  rawCode: unknown,
): Promise<{ ok: true; factorId: string } | MfaFail> {
  const code = normalizeTotpCode(rawCode);
  if (!code) return { ok: false, code: "mfa-invalid-input" };
  const factors = await factorsOf(client);
  if (!factors) return { ok: false, code: "mfa-challenge-failed" };
  const factor = verifiedTotpOf(factors);
  if (!factor) return { ok: false, code: "mfa-no-factor" };
  return challengeAndVerify(client, factor.id, code);
}

/**
 * Removes one of the caller's own factors. Needs aal2 and a fresh, session-bound
 * re-auth (D-16a, D-17) — both checked before Supabase is asked.
 */
export async function unenrolFactor(
  client: MfaClient,
  input: {
    factorId: unknown;
    aal: VamosClaims["aal"];
    reauth: ReauthResult;
  },
): Promise<{ ok: true } | MfaFail> {
  if (!validFactorId(input.factorId)) return { ok: false, code: "mfa-invalid-input" };
  if (input.aal !== "aal2") return { ok: false, code: "mfa-aal2-required" };
  if (!input.reauth.ok) return { ok: false, code: input.reauth.code };
  const factors = await factorsOf(client);
  if (!factors) return { ok: false, code: "mfa-unenroll-failed" };
  if (!factors.some((f) => f.id === input.factorId)) return { ok: false, code: "mfa-invalid-input" };
  const { error } = await client.auth.mfa.unenroll({ factorId: input.factorId });
  if (error) return { ok: false, code: "mfa-unenroll-failed" };
  return { ok: true };
}

/** What the settings pane needs: is TOTP on, which factor, is a passkey registered. */
export async function listFactors(
  client: MfaClient,
): Promise<{ ok: true; totp: boolean; totpFactorId: string | null; passkey: boolean } | MfaFail> {
  const factors = await factorsOf(client);
  if (!factors) return { ok: false, code: "mfa-status-failed" };
  const totp = verifiedTotpOf(factors);
  let passkey = factors.some((f) => f.factor_type === "webauthn" && f.status === "verified");
  if (!passkey && client.auth.passkey) {
    try {
      const { data, error } = await client.auth.passkey.list();
      passkey = !error && Array.isArray(data) && data.length > 0;
    } catch {
      passkey = false;
    }
  }
  return { ok: true, totp: Boolean(totp), totpFactorId: totp?.id ?? null, passkey };
}

/** One of the admin's passkeys as the settings pane sees it. No key material, ever. */
export type PasskeySummary = {
  id: string;
  friendlyName: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** The caller's passkeys from the auth server (26.1-25). Only id, name and dates leave here. */
export async function listPasskeys(
  client: MfaClient,
): Promise<{ ok: true; passkeys: PasskeySummary[] } | MfaFail> {
  if (!client.auth.passkey) return { ok: false, code: "mfa-status-failed" };
  try {
    const { data, error } = await client.auth.passkey.list();
    if (error || !Array.isArray(data)) return { ok: false, code: "mfa-status-failed" };
    const passkeys: PasskeySummary[] = [];
    for (const item of data) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      if (typeof row.id !== "string" || !UUID_RE.test(row.id)) continue;
      passkeys.push({
        id: row.id,
        friendlyName: stringOrNull(row.friendly_name),
        createdAt: stringOrNull(row.created_at),
        lastUsedAt: stringOrNull(row.last_used_at),
      });
    }
    return { ok: true, passkeys };
  } catch {
    return { ok: false, code: "mfa-status-failed" };
  }
}

/**
 * D-17c: adding a passkey needs a session the staff gate lets in and a fresh, session-bound
 * re-auth — the same rule as adding an authenticator app (D-17b), so a stolen session cannot
 * add its own passkey.
 */
export function passkeyAddGate(input: {
  decision: StaffGateDecision;
  reauth: ReauthResult;
}): { ok: true } | MfaFail {
  if (input.decision !== "allow") return { ok: false, code: "mfa-aal2-required" };
  if (!input.reauth.ok) return { ok: false, code: input.reauth.code };
  return { ok: true };
}

/**
 * Removes one of the caller's own passkeys. Same checks as adding one (D-17, D-17c), then the
 * id must be in the caller's own server list before Supabase is asked to delete it.
 */
export async function removePasskey(
  client: MfaClient,
  input: { passkeyId: unknown; decision: StaffGateDecision; reauth: ReauthResult },
): Promise<{ ok: true } | MfaFail> {
  if (typeof input.passkeyId !== "string" || !UUID_RE.test(input.passkeyId)) {
    return { ok: false, code: "mfa-invalid-input" };
  }
  const allowed = passkeyAddGate(input);
  if (!allowed.ok) return allowed;
  const listed = await listPasskeys(client);
  if (!listed.ok) return { ok: false, code: "mfa-unenroll-failed" };
  if (!listed.passkeys.some((p) => p.id === input.passkeyId)) return { ok: false, code: "mfa-invalid-input" };
  const api = client.auth.passkey;
  if (!api?.delete) return { ok: false, code: "mfa-unenroll-failed" };
  try {
    const { error } = await api.delete({ passkeyId: input.passkeyId });
    if (error) return { ok: false, code: "mfa-unenroll-failed" };
  } catch {
    return { ok: false, code: "mfa-unenroll-failed" };
  }
  return { ok: true };
}

/** True when the session was established with a password. */
export function sessionUsedPassword(amr: readonly AmrEntry[] | null | undefined): boolean {
  return (amr ?? []).some((entry) =>
    typeof entry === "string" ? entry === "password" : entry?.method === "password",
  );
}

/**
 * D-16a: with `magic_link` stored, a password sign-in for that account is
 * refused. Callers sign the session out and answer the generic credentials
 * error, so the switch cannot be used to enumerate accounts.
 */
export function passwordSignInRefused(
  method: SignInMethod | null,
  amr: readonly AmrEntry[] | null | undefined,
): boolean {
  return method === "magic_link" && sessionUsedPassword(amr);
}

/**
 * Per-account attempt limit on code checks (TOTP, e-mail re-auth code), on top of
 * the per-IP `auth` write limit. Keyed on the user id so rotating IPs does not
 * buy more guesses. Fails closed.
 */
export async function checkCodeAttemptLimit(
  limiter: { limit(input: { key: string }): Promise<{ success: boolean }> },
  subject: string,
): Promise<boolean> {
  try {
    const result = await limiter.limit({ key: `auth-code:${subject}` });
    return result.success;
  } catch {
    return false;
  }
}

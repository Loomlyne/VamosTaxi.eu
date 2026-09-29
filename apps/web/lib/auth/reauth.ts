// apps/web/lib/auth/reauth.ts
//
// D-17 / audit S2: changing the admin password or email, switching the sign-in
// method, or removing a factor needs a re-auth within the last 5 minutes, bound
// to the current Supabase session. The proof is an HMAC cookie `vt_reauth`:
//
//   value = "v1.<exp seconds>.<base64url HMAC-SHA256(key, "vt_reauth.v1|<sub>|<session_id>|<exp>")>"
//
// The user id and session id are in the MAC input, not the cookie, so a cookie
// lifted into another session (or another account) never verifies. The key is
// the Worker secret STAFF_REAUTH_SECRET — used for nothing else. Missing or short
// key → re-auth is unavailable and every gated action is refused; there is no
// default key.

export const REAUTH_COOKIE = "vt_reauth";
export const REAUTH_TTL_SECONDS = 300;
const REAUTH_VERSION = "v1";
const MIN_SECRET_LENGTH = 32;
const COOKIE_RE = /^v1\.(\d{1,12})\.([A-Za-z0-9_-]{43})$/;

export type ReauthGate =
  | { ok: true }
  | { ok: false; code: "reauth-required" | "reauth-unavailable" };

type ReauthCheck = {
  secret: string | null | undefined;
  cookieHeader: string | null | undefined;
  userId: string | undefined;
  sessionId: string | undefined;
  now?: number;
};

/** The re-auth HMAC key, or null when it is not configured (fail closed). */
export function reauthSecret(env: { STAFF_REAUTH_SECRET?: string }): string | null {
  const value = env.STAFF_REAUTH_SECRET;
  if (typeof value !== "string" || value.length < MIN_SECRET_LENGTH) return null;
  return value;
}

function base64url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const binary = atob(padded);
    const out = new Uint8Array(new ArrayBuffer(binary.length));
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage],
  );
}

function macInput(userId: string, sessionId: string, exp: number): Uint8Array<ArrayBuffer> {
  const bytes = new TextEncoder().encode(`${REAUTH_COOKIE}.${REAUTH_VERSION}|${userId}|${sessionId}|${exp}`);
  const out = new Uint8Array(new ArrayBuffer(bytes.length));
  out.set(bytes);
  return out;
}

function cookieAttributes(maxAge: number): string {
  return `Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}

/** Set-Cookie for a fresh re-auth, or null when it cannot be bound (no key / no session). */
export async function mintReauthCookie(input: {
  secret: string | null | undefined;
  userId: string | undefined;
  sessionId: string | undefined;
  now?: number;
}): Promise<string | null> {
  if (!input.secret || !input.userId || !input.sessionId) return null;
  const exp = Math.floor((input.now ?? Date.now()) / 1000) + REAUTH_TTL_SECONDS;
  const key = await hmacKey(input.secret, "sign");
  const mac = await crypto.subtle.sign("HMAC", key, macInput(input.userId, input.sessionId, exp));
  return `${REAUTH_COOKIE}=${REAUTH_VERSION}.${exp}.${base64url(mac)}; ${cookieAttributes(REAUTH_TTL_SECONDS)}`;
}

/** Set-Cookie that drops the re-auth proof (sign-out). */
export function clearReauthCookie(): string {
  return `${REAUTH_COOKIE}=; ${cookieAttributes(0)}`;
}

/** One cookie value from a Cookie header. */
export function readCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

/** True only for a valid, unexpired proof minted for this user and this session. */
export async function hasFreshReauth(input: ReauthCheck): Promise<boolean> {
  if (!input.secret || !input.userId || !input.sessionId) return false;
  const value = readCookie(input.cookieHeader, REAUTH_COOKIE);
  const match = value ? COOKIE_RE.exec(value) : null;
  if (!match) return false;
  const exp = Number(match[1]);
  const nowSec = Math.floor((input.now ?? Date.now()) / 1000);
  if (!Number.isSafeInteger(exp) || exp <= nowSec || exp - nowSec > REAUTH_TTL_SECONDS) return false;
  const mac = fromBase64url(match[2] ?? "");
  if (!mac) return false;
  try {
    const key = await hmacKey(input.secret, "verify");
    // subtle.verify compares in constant time.
    return await crypto.subtle.verify("HMAC", key, mac, macInput(input.userId, input.sessionId, exp));
  } catch {
    return false;
  }
}

/** The gate every sensitive action calls. Missing key is its own code so ops can see it. */
export async function reauthGate(input: ReauthCheck): Promise<ReauthGate> {
  if (!input.secret) return { ok: false, code: "reauth-unavailable" };
  if (await hasFreshReauth(input)) return { ok: true };
  return { ok: false, code: "reauth-required" };
}

/**
 * A password-recovery sign-in in the last 5 minutes already proves the admin
 * holds the mailbox, so the reset-password flow is not asked to re-auth again.
 * Needs the AMR timestamp; a bare string entry is not enough.
 */
export function recentRecovery(
  amr: ReadonlyArray<{ method: string; timestamp?: number } | string> | null | undefined,
  now: number = Date.now(),
): boolean {
  const nowSec = Math.floor(now / 1000);
  return (amr ?? []).some(
    (entry) =>
      typeof entry !== "string" &&
      entry.method === "recovery" &&
      typeof entry.timestamp === "number" &&
      nowSec - entry.timestamp >= 0 &&
      nowSec - entry.timestamp <= REAUTH_TTL_SECONDS,
  );
}

/** Does this profile body change the password or the email? */
export function sensitiveProfileChange(
  body: Record<string, unknown>,
  currentEmail: string | null | undefined,
): boolean {
  if (typeof body.password === "string" && body.password.length > 0) return true;
  const next = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const current = (currentEmail ?? "").trim().toLowerCase();
  return next.length > 0 && next !== current;
}

/** The slice of a cookie-less Supabase client the credential re-checks use. */
export type CredentialClient = {
  auth: {
    signInWithPassword(args: { email: string; password: string }): Promise<{
      error: { code?: string } | null;
    }>;
    signInWithOtp(args: {
      email: string;
      options?: { shouldCreateUser?: boolean };
    }): Promise<{ error: { code?: string } | null }>;
    verifyOtp(args: { email: string; token: string; type: "email" }): Promise<{
      error: { code?: string } | null;
    }>;
    signOut(args?: { scope?: "global" | "local" | "others" }): Promise<{ error: unknown }>;
  };
};

async function dropThrowawaySession(client: CredentialClient): Promise<void> {
  try {
    // scope "local" revokes only the throwaway session, never the admin's own.
    await client.auth.signOut({ scope: "local" });
  } catch {
    // Revocation is best effort; the throwaway session never reached a browser.
  }
}

/** Re-checks the admin's own email + password on an isolated client. */
export async function verifyOwnPassword(
  client: CredentialClient,
  email: string | undefined,
  password: unknown,
): Promise<boolean> {
  if (!email || typeof password !== "string" || password.length === 0 || password.length > 256) {
    return false;
  }
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) return false;
  await dropThrowawaySession(client);
  return true;
}

/** Sends a 6-digit e-mail code to the admin's own address (never creates a user). */
export async function sendReauthCode(
  client: CredentialClient,
  email: string | undefined,
): Promise<boolean> {
  if (!email) return false;
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  return !error;
}

/** Verifies that code on an isolated client, then drops the session it minted. */
export async function verifyReauthCode(
  client: CredentialClient,
  email: string | undefined,
  rawCode: unknown,
): Promise<boolean> {
  const token = typeof rawCode === "string" ? rawCode.replace(/\s+/g, "") : "";
  if (!email || !/^\d{6}$/.test(token)) return false;
  const { error } = await client.auth.verifyOtp({ email, token, type: "email" });
  if (error) return false;
  await dropThrowawaySession(client);
  return true;
}

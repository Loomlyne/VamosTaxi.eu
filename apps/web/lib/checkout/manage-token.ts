// apps/web/lib/checkout/manage-token.ts
//
// Manage-booking token. The customer holds the raw value (cookie + email);
// Postgres stores only SHA-256 (`booking_access_tokens.token_hash`, 32 bytes).
// No logging of any kind in this module — the omission is deliberate.

import { base64urlDecode, base64urlEncode } from "../crypto/hmac";

export const MANAGE_COOKIE_NAME = "vt_manage";

/**
 * 32 cryptographically random bytes. `raw` is base64url for the cookie and
 * the confirmation email. `hash` is SHA-256 of those bytes for Postgres.
 * Never Math.random.
 */
export async function mintManageToken(): Promise<{ raw: string; hash: Uint8Array }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return { raw: base64urlEncode(bytes), hash: new Uint8Array(digest) };
}

/**
 * Set-Cookie for the manage token.
 *
 * SameSite=Lax looks weaker than Strict. Strict would not be sent when the
 * browser returns from Stripe's redirect-based methods (TWINT / 3DS) — that
 * is a top-level cross-site GET, and the confirmation page would then see no
 * cookie for exactly those customers. Lax sends it on that navigation and
 * withholds it from cross-site subresources.
 *
 * maxAgeSeconds is the caller's value (from settings_versions) — never a
 * literal in this file.
 */
export function manageTokenCookie(rawToken: string, maxAgeSeconds: number): string {
  return `${MANAGE_COOKIE_NAME}=${rawToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

/**
 * OpenNext `cookies()` can be empty on Route Handlers while the browser
 * still sent Cookie. Prefer the jar; fall back to the raw header.
 * Never log the value.
 */
export function readManageCookie(jarValue: string, cookieHeader: string | null): string {
  if (jarValue) return jarValue;
  if (!cookieHeader) return "";
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) !== MANAGE_COOKIE_NAME) continue;
    try {
      return decodeURIComponent(trimmed.slice(eq + 1));
    } catch {
      return trimmed.slice(eq + 1);
    }
  }
  return "";
}

/** Cookie first, query only as first-click fallback. Never log the value. */
export function rawManageTokenFromRequest(request: Request): string {
  const cookie = readManageCookie("", request.headers.get("cookie"));
  if (cookie) return cookie;
  try {
    const url = new URL(request.url);
    return (url.searchParams.get("token") ?? url.searchParams.get("mb") ?? "").trim();
  } catch {
    return "";
  }
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, "0");
  }
  return out;
}

/**
 * SHA-256 of the cookie's raw bytes, as 64 lowercase hex chars for
 * `request.vamos.manage_token_hash`. Empty or undecodable input returns
 * "" so the GUC is unset and RLS returns zero rows — never a throw.
 */
export async function hashManageToken(raw: string): Promise<string> {
  if (!raw) return "";
  try {
    const bytes = new Uint8Array(base64urlDecode(raw));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return toHex(new Uint8Array(digest));
  } catch {
    return "";
  }
}

/** SHA-256 of raw token bytes for checkout_pay_link_by_hash. Empty → empty. */
export async function hashRawToken(raw: string): Promise<Uint8Array> {
  if (!raw) return new Uint8Array();
  const bytes = new Uint8Array(base64urlDecode(raw));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(digest);
}

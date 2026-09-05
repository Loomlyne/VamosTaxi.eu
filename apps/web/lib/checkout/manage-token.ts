// apps/web/lib/checkout/manage-token.ts
//
// Manage-booking token. The customer holds the raw value (cookie + email);
// Postgres stores only SHA-256 (`booking_access_tokens.token_hash`, 32 bytes).
// No logging of any kind in this module — the omission is deliberate.

import { base64urlEncode } from "../crypto/hmac";

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

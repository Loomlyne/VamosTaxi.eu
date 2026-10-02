// apps/web/lib/abuse/vamos-qs.ts
//
// Signed visitor cookie for QUOTE-09's per-visitor rate-limit bucket (D-36).
//
// The one rule that makes the whole layer work: an unverifiable cookie is
// treated as MISSING, never as a new identity. An unsigned UUID is
// client-mintable — Cookie: vamos_qs=<fresh uuid> would buy a new 8/60 bucket
// and reset the Turnstile counter on every request. Signing it is what makes
// the per-visitor gate a gate.
//
// HttpOnly stops JavaScript READING the cookie on the first-party page; it
// does not stop a script SENDING one, which is why the signature and not the
// flag is the control. Callers that get null from verifyVamosQs fall to the
// 4/60 bare-IP bucket (QUOTE_RATE_LIMITER_BARE) — never into a fresh copy of
// the larger 8/60 binding.
//
// Uses the shared HMAC primitive (../crypto/hmac) with a DIFFERENT secret
// (VAMOS_QS_SECRET). One secret must never sign two token kinds.

import { signHmac, verifyHmac } from "../crypto/hmac";

/** Cookie name set on the first document response if absent. */
export const VAMOS_QS_COOKIE = "vamos_qs";

/**
 * Exact Set-Cookie attribute string. No route handler writes this itself —
 * always interpolate `${VAMOS_QS_COOKIE}=${token}; ${VAMOS_QS_ATTRS}`.
 */
export const VAMOS_QS_ATTRS =
  "HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400";

/**
 * Mint a signed visitor cookie value: visitorId + "." + base64url(mac).
 * `visitorId` is a server-generated UUID (or any non-empty opaque id); the
 * MAC covers the id string as the message segment.
 */
export async function mintVamosQs(
  secret: string,
  visitorId: string,
): Promise<string> {
  if (typeof visitorId !== "string" || visitorId.length === 0) {
    throw new TypeError("mintVamosQs: visitorId must be a non-empty string");
  }
  if (visitorId.includes(".")) {
    // Dot is the segment separator; refuse ids that would make parse ambiguous.
    throw new TypeError("mintVamosQs: visitorId must not contain '.'");
  }
  const mac = await signHmac(secret, visitorId);
  return `${visitorId}.${mac}`;
}

/**
 * Verify a vamos_qs cookie value. Returns the visitor id on success, or null
 * for every failure mode (unsigned bare UUID, wrong MAC, malformed, empty).
 * All nulls are indistinguishable from a missing cookie (D-36).
 */
export async function verifyVamosQs(
  secret: string,
  value: string | null | undefined,
): Promise<string | null> {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  const dot = value.indexOf(".");
  if (dot <= 0 || dot === value.length - 1) {
    // No separator, empty id, or empty mac — including a bare UUID.
    return null;
  }

  // Only one separator expected: id may not contain '.'; mac is base64url (no '.').
  if (value.indexOf(".", dot + 1) !== -1) {
    return null;
  }

  const visitorId = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  if (!visitorId || !mac) {
    return null;
  }

  const ok = await verifyHmac(secret, visitorId, mac);
  if (!ok) {
    return null;
  }
  return visitorId;
}

/**
 * The visitor id from a vamos_qs cookie, verified with the current secret and then, during a
 * rotation, with the previous one. Null when neither verifies. One copy, so the rate-limit bucket
 * and the Turnstile counter always agree about who the visitor is.
 */
export async function verifiedSubject(
  cookie: string | null | undefined,
  secret: string,
  previousSecret: string | undefined,
): Promise<string | null> {
  const current = await verifyVamosQs(secret, cookie);
  if (current) return current;
  if (typeof previousSecret === "string" && previousSecret.length > 0) {
    return verifyVamosQs(previousSecret, cookie);
  }
  return null;
}

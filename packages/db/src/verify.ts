// packages/db/src/verify.ts
//
// Supabase access-token verification with `jose` (D-14/T-03-18). This is the reason the
// isolation probe's identities are honest: a hand-minted JWT is rejected here, so "two real
// customers" in the DATA-06 proof means two real Supabase Auth users with real access tokens,
// never a forged claim smuggled past the boundary the proof exists to test. Phase 5 owns the
// app-side consumer of this function (the shipped route handlers' own bearer check); Phase 3
// ships it for the isolation probe, its only caller today.
//
// Refuses HS256 explicitly, before any network round-trip: a JWKS-published key is always
// asymmetric (RSA/EC), so an HS256 token could never legitimately match one, but checking the
// header first closes the classic algorithm-confusion path (an attacker mints an HS256 token
// using a public RSA/EC key's own bytes as the HMAC secret) at the cheapest possible point.
// Checks issuer and audience against the Supabase project the caller names. Rejects anything
// it cannot verify — an expired token, a bad signature, a wrong issuer or audience — and never
// falls back to reading the payload unverified.
//
// Maps the verified payload onto `VamosClaims` by reading `sub`, `role`, `aal`, `email`,
// `session_id` and `app_metadata` only, mirroring `claims.ts`'s own enumerate-don't-spread
// discipline. `user_metadata` is never read here: it is writable by the customer themselves
// through the client SDK (Phase 2 D-04), so trusting it would let a customer claim any role or
// session state it wants simply by editing their own profile.

import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from "jose";
import type { VamosClaims } from "./claims";

export interface VerifyAccessTokenOptions {
  /** The Supabase project URL, e.g. "https://<ref>.supabase.co" — JWKS and issuer derive from it. */
  supabaseUrl: string;
  /** Expected `aud` claim. Supabase's own default for a signed-in session. */
  audience?: string;
}

// One remote JWKS set per project URL, reused across calls in the same isolate. `jose`'s own
// cache (cooldown + cache duration) is what keeps this from hitting the JWKS endpoint on every
// request — this Map only exists so a second call in the same isolate reuses the same
// `createRemoteJWKSet` instance rather than losing that cache on every invocation.
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwksFor(supabaseUrl: string): ReturnType<typeof createRemoteJWKSet> {
  const normalized = supabaseUrl.replace(/\/+$/, "");
  let jwks = jwksCache.get(normalized);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${normalized}/auth/v1/.well-known/jwks.json`));
    jwksCache.set(normalized, jwks);
  }
  return jwks;
}

/**
 * Verifies a Supabase access token and maps the verified payload onto `VamosClaims`. Throws on
 * anything it cannot verify — never returns a partially-trusted result.
 */
export async function verifyAccessToken(
  token: string,
  opts: VerifyAccessTokenOptions,
): Promise<VamosClaims> {
  if (!token) {
    throw new Error("verifyAccessToken: empty token");
  }

  // The explicit HS256 refusal (see file header) — checked from the unverified header, before
  // the JWKS fetch, so a symmetric-algorithm token is rejected at the cheapest point rather
  // than being handed to `jwtVerify` at all.
  const { alg } = decodeProtectedHeader(token);
  if (alg === "HS256") {
    throw new Error("verifyAccessToken: HS256 is refused — this project verifies asymmetric Supabase signing keys only");
  }

  const normalized = opts.supabaseUrl.replace(/\/+$/, "");
  const issuer = `${normalized}/auth/v1`;

  const { payload } = await jwtVerify(token, jwksFor(opts.supabaseUrl), {
    issuer,
    audience: opts.audience ?? "authenticated",
    // Explicit allowlist, matching the HS256 refusal above in spirit: only the two asymmetric
    // algorithms Supabase's signing-keys feature actually publishes are ever accepted.
    algorithms: ["RS256", "ES256"],
  });

  const sub = payload.sub;
  const roleValue = payload.role;
  if (typeof sub !== "string" || (roleValue !== "anon" && roleValue !== "authenticated")) {
    throw new Error("verifyAccessToken: verified payload is missing sub or a legal role claim");
  }
  const role = roleValue as VamosClaims["role"];

  const aalValue = payload.aal;
  const aal =
    aalValue === "aal1" || aalValue === "aal2" || aalValue === "aal3" ? aalValue : undefined;

  const emailValue = payload.email;
  const email = typeof emailValue === "string" ? emailValue : undefined;

  const sessionIdValue = payload.session_id;
  const sessionId = typeof sessionIdValue === "string" ? sessionIdValue : undefined;

  // `app_metadata` is passed through as-is here; `claimsForSql` downstream is the place that
  // re-enumerates it field by field before it ever reaches SQL — this function's own job is
  // only "verified or thrown", not re-shaping the claim for the GUC.
  const appMetadataValue = payload.app_metadata;
  const appMetadata: VamosClaims["app_metadata"] =
    typeof appMetadataValue === "object" && appMetadataValue !== null
      ? (appMetadataValue as VamosClaims["app_metadata"])
      : undefined;

  return {
    sub,
    role,
    aal,
    email,
    session_id: sessionId,
    app_metadata: appMetadata,
  };
}

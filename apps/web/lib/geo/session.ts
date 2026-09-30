// apps/web/lib/geo/session.ts
//
// Our Search Box session-token set (D-14, D-15). What is stored is OUR
// bookkeeping about OUR session tokens, not a Mapbox response — Product
// Terms §1.9 / §2.7.2 / §2.10.1 bar caching Licensed Map Content, and this
// is not that. No Mapbox response field may ever be added to this record,
// so the file cannot drift into being the cache D-14 forbids.
//
// Lives in QUOTE_ABUSE (D-37), never GEO_CACHE. The key is the rate-limit
// bucket plus a SHA-256 of the session UUID — never the UUID itself, never
// a customer or booking id, never a Mapbox field.
//
// Plan 04-13 wraps the /api/geo/* routes with rate-limit, breaker and
// Turnstile; this module is only the suggest→retrieve session gate.

const SESSION_TTL_SECONDS = 30 * 60;

export { SESSION_TTL_SECONDS };

type AbuseEnv = { QUOTE_ABUSE?: KVNamespace };

export type PublicSuggestion = {
  mapbox_id: string;
  name: string;
  address: string;
  context: string;
};

/**
 * §4 suggest payload. Pick the four public fields so a mapper that later
 * grows lng/lat/coordinates cannot leak them through /suggest.
 */
export function publicSuggestion(hit: PublicSuggestion): PublicSuggestion {
  return {
    mapbox_id: hit.mapbox_id,
    name: hit.name,
    address: hit.address,
    context: hit.context,
  };
}

/** Rate-limit bucket for the session key — IP, never a customer id. */
export function sessionBucket(request: Request): string {
  // Cloudflare's visitor address only; x-forwarded-for is client-settable.
  return request.headers.get("cf-connecting-ip")?.trim() || "unknown";
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sessionKey(bucket: string, sessionToken: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(sessionToken),
  );
  return `geo:session:${bucket}:${bytesToHex(digest)}`;
}

export async function rememberSession(
  env: AbuseEnv,
  sessionToken: string,
  bucket: string,
): Promise<void> {
  const kv = env.QUOTE_ABUSE;
  if (!kv) return;
  try {
    const key = await sessionKey(bucket, sessionToken);
    await kv.put(key, "1", { expirationTtl: SESSION_TTL_SECONDS });
  } catch {
    // Suggest still answers; retrieve will fail closed without the record.
  }
}

export async function hasSeenSession(
  env: AbuseEnv,
  sessionToken: string,
  bucket: string,
): Promise<boolean> {
  const kv = env.QUOTE_ABUSE;
  // Unavailable KV must fail CLOSED on /retrieve: this is an abuse control,
  // the opposite of the token-absent degradation in mapbox.ts (a cost
  // control). A free bypass of the session gate is worse than a 403.
  if (!kv) return false;
  try {
    const key = await sessionKey(bucket, sessionToken);
    const value = await kv.get(key);
    return value !== null && value !== undefined;
  } catch {
    return false;
  }
}

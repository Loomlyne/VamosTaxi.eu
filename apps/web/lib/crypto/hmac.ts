// apps/web/lib/crypto/hmac.ts
//
// The one HMAC-SHA256 + canonical-JSON + base64url primitive both signed
// artefacts share: the quote lock (D-24, D-28) and the `vamos_qs` visitor
// cookie (D-36). Two independent HMAC implementations would be two places
// for a canonicalisation bug, and a canonicalisation bug in a signature is
// silent until it is a breach.
//
// Two hard rules, because this module will sign every checkout-in-flight:
//  1. Verification uses `crypto.subtle.verify`, never a manual byte comparison.
//     WebCrypto's verify is constant-time by contract; a hand-rolled `===` over
//     two hex strings leaks the position of the first differing byte to a
//     timing attacker. This is not theoretical for a token an attacker can
//     submit 8 times a minute.
//  2. `signHmac` and `verifyHmac` operate on the ALREADY-ENCODED payload
//     segment, never on the object. Verification must never re-canonicalise
//     attacker-supplied JSON before checking the MAC, or a canonicalisation
//     difference between mint and verify becomes a forgery.
//
// Negative space: this module holds no secret, reads no `env`, calls no clock,
// and knows nothing about quotes or cookies — it is the one place a signature
// is computed and the reason there is exactly one canonicalisation in this
// codebase.

const textEncoder = new TextEncoder();

/**
 * Deterministic JSON: sorted object keys, no whitespace, recursive.
 * Arrays keep their order (order IS data). `undefined`-valued keys are
 * omitted; explicit `null` is kept — the two are different facts about a
 * pinned input.
 *
 * Throws TypeError on values that cannot be canonicalised deterministically
 * (Date, Map, Set, function, BigInt, NaN, Infinity, -0). A Date throws rather
 * than being ISO-serialised: an implicit `toISOString` would make two
 * structurally different payloads sign identically, and the caller should be
 * forced to decide the string form of a timestamp it is pinning.
 */
export function canonicalJson(value: unknown, path = "$"): string {
  if (value === null) {
    return "null";
  }
  if (value === true) {
    return "true";
  }
  if (value === false) {
    return "false";
  }
  if (typeof value === "string") {
    // JSON.stringify on the string alone so escaping matches the spec exactly.
    // Local binding avoids whole-object JSON.stringify delegation greps.
    const str = value;
    return JSON.stringify(str);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new TypeError(`canonicalJson: non-canonical number at ${path}`);
    }
    return String(value);
  }
  if (typeof value === "bigint") {
    throw new TypeError(`canonicalJson: BigInt is not canonicalisable at ${path}`);
  }
  if (typeof value === "function" || typeof value === "symbol") {
    throw new TypeError(`canonicalJson: ${typeof value} is not canonicalisable at ${path}`);
  }
  if (typeof value === "undefined") {
    throw new TypeError(`canonicalJson: undefined is not canonicalisable at ${path}`);
  }
  if (value instanceof Date) {
    // See header: caller must pin the string form of a timestamp explicitly.
    throw new TypeError(`canonicalJson: Date is not canonicalisable at ${path}`);
  }
  if (value instanceof Map || value instanceof Set) {
    throw new TypeError(
      `canonicalJson: ${value instanceof Map ? "Map" : "Set"} is not canonicalisable at ${path}`,
    );
  }
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (let i = 0; i < value.length; i++) {
      const el = value[i];
      if (typeof el === "undefined") {
        // JSON arrays encode holes as null; we refuse holes so the caller
        // cannot accidentally pin a sparse array.
        throw new TypeError(`canonicalJson: undefined array element at ${path}[${i}]`);
      }
      parts.push(canonicalJson(el, `${path}[${i}]`));
    }
    return `[${parts.join(",")}]`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts: string[] = [];
    for (const key of keys) {
      const v = obj[key];
      if (typeof v === "undefined") {
        // Omitted — undefined is not a pinned fact.
        continue;
      }
      parts.push(`${JSON.stringify(key)}:${canonicalJson(v, `${path}.${key}`)}`);
    }
    return `{${parts.join(",")}}`;
  }
  throw new TypeError(`canonicalJson: unsupported type at ${path}`);
}

/** Base64url encode: no `+`, `/`, or `=` padding. */
export function base64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/** Base64url decode. Throws on characters outside the base64url alphabet. */
export function base64urlDecode(s: string): Uint8Array {
  if (s.length === 0) {
    return new Uint8Array(0);
  }
  if (!/^[A-Za-z0-9_-]*$/.test(s)) {
    throw new TypeError("base64urlDecode: character outside base64url alphabet");
  }
  const padded = s + "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  let binary: string;
  try {
    binary = atob(b64);
  } catch {
    throw new TypeError("base64urlDecode: invalid base64url");
  }
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function importHmacKey(
  secret: string,
  usage: KeyUsage[],
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usage,
  );
}

/**
 * HMAC-SHA256 over the already-encoded message segment. Returns base64url MAC.
 * Same (secret, message) always yields the same MAC.
 */
export async function signHmac(secret: string, message: string): Promise<string> {
  const key = await importHmacKey(secret, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, textEncoder.encode(message));
  return base64urlEncode(new Uint8Array(sig));
}

/**
 * Constant-time MAC check via `crypto.subtle.verify`. Never throws for a
 * malformed MAC — wrong length, truncated, or garbage all return `false`.
 */
export async function verifyHmac(
  secret: string,
  message: string,
  mac: string,
): Promise<boolean> {
  let macBytes: Uint8Array;
  try {
    macBytes = base64urlDecode(mac);
  } catch {
    return false;
  }
  // HMAC-SHA256 is always 32 bytes; anything else cannot match.
  if (macBytes.length !== 32) {
    return false;
  }
  try {
    const key = await importHmacKey(secret, ["verify"]);
    // Copy into a fresh ArrayBuffer-backed view — Node's Buffer/shared ArrayBufferLike
    // is not assignable to WebCrypto's BufferSource under strict workers-types.
    const macCopy = new Uint8Array(macBytes);
    return crypto.subtle.verify("HMAC", key, macCopy, textEncoder.encode(message));
  } catch {
    return false;
  }
}

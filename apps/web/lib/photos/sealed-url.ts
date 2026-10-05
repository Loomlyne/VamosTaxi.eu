// apps/web/lib/photos/sealed-url.ts
//
// Security S10 (2026-10-05): a class photo is stored at `classes/<class uuid>/<file>`, and the
// public quote board used to hand that key out as `/photos/classes/<uuid>/<file>`, so every
// visitor read the class row ids. The public board now gets a sealed address instead:
//
//   /photos/c/<token>.<ext>
//
// `token` is base64url(iv || AES-GCM(key)). The iv is the first 12 bytes of HMAC-SHA256 over the
// key, so the same photo always gets the same address (browsers keep caching it as immutable) and
// nobody without the Worker secret can read the key back. Both keys come from QUOTE_LOCK_SECRET
// through HKDF with their own label, so they never equal the quote-lock key. The extension stays on
// the address so the middleware matcher and the asset pin treat it like every other photo file.
// A sealed address opens to a `classes/` key only. The staff screens keep the plain keys.

import { base64urlDecode, base64urlEncode } from "../crypto/hmac";

export const SEALED_PHOTO_PREFIX = "/photos/c/";

const SEALED_KEY_PREFIX = "classes/";
const HKDF_SALT = new TextEncoder().encode("vamos-photo-url");
const IV_BYTES = 12;
const EXT_RE = /^[a-z0-9]{2,5}$/;

type PhotoKeys = { enc: CryptoKey; mac: CryptoKey };

async function deriveKeys(secret: string): Promise<PhotoKeys> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "HKDF", false, ["deriveKey"]);
  const hkdf = (label: string) => ({
    name: "HKDF",
    hash: "SHA-256",
    salt: HKDF_SALT,
    info: new TextEncoder().encode(label),
  });
  const enc = await crypto.subtle.deriveKey(hkdf("photo-url-enc-v1"), base, { name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  const mac = await crypto.subtle.deriveKey(hkdf("photo-url-iv-v1"), base, { name: "HMAC", hash: "SHA-256", length: 256 }, false, [
    "sign",
  ]);
  return { enc, mac };
}

function extensionOf(key: string): string {
  const leaf = key.split("/").pop() ?? "";
  const dot = leaf.lastIndexOf(".");
  const ext = dot > 0 ? leaf.slice(dot + 1).toLowerCase() : "";
  return EXT_RE.test(ext) ? ext : "bin";
}

async function sealWith(keys: PhotoKeys, key: string): Promise<string> {
  const plain = new TextEncoder().encode(key);
  const iv = new Uint8Array(await crypto.subtle.sign("HMAC", keys.mac, plain)).slice(0, IV_BYTES);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, keys.enc, plain));
  const token = new Uint8Array(iv.length + cipher.length);
  token.set(iv, 0);
  token.set(cipher, iv.length);
  return `${SEALED_PHOTO_PREFIX}${base64urlEncode(token)}.${extensionOf(key)}`;
}

/** Sealed public address for one `classes/` key, or null without a secret or for any other key. */
export async function sealClassPhotoKey(secret: string | undefined, key: string): Promise<string | null> {
  if (!secret || !key.startsWith(SEALED_KEY_PREFIX)) return null;
  return sealWith(await deriveKeys(secret), key);
}

/**
 * The public class board with every `/photos/classes/…` address sealed. Without a secret the photo
 * is left out (no card loses more than its picture); any other address is left as it is.
 */
export async function sealClassPhotoUrls<T extends { photo_url?: string | null }>(
  secret: string | undefined,
  classes: readonly T[],
): Promise<T[]> {
  const plainPrefix = `/photos/${SEALED_KEY_PREFIX}`;
  if (!classes.some((c) => typeof c.photo_url === "string" && c.photo_url.startsWith(plainPrefix))) {
    return [...classes];
  }
  const keys = secret ? await deriveKeys(secret) : null;
  const out: T[] = [];
  for (const c of classes) {
    const url = c.photo_url;
    if (typeof url !== "string" || !url.startsWith(plainPrefix)) {
      out.push(c);
      continue;
    }
    out.push({ ...c, photo_url: keys ? await sealWith(keys, url.slice("/photos/".length)) : null });
  }
  return out;
}

/**
 * The R2 key behind a sealed `/photos/c/<token>.<ext>` pathname, tried with each secret in turn
 * (current, then the previous one during a rotation). Null for anything that does not open, does
 * not name a `classes/` key, or whose extension does not match.
 */
export async function openSealedPhotoPath(
  secrets: ReadonlyArray<string | undefined>,
  pathname: string,
): Promise<string | null> {
  if (!pathname.startsWith(SEALED_PHOTO_PREFIX)) return null;
  const leaf = pathname.slice(SEALED_PHOTO_PREFIX.length);
  const match = /^([A-Za-z0-9_-]{24,1024})\.([a-z0-9]{2,5})$/.exec(leaf);
  if (!match) return null;
  let bytes: Uint8Array;
  try {
    bytes = base64urlDecode(match[1]!);
  } catch {
    return null;
  }
  if (bytes.length <= IV_BYTES + 16) return null;
  const iv = bytes.slice(0, IV_BYTES);
  const cipher = bytes.slice(IV_BYTES);
  for (const secret of secrets) {
    if (!secret) continue;
    const keys = await deriveKeys(secret);
    let key: string;
    try {
      key = new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, keys.enc, cipher));
    } catch {
      continue;
    }
    if (!key.startsWith(SEALED_KEY_PREFIX) || extensionOf(key) !== match[2]) return null;
    return key;
  }
  return null;
}

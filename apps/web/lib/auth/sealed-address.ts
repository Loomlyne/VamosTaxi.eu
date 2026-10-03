// apps/web/lib/auth/sealed-address.ts
//
// F12. The e-mail sign-in link carries the address it was sent to, sealed, so the confirm screen can
// show "You are signing in as …" without spending the token. AES-256-GCM, the token_hash is the
// associated data: a sealed address cannot be moved onto another link. The key is derived (HKDF-SHA-256)
// from the e-mail-hook secret with its own label, so a stolen seal says nothing about the webhook and
// the owner has no extra secret to set. Never logs the secret, the address or the seal. A missing
// secret answers null on purpose (the caller fails closed), it never throws.

const LABEL = "vamos-f12-sealed-address-v1";
const IV_BYTES = 12;

/** The secret this module derives from. Same lookup the e-mail hook uses. */
export function sealSecretFrom(env: { SEND_EMAIL_HOOK_SECRET?: string } | undefined): string | undefined {
  const secret = env?.SEND_EMAIL_HOOK_SECRET ?? process.env.SEND_EMAIL_HOOK_SECRET;
  return typeof secret === "string" && secret.length > 0 ? secret : undefined;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: encoder.encode(LABEL) },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Seals `email` to `tokenHash`. Null when the secret or the token_hash is missing. */
export async function sealAddress(
  email: string,
  tokenHash: string,
  secret: string | null | undefined,
): Promise<string | null> {
  if (!secret || !tokenHash || !email) return null;
  try {
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const key = await deriveKey(secret);
    const cipher = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: encoder.encode(tokenHash) },
        key,
        encoder.encode(email.trim().toLowerCase()),
      ),
    );
    const out = new Uint8Array(iv.length + cipher.length);
    out.set(iv, 0);
    out.set(cipher, iv.length);
    return toBase64Url(out);
  } catch {
    return null;
  }
}

/** Opens a seal made for exactly this `tokenHash`. Null for anything else. */
export async function openAddress(
  sealed: string | null | undefined,
  tokenHash: string,
  secret: string | null | undefined,
): Promise<string | null> {
  if (!secret || !tokenHash || !sealed || sealed.length > 2000) return null;
  const bytes = fromBase64Url(sealed);
  if (!bytes || bytes.length <= IV_BYTES + 16) return null;
  try {
    const key = await deriveKey(secret);
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: bytes.slice(0, IV_BYTES),
        additionalData: new TextEncoder().encode(tokenHash),
      },
      key,
      bytes.slice(IV_BYTES),
    );
    const email = new TextDecoder("utf-8", { fatal: true }).decode(plain);
    return email.length > 0 ? email : null;
  } catch {
    return null;
  }
}

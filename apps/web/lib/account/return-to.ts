/**
 * Sign-in return target (D-13). Only a same-origin checkout path is accepted:
 * `/checkout?…` or `/{locale}/checkout?…`. Anything else returns null so the
 * caller falls back to /account. Mirrored inline in app/pages/AuthForm.dc.html.
 */
const MAX_LEN = 2000;
const RE = /^\/(?:(?:en|de|fr|ar)\/)?checkout(?:\?[^#\s\\]*)?$/;

export function safeReturnTo(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v || v.length > MAX_LEN || v.startsWith("//")) return null;
  if (/[\u0000-\u001f\\]/.test(v) || v.includes("..")) return null;
  return RE.test(v) ? v : null;
}

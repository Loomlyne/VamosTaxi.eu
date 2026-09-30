// F14: the lock secret must be present before any route verifies or mints a lock.
// An empty HMAC key only failed closed by accident (WebCrypto refuses a zero-length key).

import { log } from "../logger";

/** True when the secret is a non-empty string. Logs one line (no value) when it is not. */
export function lockSecretPresent(secret: string | undefined | null, route: string): boolean {
  if (typeof secret === "string" && secret.length > 0) return true;
  log("error", "quote_lock_secret_missing", { requestId: "lock-secret", route, locale: null }, { reason: "secret-empty" });
  return false;
}

/** 503 in the shape of the checkout routes ({ ok:false, code }). */
export function lockSecretMissingResponse(): Response {
  return new Response(JSON.stringify({ ok: false, code: "temporarily_unavailable" }), {
    status: 503,
    headers: { "content-type": "application/json", "cache-control": "private, no-store" },
  });
}

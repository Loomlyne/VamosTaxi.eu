// apps/web/lib/consent/cookie.ts
//
// D-09: first-party consent_subject cookie. HttpOnly + Secure + SameSite=Lax,
// 1 year. Helpers read Cookie / format Set-Cookie. They do not write a cookie
// on GET (cache pitfall — mint only on the consent POST).

export const CONSENT_COOKIE = "consent_subject";

const CONSENT_MAX_AGE = 31536000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Server-minted subject UUID. Callers set it on POST, never on a page GET. */
export function mintConsentSubject(): string {
  return crypto.randomUUID();
}

/**
 * Read consent_subject from a Cookie header. Non-UUID values are treated as
 * missing so a forged customer_id cannot ride this cookie.
 */
export function readConsentSubject(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) !== CONSENT_COOKIE) continue;
    let value = trimmed.slice(eq + 1);
    try {
      value = decodeURIComponent(value);
    } catch {
      // keep raw
    }
    return isUuid(value) ? value : null;
  }
  return null;
}

/**
 * Set-Cookie for a Worker-minted UUID. Path=/; HttpOnly; Secure; SameSite=Lax.
 */
export function consentSubjectSetCookie(subject: string): string {
  if (!isUuid(subject)) {
    throw new TypeError("consentSubjectSetCookie: subject must be a UUID");
  }
  return `${CONSENT_COOKIE}=${subject}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${CONSENT_MAX_AGE}`;
}

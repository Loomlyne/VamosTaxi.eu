export type CookiePair = { name: string; value: string };

export function cookieListFromHeader(header: string | null | undefined): CookiePair[] {
  if (!header) return [];
  const out: CookiePair[] = [];
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const name = part.slice(0, idx).trim();
    if (!name) continue;
    out.push({ name, value: part.slice(idx + 1).trim() });
  }
  return out;
}

export function authCookiesFrom(store: CookiePair[], header: string | null | undefined): CookiePair[] {
  const fromHeader = cookieListFromHeader(header);
  return fromHeader.length > 0 ? fromHeader : store;
}

/**
 * Auth cookies are Secure whenever the request came in over https. Plain http is only
 * localhost / dashboard.localhost / 127.0.0.1 in local development, where a Secure cookie
 * would be dropped by the browser and sign-in tests would stop working.
 */
export function isSecureRequest(input: {
  url?: string | null;
  forwardedProto?: string | null;
  host?: string | null;
}): boolean {
  if (input.url) {
    try {
      return new URL(input.url).protocol === "https:";
    } catch {
      // fall through to the header signals
    }
  }
  const proto = input.forwardedProto?.split(",")[0]?.trim().toLowerCase();
  if (proto) return proto === "https";
  const hostname = input.host?.split(":")[0]?.trim().toLowerCase();
  if (!hostname) return false;
  return !(
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost")
  );
}

/**
 * The session cookie's name (owner, 2026-10-04: the Supabase default `sb-<project ref>-auth-token`
 * put the project ref in every signed-in browser). Supabase derives the rest from it: chunks are
 * `vt-auth.0`, `vt-auth.1`…, the PKCE verifier is `vt-auth-code-verifier`.
 */
export const AUTH_COOKIE_NAME = "vt-auth";

/** The session cookie, whole or chunked (`vt-auth`, `vt-auth.0`). Not the PKCE verifier. */
export const AUTH_SESSION_COOKIE_RE = /^vt-auth(?:\.\d+)?$/;

/**
 * Every cookie the old default name produced: `sb-<ref>-auth-token`, its chunks `.0/.1…`,
 * `-code-verifier` and the per-flow verifier keys. Only ever matched to expire them.
 */
export const LEGACY_AUTH_COOKIE_RE = /^sb-[A-Za-z0-9_-]+-auth-token(?:[.-][A-Za-z0-9_.-]*)?$/;

/**
 * Cookie attributes for every Supabase auth cookie. Path "/", SameSite Lax and NO Domain, so a
 * cookie stays host-only: the dashboard and the public site never share a session.
 *
 * HttpOnly (security report S4, 2026-10-05): no browser code reads the session. There is no browser
 * Supabase client (server.ts), the mocks and the React pages ask /api/auth and /api/checkout/me,
 * and the only `document.cookie` writers name NEXT_LOCALE and Meta's cookies. Without it, any
 * injected script could lift the refresh token. @supabase/ssr spreads these options over its own
 * defaults (`httpOnly: false`) on every write and every removal, so this one line covers the
 * chunks (`vt-auth.0`…) and the PKCE verifier too.
 */
export function authCookieOptions(secure: boolean): {
  name: typeof AUTH_COOKIE_NAME;
  path: "/";
  sameSite: "lax";
  secure: boolean;
  httpOnly: true;
} {
  return { name: AUTH_COOKIE_NAME, path: "/", sameSite: "lax", secure, httpOnly: true };
}

/** Names of the old `sb-*-auth-token*` cookies a request still carries (deduplicated). */
export function legacyAuthCookieNames(cookieHeader: string | null | undefined): string[] {
  const names = cookieListFromHeader(cookieHeader)
    .map((c) => c.name)
    .filter((name) => LEGACY_AUTH_COOKIE_RE.test(name));
  return [...new Set(names)];
}

/**
 * Set-Cookie lines that expire every old `sb-*-auth-token*` cookie the request carried. They were
 * always host-only on Path "/" (no Domain), so the same name + Path deletes them. The visitor is
 * signed out once; the client configured with AUTH_COOKIE_NAME never reads these names.
 */
export function legacyAuthCookieExpiry(cookieHeader: string | null | undefined, secure: boolean): string[] {
  return legacyAuthCookieNames(cookieHeader).map(
    (name) => `${name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure ? "; Secure" : ""}; SameSite=Lax`,
  );
}

/**
 * Same response with the old auth cookies expired, or the response itself when the request had
 * none. Runs once per browser in the Worker entry (public and dashboard). A response that carried
 * public cache headers turns private, because it now sets a cookie.
 */
export function withLegacyAuthCookiesExpired(request: Request, response: Response): Response {
  if (response.status === 101) return response;
  const secure = isSecureRequest({
    url: request.url,
    forwardedProto: request.headers.get("x-forwarded-proto"),
    host: request.headers.get("host"),
  });
  const expiry = legacyAuthCookieExpiry(request.headers.get("cookie"), secure);
  if (expiry.length === 0) return response;
  const headers = new Headers(response.headers);
  for (const line of expiry) headers.append("Set-Cookie", line);
  const cache = headers.get("cache-control");
  if (!cache || /\bpublic\b|s-maxage/i.test(cache)) headers.set("cache-control", "private, no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

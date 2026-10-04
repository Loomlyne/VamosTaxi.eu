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
 * Cookie attributes for every Supabase auth cookie. Path "/", SameSite Lax and NO Domain, so a
 * cookie stays host-only: the dashboard and the public site never share a session.
 */
export function authCookieOptions(secure: boolean): {
  path: "/";
  sameSite: "lax";
  secure: boolean;
} {
  return { path: "/", sameSite: "lax", secure };
}

/**
 * Rollback of the 2026-10-04 rename: the renamed build wrote `vt-auth`, `vt-auth.0/.1…`,
 * `vt-auth-code-verifier` (and per-flow verifier keys). This build no longer reads them; they are
 * expired so nothing stale stays in browsers. Only ever matched to expire them.
 */
export const RETIRED_AUTH_COOKIE_RE = /^vt-auth(?:[.-][A-Za-z0-9_.-]*)?$/;

/** Set-Cookie lines that expire every retired `vt-auth*` cookie the request carried (host-only, Path "/"). */
export function retiredAuthCookieExpiry(cookieHeader: string | null | undefined, secure: boolean): string[] {
  const names = [...new Set(cookieListFromHeader(cookieHeader).map((c) => c.name).filter((n) => RETIRED_AUTH_COOKIE_RE.test(n)))];
  return names.map(
    (name) => `${name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure ? "; Secure" : ""}; SameSite=Lax`,
  );
}

/** Same response with the retired `vt-auth*` cookies expired, or the response itself when there are none. */
export function withRetiredAuthCookiesExpired(request: Request, response: Response): Response {
  if (response.status === 101) return response;
  const secure = isSecureRequest({
    url: request.url,
    forwardedProto: request.headers.get("x-forwarded-proto"),
    host: request.headers.get("host"),
  });
  const expiry = retiredAuthCookieExpiry(request.headers.get("cookie"), secure);
  if (expiry.length === 0) return response;
  const headers = new Headers(response.headers);
  for (const line of expiry) headers.append("Set-Cookie", line);
  const cache = headers.get("cache-control");
  if (!cache || /\bpublic\b|s-maxage/i.test(cache)) headers.set("cache-control", "private, no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

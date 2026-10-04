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

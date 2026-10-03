export const PUBLIC_CSRF_HOSTS: readonly string[] = Object.freeze([
  "vamostaxi.site",
  "www.vamostaxi.site",
  "localhost",
]);

export const AUTH_CSRF_HOSTS: readonly string[] = Object.freeze([
  ...PUBLIC_CSRF_HOSTS,
  "dashboard.vamostaxi.site",
  "dashboard.localhost",
]);

function hostnameAllowed(hostname: string, hosts: readonly string[]): boolean {
  return hosts.includes(hostname);
}

export function originAllowed(origin: string | null, hosts: readonly string[]): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    if (!hostnameAllowed(url.hostname, hosts)) return false;
    if (url.protocol === "https:") return true;
    return (
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "dashboard.localhost")
    );
  } catch {
    return false;
  }
}

/** CSRF (ASVS L1) for cookie-backed public mutations. Missing Origin is deny. */
export function publicOriginAllowed(origin: string | null): boolean {
  return originAllowed(origin, PUBLIC_CSRF_HOSTS);
}

export function authOriginAllowed(origin: string | null): boolean {
  return originAllowed(origin, AUTH_CSRF_HOSTS);
}

function csrfRefusal(): Response {
  return Response.json(
    { ok: false, code: "csrf" },
    { status: 403, headers: { "cache-control": "private, no-store" } },
  );
}

export function csrfForbidden(
  request: Request,
  kind: "public" | "auth" = "public",
): Response | null {
  const origin = request.headers.get("Origin");
  const ok = kind === "auth" ? authOriginAllowed(origin) : publicOriginAllowed(origin);
  if (ok) return null;
  return csrfRefusal();
}

/** The staff console hosts. Never part of PUBLIC_CSRF_HOSTS. */
export const DASHBOARD_CSRF_HOSTS: readonly string[] = Object.freeze([
  "dashboard.vamostaxi.site",
  "dashboard.localhost",
]);

export function dashboardOriginAllowed(origin: string | null): boolean {
  return originAllowed(origin, DASHBOARD_CSRF_HOSTS);
}

/**
 * CSRF for the two public money routes the dashboard's New trip also posts to
 * (`/api/checkout/price`, `/api/checkout/intent`). Quick 261003.
 *
 * - A public-site Origin passes exactly as `csrfForbidden(request)` does.
 * - The dashboard Origin passes only when the request itself is addressed to the
 *   dashboard host (same-origin call from the console, so only dashboard-host cookies
 *   travel) AND `hasStaffSession()` confirms a gated staff session on those cookies.
 *   It is asked only for a dashboard Origin, so public checkout pays nothing extra.
 * - Missing Origin, any other Origin, or a staff check that throws: 403 `csrf`.
 *
 * PUBLIC_CSRF_HOSTS is not widened: every other cookie-backed public route still
 * refuses the dashboard Origin.
 */
export async function csrfForbiddenPublicOrStaff(
  request: Request,
  hasStaffSession: () => Promise<boolean>,
): Promise<Response | null> {
  const origin = request.headers.get("Origin");
  if (publicOriginAllowed(origin)) return null;
  if (!dashboardOriginAllowed(origin)) return csrfRefusal();
  let host: string | null = null;
  try {
    host = new URL(request.url).host;
  } catch {
    return csrfRefusal();
  }
  if (!isDashboardHost(host)) return csrfRefusal();
  let staff = false;
  try {
    staff = (await hasStaffSession()) === true;
  } catch {
    staff = false;
  }
  return staff ? null : csrfRefusal();
}

/** Password-reset / invite URLs. Never trust x-forwarded-host. */
export function trustedSiteOrigin(hostHeader: string | null): string | null {
  if (!hostHeader) return null;
  const host = hostHeader.split(",")[0]?.trim().toLowerCase() ?? "";
  if (!host || host.includes("/") || host.includes("\\") || host.includes(" ")) return null;
  // hostname, optional numeric port — nothing else (no "host:1@other" userinfo).
  if (!/^[a-z0-9.-]+(?::\d{1,5})?$/.test(host)) return null;
  const hostname = host.split(":")[0] ?? "";
  if (!hostname || !hostnameAllowed(hostname, AUTH_CSRF_HOSTS)) return null;
  const http = hostname === "localhost" || hostname === "dashboard.localhost";
  return `${http ? "http" : "https"}://${host}`;
}

/** Stripe return URLs and emailed pay links — public site only, never dashboard/workers.dev. */
export function publicSiteOrigin(hostHeader: string | null): string {
  const origin = trustedSiteOrigin(hostHeader);
  if (!origin) return "https://vamostaxi.site";
  try {
    const hostname = new URL(origin).hostname;
    if (hostnameAllowed(hostname, PUBLIC_CSRF_HOSTS)) return origin;
  } catch {
    // fall through
  }
  return "https://vamostaxi.site";
}

/** The staff console host. Its e-mail sign-in may only reach existing accounts. */
export function isDashboardHost(hostHeader: string | null): boolean {
  const host = hostHeader?.split(",")[0]?.trim().toLowerCase().split(":")[0] ?? "";
  return host === "dashboard.vamostaxi.site" || host === "dashboard.localhost";
}

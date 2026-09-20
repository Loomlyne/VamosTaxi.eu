export const PUBLIC_CSRF_HOSTS = new Set([
  "vamostaxi.site",
  "www.vamostaxi.site",
  "localhost",
]);

export const AUTH_CSRF_HOSTS = new Set([
  ...Array.from(PUBLIC_CSRF_HOSTS),
  "dashboard.vamostaxi.site",
  "dashboard.localhost",
]);

function hostnameAllowed(hostname: string, hosts: Set<string>): boolean {
  return hosts.has(hostname);
}

export function originAllowed(origin: string | null, hosts: Set<string>): boolean {
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

export function csrfForbidden(
  request: Request,
  kind: "public" | "auth" = "public",
): Response | null {
  const origin = request.headers.get("Origin");
  const ok = kind === "auth" ? authOriginAllowed(origin) : publicOriginAllowed(origin);
  if (ok) return null;
  return Response.json(
    { ok: false, code: "csrf" },
    { status: 403, headers: { "cache-control": "private, no-store" } },
  );
}

/** Password-reset / invite URLs. Never trust x-forwarded-host. */
export function trustedSiteOrigin(hostHeader: string | null): string | null {
  if (!hostHeader) return null;
  const host = hostHeader.split(",")[0]?.trim().toLowerCase() ?? "";
  if (!host || host.includes("/") || host.includes("\\") || host.includes(" ")) return null;
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

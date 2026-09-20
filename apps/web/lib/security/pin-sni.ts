/** Known public hostnames this Worker serves. Do not add `.eu`. */
export const VAMOS_SURFACES = [
  "vamostaxi.site",
  "www.vamostaxi.site",
  "dashboard.vamostaxi.site",
] as const;

type SurfaceHost = (typeof VAMOS_SURFACES)[number];

const SURFACES = new Set<string>(VAMOS_SURFACES);

export const APEX_HOST = "vamostaxi.site";
export const DASHBOARD_HOST = "dashboard.vamostaxi.site";

/** Worker-owned surface. `auto` is Host/SNI (shared Worker — spoofable). */
export type VamosSurface = "public" | "dashboard" | "auto";

export function sniFromCf(cf: unknown): string | null {
  if (!cf || typeof cf !== "object") return null;
  const raw = (cf as { tlsServerName?: unknown }).tlsServerName;
  if (typeof raw !== "string") return null;
  const host = raw.split(":")[0]?.toLowerCase() ?? "";
  return host.length > 0 ? host : null;
}

/** When TLS SNI and URL host disagree, trust SNI — Host is spoofable on a shared Worker. */
export function pinUrlToSni(url: URL, sni: string | null): URL {
  if (!sni || !SURFACES.has(sni) || !SURFACES.has(url.hostname.toLowerCase())) {
    return url;
  }
  if (url.hostname.toLowerCase() === sni) return url;
  const next = new URL(url.toString());
  next.hostname = sni as SurfaceHost;
  return next;
}

/**
 * Pin URL host to the Worker this code is running on.
 * `public` ignores Host: dashboard (apex Worker).
 * `dashboard` ignores Host: apex (vamos-dashboard gateway entrypoint).
 * `auto` falls back to SNI pin (no-op when runtime has no tlsServerName).
 */
export function pinUrlToSurface(
  url: URL,
  surface: VamosSurface,
  sni: string | null = null,
): URL {
  if (surface === "auto") return pinUrlToSni(url, sni);
  const host = url.hostname.toLowerCase();
  if (surface === "dashboard") {
    if (host === DASHBOARD_HOST) return url;
    const next = new URL(url.toString());
    next.hostname = DASHBOARD_HOST;
    return next;
  }
  if (host === DASHBOARD_HOST) {
    const next = new URL(url.toString());
    next.hostname = APEX_HOST;
    return next;
  }
  return url;
}

/**
 * K92: Worker `vamos` Assets are bound to apex/www, not dashboard.
 * Dashboard documents keep dashboard URL (middleware / 308 Location).
 * `/app/ops/*`, `/_next/*`, `/brand/*`, and dotted files are rewritten to
 * apex so OpenNext ASSETS hit. Never rewrite `/api/*` or `/login`.
 */
export function isApexAssetPath(pathname: string): boolean {
  if (pathname === "/api" || pathname.startsWith("/api/")) return false;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/app/ops/")) return true;
  if (pathname.startsWith("/brand/")) return true;
  const leaf = pathname.split("/").pop() ?? "";
  return leaf.includes(".");
}

export function pinRequestToApexAssets(request: Request): Request {
  const url = new URL(request.url);
  if (!isApexAssetPath(url.pathname)) return request;
  if (url.hostname.toLowerCase() === APEX_HOST) return request;
  const next = new URL(url.toString());
  next.hostname = APEX_HOST;
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("host", APEX_HOST);
  const inbound = new Request(next.toString(), request);
  return new Request(inbound, { headers });
}

export function pinRequestToSurface(
  request: Request,
  surface: VamosSurface,
  sni: string | null = null,
): Request {
  const url = new URL(request.url);
  const pinned = pinUrlToSurface(url, surface, sni);
  const headerHost =
    (request.headers.get("host") ?? "").split(":")[0]?.toLowerCase() ?? "";
  if (
    pinned.href === url.href &&
    headerHost === pinned.hostname.toLowerCase()
  ) {
    return request;
  }
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("host", pinned.hostname);
  const inbound = new Request(pinned.toString(), request);
  return new Request(inbound, { headers });
}

export function surfaceFromEnv(env: {
  VAMOS_SURFACE?: string;
  DEPLOY_ENV?: string;
}): VamosSurface {
  if (env.VAMOS_SURFACE === "public" || env.VAMOS_SURFACE === "dashboard") {
    return env.VAMOS_SURFACE;
  }
  if (env.DEPLOY_ENV === "ops-changes") return "dashboard";
  return "auto";
}

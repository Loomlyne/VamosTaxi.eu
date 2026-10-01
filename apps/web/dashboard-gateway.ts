/**
 * K76: TLS for dashboard.vamostaxi.site lands here (custom domain), not on
 * Worker `vamos`. No secrets. Forwards to vamos's `Dashboard` entrypoint.
 * Do not bind vamostaxi.eu. Do not bind this hostname to vamos-ops-changes.
 *
 * Cloudflare routes this Worker by HTTP Host, not TLS SNI. request.cf has
 * no tlsServerName (logged 2026-09-20). If SNI ever appears, reject Host
 * spoofs whose SNI is not dashboard.
 *
 * K92: Assets live on Worker `vamos` custom domains (apex/www), not here.
 * `/app/ops/*` `/_next/*` `/brand/*` and dotted files go to vamos default
 * fetch on vamostaxi.site so OpenNext ASSETS hit. Documents stay on Dashboard.
 * Exception (F16): `/app/ops/*` goes to Dashboard, which reads the file from ASSETS itself.
 */
import { isApexAssetPath } from "./lib/security/pin-sni";

export interface Env {
  APP: Fetcher;
  PUBLIC: Fetcher;
}

const DASHBOARD_HOST = "dashboard.vamostaxi.site";
const APEX_HOST = "vamostaxi.site";

function sniOf(request: Request): string | null {
  const cf = (request as { cf?: Record<string, unknown> }).cf;
  if (!cf) return null;
  for (const key of ["tlsServerName", "clientTlsServerName", "sni"] as const) {
    const raw = cf[key];
    if (typeof raw === "string" && raw.length > 0) {
      return raw.split(":")[0]?.toLowerCase() ?? null;
    }
  }
  return null;
}

function apexAssetRequest(request: Request): Request {
  const url = new URL(request.url);
  url.hostname = APEX_HOST;
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("host", APEX_HOST);
  const inbound = new Request(url.toString(), request);
  return new Request(inbound, { headers });
}

export default {
  fetch(request: Request, env: Env): Promise<Response> | Response {
    const sni = sniOf(request);
    if (sni && sni !== DASHBOARD_HOST) {
      return new Response(null, {
        status: 404,
        headers: { "cache-control": "private, no-store" },
      });
    }
    const path = new URL(request.url).pathname;
    // robots.txt is a dotted file, so the asset rule below would answer it from the apex
    // with the public site's rules. The console is closed to crawlers outright.
    if (path === "/robots.txt") {
      return new Response("User-agent: *\nDisallow: /\n", {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "x-robots-tag": "noindex",
          "cache-control": "public, max-age=3600",
        },
      });
    }
    // F16: dashboard screen files are answered by the Dashboard entrypoint (dashboard host only).
    // The public entrance 404s /app/ops/*, so they must not be sent there.
    if (path === "/app/ops" || path.startsWith("/app/ops/")) {
      return env.APP.fetch(request);
    }
    if (isApexAssetPath(path)) {
      return env.PUBLIC.fetch(apexAssetRequest(request));
    }
    return env.APP.fetch(request);
  },
};

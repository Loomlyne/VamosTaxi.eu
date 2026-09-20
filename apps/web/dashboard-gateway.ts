/**
 * K76: TLS for dashboard.vamostaxi.site lands here (custom domain), not on
 * Worker `vamos`. No secrets. Forwards to vamos's `Dashboard` entrypoint.
 * Do not bind vamostaxi.eu. Do not bind this hostname to vamos-ops-changes.
 *
 * Cloudflare routes this Worker by HTTP Host, not TLS SNI. request.cf has
 * no tlsServerName (logged 2026-09-20). If SNI ever appears, reject Host
 * spoofs whose SNI is not dashboard.
 */
export interface Env {
  APP: Fetcher;
}

const DASHBOARD_HOST = "dashboard.vamostaxi.site";

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

export default {
  fetch(request: Request, env: Env): Promise<Response> | Response {
    const sni = sniOf(request);
    if (sni && sni !== DASHBOARD_HOST) {
      return new Response(null, {
        status: 404,
        headers: { "cache-control": "private, no-store" },
      });
    }
    return env.APP.fetch(request);
  },
};

// apps/web/lib/consent/web-analytics.ts
//
// Cloudflare Web Analytics (cookieless), loaded only after the visitor allows
// Analytics (owner 2026-10-01; /cookies section 05 "off until you allow them").
// Cloudflare's automatic injection must stay off, or the beacon runs without
// consent. The token is the public site tag Cloudflare prints into every page;
// app/vamos-consent.js carries the same one for the mock pages.

export const WEB_ANALYTICS_SRC = "https://static.cloudflareinsights.com/beacon.min.js";
export const WEB_ANALYTICS_TOKEN = "792482ef56d84c46aee4f6501205ce68";

const SITE_HOST = /(^|\.)vamostaxi\.(site|eu)$/;

/** Adds the beacon once per page, on the public site only (never dashboard, local or test hosts). */
export function loadWebAnalytics(doc: Document = document): boolean {
  const host = doc.location?.hostname ?? "";
  if (!SITE_HOST.test(host) || host.startsWith("dashboard.")) return false;
  if (doc.querySelector(`script[src="${WEB_ANALYTICS_SRC}"]`)) return false;
  const s = doc.createElement("script");
  s.defer = true;
  s.src = WEB_ANALYTICS_SRC;
  s.setAttribute("data-cf-beacon", JSON.stringify({ token: WEB_ANALYTICS_TOKEN }));
  doc.head.appendChild(s);
  return true;
}

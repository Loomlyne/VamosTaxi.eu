// apps/web/lib/security/headers.ts
//
// Shared security header list. next.config.ts headers() covers Next
// responses. serveOpsDc builds its own Headers() and must apply the same
// pairs or dashboard.vamostaxi.site/login ships with no HSTS/CSP/XFO.
//
// D-48: card entry happens only on Stripe's hosted page (a top-level
// navigation, not governed by this policy). No page of ours loads Stripe.js,
// frames Stripe or calls api.stripe.com from the browser, so no Stripe or Link
// host is allowlisted. Add one back only with the surface that needs it.
//
// Cloudflare Web Analytics: static.cloudflareinsights.com serves the beacon,
// cloudflareinsights.com receives it. Our own code loads it only after the
// visitor allows Analytics (lib/consent/web-analytics.ts); Cloudflare's
// automatic injection must stay off, or this allowance lets it run unasked.
//
// Meta (Phase 28): its hosts appear only through `contentSecurityPolicy({ metaPixel: true })`, which
// `lib/meta/pixel-csp.ts` chooses per address for the clean mock pages while both Meta flags are on.
// SECURITY_HEADER_PAIRS (the Next pages, the dashboard, every other response) never names a Meta host.
//
// Referrer-Policy is strict-origin: a move from a checkout, confirmation or pay-link address to another
// page of ours tells that page only https://vamostaxi.site/, never the previous address (Meta's script
// reads document.referrer). Cross-site requests already sent the origin only, so Mapbox, Turnstile and
// Stripe see what they saw before. No product code reads Referer.

/**
 * The Content-Security-Policy string. `metaPixel: false` is the policy of every page today; `true`
 * adds Meta's script, beacon and fallback-frame hosts and nothing else (connect-src does not gain the
 * script host, so Meta's telemetry stays blocked; no Instagram or gateway host).
 */
export function contentSecurityPolicy(opts: { metaPixel: boolean }): string {
  const meta = opts.metaPixel;
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' challenges.cloudflare.com static.cloudflareinsights.com${meta ? " https://connect.facebook.net" : ""}`,
    `frame-src challenges.cloudflare.com${meta ? " https://www.facebook.com" : ""}`,
    `connect-src 'self' challenges.cloudflare.com api.mapbox.com events.mapbox.com cloudflareinsights.com${meta ? " https://www.facebook.com" : ""}`,
    `img-src 'self' data: blob: https://*.mapbox.com${meta ? " https://www.facebook.com" : ""}`,
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export const SECURITY_HEADER_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["Strict-Transport-Security", "max-age=31536000; includeSubDomains"],
  ["Referrer-Policy", "strict-origin"],
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "DENY"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
  ["Content-Security-Policy", contentSecurityPolicy({ metaPixel: false })],
];

export function applySecurityHeaders(headers: Headers): void {
  headers.delete("x-powered-by");
  for (const [key, value] of SECURITY_HEADER_PAIRS) {
    headers.set(key, value);
  }
}

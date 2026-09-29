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

export const SECURITY_HEADER_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["Strict-Transport-Security", "max-age=31536000; includeSubDomains"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "DENY"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
  [
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' unpkg.com challenges.cloudflare.com; frame-src challenges.cloudflare.com; connect-src 'self' maps.googleapis.com challenges.cloudflare.com api.mapbox.com events.mapbox.com; img-src 'self' data: blob: https://*.mapbox.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
  ],
];

export function applySecurityHeaders(headers: Headers): void {
  headers.delete("x-powered-by");
  for (const [key, value] of SECURITY_HEADER_PAIRS) {
    headers.set(key, value);
  }
}

// apps/web/lib/security/headers.ts
//
// Shared security header list. next.config.ts headers() covers Next
// responses. serveOpsDc builds its own Headers() and must apply the same
// pairs or dashboard.vamostaxi.site/login ships with no HSTS/CSP/XFO.

export const SECURITY_HEADER_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["Strict-Transport-Security", "max-age=31536000; includeSubDomains"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "DENY"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
  [
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' unpkg.com js.stripe.com challenges.cloudflare.com; frame-src js.stripe.com hooks.stripe.com challenges.cloudflare.com; connect-src 'self' api.stripe.com challenges.cloudflare.com api.mapbox.com events.mapbox.com; img-src 'self' data: blob: https://*.mapbox.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
  ],
];

export function applySecurityHeaders(headers: Headers): void {
  for (const [key, value] of SECURITY_HEADER_PAIRS) {
    headers.set(key, value);
  }
}

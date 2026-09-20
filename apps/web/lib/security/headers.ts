// apps/web/lib/security/headers.ts
//
// Shared security header list. next.config.ts headers() covers Next
// responses. serveOpsDc builds its own Headers() and must apply the same
// pairs or dashboard.vamostaxi.site/login ships with no HSTS/CSP/XFO.
//
// CSP Stripe hosts are the Checkout funnel: ui_mode=elements, Link, and
// nested card iframes. Do not shrink back to js.stripe.com alone.

export const SECURITY_HEADER_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["Strict-Transport-Security", "max-age=31536000; includeSubDomains"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "DENY"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
  [
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' unpkg.com js.stripe.com *.js.stripe.com checkout.stripe.com challenges.cloudflare.com; frame-src js.stripe.com *.js.stripe.com hooks.stripe.com checkout.stripe.com link.com *.link.com challenges.cloudflare.com; connect-src 'self' api.stripe.com checkout.stripe.com link.com *.link.com maps.googleapis.com challenges.cloudflare.com api.mapbox.com events.mapbox.com; img-src 'self' data: blob: https://*.mapbox.com https://*.stripe.com https://*.link.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
  ],
];

export function applySecurityHeaders(headers: Headers): void {
  headers.delete("x-powered-by");
  for (const [key, value] of SECURITY_HEADER_PAIRS) {
    headers.set(key, value);
  }
}

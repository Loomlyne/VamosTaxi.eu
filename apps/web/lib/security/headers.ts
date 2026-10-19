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
// Owner's tags (2026-10-19): Google Tag Manager GTM-KPKGT4VH, Google tag G-K5MZME44P6, Meta Pixel
// 1595596972063765. Hosts follow Google's CSP guide for GA4/GTM (collect on analytics.google.com,
// www.google.com and *.g.doubleclick.net; audiences on google.<country>, listed for the visitor countries
// we serve) and Meta's pixel hosts. A shorter list silently dropped GA4 hits in the live check of
// 2026-10-19.
//
// Referrer-Policy is strict-origin: a move from a checkout, confirmation or pay-link address to another
// page of ours tells that page only https://vamostaxi.site/, never the previous address. Cross-site
// requests already sent the origin only, so Mapbox, Turnstile and Stripe see what they saw before. No
// product code reads Referer.

/** The one Content-Security-Policy string of every response. */
export function contentSecurityPolicy(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' challenges.cloudflare.com static.cloudflareinsights.com https://*.googletagmanager.com https://www.google-analytics.com https://www.google.com https://googleads.g.doubleclick.net https://www.googleadservices.com https://connect.facebook.net",
    "frame-src challenges.cloudflare.com https://*.googletagmanager.com https://td.doubleclick.net https://www.facebook.com",
    "connect-src 'self' challenges.cloudflare.com api.mapbox.com events.mapbox.com cloudflareinsights.com https://*.googletagmanager.com https://*.google-analytics.com https://analytics.google.com https://*.analytics.google.com https://*.g.doubleclick.net https://www.google.com https://www.google.ch https://www.google.de https://www.google.fr https://www.google.it https://www.google.at https://www.google.co.uk https://www.google.nl https://www.google.be https://www.google.es https://www.google.ae https://www.google.tn https://www.facebook.com https://connect.facebook.net",
    "img-src 'self' data: blob: https://*.mapbox.com https://*.googletagmanager.com https://*.google-analytics.com https://*.g.doubleclick.net https://www.google.com https://www.google.ch https://www.google.de https://www.google.fr https://www.google.it https://www.google.at https://www.google.co.uk https://www.google.nl https://www.google.be https://www.google.es https://www.google.ae https://www.google.tn https://www.facebook.com",
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
  ["Content-Security-Policy", contentSecurityPolicy()],
];

export function applySecurityHeaders(headers: Headers): void {
  headers.delete("x-powered-by");
  for (const [key, value] of SECURITY_HEADER_PAIRS) {
    headers.set(key, value);
  }
}

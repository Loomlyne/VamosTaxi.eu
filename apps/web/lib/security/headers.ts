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
// Google (2026-10-09): its hosts appear only through `contentSecurityPolicy({ googleTag: true })`, chosen per
// address by `lib/google/google-csp.ts` while the Google flag is open. SECURITY_HEADER_PAIRS never names one.
//
// Referrer-Policy is strict-origin: a move from a checkout, confirmation or pay-link address to another
// page of ours tells that page only https://vamostaxi.site/, never the previous address (Meta's script
// reads document.referrer). Cross-site requests already sent the origin only, so Mapbox, Turnstile and
// Stripe see what they saw before. No product code reads Referer.

/**
 * Google's hosts for the Google Ads tag (owner decision 2026-10-09), exactly the list Google documents for the
 * Ads Conversion / Conversion Linker tag with a Content Security Policy
 * (developers.google.com/tag-platform/security/guides/csp, read 2026-10-09). Google's own country domains are
 * listed one by one because CSP allows no wildcard on the right of a host: the countries our visitors use
 * (CH, DE, FR, AE, AT, IT). A beacon to another country's domain is blocked and only loses one ping.
 */
const GOOGLE_TLDS = ["ch", "de", "fr", "ae", "at", "it"] as const;
const googleCountryHosts = GOOGLE_TLDS.map((t) => `https://www.google.${t}`);
const GOOGLE_SCRIPT = ["https://www.googletagmanager.com", "https://www.googleadservices.com", "https://www.google.com"];
const GOOGLE_IMG = [
  "https://www.googletagmanager.com",
  "https://www.googleadservices.com",
  "https://googleads.g.doubleclick.net",
  "https://pagead2.googlesyndication.com",
  "https://www.google.com",
  ...googleCountryHosts,
];
/**
 * Google Analytics 4 (adopted wording 2026-10-11): the hosts Google documents for GA4 with a Content Security
 * Policy (same guide, its GA4 section). GA4 picks its collection host per region (region1.google-analytics.com,
 * www.google-analytics.com, region1.analytics.google.com), so the two leftmost wildcards are Google's own advice.
 * gtag.js and Tag Manager's gtm.js both come from www.googletagmanager.com, already listed above.
 */
const GA4_HOSTS = ["https://*.google-analytics.com", "https://*.analytics.google.com"];
/**
 * Consent Mode advanced (2026-10-16): gtag.js runs for every visitor on the listed pages, before consent, and its
 * cookieless pings use the same hosts. The GA4 section of Google's CSP guide (updated 2026-09-18) also lists
 * `*.google.com`, `*.g.doubleclick.net` and `*.google.<TLD>` for connect-src and img-src; they are added here, the
 * country domains one by one as above.
 */
const GA4_GUIDE_HOSTS = ["https://*.google.com", "https://*.g.doubleclick.net", ...GOOGLE_TLDS.map((t) => `https://*.google.${t}`)];
const GOOGLE_IMG_ALL = [...GOOGLE_IMG, GA4_HOSTS[0]!, ...GA4_GUIDE_HOSTS];
const GOOGLE_CONNECT = [...GOOGLE_IMG, "https://ad.doubleclick.net", ...GA4_HOSTS, ...GA4_GUIDE_HOSTS];
const GOOGLE_FRAME = ["https://www.googletagmanager.com"];

const withHosts = (on: boolean, hosts: readonly string[]): string => (on ? ` ${hosts.join(" ")}` : "");

/**
 * The Content-Security-Policy string. `metaPixel: false` is the policy of every page today; `true`
 * adds Meta's script, beacon and fallback-frame hosts and nothing else (connect-src does not gain the
 * script host, so Meta's telemetry stays blocked; no Instagram or gateway host). `googleTag: true` adds
 * Google's documented Ads and GA4 hosts and nothing else; it is chosen per address by `lib/google/google-csp.ts`
 * (never on a pay link, never on the dashboard) and only while the Google flag is open.
 */
export function contentSecurityPolicy(opts: { metaPixel: boolean; googleTag?: boolean }): string {
  const meta = opts.metaPixel;
  const google = opts.googleTag === true;
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' challenges.cloudflare.com static.cloudflareinsights.com${meta ? " https://connect.facebook.net" : ""}${withHosts(google, GOOGLE_SCRIPT)}`,
    `frame-src challenges.cloudflare.com${meta ? " https://www.facebook.com" : ""}${withHosts(google, GOOGLE_FRAME)}`,
    `connect-src 'self' challenges.cloudflare.com api.mapbox.com events.mapbox.com cloudflareinsights.com${meta ? " https://www.facebook.com" : ""}${withHosts(google, GOOGLE_CONNECT)}`,
    `img-src 'self' data: blob: https://*.mapbox.com${meta ? " https://www.facebook.com" : ""}${withHosts(google, GOOGLE_IMG_ALL)}`,
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

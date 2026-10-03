---
status: awaiting_human_verify
trigger: "live iPhone /checkout step 1 shows 'Too many prices in a short time' after picking ZRH -> Zurich Main Station on home"
created: 2026-10-03T16:12:46+0400
updated: 2026-10-03T16:29:00+0400
---

## Current Focus

reasoning_checkpoint:
  hypothesis: "Every lookup (geo suggest per keystroke, retrieve, reverse, flight) and every quote/reprice/coupon-price call share ONE Worker rate-limit counter per visitor. On live VAMOS_QS_SECRET is not set, so nobody gets a vamos_qs cookie and everyone is on QUOTE_RATE_LIMITER_BARE 4/60 keyed by IP. Typing two addresses on home spends the 4 before /checkout posts /api/quote, so the first quote answers 429 rate_limited."
  confirming_evidence:
    - "guards.ts wireRateLimitGuard and wireQuoteAbuse pass the same two bindings; bucketFor keys verified=ip:subject, bare=ip"
    - "live GET https://vamostaxi.site/checkout and / return no vamos_qs Set-Cookie (2026-10-03 16:0x +04)"
    - "wrangler secret list --env staging (names only) has no VAMOS_QS_SECRET; middleware mints the cookie only when the secret is non-empty"
    - "home.dc.html geoSearch fires /api/geo/suggest 160 ms after each keystroke; /checkout fires /api/geo/retrieve + POST /api/quote on load"
    - "middleware serves DC pages (home) and returns before the vamos_qs mint, so even with the secret set, home visitors are bare"
  falsification_test: "With lookups on their own namespace, 10+ suggest calls followed by POST /api/quote from the same IP must still answer 200 (not 429). If the quote still 429s, the counter is not the cause."
  fix_rationale: "Separate counters remove the cross-starvation without loosening the quote limit: lookups get LOOKUP_RATE_LIMITER(_BARE), reprice + coupon pricing get PRICE_RATE_LIMITER(_BARE); /api/quote keeps 8/60 + 4/60 alone (Mapbox Directions protection unchanged). Old namespaces 1001/1002 also back write limits (contact, review, consent, auth code), so their numbers are not raised."
  blind_spots: "Cannot reproduce on live (no deploy from a job session). Carrier NAT sharing one IPv4 among strangers can still exhaust 4/60 on /api/quote. Workers rate limits are per colo and eventually consistent."

## Symptoms

expected: /checkout step 1 lists class prices after a trip chosen on home
actual: "Too many prices in a short time — wait a moment and try again" + TRY AGAIN
errors: quote.error.rate_limited (HTTP 429 from POST /api/quote)
reproduction: iPhone, vamostaxi.site home, type ZRH -> Zurich Main Station, continue to /checkout
started: reported 2026-10-03

## Eliminated

## Evidence

- timestamp: 2026-10-03T16:05+0400
  checked: apps/web/lib/abuse/guards.ts, rate-limit.ts, wrangler.jsonc ratelimits
  found: geo/flight (wireRateLimitGuard) and quote/reprice/price (wireQuoteAbuse) use the same QUOTE_RATE_LIMITER 8/60 / QUOTE_RATE_LIMITER_BARE 4/60 with the same key
  implication: lookups starve quotes
- timestamp: 2026-10-03T16:08+0400
  checked: live response headers + live secret names (read-only)
  found: no vamos_qs cookie minted; VAMOS_QS_SECRET absent
  implication: every live visitor is on the 4/60 per-IP counter
- timestamp: 2026-10-03T16:10+0400
  checked: middleware.ts DC page branch
  found: DC pages (home) return before the vamos_qs mint
  implication: home lookups are bare even once the secret is set

## Resolution

root_cause: shared lookup+quote rate-limit counter, 4/60 per IP on live because VAMOS_QS_SECRET is unset
fix: LOOKUP_RATE_LIMITER 60/60 + _BARE 40/60 (1005/1006) for geo + flight; PRICE_RATE_LIMITER 12/60 + _BARE 8/60 (1007/1008) for reprice + voucher price; /api/quote keeps 8/60 + 4/60; /checkout retries a rate_limited quote once after 61 s
verification: unit tests (rate-counters.test.ts + abuse, checkout, quote suites) green; tsc + eslint clean; local Worker: 35 bare suggest calls then POST /api/quote passes the limiter 4 times, 5th 429; 41st lookup 429
files_changed: [apps/web/lib/abuse/guards.ts, apps/web/lib/abuse/rate-limit.ts, apps/web/lib/env.d.ts, apps/web/wrangler.jsonc, apps/web/app/api/quote/reprice/route.ts, apps/web/app/api/checkout/price/route.ts, apps/web/app/[locale]/checkout/CheckoutPage.tsx, apps/web/lib/abuse/rate-counters.test.ts]

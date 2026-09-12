---
phase: 10-hardening-performance-security-compliance
plan: 06
subsystem: infra
tags: [csp, hsts, next-config, stripe, turnstile, mapbox]

requires:
  - phase: 10-hardening-performance-security-compliance
    provides: Wave 0 headers.test.ts source-read contract
provides:
  - next.config.ts headers() HSTS/CSP/Referrer/Permissions-Policy/X-Frame-Options
  - CSP allowlist Stripe + Turnstile + Mapbox with D-33 funnel-wins comment
affects: [10-07, 10-09]

tech-stack:
  added: []
  patterns:
    - Catch-all /:path* security headers; /dev noindex stays on its own rows
    - CSP exception path is loosen-that-directive, not a checkout captcha wall

key-files:
  created: []
  modified:
    - apps/web/next.config.ts

key-decisions:
  - "HSTS max-age=31536000; includeSubDomains — not preload; not the production .eu zone"
  - "X-Frame-Options DENY + CSP frame-ancestors none; Stripe may frame-src into checkout"
  - "D-33: if Payment Element breaks, loosen that CSP directive only"

patterns-established:
  - "Security headers live in next.config.ts headers(); cookie Secure is 10-07; WAF is 10-09"

requirements-completed: [LAUNCH-01, LAUNCH-02]

duration: 3min
completed: 2026-09-12
---

# Phase 10 Plan 06: Security headers Summary

**next.config.ts catch-all headers() emit HSTS (no preload), CSP allowlisting Stripe/Turnstile/Mapbox, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy camera/mic/geo off, and X-Frame-Options DENY; /dev noindex kept**

## Performance

- **Duration:** 3 min
- **Started:** 2026-09-12T14:32:35Z
- **Completed:** 2026-09-12T14:35:46Z
- **Tasks:** 2/2
- **Files modified:** 1

## Accomplishments

- Global `/:path*` security headers on Worker responses (D-32…D-38)
- CSP allowlists `js.stripe.com` / `hooks.stripe.com` / `api.stripe.com`, `challenges.cloudflare.com`, `api.mapbox.com` / `events.mapbox.com` / `https://*.mapbox.com`; `frame-ancestors 'none'`; `object-src 'none'`
- Staging `/dev` and `/:locale/dev` `X-Robots-Tag: noindex` rows untouched; `transpilePackages` kept
- `pnpm --filter web exec vitest run lib/security/headers.test.ts` — 3 passed

## Task Commits

1. **Task 1: Global security headers in next.config.ts** - `c966a73` (feat)
2. **Task 2: CSP funnel-wins comment and no Sentry/eu leakage** - `50f44ef` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/next.config.ts` - catch-all security headers + D-33 funnel-wins comment on CSP

## Decisions Made

- One `/:path*` catch-all covers unprefixed English and prefixed de/fr/ar; do not duplicate security keys on /dev rows
- HSTS is `includeSubDomains` without preload; file source must not name `vamostaxi.eu` or `sentry.io`
- Funnel wins: documented exception is loosen the breaking CSP directive only

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 10-07 (middleware cookie Secure on NEXT_LOCALE). Do not start 10-07 from this plan. WAF is 10-09. No Sentry. No `.eu` bind.

## Self-Check: PASSED

- `apps/web/next.config.ts` exists and emits D-32…D-38 headers
- `/dev/:path*` and `/:locale/dev/:path*` noindex rows remain
- `pnpm --filter web exec vitest run lib/security/headers.test.ts` — Test Files 1 passed, Tests 3 passed
- No `sentry.io`, no `vamostaxi.eu`, no `report-uri`, no `preload` on HSTS, no `sk_live_`, no `CHF`
- `git log --oneline --grep="10-06"` returns Task 1 + Task 2 commits

---
*Phase: 10-hardening-performance-security-compliance*
*Completed: 2026-09-12*

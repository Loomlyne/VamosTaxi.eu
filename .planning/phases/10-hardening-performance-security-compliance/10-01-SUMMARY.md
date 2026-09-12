---
phase: 10-hardening-performance-security-compliance
plan: 01
subsystem: testing
tags: [vitest, consent, health, csp, cache, rate-limit]

requires:
  - phase: 02-data-schema-rls-staff-auth-foundations
    provides: consent_log + record_consent GUC
  - phase: 04-quote-pricing-engine
    provides: QUOTE_RATE_LIMITER family + gatePublicRequest leak 404
provides:
  - Wave 0 Vitest contracts for SITE-08 / LAUNCH-01…04 / LAUNCH-07
  - Green leak-gate (db-smoke 404, no public /health, no Sentry, no vamostaxi.eu bind)
affects: [10-02, 10-03, 10-04, 10-05, 10-06, 10-07, 10-08]

tech-stack:
  added: []
  patterns:
    - Wave 0 source-read Vitest files name future helpers; leak-gate reads live sources only

key-files:
  created:
    - apps/web/lib/consent/ip.test.ts
    - apps/web/lib/consent/cookie.test.ts
    - apps/web/lib/consent/record.test.ts
    - apps/web/lib/abuse/write-rate-limit.test.ts
    - apps/web/lib/health/probe.test.ts
    - apps/web/lib/health/header.test.ts
    - apps/web/lib/health/leak-gate.test.ts
    - apps/web/lib/security/headers.test.ts
    - apps/web/lib/cache/marketing-cache.test.ts
    - apps/web/components/consent/banner-contract.test.ts
  modified: []

key-decisions:
  - "Two-button banner (Accept/Dismiss), not four toggles"
  - "Health is GET /api/internal/health + X-Vamos-Health-Key empty 404"
  - "Keep /api/dev/db-smoke 404; no vamostaxi.eu; no sk_live_; no Sentry; no invented CHF"

patterns-established:
  - "Wave 0 tests source-read future ip.ts/cookie.ts/bind.ts/header.ts/CookieBanner.tsx until later plans turn them green"
  - "leak-gate.test.ts is green now against live db-smoke, gatePublicRequest, wrangler custom_domain, package.json"

requirements-completed: [SITE-08, LAUNCH-01, LAUNCH-02, LAUNCH-03, LAUNCH-04, LAUNCH-07]

duration: 8min
completed: 2026-09-12
---

# Phase 10 Plan 01: Wave 0 Vitest contracts Summary

**Ten Wave 0 Vitest files landed with no production code; leak-gate is green on db-smoke 404, no public /health, no Sentry, and no vamostaxi.eu bind**

## Performance

- **Duration:** 8 min
- **Started:** 2026-09-12T14:12:18Z
- **Completed:** 2026-09-12T14:20:12Z
- **Tasks:** 3/3
- **Files modified:** 10 (created)

## Accomplishments

- Wave 0 VALIDATION checkboxes have files (consent IP/cookie/record, write limiter, health header/probe/leak-gate, security headers, marketing cache, two-button banner)
- `pnpm --filter web exec vitest run lib/health/leak-gate.test.ts` — 5 passed
- D-IDs named in tests: D-03 D-05 D-09 D-10 D-18 D-24 D-28
- No production helpers, no supabase db push, no Docker, no deploy, no new npm packages

## Task Commits

1. **Task 1: Wave 0 consent, IP, cookie, record contracts** - `5be26f9` (test)
2. **Task 2: Wave 0 write rate-limit + health 404 contracts** - `957e1e8` (test)
3. **Task 3: Green-now leak gate, headers/cache contracts, no fake banner grid** - `129e9d0` (test)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/lib/consent/ip.test.ts` - D-10 truncated IP / cf-connecting-ip / no raw IP logs
- `apps/web/lib/consent/cookie.test.ts` - D-09 consent_subject HttpOnly Secure Lax 1 year; no GET mint
- `apps/web/lib/consent/record.test.ts` - D-03 record_consent GUC; accept_all/reject_all/settings_change; never save_choices
- `apps/web/lib/abuse/write-rate-limit.test.ts` - Quote fail-open lock; checkWriteRateLimit fail-closed + prefixed keys
- `apps/web/lib/health/probe.test.ts` - D-21/D-22 `{ ok, db, payments, maps }`; SELECT 1 / balance.retrieve / Mapbox tokens v2
- `apps/web/lib/health/header.test.ts` - D-18 X-Vamos-Health-Key timing-safe compare; empty 404 not 401
- `apps/web/lib/health/leak-gate.test.ts` - Live db-smoke 404, no public /health, no Sentry dep, no .eu custom_domain
- `apps/web/lib/security/headers.test.ts` - HSTS/CSP/Referrer/Permissions-Policy/X-Frame-Options (red until 10-06)
- `apps/web/lib/cache/marketing-cache.test.ts` - Marketing s-maxage vs personal no-store; GET never mints consent_subject (red until 10-07)
- `apps/web/components/consent/banner-contract.test.ts` - Accept/Dismiss only; no fake toggles; dashboard skip (red until 10-04)

## Decisions Made

- Followed CONTEXT D-01…D-47: two-button banner, secret-header health, keep db-smoke 404
- Wave 0 is source-read proofs of future helper paths; leak-gate only reads sources that already exist so it stays green

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 10-02 (IP truncate + cookie helpers + checkWriteRateLimit). Do not start 10-02 from this plan. Remaining Wave 0 files stay on disk and may fail until 10-02…10-08.

## Self-Check: PASSED

- All ten 10-VALIDATION.md Wave 0 files exist (`test -f` × 10)
- `pnpm --filter web exec vitest run lib/health/leak-gate.test.ts` — Test Files 1 passed, Tests 5 passed
- No production behavior change

---
*Phase: 10-hardening-performance-security-compliance*
*Completed: 2026-09-12*

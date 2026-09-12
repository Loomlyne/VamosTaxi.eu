---
phase: 10-hardening-performance-security-compliance
plan: 07
subsystem: infra
tags: [cache-control, middleware, vary, consent, next-locale]

requires:
  - phase: 10-hardening-performance-security-compliance
    provides: Wave 0 marketing-cache.test.ts source-read contract
provides:
  - Public marketing GET Cache-Control public s-maxage + stale-while-revalidate
  - Vary on consent cookie presence (boolean), never the UUID
  - NEXT_LOCALE Secure + SameSite=Lax, not HttpOnly
affects: [10-03, 10-09]

tech-stack:
  added: []
  patterns:
    - Marketing HTML cache vs personal no-store lives in middleware; Worker still runs gatePublicRequest
    - Consent cache key is X-Consent-Present 1|0, not Cookie UUID

key-files:
  created: []
  modified:
    - apps/web/middleware.ts

key-decisions:
  - "s-maxage=300, stale-while-revalidate=3600 on logged-out marketing GET"
  - "Vary X-Consent-Present boolean via readConsentSubject — middleware source has no consent_subject literal (10-01 source-read)"
  - "NEXT_LOCALE Secure in middleware only; dc-mock-urls leak redirect left as-is"

patterns-established:
  - "GET never Set-Cookies consent_subject; mint stays POST /api/consent (10-03)"
  - "Auth cookie or /api /checkout /confirmation /bookings /account / ?nocache= / dashboard → private, no-store"

requirements-completed: [LAUNCH-01]

duration: 2min
completed: 2026-09-12
---

# Phase 10 Plan 07: Marketing cache + Secure NEXT_LOCALE Summary

**Middleware caches logged-out marketing HTML (public s-maxage + Vary on consent presence) and no-stores tickets/auth; NEXT_LOCALE is Secure+Lax, not HttpOnly**

## Performance

- **Duration:** 2 min
- **Started:** 2026-09-12T14:39:44Z
- **Completed:** 2026-09-12T14:42:26Z
- **Tasks:** 2/2
- **Files modified:** 1

## Accomplishments

- Logged-out marketing GET (home, about, FAQ, contact, legal) gets `public, s-maxage=300, stale-while-revalidate=3600`
- Two cache variants via `X-Consent-Present: 1|0` + `Vary` — never the consent UUID
- Auth cookie (`sb-*-auth-token`), `/api` `/checkout` `/confirmation` `/bookings` `/account`, `?nocache=`, dashboard: `private, no-store`
- NEXT_LOCALE `secure: true`, SameSite=Lax, not HttpOnly; GET does not mint consent; staging `applyStagingNoindex` stays
- Worker `gatePublicRequest` unchanged; no Cache Rules that skip the Worker
- `pnpm --filter web exec vitest run lib/cache/marketing-cache.test.ts` — 5 passed

## Task Commits

1. **Task 1: Marketing Cache-Control vs personal no-store** - `cd88e87` (feat)
2. **Task 2: Secure NEXT_LOCALE; never mint consent on GET** - `a85c2f6` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/middleware.ts` - marketing cache headers, Vary on consent presence, Secure NEXT_LOCALE

## Decisions Made

- Modest TTL 300/3600; no public load-test URL; photos/FX left as already cached
- Import `readConsentSubject` so middleware source-read still forbids the `consent_subject` token (Wave 0 test)
- Live NEXT_LOCALE setter is middleware; did not patch `dc-mock-urls.ts` leak-redirect Set-Cookie

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for remaining Phase 10 plans. Do not start 10-03 from this plan. Do not deploy. WAF is 10-09.

## Self-Check: PASSED

- `apps/web/middleware.ts` exists with public s-maxage for marketing and private no-store for auth/personal
- No `consent_subject` in middleware source (no GET Set-Cookie mint)
- `apps/web/worker.ts` still calls `gatePublicRequest`
- `pnpm --filter web exec vitest run lib/cache/marketing-cache.test.ts` — Test Files 1 passed, Tests 5 passed
- `git log --oneline --grep="10-07"` returns Task 1 + Task 2 commits
- No wrangler Cache Rule, no k6, no new npm packages, no supabase db push, no Docker, no deploy

---
*Phase: 10-hardening-performance-security-compliance*
*Completed: 2026-09-12*

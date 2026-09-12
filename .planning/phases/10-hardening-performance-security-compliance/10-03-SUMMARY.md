---
phase: 10-hardening-performance-security-compliance
plan: 03
subsystem: api
tags: [consent, turnstile, signup, rate-limit, nFADP]

requires:
  - phase: 10-hardening-performance-security-compliance
    provides: IP/cookie/bind helpers + checkWriteRateLimit
  - phase: 02-data-schema-rls-staff-auth-foundations
    provides: consent_log + record_consent GUC
  - phase: 05-public-site-i18n-legal-contact-auth
    provides: POST /api/contact Turnstile + POST /api/auth signup
provides:
  - POST /api/consent asAnon record_consent
  - TurnstileAction consent on Accept only
  - Signup asCustomer append-only consent row
affects: [10-04, 10-05]

tech-stack:
  added: []
  patterns:
    - Accept fail-closed Turnstile action consent; Dismiss skips challenge
    - Guest writes asAnon; signup writes asCustomer; never import @vamos/db from routes

key-files:
  created:
    - apps/web/app/api/consent/route.ts
  modified:
    - apps/web/lib/turnstile.ts
    - apps/web/app/api/auth/route.ts
    - apps/web/lib/consent/record.test.ts

key-decisions:
  - "Turnstile action consent only on accept_all; Dismiss/settings_change write without a token"
  - "Signup reuses consent_subject cookie or mints; settings_change if cookie existed else reject_all"
  - "Consent write failure after signup logs and does not fail auth"

patterns-established:
  - "POST /api/consent: checkWriteRateLimit then asAnon set_config + record_consent; Set-Cookie on success only"
  - "Signup consent row is a new insert via recordConsent inside asCustomer; never UPDATE"

requirements-completed: [SITE-08, LAUNCH-02]

duration: 8min
completed: 2026-09-12
---

# Phase 10 Plan 03: POST /api/consent + signup consent row Summary

**Guest Accept/Dismiss writes consent through asAnon + GUC bind; Accept is fail-closed Turnstile action consent; password and magic signup append a new asCustomer row without blocking auth**

## Performance

- **Duration:** 8 min
- **Started:** 2026-09-12T14:50:17Z
- **Completed:** 2026-09-12T14:58:27Z
- **Tasks:** 2/2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- `POST /api/consent` is `force-dynamic`; GET 405; no `@vamos/db` import
- Accept maps to `accept_all` and `verifyTurnstile({ action: "consent" })`; fail → `{ ok: false, code: "challenge_failed" }` 403
- Dismiss/reject map to `reject_all`; `settings_change` writes without Turnstile
- `checkWriteRateLimit` kind consent before write; 429 `rate_limited`; `consent_subject` Set-Cookie on POST success only
- Categories stay necessary true / others false via `recordConsent`; ip from truncated `cf-connecting-ip`
- After successful password or magic signup, `asCustomer` + `recordConsent`; cookie reuse or mint; no `customer_id` argument; write failure logs only

## Task Commits

1. **Task 1: POST /api/consent + Turnstile on Accept** - `5b57cb2` (test) + `ff0be37` (feat)
2. **Task 2: Signup appends a new consent_log row** - `c9bc637` (test) + `44ac5c3` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/app/api/consent/route.ts` - guest POST record_consent
- `apps/web/lib/turnstile.ts` - TurnstileAction includes consent
- `apps/web/app/api/auth/route.ts` - signup asCustomer consent row
- `apps/web/lib/consent/record.test.ts` - HTTP mapping + signup source contracts

## Decisions Made

- GET on `/api/consent` returns 405 rather than omitting the handler
- Banner aliases `accept`/`dismiss`/`reject` map in the route; RPC methods stay accept_all / reject_all / settings_change
- If signup has no session yet (email confirm), log `consent-no-session` and keep the auth result

## Deviations from Plan

None material — banner UI stays 10-04. `record.test.ts` is extra vs `files_modified` because TDD source-read tests live there.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

```
pnpm --filter web exec vitest run lib/consent/record.test.ts
```

Test Files 1 passed (1). Tests 11 passed (11).

- No Sentry. No Turnstile on checkout. No supabase db push. No Docker. No deploy. No new npm packages.
- Consent and auth routes do not import `@vamos/db`.

## Next Phase Readiness

Ready for 10-04 (banner UI). Do not start 10-04 from this plan.

## Self-Check: PASSED

---
*Phase: 10-hardening-performance-security-compliance*
*Completed: 2026-09-12*

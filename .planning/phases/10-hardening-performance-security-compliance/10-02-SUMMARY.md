---
phase: 10-hardening-performance-security-compliance
plan: 02
subsystem: security
tags: [consent, rate-limit, cookie, guc, nFADP]

requires:
  - phase: 10-hardening-performance-security-compliance
    provides: Wave 0 Vitest contracts for IP/cookie/record/write-limiter
  - phase: 02-data-schema-rls-staff-auth-foundations
    provides: consent_log + record_consent GUC
  - phase: 04-quote-pricing-engine
    provides: QUOTE_RATE_LIMITER / QUOTE_RATE_LIMITER_BARE
provides:
  - truncateClientIp last-octet / IPv6 /64
  - consent_subject cookie helpers (HttpOnly Secure Lax 1y)
  - GUC bind + record_consent on the same asAnon/asCustomer tx
  - checkWriteRateLimit fail-closed on existing limiter family
affects: [10-03, 10-04, 10-05]

tech-stack:
  added: []
  patterns:
    - Write limiter fail-closed; quote checkRateLimit stays fail-open
    - Prefixed keys consent:/contact:/review: reuse namespace 1001/1002

key-files:
  created:
    - apps/web/lib/consent/ip.ts
    - apps/web/lib/consent/cookie.ts
    - apps/web/lib/consent/policy.ts
    - apps/web/lib/consent/bind.ts
  modified:
    - apps/web/lib/abuse/rate-limit.ts

key-decisions:
  - "policy_version stamp is 2026-09-12, not legal prose"
  - "checkWriteRateLimit catch returns rate_limited; checkRateLimit catch still ok true"
  - "No new ratelimit namespace_id; prefixes on QUOTE_RATE_LIMITER family"
  - "recordConsent never passes customer_id or subject as RPC arguments"

patterns-established:
  - "Mint consent_subject on POST only — cookie helpers do not Set-Cookie on GET"
  - "set_config request.vamos.consent_subject then record_consent inside the identity tx"

requirements-completed: [SITE-08, LAUNCH-02]

duration: 7min
completed: 2026-09-12
---

# Phase 10 Plan 02: Consent IP/cookie/bind helpers + checkWriteRateLimit Summary

**Worker helpers truncate CF-Connecting-IP, format an HttpOnly consent_subject cookie, bind `request.vamos.consent_subject` then `record_consent` on the same tx, and fail-close write amplifiers on prefixed QUOTE_RATE_LIMITER keys**

## Performance

- **Duration:** 7 min
- **Started:** 2026-09-12T14:23:35Z
- **Completed:** 2026-09-12T14:30:28Z
- **Tasks:** 2/2
- **Files modified:** 5 (4 created, 1 modified)

## Accomplishments

- `truncateClientIp` zeros IPv4 last octet and IPv6 /64; never logs the raw IP
- `consent_subject` cookie: Max-Age 31536000, HttpOnly, Secure, SameSite=Lax, Path=/; UUID only; no GET mint
- `recordConsent` runs `set_config('request.vamos.consent_subject', …, true)` then `public.record_consent` with necessary true / others false; methods accept_all / reject_all / settings_change; never save_choices
- `checkWriteRateLimit` fail-closed `{ ok: false, code: "rate_limited" }` on throw; quote `checkRateLimit` catch still `{ ok: true }`
- Keys `consent:${ip}`, `consent:${ip}:${subject}`, `contact:${ip}`, `review:${ip}` — no namespace_id 1003

## Task Commits

1. **Task 1: IP truncate + consent cookie + policy stamp** - `0bfa555` (feat)
2. **Task 2: GUC bind helper + fail-closed write rate limit** - `1bb7d38` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/lib/consent/ip.ts` - D-10 truncate + cf-connecting-ip reader
- `apps/web/lib/consent/cookie.ts` - D-09 read/Set-Cookie/mint UUID
- `apps/web/lib/consent/policy.ts` - CONSENT_POLICY_VERSION 2026-09-12
- `apps/web/lib/consent/bind.ts` - GUC bind + record_consent on caller tx
- `apps/web/lib/abuse/rate-limit.ts` - checkWriteRateLimit + writeRateLimitKeys

## Decisions Made

- Policy stamp is the dated constant `2026-09-12`
- Write limiter takes kind/ip/subject and builds prefixed keys in this module so 10-03/10-05 do not invent key strings
- Categories object is always necessary true, functional/analytics/marketing false

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Source-scan of checkRateLimit catch must not see `{ ok: false }` in comments between the two exports; JSDoc for the write limiter omits that token.

## User Setup Required

None - no external service configuration required.

## Verification

```
pnpm --filter web exec vitest run lib/consent/ip.test.ts lib/consent/cookie.test.ts lib/consent/record.test.ts lib/abuse/write-rate-limit.test.ts lib/abuse/rate-limit.test.ts
```

Test Files 5 passed (5). Tests 26 passed (26).

- checkRateLimit catch still `return { ok: true }`
- checkWriteRateLimit catch `return { ok: false, code: "rate_limited" }`
- No HTTP routes, no supabase db push, no Docker, no deploy, no new npm packages

## Next Phase Readiness

Ready for 10-03 (POST /api/consent). Do not start 10-03 from this plan. Quote funnel limiter unchanged.

## Self-Check: PASSED

---
*Phase: 10-hardening-performance-security-compliance*
*Completed: 2026-09-12*

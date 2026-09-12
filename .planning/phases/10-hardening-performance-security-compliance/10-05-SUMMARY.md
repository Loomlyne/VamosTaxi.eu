---
phase: 10-hardening-performance-security-compliance
plan: 05
subsystem: security
tags: [rate-limit, turnstile, contact, reviews, launch-02]

requires:
  - phase: 10-hardening-performance-security-compliance
    provides: checkWriteRateLimit fail-closed on QUOTE_RATE_LIMITER family
  - phase: 05-public-surfaces-customer-accounts
    provides: POST /api/contact Turnstile + POST /api/reviews/submit
provides:
  - POST /api/contact checkWriteRateLimit kind contact, 429 rate_limited
  - POST /api/reviews/submit checkWriteRateLimit kind review, 429 rate_limited
  - formFailure rate_limited 429
affects: [10-09]

tech-stack:
  added: []
  patterns:
    - Write limiter fail-closed on contact/review; quote checkRateLimit stays fail-open
    - Prefixed keys contact:${ip} review:${ip} via kind; no new ratelimit binding

key-files:
  created: []
  modified:
    - apps/web/app/api/contact/route.ts
    - apps/web/app/api/reviews/submit/route.ts
    - apps/web/lib/forms/notify.ts
    - apps/web/lib/abuse/write-rate-limit.test.ts

key-decisions:
  - "Limiter uses env.QUOTE_RATE_LIMITER so the identifier is in POST source"
  - "Review Turnstile action stays contact; widget not changed"
  - "Checkout, manage cancel, webhook: no verifyTurnstile; proofs live in write-rate-limit.test.ts not leak-gate"

patterns-established:
  - "Public write POSTs: checkWriteRateLimit then fail-closed verifyTurnstile; 429 rate_limited"
  - "formFailure status union includes 429; reviews jsonErr rate_limited 429"

requirements-completed: [LAUNCH-02]

duration: 5min
completed: 2026-09-12
---

# Phase 10 Plan 05: Rate-limit contact and reviews POST Summary

**Contact and review writes fail-closed on checkWriteRateLimit (kind contact/review, keys contact:${ip} / review:${ip}) and return 429 rate_limited; Turnstile stays action contact; checkout/cancel/webhook unchanged**

## Performance

- **Duration:** 5 min
- **Started:** 2026-09-12T15:02:27Z
- **Completed:** 2026-09-12T15:07:21Z
- **Tasks:** 2/2
- **Files modified:** 4

## Accomplishments

- `formFailure` accepts `rate_limited` with status 429
- `POST /api/contact` calls `checkWriteRateLimit` kind `contact` with `env.QUOTE_RATE_LIMITER` before `submit_contact_message`; fail → `formFailure("rate_limited", 429)`
- `POST /api/reviews/submit` calls `checkWriteRateLimit` kind `review` before `submit_review`; fail → `jsonErr("rate_limited", 429)`
- Both keep fail-closed `verifyTurnstile` action `contact`; no `@vamos/db`; no `lib/abuse/turnstile` fail-open ladder
- Checkout intent, manage/account cancel, and Stripe webhook still have no `verifyTurnstile`; `webhook-verify.ts` is `constructEventAsync` only
- Quote `checkRateLimit` catch still fail-open

## Task Commits

1. **Task 1: Rate-limit contact and reviews; 429 rate_limited** - `b47a6e9` (test) + `1ef456d` (feat) + `2be0d85` (fix: `env.QUOTE_RATE_LIMITER` identifier)
2. **Task 2: Prove checkout/cancel/webhook were not given Turnstile** - `ea14fdc` (test)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/lib/forms/notify.ts` - FormFailureCode + status 429
- `apps/web/app/api/contact/route.ts` - write limiter before submit
- `apps/web/app/api/reviews/submit/route.ts` - write limiter before submit
- `apps/web/lib/abuse/write-rate-limit.test.ts` - source-read contact/review + no-Turnstile proofs

## Decisions Made

- Pass `env.QUOTE_RATE_LIMITER` (not BARE) so POST source contains that identifier
- Task 2 assertions stay in `write-rate-limit.test.ts`; do not rewrite `leak-gate.test.ts`

## Deviations from Plan

None - plan executed exactly as written. Task 2 listed `leak-gate.test.ts` but instructed preferring `write-rate-limit.test.ts`.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

```
pnpm --filter web exec vitest run lib/abuse/write-rate-limit.test.ts
```

Test Files 1 passed (1). Tests 9 passed (9).

- contact and reviews source contain `checkWriteRateLimit`
- webhook-verify.ts still `constructEventAsync` only
- No Turnstile on checkout/cancel/webhook
- No supabase db push. No Docker. No deploy. No new npm packages. Quote fail-open unchanged.

## Next Phase Readiness

Do not start 10-04 from this plan.

## Self-Check: PASSED

---
*Phase: 10-hardening-performance-security-compliance*
*Completed: 2026-09-12*

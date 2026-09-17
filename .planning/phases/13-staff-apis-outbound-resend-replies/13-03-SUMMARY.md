---
phase: 13-staff-apis-outbound-resend-replies
plan: 03
subsystem: api
tags: [resend, rfc-message-id, staff-reply, threading]

requires:
  - phase: 13-01
    provides: Wave 0 ticket-mail/notify tests for unminted headers and GET-after-send
provides:
  - staffSender with REPLIES_DOMAIN_VERIFIED false
  - unminted threadHeaders (In-Reply-To + References only)
  - retrieveRfcMessageId after Resend send UUID
affects: [13-06, 13-07, 14]

tech-stack:
  added: []
  patterns:
    - GET Resend message_id is the RFC identity; never suffixOf or staffMessageId
    - Staff fail-closed when GET is empty; never EMAIL after Resend accepted

key-files:
  created: []
  modified:
    - apps/web/lib/ops/ticket-mail.ts
    - apps/web/lib/forms/notify.ts

key-decisions:
  - "REPLIES_DOMAIN_VERIFIED is false this phase (D-01 D-09)"
  - "threadHeaders second arg still accepts a leftover outbound UUID string and ignores it so tickets-write compiles until 13-07"

patterns-established:
  - "RFC id is /^<.+@.+>$/ after emails.get; retry once"
  - "options.from overrides CONTACT_FROM; void from stays unused"

requirements-completed: [RPLY-01, RPLY-02]

duration: 12min
completed: 2026-09-18
---

# Phase 13: Staff APIs + outbound Resend replies — 13-03 Summary

**Unminted thread headers plus GET RFC helper: staff From stays noreply, fail-closed when Resend GET has no message_id.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-09-18T01:32:00Z
- **Completed:** 2026-09-18T01:35:00Z
- **Tasks:** 2/2
- **Files modified:** 2

## Accomplishments
- `staffSender` From is `Vamos Taxi <noreply@vamostaxi.site>`; Reply-To is the plus-address while `REPLIES_DOMAIN_VERIFIED` is false.
- `threadHeaders` no longer sets `Message-ID`; Gmail/Phase 14 match GET `message_id`.
- `sendContactMessage` GETs RFC id after send; staff path never EMAIL-dual-sends; contact EMAIL fallback remains.

## Task Commits

1. **Task 1: staffSender + unminted threadHeaders** - `016577f` (feat)
2. **Task 2: retrieveRfcMessageId + options.from** - `c4012e8` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `apps/web/lib/ops/ticket-mail.ts` - D-01 sender gate, unminted headers
- `apps/web/lib/forms/notify.ts` - GET-after-send, fail-closed staff, options.from

## Decisions Made
Followed CONTEXT D-01 D-06 D-08 D-09. No tickets-write persist (13-07).

## Deviations from Plan

**1. [Rule 1 - Bug] Relative import for asRfcMessageId**
- **Found during:** Task 2
- **Issue:** `@/lib/ops/ticket-mail` fails vitest `configLoader: native` (`Cannot find package '@/lib/…'`).
- **Fix:** Import `../ops/ticket-mail`.
- **Files modified:** `apps/web/lib/forms/notify.ts`
- **Verification:** notify + ticket-mail vitest 16/16 pass
- **Committed in:** `c4012e8`

**Total deviations:** 1 auto-fixed (Rule 1).
**Impact on plan:** Import path only. Behavior matches the plan.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
13-04 (email chrome) is independent Wave 2. 13-06/13-07 can persist GET RFC ids.

## Self-Check: PASSED
- ticket-mail.test.ts green (no Message-ID)
- notify.test.ts green including GET cases and EMAIL fallback
- REPLIES_DOMAIN_VERIFIED is false

---
*Phase: 13-staff-apis-outbound-resend-replies*
*Completed: 2026-09-18*

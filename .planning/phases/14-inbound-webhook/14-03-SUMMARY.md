---
phase: 14-inbound-webhook
plan: 03
subsystem: api
tags: [inbound, ingest, plus-token, rfc, idempotency]

requires:
  - phase: 14-inbound-webhook
    provides: stripQuotedHistory tokenFromInboundTargets parseInboundHeaders
provides:
  - ingestInboundEmail plus-token then RFC, never From
  - unmatched drop, Closed→Responded, email_id idempotent, D-07 empty body
affects: [14-05, 14-06]

tech-stack:
  added: []
  patterns:
    - Resolve ticket first; one TX for event + message
    - Empty body + attachments uses Attachment received. until 14-05 classifies keep

key-files:
  created: []
  modified:
    - apps/web/lib/ops/ticket-inbound.ts

key-decisions:
  - "Never WHERE email. Unmatched ≠ ticket."
  - "Relative imports so vitest native loader can import ticket-inbound.ts"

patterns-established:
  - "tokenFromInboundTargets then rfc_message_id SELECT; inbound event conflict returns ok"

requirements-completed: [INB-02]

duration: 6min
completed: 2026-09-18
---

# Phase 14 Plan 03: ingest plus-token then RFC Summary

**ingestInboundEmail matches plus-token on to ∪ received_for then RFC ids, drops unmatched, reopens Closed to Responded, and stores D-07 empty-body copy.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-09-18T02:33:00Z
- **Completed:** 2026-09-18T02:35:00Z
- **Tasks:** 2/2
- **Files modified:** 1

## Accomplishments

- Match order: tokenFromInboundTargets then support_messages.rfc_message_id. Never From.
- Unmatched inserts inbound event only and returns drop.
- Same email_id returns ok with no second message.
- Closed → responded, closed_at null.
- Empty body → `Message could not be read.`; attachments present → `Attachment received.`

## Task Commits

1. **Task 1–2: ingest TX** - (this commit)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/lib/ops/ticket-inbound.ts` - ingest match + TX

## Decisions Made

Relative `./ticket-mail` import so Wave 0 vitest can load the module (native configLoader has no `@/` alias).

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0
**Impact on plan:** None.

## Issues Encountered

First vitest run failed on `@/lib/ops/ticket-mail`. Switched to relative import. 23 tests passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

14-05 can store files on SUPPORT_FILES after 14-04 SQL is in git.

---
*Phase: 14-inbound-webhook*
*Completed: 2026-09-18*

---
phase: 14-inbound-webhook
plan: 01
subsystem: testing
tags: [vitest, inbound, resend, quote-strip, wave-0]

requires:
  - phase: 13-staff-apis-outbound-resend-replies
    provides: ticket-mail parse helpers, ticket-inbound stub, asSystem mock analog
provides:
  - Wave 0 ticket-mail.test.ts stripQuotedHistory / received_for / parseInboundHeaders
  - Wave 0 ticket-inbound.test.ts plus-token, RFC, From-spoof drop, unmatched, email_id idempotent, Closed→Responded
  - Wave 0 ticket-inbound-files.test.ts jpeg keep, zip reject, 5MiB, max 3
affects: [14-02, 14-03, 14-05]

tech-stack:
  added: []
  patterns:
    - Wave 0 imports missing 14-02/14-05 names via dynamic import; RED until those plans
    - asSystem vi.mock for ingest without Hyperdrive

key-files:
  created:
    - apps/web/lib/ops/ticket-inbound-files.test.ts
  modified:
    - apps/web/lib/ops/ticket-mail.test.ts
    - apps/web/lib/ops/ticket-inbound.test.ts

key-decisions:
  - "Wave 0 verify is rg / test -f. Vitest may stay RED until 14-02/14-03/14-05."
  - "CONTEXT D-04: Closed+inbound → Responded. ROADMAP stay-closed is dead."
  - "D-07 strings exact: Message could not be read. / Attachment received. / Attachment not kept: {filename}"

patterns-established:
  - "Plus-token on received_for with unrelated to still appends."
  - "Never match From. Unmatched ≠ ticket."

requirements-completed: [INB-02]

duration: 12min
completed: 2026-09-18
---

# Phase 14 Plan 01: Wave 0 inbound tests Summary

**Wave 0 Vitest files lock plus-token then RFC (never From), quote-strip, unmatched drop, email_id idempotency, Closed→Responded, and inbound file caps before ingest/webhook edits.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-09-18T02:21:26Z
- **Completed:** 2026-09-18T02:31:00Z
- **Tasks:** 3/3
- **Files modified:** 3

## Accomplishments

- `ticket-mail.test.ts` names stripQuotedHistory, received_for token, parseInboundHeaders, script-stripped html, clip 8000.
- `ticket-inbound.test.ts` covers plus-token on `to`, plus-token only on `received_for`, RFC In-Reply-To, From spoof drop, unmatched no insert, same email_id once, Closed→responded, `Message could not be read.`, `Attachment received.`
- `ticket-inbound-files.test.ts` jpeg keep, zip reject, 5242880+1 reject, fourth file not-kept, inline png skip without D-10 line.

## Task Commits

Each task was committed atomically:

1. **Task 1–3: Wave 0 mail / ingest / file-cap tests** - `a6d9fd5` (test)

**Plan metadata:** (this commit)

_Note: TDD plan is tests-only. RED is the deliverable. GREEN is 14-02 / 14-03 / 14-05._

## Files Created/Modified

- `apps/web/lib/ops/ticket-mail.test.ts` - Wave 0 strip + parse
- `apps/web/lib/ops/ticket-inbound.test.ts` - Wave 0 ingest contract
- `apps/web/lib/ops/ticket-inbound-files.test.ts` - Wave 0 MIME/size/count

## Decisions Made

None - followed plan as specified. Verify used `rg` / `test -f`, not vitest exit 0.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0
**Impact on plan:** None.

## Issues Encountered

Kanban worker toured ~7 min with tests on disk and no commit. Orchestrator stopped it and committed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

14-02 can export stripQuotedHistory / parseInboundHeaders / receivedFor and turn mail tests GREEN.

---
*Phase: 14-inbound-webhook*
*Completed: 2026-09-18*

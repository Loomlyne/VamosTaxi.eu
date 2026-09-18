---
phase: 15-wire-ops-support-to-apis
plan: 02
subsystem: api
tags: [staff, tickets, files, mapTicket]

requires:
  - phase: 12-ticket-schema-support-mock
    provides: mapTicket + loadTickets
provides:
  - Optional files[] on OpsTicketMessage
  - Missing support_message_files → files [] (no 500)
affects: [15-03]

tech-stack:
  added: []
  patterns: [catch 42P01 on optional files table]

key-files:
  created:
    - apps/web/lib/ops/tickets.test.ts
  modified:
    - apps/web/lib/ops/tickets-map.ts
    - apps/web/lib/ops/tickets-map.test.ts
    - apps/web/lib/ops/tickets.ts

key-decisions:
  - "Missing Phase 14 table cannot fail the board GET."
  - "Body stays source text; no HTML render field."

patterns-established:
  - "filesByMessageId optional third arg on mapTicket"

requirements-completed: [SUP-01, SUP-03]

duration: 10min
completed: 2026-09-18
---

# Phase 15-02: GET map optional files

**Staff ticket GET can carry inbound file metadata; missing `support_message_files` still returns the board.**

## Performance

- **Duration:** 10 min
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `mapTicket` attaches `files[]` by message id; unknown ids ignored.
- `loadTickets` selects `m.id` and optional `support_message_files`; 42P01 swallowed.

## Task Commits

1. **Tasks 1–2: map + optional files query** — `965333a`
2. **tickets.test.ts @/ mock so loadTickets vitest runs** — `eaabba8`
3. **Plan metadata:** 15-02-SUMMARY.md (this file)

## Files Created/Modified

- `apps/web/lib/ops/tickets-map.ts` — optional `files[]` on messages
- `apps/web/lib/ops/tickets-map.test.ts` — text body + files-by-id
- `apps/web/lib/ops/tickets.ts` — `support_message_files` select; 42P01 → []
- `apps/web/lib/ops/tickets.test.ts` — missing-table stub; relative tickets-map mock

## Decisions Made

None beyond the plan. ops-live-data public DC copy is missing in the worktree (inherited); plan files `tickets-map` + `tickets` 12 passed.

## Deviations from Plan

None.

## User Setup Required

None - no `supabase db push`.

## Next Phase Readiness

15-03 DC Save + badge + files in bubble.

---
*Phase: 15-wire-ops-support-to-apis*
*Completed: 2026-09-18*

---
phase: 14-inbound-webhook
plan: 04
subsystem: database
tags: [sql, rls, support_message_files, rfc_message_id]

requires:
  - phase: 14-inbound-webhook
    provides: Wave 0 file-cap tests
provides:
  - support_message_files SQL in git, not applied
  - support_messages rfc_message_id partial index
affects: [14-05, 14-07]

tech-stack:
  added: []
  patterns:
    - RLS FORCE; revoke anon/authenticated/public roles; staff SELECT only; asSystem writes

key-files:
  created:
    - packages/db/supabase/migrations/20260918020000_support_message_files.sql
  modified: []

key-decisions:
  - "Do not apply. Hosted apply is 14-07 after Koss says apply."
  - "No INSERT grant to vamos_staff."

patterns-established:
  - "Inbound file bytes are R2 keys, not public URLs"

requirements-completed: [INB-02]

duration: 4min
completed: 2026-09-18
---

# Phase 14 Plan 04: support_message_files SQL in git Summary

**Migration `20260918020000_support_message_files.sql` adds the files table (staff SELECT, RLS FORCE) and a partial rfc_message_id index. Hosted schema is unchanged.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-09-18T02:35:00Z
- **Completed:** 2026-09-18T02:36:00Z
- **Tasks:** 2/2
- **Files modified:** 1

## Accomplishments

- `support_message_files` with filename 1..255, kept + r2_key pairing, RLS force.
- Revoke public/vamos_public/vamos_edge/vamos_guest/anon/authenticated. Grant SELECT vamos_staff only.
- Partial index `support_messages_rfc_message_id_idx`.

## Task Commits

1. **Task 1–2: SQL file** - (this commit)

**Plan metadata:** (this commit)

## Files Created/Modified

- `packages/db/supabase/migrations/20260918020000_support_message_files.sql` - files table + rfc index

## Decisions Made

None - followed plan as specified. Did not apply.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0
**Impact on plan:** None.

## Issues Encountered

None.

## User Setup Required

None in this plan. 14-07 will ask Koss to say **apply**.

## Next Phase Readiness

14-05 can insert file rows against this shape. Do not apply until 14-07.

---
*Phase: 14-inbound-webhook*
*Completed: 2026-09-18*

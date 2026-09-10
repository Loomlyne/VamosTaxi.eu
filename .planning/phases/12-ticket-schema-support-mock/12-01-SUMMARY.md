---
phase: 12-ticket-schema-support-mock
plan: 01
subsystem: database
tags: [postgres, supabase, rls, pgTAP, contact_submissions]

requires:
  - phase: 06-ops-console
    provides: contact_submissions + staff ops console
provides:
  - contact_ticket_schema in git (four-status historical)
  - responded CHECK + FORCE RLS on contact_submissions
  - pgTAP hasnt_table support_tickets
affects: [12-02, 12-03, 13, 14]

tech-stack:
  added: []
  patterns: [reconstruct hosted migration in git; MCP apply_migration delta only]

key-files:
  created:
    - packages/db/supabase/migrations/20260904182631_contact_ticket_schema.sql
    - packages/db/supabase/migrations/20260910180000_ticket_status_responded.sql
    - packages/db/supabase/tests/support_tickets.test.sql
  modified:
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md

key-decisions:
  - "Tickets stay contact_submissions + support_messages + support_inbound_events. No support_tickets table."
  - "Hosted apply is MCP apply_migration of the responded delta only. Never supabase db push. Never re-apply 20260904182631."

patterns-established:
  - "Historical hosted version reconstructed with IF NOT EXISTS + backfill for local db:reset."
  - "MCP stamps its own schema_migrations version; repo filename may differ."

requirements-completed: [SUP-02]

duration: 40min
completed: 2026-09-10
---

# Phase 12: Ticket schema (12-01) Summary

**Hosted five-status CHECK (`responded`) + FORCE RLS on `contact_submissions`; schema reconstructed in git; no `support_tickets` table.**

## Performance

- **Duration:** 40 min
- **Started:** 2026-09-10T15:18:00Z
- **Completed:** 2026-09-10T15:30:06Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Repo copy of hosted `contact_ticket_schema` with unique `reply_token`, inbound_form seed, FORCE on messages/events
- Delta migration adds `responded` and FORCE RLS on the header table
- Stale untracked `20260910000002_ops_support_write.sql` deleted, never applied
- pgTAP: `hasnt_table support_tickets`, five-status check, unique token, anon 42501
- SUP-02 / ROADMAP: Open / Close / Reopen only

## Task Commits

1. **Task 1: Reconstruct hosted contact_ticket_schema** - `df1f110` (feat)
2. **Task 2: responded + FORCE + pgTAP** - `0422d6f` (feat)
3. **Task 3: Hosted apply** - MCP `apply_migration` (no git commit)

**Plan metadata:** this file

## Files Created/Modified

- `packages/db/supabase/migrations/20260904182631_contact_ticket_schema.sql` - git copy of hosted four-status schema + backfill
- `packages/db/supabase/migrations/20260910180000_ticket_status_responded.sql` - five-status CHECK + FORCE RLS
- `packages/db/supabase/tests/support_tickets.test.sql` - pgTAP
- `.planning/REQUIREMENTS.md` - SUP-02 five statuses
- `.planning/ROADMAP.md` - Phase 12 success line

## Decisions Made

- Reconstruct 04182631 in git; MCP-apply only the responded delta
- Do not change STATE current phase (Phase 8 stays current)

## Deviations from Plan

### MCP version stamp

**1. Hosted `schema_migrations` version is `20260910152917`, not `20260910180000`**
- **Found during:** Task 3 (hosted apply)
- **Issue:** Supabase MCP assigns its own timestamp to `name=ticket_status_responded`
- **Fix:** None required — SQL effect is the CHECK + FORCE. Repo file stays `20260910180000` for local reset. Never `db push`.
- **Verification:** `list_migrations` includes `ticket_status_responded`; CHECK includes `responded`; `relforcerowsecurity` true on `contact_submissions`; `to_regclass('public.support_tickets')` is null
- **Committed in:** n/a (hosted only)

---

**Total deviations:** 1 (MCP version stamp)
**Impact on plan:** Acceptance intent met. Filename vs hosted version mismatch is the existing house pattern.

## Issues Encountered

None besides the MCP version stamp.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 12-02 GET/PATCH and 12-03 `#support` DC can run
- Do not re-apply 04182631
- STATE current phase unchanged

## Self-Check: PASSED

- Hosted CHECK includes responded
- Hosted contact_submissions FORCE RLS true
- No support_tickets table
- Stale 000002 gone from disk

---
*Phase: 12-ticket-schema-support-mock*
*Completed: 2026-09-10*

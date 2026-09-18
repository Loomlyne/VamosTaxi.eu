---
phase: 14-inbound-webhook
plan: 05
subsystem: api
tags: [inbound, r2, attachments, mime-caps]

requires:
  - phase: 14-inbound-webhook
    provides: ingestInboundEmail + support_message_files SQL in git
provides:
  - classifyInboundFile jpeg/png/webp/gif/pdf ≤5MiB max 3
  - storeInboundFiles on SUPPORT_FILES never PHOTOS
affects: [14-06, 14-07, 15]

tech-stack:
  added: []
  patterns:
    - R2 key support/{submissionId}/{messageId}/{fileId}
    - download_url fetched once; Postgres stores r2_key

key-files:
  created:
    - apps/web/lib/ops/ticket-inbound-files.ts
  modified:
    - apps/web/lib/ops/ticket-inbound.ts
    - apps/web/lib/env.d.ts

key-decisions:
  - "SUPPORT_FILES is optional until 14-07 bind. Missing bucket → D-10, text ingest still ok."
  - "storeInboundFiles runs only when insert returning id exists (unit mock returns [])."

patterns-established:
  - "Never PHOTOS for mail files"

requirements-completed: [INB-02]

duration: 8min
completed: 2026-09-18
---

# Phase 14 Plan 05: SUPPORT_FILES + MIME caps Summary

**Inbound attachments classify jpeg/png/webp/gif/pdf ≤5 MiB (max 3), put kept bytes on SUPPORT_FILES, and append `Attachment not kept: filename` for rejects.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-09-18T02:41:00Z
- **Completed:** 2026-09-18T02:44:00Z
- **Tasks:** 2/2
- **Files modified:** 3

## Accomplishments

- `classifyInboundFile` + Wave 0 files tests GREEN.
- `storeInboundFiles` fetch `download_url` once, `r2_key` only, never CDN URL.
- Inline <20KiB skip with no D-10 line.
- `env.SUPPORT_FILES?: R2Bucket`; PHOTOS unchanged.

## Task Commits

1. **Task 1–2: caps + ingest wire** - `e21e689`

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/lib/ops/ticket-inbound-files.ts` — classify + R2 put
- `apps/web/lib/ops/ticket-inbound.ts` — store after message insert
- `apps/web/lib/env.d.ts` — SUPPORT_FILES optional

## Decisions Made

Missing bucket does not crash text ingest. Bind is 14-07.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0
**Impact on plan:** None.

## Issues Encountered

Worktree has no `node_modules`. Vitest used MAIN `apps/web/node_modules/.bin/vitest`. 28 passed. Did not run workspace lint/typecheck/build (that is an install).

## User Setup Required

None in this plan. 14-07: apply SQL + create R2 `vamos-support-staging`.

## Next Phase Readiness

14-06 can GET receiving + staff file GET. No public URL.

---
*Phase: 14-inbound-webhook*
*Completed: 2026-09-18*

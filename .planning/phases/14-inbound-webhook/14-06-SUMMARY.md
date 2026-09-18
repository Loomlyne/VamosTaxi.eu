---
phase: 14-inbound-webhook
plan: 06
subsystem: api
tags: [inbound, webhook, resend, svix, r2]

requires:
  - phase: 14-inbound-webhook
    provides: ingestInboundEmail + storeInboundFiles + SUPPORT_FILES type
provides:
  - email.received always GET /emails/receiving/:id then /attachments
  - staff GET /api/staff/tickets/:id/files/:fileId via withStaff
affects: [14-07, 15, 16]

tech-stack:
  added: []
  patterns:
    - Svix on raw body; hydrate receiving before ingest
    - staff file stream from SUPPORT_FILES; images inline

key-files:
  created:
    - apps/web/app/[locale]/(ops)/api/staff/tickets/[id]/files/[fileId]/route.ts
    - apps/web/lib/ops/ticket-inbound-webhook.test.ts
  modified:
    - apps/web/app/api/webhooks/resend/route.ts

key-decisions:
  - "Missing RESEND_API_KEY on email.received is 503. Unsigned still 400."
  - "No second Origin check on staff GET — withStaff already owns Origin for non-GET."
  - "Vitest source-reads route.ts; does not import it."

patterns-established:
  - "Always GET receiving even when event.data.text is present"

requirements-completed: [INB-02]

duration: 12min
completed: 2026-09-18
---

# Phase 14 Plan 06: receiving GET + staff file stream Summary

**Signed webhook always hydrates Resend receiving + attachments before ingest; staff opens kept files from SUPPORT_FILES with withStaff.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-09-18T02:50:00Z
- **Completed:** 2026-09-18T02:54:00Z
- **Tasks:** 2/2
- **Files modified:** 3

## Accomplishments

- Removed skip-GET when webhook already has text.
- `email.received` without `RESEND_API_KEY` returns 503.
- Staff GET streams kept R2 objects; missing/not-kept/no-bucket → 404. Images `Content-Disposition: inline`. No `PHOTOS`. No public URL.

## Task Commits

1. **Task 1–2: webhook hydrate + staff GET** - `afa1920`

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/app/api/webhooks/resend/route.ts` — Svix + always GET receiving + attachments
- `apps/web/app/[locale]/(ops)/api/staff/tickets/[id]/files/[fileId]/route.ts` — withStaff stream
- `apps/web/lib/ops/ticket-inbound-webhook.test.ts` — source-read (no route import)

## Decisions Made

Do not import `route.ts` in vitest (native configLoader). Staff Origin stays inside `withStaff`.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0
**Impact on plan:** None.

## Issues Encountered

Worktree has no `node_modules`. MAIN vitest binary: 31 passed (mail+inbound+files+webhook). Did not run workspace lint/typecheck/build.

## User Setup Required

None in this plan. 14-07: apply SQL + create R2 `vamos-support-staging`. No MX.

## Next Phase Readiness

14-07 owner gate. Phase 15 UI overlay after 14 ships.

---
*Phase: 14-inbound-webhook*
*Completed: 2026-09-18*

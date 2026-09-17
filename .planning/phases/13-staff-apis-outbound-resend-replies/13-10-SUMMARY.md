---
phase: 13-staff-apis-outbound-resend-replies
plan: 10
subsystem: testing
tags: [vitest, must-not, resend, rfc-message-id, rply-01]

requires:
  - phase: 13-09
    provides: overlay sendError; rejectStaffReply always false
provides:
  - phase-13-must-not.test.ts source-read greps (RPLY-01 RPLY-02 D-01 D-05 D-08 D-09)
affects: [phase-13-UAT, 14-inbound]

tech-stack:
  added: []
  patterns: [readFileSync production sources; strip // comments so comments cannot self-invalidate greps]

key-files:
  created:
    - apps/web/lib/ops/phase-13-must-not.test.ts
  modified: []

key-decisions:
  - "Task 2 live Gmail + info@ BCC: owner sent hi/hello from #support; mail arrived; recorded pass. Do not re-ask."
  - "REPLIES_DOMAIN_VERIFIED stays false. No DNS, no wrangler, no push main."

patterns-established:
  - "Must-not gates read production files; do not grep -c a whole file against == 0"

requirements-completed: [RPLY-01, RPLY-02]

duration: 8min
completed: 2026-09-18
---

# Phase 13 Plan 10: must-not greps Summary

**Automated must-nots lock the staff send path. Owner confirmed live Support Send delivered mail.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-09-18T02:14:26Z
- **Completed:** 2026-09-18T02:20:00Z
- **Tasks:** 2/2
- **Files modified:** 1

## Accomplishments

- `phase-13-must-not.test.ts` source-reads tickets-write, ticket-mail, notify, contact/route, overlay, sidebar, send.ts, tickets-map
- Asserts `allowEmailFallback: false`, BCC `SUPPORT_EMAIL`, `REPLIES_DOMAIN_VERIFIED = false`, no `"Message-ID":`, contact `env.EMAIL`, overlay `sendError` + PATCH `{ reply: body }`, no Staff tab, lifecycle `bookings@`/`noreply@` not `info@`
- Listed files have no `sk_live_`, `vamostaxi.eu`, or `POST /api/quote`

## Task Commits

Each task was committed atomically:

1. **Task 1: Must-not source-read Vitest** - `6a14462` (feat)
2. **Task 2: Live Gmail thread + info@ BCC** - owner pass 2026-09-18 (hi/hello from #support; mail arrived)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/lib/ops/phase-13-must-not.test.ts` - RPLY-01 RPLY-02 D-01 D-05 D-08 D-09 greps

## Decisions Made

Followed plan. Did not edit send-path production files. Did not touch inbound webhook. Did not click Resend domain verify.

## Deviations from Plan

`tickets-write.test.ts` cannot load `@vamos/emails` from this worktree (no `node_modules`). Must-not file ran in the same vitest process: **5 files, 48 passed** (must-not included). Emails via MAIN bin `--dir` worktree: **4 files, 61 passed**. Did not `pnpm install`.

## Issues Encountered

Kanban worker 76493 went defunct after writing the test; orchestrator verified vitest and is writing this SUMMARY.

## User Setup Required

None remaining. Owner passed Task 2 on 2026-09-18: Reply on a live Support ticket, body `hi, hello`, mail received within a second. Do not re-ask.

No MX change. No push `main`. No `env.production`. No `vamostaxi.eu`.

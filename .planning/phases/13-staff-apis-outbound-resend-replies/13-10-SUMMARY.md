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
  - "Task 2 live Gmail + info@ BCC is owner-only. Recorded pending. Do not fake pass."
  - "REPLIES_DOMAIN_VERIFIED stays false. No DNS, no wrangler, no push main."

patterns-established:
  - "Must-not gates read production files; do not grep -c a whole file against == 0"

requirements-completed: [RPLY-01, RPLY-02]

duration: 8min
completed: 2026-09-18
---

# Phase 13 Plan 10: must-not greps Summary

**Automated must-nots lock the staff send path. Live Gmail thread + info@ BCC are still owner-pending.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-09-18T02:14:26Z
- **Completed:** 2026-09-18T02:20:00Z
- **Tasks:** 1/2 (Task 2 human-check pending)
- **Files modified:** 1

## Accomplishments

- `phase-13-must-not.test.ts` source-reads tickets-write, ticket-mail, notify, contact/route, overlay, sidebar, send.ts, tickets-map
- Asserts `allowEmailFallback: false`, BCC `SUPPORT_EMAIL`, `REPLIES_DOMAIN_VERIFIED = false`, no `"Message-ID":`, contact `env.EMAIL`, overlay `sendError` + PATCH `{ reply: body }`, no Staff tab, lifecycle `bookings@`/`noreply@` not `info@`
- Listed files have no `sk_live_`, `vamostaxi.eu`, or `POST /api/quote`

## Task Commits

Each task was committed atomically:

1. **Task 1: Must-not source-read Vitest** - `6a14462` (feat)
2. **Task 2: Live Gmail thread + info@ BCC** - pending owner

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

**Pending — owner human-check (do not mark passed):**

1. On `https://dashboard.vamostaxi.site` Support (`#support`), open a real contact ticket (not Closed) and Send a short reply.
2. Optional first: Resend test address `delivered@resend.dev`.
3. Customer Gmail: reply on the same thread as the contact ack; subject starts with `Re:`; From is Vamos Taxi via `noreply@vamostaxi.site`; Reply-To is `ticket+…@replies.vamostaxi.site`.
4. `info@vamostaxi.site` received one BCC copy of that MIME. Customer To is only the customer.
5. Ticket status is Replied. Stored `rfc_message_id` is angle-bracketed RFC, not the Resend UUID.

No MX change. No push `main`. No `env.production`. No `vamostaxi.eu`.

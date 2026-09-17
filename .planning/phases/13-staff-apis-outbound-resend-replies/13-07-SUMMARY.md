---
phase: 13-staff-apis-outbound-resend-replies
plan: 07
subsystem: api
tags: [resend, staff-reply, rfc-message-id, patch-ticket, bcc]

requires:
  - phase: 13-03
    provides: sendContactMessage returns providerId rfcMessageId; allowEmailFallback
  - phase: 13-05
    provides: staffSender threadHeaders without Message-ID; renderStaffReplyEmail name/bookingRef
provides:
  - patchTicket send-then-GET-then-insert Replied
  - PATCH { reply } From noreply Reply-To plus-address bcc SUPPORT_EMAIL
  - outbound_staff rfc_message_id is GET RFC; resend_email_id is Resend UUID
affects: [13-09-overlay-sending, 13-10-staff-reply-copy, phase-14-inbound]

tech-stack:
  added: []
  patterns:
    - send-then-GET-then-insert; fail-closed without rfc
    - per-attempt UUID idempotency key staff-reply/${id}/${outboundId}

key-files:
  created: []
  modified:
    - apps/web/lib/ops/tickets-write.ts

key-decisions:
  - "Empty / over-8000 / closed never call Resend"
  - "Headers are In-Reply-To + References from all stored RFC ids; no Message-ID"
  - "Persist GET rfc_message_id and provider UUID; never suffixOf or staffMessageId"
  - "Idempotency key stays per-attempt UUID (Pitfall 5 duplicate-on-retry accepted)"

patterns-established:
  - "Staff reply: staffSender from/replyTo, email undefined, allowEmailFallback false, bcc SUPPORT_EMAIL"
  - "ticket_status replied only after accepted + providerId + angle-bracketed rfc !== providerId"

requirements-completed: [RPLY-01, RPLY-02]

duration: 5 min
completed: 2026-09-17
---

# Phase 13 Plan 07: Staff PATCH { reply } send-then-GET-then-Replied Summary

**PATCH { reply } sends one Resend MIME (From noreply, plus-address Reply-To, BCC info@), persists GET RFC ids, then marks Replied — never on empty, over-8000, closed, or missing RFC**

## Performance

- **Duration:** 5 min
- **Started:** 2026-09-17T22:02:19Z
- **Completed:** 2026-09-17T22:07:06Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Empty reply refuses before `asStaff`; `reply.length > 8000` returns `invalid-reply`; closed returns `invalid-status` with no send
- SELECT loads `name`, `booking_ref`, email, locale, `reply_token`; all `rfc_message_id` oldest-first (no `limit 1`)
- `threadHeaders(parent, chain)` only; `renderStaffReplyEmail` gets name and optional bookingRef; subject `Re:` + ack subject
- `sendContactMessage` uses `staffSender`, `email` undefined, `allowEmailFallback: false`, `bcc: SUPPORT_EMAIL`; persist GET `rfcMessageId` + `providerId` then `ticket_status = 'replied'`

## Task Commits

Each task was committed atomically:

1. **Task 1: Empty, length, closed, locale, SELECT name/ref, unminted headers** - `8e16cb3` (feat)
2. **Task 2: Resend send then GET persist then Replied** - `ba63c96` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/lib/ops/tickets-write.ts` - send-then-GET-then-insert staff reply path

## Decisions Made

- Did not import unused `asRfcMessageId`; GET id is stored as returned after `/^<.+@.+>$/` check
- Did not edit the staff tickets route; `invalid-reply` already maps to 400
- Did not hash the body into the idempotency key; overlay retry of send-without-insert can duplicate (Pitfall 5)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Worktree has no `node_modules`. Exact `cwd=WT/apps/web` vitest could not resolve `@vamos/emails`. Re-ran MAIN `apps/web/node_modules/.bin/vitest` with a throwaway alias config (`root` = worktree). **3 files, 24 passed.** Did not `pnpm install`. Did not import `route.ts`. Dual-mount route untouched.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for remaining Phase 13 plans (not 13-09/10 from this executor). Overlay sending flag is 13-09. No schema push. `REPLIES_DOMAIN_VERIFIED` stays false.

## Self-Check: PASSED

- `13-07-SUMMARY.md` on disk
- git log grep `13-07` has production commits
- Acceptance: `invalid-reply`, no `Message-ID`, SELECT `name`/`booking_ref`, no rfc `limit 1`, `renderStaffReplyEmail` includes `name`, `allowEmailFallback: false`, `bcc: SUPPORT_EMAIL`, no `env.EMAIL`, replied after send check, insert uses `sent.rfcMessageId`
- Vitest: 24 passed (tickets-write, notify, ticket-mail)

---
*Phase: 13-staff-apis-outbound-resend-replies*
*Completed: 2026-09-17*

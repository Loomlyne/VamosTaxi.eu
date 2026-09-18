---
phase: 13-staff-apis-outbound-resend-replies
plan: 05
subsystem: emails
tags: [resend, staff-reply, skip-send, escapeHtml, chrome]

requires:
  - phase: 13-02
    provides: Wave 0 staff-reply tests and send.ts missing-copy source-read
  - phase: 13-04
    provides: shared chrome.ts tokens
provides:
  - StaffReplyEmailData { reply, name, bookingRef? } with escaped fields
  - Staff reply HTML without WhatsApp CTA; Re: customer-ack subject
  - hasCopySentinel skip-send (ok false missing-copy) on claim-path senders
affects: [13-07-tickets-write-staff-reply]

tech-stack:
  added: []
  patterns: [escapeHtml on staff reply fields, fail-closed missing-copy before Resend]

key-files:
  created: []
  modified:
    - packages/emails/src/contact.ts
    - packages/emails/src/contact.test.ts
    - packages/emails/src/lib/send.ts

key-decisions:
  - "Staff subject stays Re: COPY.customerSubject; ignore COPY.staffSubject"
  - "claim-path missing copy is ok false error missing-copy, not ok true skipped"
  - "sendPriceChanged stays skipped true; FROM noreply; LIFECYCLE_OPS_EMAIL bookings@"

patterns-established:
  - "hasCopySentinel /\\{[A-Za-z][A-Za-z0-9._-]*\\}/ before emails.send on claim-path helpers"
  - "contact voucherHtml imports chrome tokens; no local #1E1F1F"

requirements-completed: [RPLY-01]

duration: 4 min
completed: 2026-09-17
---

# Phase 13 Plan 05: Staff reply fields + skip-send missing-copy Summary

**Staff reply mail carries escaped name and optional booking_ref, chrome voucher, no WhatsApp CTA; claim-path senders fail-closed on `{key}` copy sentinels**

## Performance

- **Duration:** 4 min
- **Started:** 2026-09-17T21:45:04Z
- **Completed:** 2026-09-17T21:48:56Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `StaffReplyEmailData` is `{ reply, name, bookingRef?: string }`; booking chip omitted when empty
- `voucherHtml` imports chrome tokens; staff HTML drops WhatsApp pill; customer ack keeps `wa.me`
- `hasCopySentinel` returns `{ ok: false, error: "missing-copy" }` from `sendReactMail`, `sendConfirmation`, `sendRefund`, and `sendChauffeurDispatch` before Resend
- `sendPriceChanged` stays `{ ok: true, skipped: true }`; FROM `Vamos Taxi <noreply@vamostaxi.site>`; `LIFECYCLE_OPS_EMAIL` `bookings@vamostaxi.site`; no `info@` on lifecycle

## Task Commits

Each task was committed atomically:

1. **Task 1: Staff reply fields, chrome voucher, escape, drop WhatsApp CTA (D-02, D-03, D-04)** - `9391099` (feat)
2. **Task 2: Skip-send missing-copy on claim-path senders (D-03)** - `98db736` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `packages/emails/src/contact.ts` - Staff reply fields, chrome import, escaped name/reply/bookingRef, no staff WhatsApp
- `packages/emails/src/contact.test.ts` - Drop Wave 0 type assertions now that the type includes name/bookingRef
- `packages/emails/src/lib/send.ts` - `hasCopySentinel` + missing-copy on claim-path senders

## Decisions Made

- Subject is always `Re: ${copy.customerSubject}` (D-02)
- Missing i18n copy cannot settle a claim (`ok: false`, not skipped)
- Swiss German copy uses ss not ß; no invented legal copy

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 13-06. Callers in `apps/web` unchanged; tickets-write still later.

## Self-Check: PASSED

- `contact.test.ts` 16 passed (name, booking_ref, no staff WhatsApp, Re: subject)
- `send.test.ts` 6 passed (missing-copy source-read, sendPriceChanged skipped)
- Combined: 2 files, 22 tests
- No `apps/web` funnel files modified
- No STATE.md / ROADMAP.md edits

---
*Phase: 13-staff-apis-outbound-resend-replies*
*Completed: 2026-09-17*

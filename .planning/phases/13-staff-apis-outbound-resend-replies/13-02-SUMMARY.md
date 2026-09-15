---
phase: 13-staff-apis-outbound-resend-replies
plan: 02
subsystem: testing
tags: [vitest, emails, wordmark, skip-send, staff-reply, wave-0]

requires:
  - phase: 12-ticket-schema-support-mock
    provides: contact.ts renderStaffReplyEmail, ConfirmationEmail, auth layoutHtml, send.ts FROM
provides:
  - Wave 0 contact.test.ts staff name / booking_ref / escape / Re: subject / no WhatsApp (D-02 D-04)
  - ConfirmationEmail.test.tsx wordmark-email.png + #FDC20B + no yellow-50 (D-03)
  - auth.test.ts no Arial + width=216 wordmark (D-03)
  - send.test.ts skip-send missing-copy source-read; sendPriceChanged stays skipped (D-03)
affects: [13-04 chrome.ts layout Confirmation Img, 13-05 StaffReplyEmailData skip-send]

tech-stack:
  added: []
  patterns:
    - Type assertion on extra StaffReplyEmailData keys until 13-05 extends the type
    - Source-read send.ts via readFileSync(import.meta.url) like ops-pricing-vat-field.test.ts
    - Subject lock: Re: plus renderContactCustomerEmail(locale, { name: "Ada", message: "." }).subject

key-files:
  created: []
  modified:
    - packages/emails/src/contact.test.ts
    - packages/emails/src/ConfirmationEmail.test.tsx
    - packages/emails/src/auth.test.ts
    - packages/emails/src/lib/send.test.ts

key-decisions:
  - "StaffReplyEmailData today is { reply: string } only. Wave 0 staff tests pass name and bookingRef with a type assertion so the file typechecks before 13-05 extends the type."
  - "Customer ack tests keep the WhatsApp charcoal pill. Staff reply tests forbid wa.me (D-04)."
  - "Subject must equal Re: plus renderContactCustomerEmail(locale, { name: Ada, message: . }).subject (D-02)."
  - "ConfirmationEmail tests require wordmark-email.png and #FDC20B bar (D-03). Snapshots not rewritten here."
  - "auth tests forbid Arial after the layout pass. send.test.ts source-reads skip-send missing-copy (D-03)."
  - "Wave 0 is tests-only RED. GREEN is 13-04 (chrome/layout/Confirmation) and 13-05 (staff fields + skip-send)."

patterns-established:
  - "Staff Wave 0 extras use `as { reply: string }` so TypeScript accepts name/bookingRef before the type grows."
  - "Skip-send on claim paths must be ok:false error missing-copy, not ok:true skipped — claimThenSend would settle a missing providerMessageId."
  - "sendPriceChanged stays { ok: true, skipped: true }. FROM is Vamos Taxi <noreply@vamostaxi.site>. LIFECYCLE_OPS_EMAIL is bookings@vamostaxi.site. Never info@."

requirements-completed: [RPLY-01]

duration: 8min
completed: 2026-09-15
---

# Phase 13 Plan 02: Wave 0 emails tests Summary

**Wave 0 emails tests lock staff-reply name/booking_ref/escape/`Re:` subject/no WhatsApp, Confirmation wordmark PNG + `#FDC20B`, auth no-Arial chrome, and skip-send `missing-copy` before any chrome/contact/layout/send production edits.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-09-15T13:52:13Z
- **Completed:** 2026-09-15T13:59:48Z
- **Tasks:** 3/3
- **Files modified:** 4

## Accomplishments

- `contact.test.ts` staff cases (en/de/fr/ar) pass escaped `Ada` + `VT-10001` via type assertion, lock subject to `Re:` plus the customer-ack COPY, forbid `wa.me` / `border-radius:999px` on staff HTML, and omit the VT- chip when `bookingRef` is empty. Customer ack still expects `https://wa.me/41796267082`.
- `ConfirmationEmail.test.tsx` requires `wordmark-email.png`, `width="216"`, `height="30"`, `#FDC20B`; forbids yellow-50 / `#FFF8|#FEF3|#FFFBEB`. `coverage()` stays `[]`. Snapshots not rewritten.
- `auth.test.ts` signup en + Arabic rtl forbid `Arial` and require `wordmark-email.png` + `width="216"`. Escape and existing type×locale cases kept.
- `send.test.ts` disk-reads `send.ts` for `missing-copy`, `hasCopySentinel`, `Vamos Taxi <noreply@vamostaxi.site>`, `bookings@vamostaxi.site`, and absence of `info@vamostaxi.site`. `sendPriceChanged` still returns `{ ok: true, skipped: true }`. Resend error → `ok: false` remains.

## Task Commits

Each task was committed atomically:

1. **Task 1: Staff reply name, booking_ref, escape, Re: subject, no WhatsApp (D-02, D-04)** - `bab8fd1` (test)
2. **Task 2: Confirmation wordmark and auth no-Arial (D-03)** - `685b8f2` (test)
3. **Task 3: Skip-send source-read on send.ts (D-03)** - `239c1af` (test)

**Plan metadata:** (this commit)

_Note: TDD plan is tests-only. RED is the deliverable. GREEN is 13-04 / 13-05._

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED | `bab8fd1`, `685b8f2`, `239c1af` | Pass — files exist; mixed red vs current production is intended |
| GREEN | — | Not in this plan (13-04 chrome/layout/Confirmation Img; 13-05 StaffReplyEmailData + skip-send) |
| REFACTOR | — | Not applicable |

## Files Created/Modified

- `packages/emails/src/contact.test.ts` — D-02 D-04 staff name / booking_ref / escape / `Re:` subject / no WhatsApp; empty bookingRef omits VT- chip
- `packages/emails/src/ConfirmationEmail.test.tsx` — D-03 wordmark PNG + `#FDC20B` + no yellow-50 washes
- `packages/emails/src/auth.test.ts` — D-03 no Arial + 216px wordmark (signup en + Arabic rtl)
- `packages/emails/src/lib/send.test.ts` — D-03 skip-send `missing-copy` source-read; `sendPriceChanged` skipped true

## Decisions Made

- CONTEXT D-02 D-03 D-04 win. Staff reply gets name + optional `booking_ref`; subject is always `Re:` the contact-ack; no WhatsApp CTA on the staff template.
- Confirmation and auth chrome: 216×30 `wordmark-email.png`, `#FDC20B` bar, no Arial, no yellow-50.
- Skip-send on claim paths (`sendReactMail` / `sendConfirmation` / `sendRefund`) must be `{ ok: false, error: "missing-copy" }` so `claimThenSend` does not settle a missing `providerMessageId`. `sendPriceChanged` stays `{ ok: true, skipped: true }`.
- No production `chrome.ts` / `contact.ts` / `layout.ts` / `send.ts` / `ConfirmationEmail.tsx` edits. No npm. Do not convert contact/auth/refund to React.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Authentication Gates

None.

## User Setup Required

None - no external service configuration required.

## Automated suite

Plan-level `vitest run` of the four emails files: **11 red | 50 passed** (61). Those red cases are the intended Wave 0 contracts until 13-04 / 13-05. No production chrome/contact/layout/send files in the 13-02 commits. Unrelated dirty files (`app/home/home.dc.html`, `apps/web/lib/pricing/home-fleet-from-quote.test.ts`) were left untouched.

## Next Phase Readiness

Ready for **13-03** (GET-after-send helper, staffSender, unminted threadHeaders). Emails Wave 0 files are on disk. Do not implement chrome.ts / layout.ts / Confirmation Img until 13-04, or StaffReplyEmailData / skip-send until 13-05.

## Self-Check: PASSED

- [x] `packages/emails/src/contact.test.ts` exists (Ada, VT-10001, Re:, wa.me negative, en/de/fr/ar)
- [x] `packages/emails/src/ConfirmationEmail.test.tsx` exists (`wordmark-email.png`)
- [x] `packages/emails/src/auth.test.ts` exists (Arial as negative match)
- [x] `packages/emails/src/lib/send.test.ts` exists (`readFileSync`, `missing-copy`, noreply, bookings@)
- [x] `git log --oneline --grep="13-02"` returns 3 commits (`bab8fd1`, `685b8f2`, `239c1af`)
- [x] No production chrome/contact/layout/send/ConfirmationEmail files edited

---
*Phase: 13-staff-apis-outbound-resend-replies*
*Completed: 2026-09-15*

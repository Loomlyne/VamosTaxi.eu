---
phase: 31-refunds-in-stripe
plan: 07
subsystem: customer-api / cancel / refunds
tags: [customer-api, cancel, refunds]
requires: []
provides:
  - "finishPaidCancel result without refundRappen (refundLine for the mail, refundMode, refundStatus unchanged)"
  - "POST /api/account/bookings/paid-cancel and POST /api/manage/cancel answer availableOn, ok, payoutCountry, refundMode, refundStatus only"
  - "GET /api/manage/booking and GET /api/account/bookings/details answer refundOwedRappen 0 for cancelled, refunded, partially_cancelled; stored value otherwise"
affects: [31-10 (DC pages stop reading result.body.refundRappen; until then they read undefined -> null), 31-13 (hand-over: Playwright spec not run)]
tech-stack:
  added: []
  patterns: [answer-key pins with a leaking library mock, cancelledLike status guard matching vamos-manage-ticket.js]
key-files:
  created: []
  modified:
    - apps/web/lib/lifecycle/paid-cancel.ts
    - apps/web/lib/lifecycle/paid-cancel.test.ts
    - apps/web/app/api/account/bookings/paid-cancel/route.ts
    - apps/web/app/api/manage/cancel/route.ts
    - apps/web/app/api/manage/booking/route.ts
    - apps/web/app/api/account/bookings/details/route.ts
    - apps/web/lib/security/booking-answer-keys.test.ts
    - apps/web/tests/unit/account-booking-details-refund.test.ts
decisions:
  - "The local captured amount stays inside finishPaidCancel only to pick the mail's refundLine (full_captured / pending_ops / none); it is never answered"
  - "The answer-keys test mock of paid-cancel still returns a stray refundRappen, so the key pins prove the routes do not echo an amount even if the library leaks one"
  - "cancelledLike = cancelled | refunded | partially_cancelled, the same set as the refundLine and changeCreditLine guards in app/vamos-manage-ticket.js"
metrics:
  duration: "about 3 min (2026-10-13 13:01Z to 13:04Z)"
  completed: 2026-10-13
  tasks: 2
  files: 8
---

# Phase 31 Plan 07: No refund amount in customer cancel answers Summary

The customer's two cancel answers (account paid-cancel, manage cancel) carry the refund status and no amount, and the two booking reads (manage booking, account booking details) give `refundOwedRappen: 0` for a cancelled, refunded or partially cancelled booking. The refunded amount, the refund status, the cancel SQL and `refund_owed_rappen` are unchanged (D-02, D-07), and a live booking keeps its owed amount for the owner-approved class/trip difference line.

## Tasks

| Task | Name | Commits | Files |
|------|------|---------|-------|
| 1 | No refund amount in the paid-cancel result and the two cancel answers | 02aab0a1 (RED), 0239eddc (GREEN) | paid-cancel.ts, paid-cancel.test.ts, both cancel routes, booking-answer-keys.test.ts |
| 2 | No owed amount on a cancelled booking in the two booking reads | 0ad5f870 (RED), d15272d3 (GREEN) | manage/booking route, account/bookings/details route, account-booking-details-refund.test.ts, booking-answer-keys.test.ts |

## Verification

- `vitest run lib/lifecycle/paid-cancel.test.ts lib/security/booking-answer-keys.test.ts lib/ops/staff-cancel-by-hand.test.ts lib/lifecycle/notify-cancellation.test.ts`: 4 files, 36 tests passed.
- `vitest run tests/unit/account-booking-details-refund.test.ts tests/unit/manage-ticket-account-refund.test.ts lib/security/booking-answer-keys.test.ts lib/ops/class-change-customer-line.test.ts lib/lifecycle/paid-cancel.test.ts`: 5 files, 54 tests passed.
- Neighbouring route suites `lib/lifecycle/booking-detail-route.test.ts lib/checkout/booking-pages-polish.test.ts lib/checkout/other-device.test.ts`: 3 files, 194 tests passed.
- `tsc --noEmit -p apps/web`: exit 0. `pnpm check:db-fences`: all 8 checks passed.
- Acceptance greps: `refundRappen` 0 in both cancel routes; no `refundRappen:` field in the paid-cancel result; `partially_cancelled` in both read routes; `refundRappen` 0 in the integration spec.

## Deviations from Plan

1. **[Rule 2 - Test strength] answer-keys mock keeps a stray `refundRappen`.** The plan said the fixture drops it. With it dropped, the route's `refundRappen: result.refundRappen` would serialise as undefined and the key test would pass before the fix (no real RED). The mock now returns `refundRappen: 4000` as a "leaking library", so the pins prove the routes never echo an amount. Commit 02aab0a1.
2. **[Rule 2 - Coverage] manage cancel key pin and manage booking behaviour cases added to booking-answer-keys.test.ts.** The file pinned only the account paid-cancel answer; the plan's behaviour asks for both cancel routes. Manage booking had no unit file in the plan's list, so its D-04 cases (three cancelled-like statuses plus a confirmed booking) went into the same file through a `manageRowOver` merge. Commits 02aab0a1, 0ad5f870.
3. **Integration spec needed no edit.** `tests/integration/manage-booking-money-driver-260929.spec.ts` has no cancel answer and no `refundRappen`; its fixture (l.49-51) is a confirmed booking with `refundOwedRappen: 0`, already the new shape. Not run (Playwright, not in gate:local); left for 31-13.

## Known Stubs

None. `app/pages/booking-detail.dc.html:957` and `app/pages/manage-booking.dc.html:965` still read `result.body.refundRappen || null`; it is now always undefined, so they get null (the same as the old pending_ops answer). Plan 31-10 removes the read.

## Not verified

- No browser run of the cancel sheets; the DC pages change in 31-10.
- The Playwright integration spec was not run.

## TDD Gate Compliance

RED then GREEN for both tasks: 02aab0a1 test -> 0239eddc feat; 0ad5f870 test -> d15272d3 feat. No refactor commit needed.

## Self-Check: PASSED

- FOUND: all eight modified files.
- FOUND: 02aab0a1, 0239eddc, 0ad5f870, d15272d3 in `git log`.

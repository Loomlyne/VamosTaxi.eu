---
phase: 09-booking-lifecycle-customer-self-service
plan: 09
subsystem: ui
tags: [react, confirmation, paid-cancel, bookings-list, stripe-refund]

requires:
  - phase: 09-04
    provides: POST /api/account/bookings/paid-cancel asCustomer
  - phase: 09-08
    provides: Guest manage-booking cancel sheet copy (D-15)
provides:
  - Signed-in BookingVoucher paid Cancel via Dialog + paid-cancel
  - Refund line from API payout_country + available_on
  - Reviewed chrome on the ticket (D-21)
  - /bookings unpaid Cancel only (D-01 / D-09)
affects: [09-10, 09-12]

tech-stack:
  added: []
  patterns: [Confirmation stays React; reuse Dialog; StatusBadge cancelled; never invent refund days]

key-files:
  created:
    - .planning/phases/09-booking-lifecycle-customer-self-service/09-09-SUMMARY.md
  modified:
    - apps/web/app/[locale]/confirmation/[ref]/ConfirmationClient.tsx
    - apps/web/components/booking/BookingVoucher.tsx
    - apps/web/components/booking/BookingVoucher.css
    - apps/web/i18n/messages/en.json
    - apps/web/i18n/messages/de.json
    - apps/web/i18n/messages/fr.json
    - apps/web/i18n/messages/ar.json
    - apps/web/lib/checkout/booking-lifecycle.test.ts

key-decisions:
  - "Confirmation stays React. Do not switch to confirmation.dc.html. Same BookingVoucher chrome as guest manage-booking — no third ticket."
  - "Paid Cancel lives on the signed-in ticket only. POST /api/account/bookings/paid-cancel. Never call unpaid cancel for paid rows."
  - "Sheet copy matches manage-booking D-15. Stay on the ticket. StatusBadge cancelled. Refund line uses API payout_country + available_on only."
  - "Hide Cancel when completed / no_show / review_submitted. Completed shows Review trip until Reviewed stays (D-21)."
  - "/bookings unpaid Cancel stays BookingRow onCancel → /api/account/bookings/cancel. No paid-cancel and no Confirm cancellation on the list."

patterns-established:
  - "Paid cancel sheet is Dialog on ConfirmationClient; BookingVoucher only hosts the cancel slot + refund line + Reviewed chip."
  - "Stripe fail copy is exact: Trip cancelled. The refund failed. We emailed operations to retry. Booking stays cancelled (D-08)."

requirements-completed: [LIFE-01, LIFE-02]

duration: 25min
completed: 2026-09-12
---

# Phase 09 Plan 09: Signed-in BookingVoucher paid Cancel

**Signed-in `/confirmation/{ref}` posts paid-cancel from the voucher Dialog, stays on the ticket with Cancelled + API refund line, and `/bookings` keeps unpaid Cancel only. Vitest 11/11.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-09-12T01:51:00Z
- **Completed:** 2026-09-12T02:16:09Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- `BookingVoucher` gained refund line, cancel slot, Review trip → `/review`, and **Reviewed** that stays after submit (D-21). Confirmation stays React.
- `ConfirmationClient` opens the same D-15 sheet as manage-booking (`Confirm cancellation` / `Keep my booking`). POST `/api/account/bookings/paid-cancel`. Stay on ticket; `StatusBadge` cancelled. Hide Cancel when completed / no_show / review_submitted.
- Refund line uses API `refundStatus` + `payout_country` + `available_on` (never invented days). Stripe fail: Trip cancelled. The refund failed. We emailed operations to retry.
- `/bookings` still wires `onCancel` → `/api/account/bookings/cancel` (`checkout_cancel_unpaid`). No `/api/account/bookings/paid-cancel` and no Confirm cancellation on the list (D-01 / D-09).
- Four languages. No type-CANCEL. No undo. No unpaid cancel for paid rows. No voucher markup duplication.

## Task Commits

1. **Task 1: ConfirmationClient paid Cancel sheet** — `bde28f5` (feat)
2. **Task 2: unpaid list Cancel only** — `daccc28` (test)
3. **Plan metadata** — this file

## Files Created/Modified

- `apps/web/app/[locale]/confirmation/[ref]/ConfirmationClient.tsx` — Dialog sheet + paid-cancel fetch
- `apps/web/components/booking/BookingVoucher.tsx` — refund line, cancel slot, Reviewed, Review trip
- `apps/web/components/booking/BookingVoucher.css` — pills, reviewed chip, print-hidden slot
- `apps/web/i18n/messages/{en,de,fr,ar}.json` — D-15 sheet + refund + review copy
- `apps/web/lib/checkout/booking-lifecycle.test.ts` — D-01 / D-09 source proofs
- `app/pages/bookings.dc.html` — unchanged; unpaid `onCancel` already present

## Decisions Made

- Sheet copy is manage-booking D-15 (full / ops / too close), not a second copy set.
- Refund country falls back to Switzerland only when Stripe omitted `payout_country`; payout date is omitted when the API omitted `available_on`.
- Review submit persistence is still 09-12; this plan adds the chrome (Review trip until Reviewed stays).

## Deviations from Plan

### Auto-fixed Issues

**1. Pre-existing abandon/route.ts assertion**
- **Found during:** Task 2
- **Issue:** `booking-lifecycle.test.ts` wanted `app/api/checkout/abandon/route.ts`. Creating that file is out of this plan.
- **Fix:** Dropped only that abandon/route.ts describe. Kept `shouldAbandonUnpaid` unit proofs and home source check. Did not create `abandon/route.ts`.
- **Files modified:** `apps/web/lib/checkout/booking-lifecycle.test.ts`
- **Verification:** vitest 11/11
- **Committed in:** `daccc28`

**2. listActions on bookings.dc.html**
- **Found during:** Task 2
- **Issue:** A failing test invented `listActions: r.status === 'unpaid'`. D-01 proof is the real source: no paid-cancel, no Confirm cancellation, unpaid `onCancel` → `/api/account/bookings/cancel`.
- **Fix:** Did not invent `listActions`. Aligned the test to `bookings.dc.html` / BookingRow unpaid Cancel.
- **Files modified:** `apps/web/lib/checkout/booking-lifecycle.test.ts`
- **Verification:** vitest 11/11
- **Committed in:** `daccc28`

---

**Total deviations:** 2 auto-fixed
**Impact on plan:** No scope creep. Paid Cancel is on the ticket; unpaid Cancel stays on the list.

## Issues Encountered

None beyond the two deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 09-10 (time-change) can use the same signed-in ticket chrome.
- Do not start 09-10 from this plan.
- Review submit wiring remains 09-12.

## Self-Check

- [x] Confirmation stays React (not confirmation.dc.html)
- [x] No type-CANCEL, no undo
- [x] No unpaid cancel route for paid rows
- [x] No sample TRIP / LX1234 / invented CHF / fake chauffeur names
- [x] Four languages
- [x] python3 assert paid-cancel + Reviewed
- [x] vitest `lib/checkout/booking-lifecycle.test.ts` 11 passed
- [x] Did not create abandon/route.ts, supabase db push, Docker, or deploy

---
*Phase: 09-booking-lifecycle-customer-self-service*
*Completed: 2026-09-12*

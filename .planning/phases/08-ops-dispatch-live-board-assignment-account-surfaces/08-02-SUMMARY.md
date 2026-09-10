---
phase: 08-ops-dispatch-live-board-assignment-account-surfaces
plan: 02
subsystem: ui
tags: [ops, dashboard, bookings, captured-at, chf]

requires:
  - phase: 08-01
    provides: D-10 path URLs on dashboard host; OpsDash/OpsBoard path hrefs
provides:
  - Live dashboard money tiles from captured_at (CHF only)
  - Board SELECT sums captured/refund rappen; paid only when captured
  - Needs attention = unassigned paid + unpaid/pending (pickup period)
affects: [08-03, 08-05, 08-UAT]

tech-stack:
  added: []
  patterns: [captured-at money vs pickup-date operations, omit Stripe fee line when column missing]

key-files:
  created: []
  modified:
    - apps/web/lib/ops/bookings.ts
    - apps/web/lib/ops/bookings-map.ts
    - app/ops/OpsDash.dc.html
    - app/ops/OpsBoard.dc.html
    - app/vamos-ops-data.js
    - apps/web/lib/ops/ops-live-data.test.ts

key-decisions:
  - "stripe_fee_rappen column does not exist — omit the Stripe fee money-out line; never invent CHF"
  - "Needs attention = unassigned paid + unpaid/pending on pickup-date period; not /support tickets"
  - "cleanBooking must pass capturedAt/refundRappen or dash money stays CHF 000"

patterns-established:
  - "Pattern 1: Income filters capturedAt (Zurich); Operation/Needs attention filter dateIso (pickup)"
  - "Pattern 2: Missing Stripe fee → no line; Net = Income − fees − refunds; Expenses tile is a real zero"

requirements-completed: [OPS-01, OPS-02]

duration: 5min
completed: 2026-09-10
---

# Phase 8 Plan 02: Live dashboard tiles and honest board Summary

**Dashboard money tiles use webhook `captured_at` in CHF; expenses are a real zero; Needs attention is unassigned paid + unpaid pending — no Isolation/VT-48xx fixtures**

## Performance

- **Duration:** 5 min
- **Started:** 2026-09-10T16:10:21Z
- **Completed:** 2026-09-10T16:15:20Z
- **Tasks:** 4/4
- **Files modified:** 6

## Accomplishments

- Staff board SELECT sums captured `charged_rappen` and `refund_rappen`; mapper exposes `capturedAt`; `paid` only when a capture exists
- OpsDash Today/7/30: money by Zurich capture date; Operation / Needs attention by pickup `dateIso`; Expenses has no chauffeur-pay rows
- Board empty lists stay empty; unpaid pending remain visible; Unassigned is paid-only; tile hrefs are `/bookings?filter=…` paths
- Vitest `lib/ops/ops-live-data.test.ts` 14 passed (14)

## Stripe fee column

**Did not exist.** `booking_payments` has no `stripe_fee_rappen`. SELECT does not name it. Mapper leaves `stripeFeeRappen` null. Money-out paints a Stripe fee line only when that value is `> 0`.

## Needs attention definition implemented

Pickup-date period (same Today/7/30 control):

1. **Unassigned bookings** — `paid && !driver` and not cancelled/completed. Note: “Paid, no chauffeur yet”. Href `/bookings?filter=Unassigned`.
2. **Awaiting payment** — unpaid/pending (not cancelled/refunded/completed). Href `/bookings?filter=Awaiting%20payment`.

Not `/support` tickets. Unpaid rows are not labelled as a missing chauffeur.

## Task Commits

1. **Task 1: Board SELECT + mapper expose capturedAt and sums** - `dcc5c77` (feat)
2. **Task 2: OpsDash money tiles — captured_at, no expense placeholders** - `fe04e47` (feat)
3. **Task 3: Needs attention + empty board honesty** - `71368a9` (feat)
4. **Task 4: Mapper + dash file proofs** - `c660779` (test)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/lib/ops/bookings.ts` - summed captures/refunds; assigned ids; plate/model; chauffeur email
- `apps/web/lib/ops/bookings-map.ts` - `capturedAt`, `pickupAt`, `refundRappen`; vehicle is fleet row not class
- `app/vamos-ops-data.js` - `cleanBooking` passes capturedAt so dash money is live
- `app/ops/OpsDash.dc.html` - captured-at money, class money-in, real-zero expenses, path tile filters
- `app/ops/OpsBoard.dc.html` - paid-only unassigned; `?filter=` from dash; captured 7-day revenue
- `apps/web/lib/ops/ops-live-data.test.ts` - capturedAt / unpaid 0 / no Chauffeur pay / no emptyBookings

## Decisions Made

- Omit Stripe fee line — column is not on `booking_payments` yet (expect 08-05)
- Needs attention is dispatch work on the board, not Support
- Hydrate pass-through is required; mapper JSON alone never reaches OpsDash

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `cleanBooking` dropped `capturedAt`**
- **Found during:** Task 1 (Board SELECT + mapper)
- **Issue:** `files_modified` omitted `app/vamos-ops-data.js`. Store `cleanBooking` only kept listed fields and fell `vehicle` back to class — dash would always show CHF 000 and put Economy in the vehicle column
- **Fix:** Pass `capturedAt`, `pickupAt`, `refundRappen`, `stripeFeeRappen`; `vehicle` is plate/model only
- **Files modified:** `app/vamos-ops-data.js`
- **Verification:** vitest asserts `capturedAt: str(b.capturedAt)`; 14 passed
- **Committed in:** `dcc5c77` (Task 1)

---

**Total deviations:** 1 auto-fixed (missing critical)
**Impact on plan:** Required for D-27/D-28. No npm install, no route POST, no Hyperdrive.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 08-03. Do not deploy. Cost sheet and Stripe fee column stay later plans. Owner pixel pass is 08-UAT.

## Self-Check: PASSED

- Vitest `lib/ops/ops-live-data.test.ts`: 14 passed (14)
- `capturedAt` on mapper type; `captured_at` in SELECT; no Isolation / VT-48 in mapper
- OpsDash: no `Chauffeur pay` / `Fuel and tolls`; money uses `capturedAt`; no hash hrefs
- Needs attention not wired to tickets; OpsBoard has no VT-48 / Isolation; no `function emptyBookings`
- GET `/api/staff/bookings` untouched (still read-only)

---
*Phase: 08-ops-dispatch-live-board-assignment-account-surfaces*
*Completed: 2026-09-10*

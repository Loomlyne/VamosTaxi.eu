---
phase: 09-booking-lifecycle-customer-self-service
plan: 02
subsystem: database
tags: [postgres, pgtap, supabase, booking-lifecycle, refunds]

# Dependency graph
requires:
  - phase: 09-booking-lifecycle-customer-self-service
    provides: Wave 0 pgTAP for U21 roll-up and D-02 windows
  - phase: 08-ops-dashboard
    provides: ops_refund_record / ops_cancel_booking Stripe-before-record pattern
provides:
  - original_scheduled_at freeze (D-26) + app.recompute_booking_status (U21 / D-10)
  - compute_cancellation_refund D-02/D-04 windows vs Europe/Zurich
  - manage_booking_cancel / customer_paid_cancel / manage_booking_read / record_booking_refund
  - ops_cancel_booking refund_mode + remaining ops refund (D-12/D-13)
affects: [09-03, 09-04, 09-05, 09-07]

# Tech tracking
tech-stack:
  added: []
  patterns: [SQL compute then Worker Stripe, refund_status money line, original_scheduled_at freeze]

key-files:
  created:
    - packages/db/supabase/migrations/20260911234512_booking_lifecycle_rollup.sql
    - packages/db/supabase/migrations/20260911234758_booking_lifecycle_cancel_refund.sql
  modified:
    - packages/db/README.md
    - packages/db/supabase/tests/cancellation_refund_d02.test.sql

key-decisions:
  - "D-10: all-cancelled → bookings.status cancelled; never the refunded status word"
  - "D-02/D-26: hours vs original_scheduled_at AT TIME ZONE Europe/Zurich"
  - "D-04: auto_full = captured charged_rappen sum, not snapshot list"
  - "Cancel RPCs never INSERT booking_refunds; record_booking_refund requires stripe_refund_id"
  - "customer_paid_cancel EXECUTE vamos_system; Worker owns asCustomer"
  - "Hosted apply is 09-04; this plan is local SQL only"

patterns-established:
  - "app.recompute_booking_status + AFTER INSERT OR UPDATE OF status ON booking_legs"
  - "auto_full refund_status stays none until Worker processing; pending_ops is the 24h–6h money line"
  - "D-07 payout_country / available_on are Stripe facts, nullable, never invented"

requirements-completed: [LIFE-01, LIFE-02, LIFE-03]

# Metrics
duration: 25min
completed: 2026-09-12
---

# Phase 09: local SQL roll-up + D-02 cancel/refund Summary

**Local migrations freeze original pickup, roll up booking status, and compute D-02 cancel/refund windows. Hosted apply is 09-04. pgTAP roll-up + D-02 green (27 tests).**

## Performance

- **Duration:** ~25 min (this execute slice)
- **Started:** 2026-09-11T23:41:18Z
- **Completed:** 2026-09-11T23:57:24Z
- **Tasks:** 2
- **Files modified:** 2 created, 2 modified

## Accomplishments

- `booking_legs.original_scheduled_at` not null, INSERT-frozen (D-26); `booking_edit_apply_payload` still updates `scheduled_at` / `scheduled_local` only
- `app.recompute_booking_status` + public wrapper + AFTER status trigger. All-cancelled → `cancelled` (D-10). No auto no-show (D-31)
- `compute_cancellation_refund`: >24h `auto_full` 100% of captured; 24h–6h `pending_ops`; ≤6h and after pickup `none`. No live percent-inside-24h tier
- Guest `manage_booking_cancel` + signed-in `customer_paid_cancel` cancel live legs, recompute, return PI; never INSERT `booking_refunds`
- `record_booking_refund` requires `stripe_refund_id`; stores D-07 `payout_country` + `available_on` as given. `bookings_set_refund_failed` does not touch `bookings.status`
- `ops_cancel_booking` calls compute and returns `refund_mode` + `refund_rappen` (D-13). `ops_refund_record` allows further refunds until remaining 0 (D-12)

## Task Commits

Each task was committed atomically:

1. **Task 1: original pickup freeze + recompute_booking_status** - `f794b23` (feat)
2. **Task 2: D-02 compute, cancel RPCs, record_booking_refund, remaining ops refund** - `aa15cb8` (feat)

**Plan metadata:** (this SUMMARY commit)

## Files Created/Modified

- `packages/db/supabase/migrations/20260911234512_booking_lifecycle_rollup.sql` - original pickup freeze + roll-up
- `packages/db/supabase/migrations/20260911234758_booking_lifecycle_cancel_refund.sql` - D-02 compute + cancel/refund RPCs
- `packages/db/README.md` - Phase 9 table rows; hosted apply is 09-04
- `packages/db/supabase/tests/cancellation_refund_d02.test.sql` - fixture only: eight-key `policy` + `total_sums` (CHECK). Charge gate untouched

## Decisions Made

Followed 09-CONTEXT D-01..D-32. `customer_paid_cancel` is `vamos_system` (Worker asCustomer), not PostgREST. Unpaid must use `checkout_cancel_unpaid` (`unpaid_use_hard_delete`). Guest token cancel still works without a captured payment so existing `manage_booking_mutation` unpaid paths keep working.

## Deviations from Plan

### Auto-fixed Issues

**1. 09-01 D-02 fixture could not INSERT `price_snapshots`**
- **Found during:** Task 2 pgTAP
- **Issue:** `policy = '{}'` fails `price_snapshots_policy_shape`; `discount_rappen = 2000` with `total_rappen = 10000` fails `price_snapshots_total_sums`. Assertions (8000 captured vs 10000 list) were correct
- **Fix:** eight-key policy jsonb; `discount_rappen = 0` so list total stays 10000; payment still 8000 under `session_replication_role = replica`. Charge gate not changed
- **Files modified:** `packages/db/supabase/tests/cancellation_refund_d02.test.sql`
- **Verification:** both pgTAP files exit 0
- **Committed in:** `aa15cb8`

---

**Total deviations:** 1 auto-fixed (fixture vs existing CHECKs)
**Impact on plan:** No product-SQL scope creep. Charge gate untouched.

## Issues Encountered

Local supabase was already healthy (API 127.0.0.1:54321, DB 54322). Did not start Docker. Did not `supabase start`. Applied with `pnpm --filter @vamos/db run reset` (exit 0), then pgTAP.

pgTAP:

```
booking_status_rollup.test.sql .... ok
cancellation_refund_d02.test.sql .. ok
All tests successful.
Files=2, Tests=27
Result: PASS
```

Command: `pnpm --filter @vamos/db run test:db supabase/tests/booking_status_rollup.test.sql supabase/tests/cancellation_refund_d02.test.sql`

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 09-03 (Worker stubs / UI) may start from this SQL. Do not treat local apply as hosted
- 09-04 hosted `supabase db push` is still BLOCKING and was not run
- Production Worker createRefund path is 09-05, not this plan

---
*Phase: 09-booking-lifecycle-customer-self-service*
*Completed: 2026-09-12*

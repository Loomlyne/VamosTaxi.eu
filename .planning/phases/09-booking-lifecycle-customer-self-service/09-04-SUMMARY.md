---
phase: 09-booking-lifecycle-customer-self-service
plan: 04
subsystem: database
tags: [postgres, supabase, hyperdrive, migrations]

requires:
  - phase: 09-02
    provides: roll-up + cancel/refund SQL
  - phase: 09-03
    provides: reviews.booking_id + submit_review SQL
provides:
  - Hosted Zurich yaumjzvylngfjhtuffqs has Phase 9 schema
  - database.types.ts regenerated from local schema
affects: [09-05, 09-06, 09-07, 09-08, 09-09, 09-10, 09-11, 09-12]

tech-stack:
  added: []
  patterns: [MCP apply_migration never db push, never Supavisor :6543]

key-files:
  created:
    - .planning/phases/09-booking-lifecycle-customer-self-service/09-04-SUMMARY.md
  modified:
    - packages/db/database.types.ts

key-decisions:
  - "Owner signed apply on yaumjzvylngfjhtuffqs (eu-central-2). MCP apply_migration only. No supabase db push."
  - "Did not apply local-only extras rename 20260911000002."
  - "Large cancel/refund file split into named MCP versions; payloads match local 09-02/09-03 SQL."

patterns-established:
  - "Hosted proof = list_migrations + execute_sql column/function exists. Types passing is not proof."

requirements-completed: [LIFE-01, LIFE-02, LIFE-08]

duration: 12min
completed: 2026-09-12
---

# Phase 09 Plan 04: Hosted Zurich apply

**Zurich `yaumjzvylngfjhtuffqs` now has original_scheduled_at, refund_status, reviews.booking_id, compute_cancellation_refund, record_booking_refund, submit_review. Direct Postgres, never :6543.**

## Performance

- **Duration:** ~12 min (hosted apply after owner `apply`)
- **Started:** 2026-09-12T00:21:00Z
- **Completed:** 2026-09-12T00:27:55Z
- **Tasks:** 2
- **Files modified:** 1 (types already committed)

## Accomplishments

- MCP `apply_migration` on `yaumjzvylngfjhtuffqs` (ACTIVE_HEALTHY, region `eu-central-2`). No `supabase db push`. No extras rename.
- `execute_sql` readback: `original_scheduled_at`, `refund_status`, `reviews.booking_id`, `app.recompute_booking_status`, `compute_cancellation_refund`, `record_booking_refund`, `submit_review`, `customer_paid_cancel`, `submit_review_customer` all true.
- D-10 on hosted: `ops_refund_record` `set status = 'refunded'` position 0; `refund_status = 'refunded'` position 4273.

## Task Commits

1. **Task 1: Local reset + regenerate database.types.ts** - `8bd1f92` (feat)
2. **Task 2: Hosted apply + readback** - this summary commit

**Plan metadata:** this file

## Files Created/Modified

- `packages/db/database.types.ts` - regenerated after local Phase 9 schema
- `.planning/phases/09-booking-lifecycle-customer-self-service/09-04-SUMMARY.md` - hosted proof

## Hosted MCP versions (list_migrations tail)

- `20260912002139` `booking_lifecycle_rollup`
- `20260912002356` `booking_lifecycle_cancel_refund_schema`
- `20260912002411` `booking_lifecycle_compute_cancellation_refund`
- `20260912002436` `booking_lifecycle_apply_customer_cancel`
- `20260912002453` `booking_lifecycle_customer_cancel_rpcs`
- `20260912002510` `booking_lifecycle_manage_booking_read`
- `20260912002537` `booking_lifecycle_record_booking_refund`
- `20260912002620` `booking_lifecycle_ops_refund_and_cancel`
- `20260912002652` `booking_lifecycle_reviews`
- `20260912002721` `booking_lifecycle_submit_review_rpcs`

Not applied: `20260911000002_live_passenger_extras` (local-only version collision fix).

## Deviations

- Cancel/refund SQL applied as several MCP names because one 30k query was too large for a single tool payload. Function bodies match local `20260911234758_booking_lifecycle_cancel_refund.sql`.
- Reviews applied as schema then RPCs (`booking_lifecycle_reviews` + `booking_lifecycle_submit_review_rpcs`).

## Issues Encountered

None after owner `apply`. Project healthy.

## Next Phase Readiness

09-05 Worker paid-cancel / Stripe test refunds can run. Charge gate untouched. `sk_live_` still refused.

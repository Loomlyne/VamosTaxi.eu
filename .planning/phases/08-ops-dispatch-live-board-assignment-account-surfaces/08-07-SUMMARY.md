---
phase: 08-ops-dispatch-live-board-assignment-account-surfaces
plan: 07
subsystem: ops
tags: [ops, paid-edit, extra-checkout, stripe, postgres, pgtap]
requires:
  - phase: 08-ops-dispatch-live-board-assignment-account-surfaces
    provides: staff origin, Stripe-first refund (08-05), phone-booking unpaid (08-06)
provides:
  - booking_edit_requests table + extra difference snapshot
  - checkout_extra_payment_settle that does not rewind pending→paid→confirmed
  - Ops accept of paid edits; unpaid PATCH refused
  - Extra Checkout Session for the fare difference only (kind extra)
affects: [08-08, 08-09, 08-10]
tech-stack:
  added: []
  patterns: [extra-snapshot-settle, asSystem-edit-accept, unpaid-no-edit]
key-files:
  created:
    - packages/db/supabase/migrations/20260910175309_booking_edit_requests.sql
    - apps/web/lib/ops/edit-request.ts
    - apps/web/lib/ops/edit-request-map.ts
    - apps/web/lib/ops/edit-request.test.ts
    - packages/db/supabase/tests/booking_edit_requests.test.sql
    - apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/edit-accept/route.ts
    - apps/web/app/api/staff/bookings/[id]/edit-accept/route.ts
  modified:
    - packages/db/README.md
    - apps/web/lib/checkout/stripe.ts
    - apps/web/lib/checkout/settle.ts
    - apps/web/lib/ops/bookings-write.ts
    - apps/web/lib/ops/bookings.ts
    - app/ops/OpsDetail.dc.html
    - app/ops/OpsDash.dc.html
key-decisions:
  - "Extra settle inserts a payment against the difference snapshot. Never pending→paid→confirmed on an already-confirmed booking. Charge gate untouched."
  - "One succeeded payment per snapshot (booking_payments_one_success_per_snapshot). Original capture stays on the original snapshot."
  - "SECURITY DEFINER writes as vamos_system. No anon/authenticated table grants. Never asStaff INSERT payments."
  - "Hosted schema apply is 08-09. SQL committed unpushed."
patterns-established:
  - "Extra Checkout metadata { booking_id, kind: extra, extra_id }. Session amount is the difference only."
  - "Merge supersedes the previous requested row and expires the old extra session when the amount changed."
requirements-completed: [OPS-05, DATA-08]
duration: 40min
completed: 2026-09-10
---

# Phase 08 Plan 07: Paid-edit extra settle Summary

**Ops can accept paid edits. Higher fare opens an extra Checkout Session for the difference only. Extra settle does not rewind pending→paid. Unpaid trips cannot be patched — cancel and create a new trip.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-09-10T17:51:43Z
- **Completed:** 2026-09-10T18:24:53Z
- **Tasks:** 4
- **Files modified:** 20

## Accomplishments

- `booking_edit_requests` + extra difference snapshot + `checkout_extra_payment_settle`. Charge gate `tg_payment_matches_snapshot` not redefined.
- Extra Checkout Session is the fare difference (`ui_mode: elements`, `chf`, metadata `{ booking_id, kind: extra, extra_id }`). Trip stays as-is until extra captured.
- Lower fare: >24h uses 08-05 `createRefund`. Inside 24h ops must click Refund. Same-price waits for accept then apply.
- Unpaid PATCH refused. Ops UI: Cancel and create a new trip. No customer edit UI (08-10).
- Dashboard Income stays original capture. Extra and refund are their own money lines.
- Paid edit that breaks assigned chauffeur → must-fix, not auto-cancel.

## Task Commits

1. **Task 1: booking_edit_requests + extra settle RPC** - `d536fd2` (feat)
2. **Task 2: extra Checkout, merge, unpaid refuse, accept path** - `f53590c` (feat)
3. **Task 3: ops paid-edit accept UI and unpaid refuse** - `ed2e71c` (feat)
4. **Task 4: extra-settle pgTAP + paid-edit file proofs** - `c0cfe70` (test)

**Plan metadata:** (this commit)

## Files Created/Modified

- `packages/db/supabase/migrations/20260910175309_booking_edit_requests.sql` — table, mint extra/clone snapshots, upsert/accept/settle RPCs
- `packages/db/README.md` — migration row
- `apps/web/lib/ops/edit-request.ts` — accept path, extra session, merge expire, 08-05 refund
- `apps/web/lib/ops/edit-request-map.ts` — pure mapping
- `apps/web/lib/ops/bookings-write.ts` — unpaid PATCH refused
- `apps/web/lib/checkout/stripe.ts` — extra metadata
- `apps/web/lib/checkout/settle.ts` — extra settle branch; skip confirmation
- `apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/edit-accept/route.ts` — withStaff accept
- `apps/web/app/api/staff/bookings/[id]/edit-accept/route.ts` — dual mount
- `app/ops/OpsDetail.dc.html` — pending Accept, unpaid no-edit, Continue, must-fix
- `app/ops/OpsDash.dc.html` — Needs attention pending edits; Extra money line
- `apps/web/lib/ops/bookings.ts` — original capture vs extra_rappen; pending edit
- `apps/web/lib/ops/edit-request.test.ts` — 6/6
- `apps/web/lib/checkout/stripe.test.ts` — extra metadata
- `packages/db/supabase/tests/booking_edit_requests.test.sql` — pgTAP (unapplied)
- `packages/db/supabase/tests/payment_fx.test.sql` — unique index name

## Decisions Made

- Extra settle temp-rebinds `bookings.price_snapshot_id` to the extra snapshot so the charge gate matches, then apply_payload binds the new quote snapshot. Original capture payment is untouched.
- Unique success index is per snapshot so extra can succeed without a second success on the original snapshot.
- Ops save without a new quote snapshot clones the bound snapshot (same-price). Lock + class total clones at the quoted total (D-66). Mapbox places for live `/api/quote` from OpsDetail are not in this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. booking_legs.vehicle_id**
- **Found during:** Task 2
- **Issue:** apply_payload selected `v_leg.vehicle_id`; column is `assigned_vehicle_id`
- **Fix:** use `assigned_vehicle_id`
- **Files modified:** `20260910175309_booking_edit_requests.sql`
- **Committed in:** `f53590c`

**2. Unique index rename**
- **Found during:** Task 1/4
- **Issue:** extra settle needs one success per snapshot, not per booking
- **Fix:** `booking_payments_one_success_per_snapshot`; payment_fx has_index updated
- **Committed in:** `d536fd2` / `c0cfe70`

**Total deviations:** 2 auto-fixed
**Impact on plan:** Required for correctness. No scope creep.

## Issues Encountered

- Local Supabase/Docker not running: pgTAP committed, not executed.
- Schema left unpushed (08-09 applies). No `supabase db push`, no MCP apply_migration.
- `check:db-fences` still fails on pre-existing files (`tickets-write.ts`, `reviews.ts`, isolate Maps). 08-07 files are not in that list.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 08-08 can proceed. 08-09 applies this migration and hosted extra settle. 08-10 is customer edit UI.
- Blocker for live extra pay: hosted SQL unapplied.

---
*Phase: 08-ops-dispatch-live-board-assignment-account-surfaces*
*Completed: 2026-09-10*

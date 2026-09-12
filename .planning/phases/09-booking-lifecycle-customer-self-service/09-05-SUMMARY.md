---
phase: 09-booking-lifecycle-customer-self-service
plan: 05
subsystem: lifecycle
tags: [stripe, refund, workers, cancel]

requires:
  - phase: 09-04
    provides: hosted Phase 9 cancel/refund RPCs
provides:
  - Guest POST /api/manage/cancel paid-cancel Worker
  - Signed-in POST /api/account/bookings/paid-cancel
  - Ops remaining refund until captured (D-12)
  - Ops dashboard cancel auto_full Stripe in Worker
affects: [09-06, 09-08]

tech-stack:
  added: []
  patterns: [Stripe createRefund then record RPC, D-08 never restore status]

key-files:
  created:
    - apps/web/lib/lifecycle/paid-cancel.ts
    - apps/web/app/api/manage/cancel/route.ts
    - apps/web/app/api/account/bookings/paid-cancel/route.ts
    - .planning/phases/09-booking-lifecycle-customer-self-service/09-05-SUMMARY.md
  modified:
    - apps/web/lib/checkout/stripe.ts
    - apps/web/lib/lifecycle/paid-cancel.test.ts
    - apps/web/lib/ops/refund.ts
    - apps/web/lib/ops/refund.test.ts
    - apps/web/lib/ops/refund-map.ts
    - apps/web/lib/ops/bookings-write.ts
    - apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/refund/route.ts

key-decisions:
  - "Stripe network outside the DB tx. createRefund then record_booking_refund / ops_refund_record."
  - "D-08 Stripe fail stamps refund_status failed via bookings_set_refund_failed. Never restores prior status."
  - "D-07 retrieveRefund expanded; persist card.country else CH + available_on. Never invent day counts."
  - "already-refunded only when remaining is 0. Optional percent/rappen default remaining captured."
  - "Unpaid POST /api/account/bookings/cancel untouched (D-09 hard-delete)."
  - "Stripe TEST only. sk_live_ refused. No live network refunds in this plan."

patterns-established:
  - "Paid cancel helper applyStripeRefund reused by customer cancel and ops auto_full."
  - "Partial ops remaining (amount < remaining) records via record_booking_refund so Stripe amount matches the row."

requirements-completed: [LIFE-02]

duration: 50min
completed: 2026-09-12
---

# Phase 09 Plan 05: Paid-cancel Worker + Stripe test refunds

**Guest and signed-in paid cancel compute refund in SQL then createRefund in the Worker. D-08 never restores status. Ops remaining refund until captured. No sk_live_. Vitest 24/24.**

## Performance

- **Duration:** ~50 min
- **Started:** 2026-09-12T00:28:00Z
- **Completed:** 2026-09-12T00:53:46Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- `paid-cancel.ts`: `manage_booking_cancel` / `customer_paid_cancel` then `createRefund` then `record_booking_refund`. Idempotency `refund:{bookingId}:{paymentId}:customer-cancel`. Charge currency CHF.
- Guest `POST /api/manage/cancel` hashes manage cookie. No `from public.bookings`, no TRIP lookup, no `createRefund` in the route.
- Signed-in `POST /api/account/bookings/paid-cancel` uses `asCustomer` ownership then `vamos_system` RPC.
- D-07: `retrieveRefund` expand charge.payment_method_details + balance_transaction. Persist `card.country` else `CH` and Stripe `available_on`.
- D-08: Stripe fail → `bookings_set_refund_failed`. Trip stays cancelled.
- `pending_ops` / `none`: no Stripe. `auto_full` only.
- Ops `refundBooking`: remaining = captured minus sum(refunds). already-refunded only at remaining 0. Optional percent or rappen. `sk_live_` refused.
- Ops `cancelBooking`: after `ops_cancel_booking`, `auto_full` calls `applyStripeRefund` outside the SQL tx. `pending_ops` / `none` skip Stripe.

## Task Commits

1. **Task 1 tests (RED)** — `0855293` test(09-05): add failing tests for paid-cancel Stripe order
2. **Task 1 impl** — `a8dbc9d` feat(09-05): paid-cancel Worker with Stripe-first refund
3. **Task 2 tests (RED)** — `00eb030` test(09-05): add failing tests for ops remaining refund
4. **Task 2 impl** — `7ba610c` feat(09-05): ops remaining refund and cancel Stripe path
5. **Plan metadata** — this file

## Files Created/Modified

- `apps/web/lib/lifecycle/paid-cancel.ts` — compute RPC → Stripe → record
- `apps/web/lib/lifecycle/paid-cancel.test.ts` — source proofs + mocked Stripe order
- `apps/web/lib/checkout/stripe.ts` — `retrieveRefund`
- `apps/web/app/api/manage/cancel/route.ts` — guest POST
- `apps/web/app/api/account/bookings/paid-cancel/route.ts` — signed-in POST
- `apps/web/lib/ops/refund.ts` / `refund-map.ts` / `refund.test.ts` — D-12 remaining
- `apps/web/lib/ops/bookings-write.ts` — ops cancel Stripe path
- `apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/refund/route.ts` — percent/rappen body

## Decisions

- Identity doors only (`asGuest` / `asCustomer` / `asSystem`). `export const dynamic = "force-dynamic"` on lib modules that import them.
- Unpaid account cancel left as `checkout_cancel_unpaid`.
- Partial ops remaining uses `applyStripeRefund` so the persisted `refund_rappen` matches Stripe. Full remaining still uses `ops_refund_record` (SQL remaining).
- No live Stripe charge. Tests mock `createRefund` / `retrieveRefund`. Never print secrets.

## Deviations from Plan

- `opsRefundAmount` lives in `refund-map.ts` (pure, no identity import) and is re-exported from `refund.ts`.
- No live test-mode refund against staging (plan allowed skip unless required).
- Did not `supabase db push`, start Docker, wrangler deploy, or start 09-06.

## Issues

- None blocking. Next plan 09-06 is reminder cron, not this Worker.

## Verification

```
cd apps/web && vitest run lib/ops/refund.test.ts lib/lifecycle/paid-cancel.test.ts
```

- Test Files  2 passed (2)
- Tests  24 passed (24)

Plan greps: guest route `createRefund` count 0; unpaid cancel still `checkout_cancel_unpaid`; paid-cancel contains `createRefund`, `record_booking_refund`, `bookings_set_refund_failed`.

## Next

09-06 reminder cron. Do not start it from this plan.

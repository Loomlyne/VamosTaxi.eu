---
phase: 08-ops-dispatch-live-board-assignment-account-surfaces
plan: 05
subsystem: payments
tags: [ops, refund, stripe, booking-events, security-definer]

requires:
  - phase: 08-04
    provides: withStaff then asSystem RPC dual-mount staff Origin CSRF
provides:
  - Stripe-first full refund via createRefund then ops_refund_record
  - Cancel unpaid drops with no Stripe; paid cancel does not refund
  - Refund mail to contact + company payer when different
affects: [08-09, 08-UAT, 08-06]

tech-stack:
  added: []
  patterns: [Stripe first then DEFINER RPC, dual-mount staff POST /refund]

key-files:
  created:
    - packages/db/supabase/migrations/20260910170935_ops_refund_record.sql
    - packages/db/supabase/tests/ops_refund.test.sql
    - apps/web/lib/ops/refund.ts
    - apps/web/lib/ops/refund-map.ts
    - apps/web/lib/ops/refund.test.ts
    - apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/refund/route.ts
    - apps/web/app/api/staff/bookings/[id]/refund/route.ts
  modified:
    - packages/db/README.md
    - packages/db/database.types.ts
    - apps/web/lib/ops/bookings-write.ts
    - apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/route.ts
    - app/ops/OpsDetail.dc.html
    - packages/emails/src/lib/send.ts
    - packages/emails/src/index.ts
    - apps/web/tests/integration/ops-dc-customers.spec.ts

key-decisions:
  - "Ops Refund = full Stripe refund; trip stays paid until Stripe succeeds"
  - "RPC refuses null stripe_refund_id; never mark refunded without Stripe"
  - "Cancel and Refund are two actions; paid cancel does not refund"
  - "Nullable stripe_fee_rappen only when Stripe returned minor units"

patterns-established:
  - "Pattern 1: createRefund first; asSystem ops_refund_record only with Stripe id"
  - "Pattern 2: refundMailRecipients(contact, payer) — company only when different"

requirements-completed: [OPS-05, DATA-08]

duration: 21min
completed: 2026-09-10
---

# Phase 8 Plan 05: Stripe-first full refund Summary

**Ops Refund credits via Stripe then records; Stripe failure leaves the trip paid. Cancel unpaid drops with no Stripe. Paid cancel does not refund.**

## Performance

- **Duration:** 21 min
- **Started:** 2026-09-10T17:04:44Z
- **Completed:** 2026-09-10T17:25:08Z
- **Tasks:** 4/4
- **Files modified:** 15

## Accomplishments

- `public.ops_refund_record` SECURITY DEFINER requires non-null `stripe_refund_id`; writes `booking_refunds` + `refund.issued` in the same tx; EXECUTE `vamos_system` only
- Staff POST `/api/staff/bookings/:id/refund`; dual-mounted; `createRefund` before RPC; `sk_live_` refused
- PATCH `status=refunded` no longer lies (`use-refund`); `markRefunded` deleted
- `ops_cancel_booking` writes `booking.status_changed` for paid cancel and unpaid drop; no Stripe; no refund mail
- `refundMailRecipients` sends issued mail to contact + company payer when different
- Optional nullable `booking_payments.stripe_fee_rappen` (D-31); never guessed

## Refund contract

**Stripe first.** Full amount = captured `charged_rappen`. Idempotency `refund:{bookingId}:{paymentId}`. Charge CHF. Test mode only. Fail → stay paid, show error, Refund again.

**Cancel ≠ Refund.** Paid cancel sets cancelled only. Unpaid cancel drops with no Stripe.

## Fee column

`booking_payments.stripe_fee_rappen` added, nullable, `CHECK > 0`. Written only when Stripe returned fee minor units. Update whitelist allows write-once even on succeeded rows. Charge gate `tg_payment_matches_snapshot` not replaced.

## Task Commits

1. **Task 1: ops_refund_record + optional fee column** - `a33ddd5` (feat)
2. **Task 2: Stripe-first refund.ts; kill markRefunded** - `ecdf1ff` (feat)
3. **Task 3: Cancel unpaid vs paid; OpsDetail two actions** - `965e60a` (feat)
4. **Task 4: Refund mail contact+company; tests** - `a796c25` (test)

**Plan metadata:** (this commit)

## Files Created/Modified

- `packages/db/supabase/migrations/20260910170935_ops_refund_record.sql`
- `packages/db/supabase/tests/ops_refund.test.sql`
- `packages/db/README.md`
- `packages/db/database.types.ts`
- `apps/web/lib/ops/refund.ts`
- `apps/web/lib/ops/refund-map.ts`
- `apps/web/lib/ops/refund.test.ts`
- `apps/web/lib/ops/bookings-write.ts`
- `apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/route.ts`
- `apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/refund/route.ts`
- `apps/web/app/api/staff/bookings/[id]/refund/route.ts`
- `app/ops/OpsDetail.dc.html`
- `packages/emails/src/lib/send.ts`
- `packages/emails/src/index.ts`
- `apps/web/tests/integration/ops-dc-customers.spec.ts`

## Verification

- **Unit:** `/Users/koss/Developer/VamosTaxi.eu/apps/web/node_modules/.bin/vitest run lib/ops/refund.test.ts` cwd worktree `apps/web` — **8 passed**. No Hyperdrive. No `app/api/**/route.ts` import.
- **File proofs:** SECURITY DEFINER, stripe_refund_id required, no GRANT to anon/authenticated, charge gate not replaced, createRefund before ops_refund_record, PATCH has no markRefunded, OpsDetail POST `/refund`, no `location.hash`, refundMailRecipients includes payer.
- **pgTAP:** `packages/db/supabase/tests/ops_refund.test.sql` written (null id / unpaid / issued event / idempotent replay / paid cancel no refunds / unpaid cancel events). **Not executed** — Docker empty; plan forbids `pnpm db:start` / Docker / hosted apply.
- **Hosted SQL:** not applied (08-09 owner gate).

## Decisions Made

- Mapper lives in `refund-map.ts` so vitest does not load Hyperdrive identity.
- D-58 skipped: no customer manage-booking cancel route in `apps/web` — do not build a Phase 9 shell.
- Fee write is the 5th RPC arg (nullable); whitelist carve-out is write-once `stripe_fee_rappen` on succeeded rows.

## Deviations from Plan

- Extra files vs `files_modified`: `refund-map.ts` (unit-test isolation), dual-mount `refund/route.ts` (preferred POST over status-flag), `database.types.ts`, `emails/src/index.ts` export, integration spec update (markRefunded assertion).
- `ops_cancel_booking` shipped in the same migration as `ops_refund_record` (one CLI file).

**Total deviations:** extra files for dual-mount + test isolation
**Impact on plan:** Required for CSRF dual-mount and unit tests; no scope creep.

## Issues Encountered

- Worktree has no local `vitest` binary — used main-tree `apps/web/node_modules/.bin/vitest`.
- pgTAP cannot run without starting Docker; documented, file not skipped.
- Comment containing `asStaff` failed a negative file-proof; comment reworded.

## User Setup Required

None - no external service configuration required. Hosted apply is 08-09. Dummy-card UAT is owner-gated later.

## Next Phase Readiness

Refund RPC + staff POST + OpsDetail two actions are on the branch. Do not apply hosted SQL until 08-09. Do not deploy. Do not add live Stripe keys.

---
*Phase: 08-ops-dispatch-live-board-assignment-account-surfaces*
*Completed: 2026-09-10*

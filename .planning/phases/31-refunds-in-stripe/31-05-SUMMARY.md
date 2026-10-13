---
phase: 31-refunds-in-stripe
plan: 05
subsystem: webhook / email / sweep
tags: [webhook, stripe, email, sweep, refunds]
requires:
  - "31-03: notification_claim_refund, notification_refund_read (migration 20261012220000)"
  - "31-04: mailCustomerRefund, deliverRefundMailByClaim, *WithDeps, refundMailDeps"
provides:
  - "money-events.ts: optional mailCustomerRefund dep, called only after outcome 'recorded' for a non-app CHF refund with refund.amount"
  - "settle.ts: recordChargeRefund returns { outcome, bookingId } from the SQL row; mailCustomerRefund(env, input) bound"
  - "notify.ts: sweep routes kind 'refund' rows to deliverRefund (deliverRefundMailByClaim); default kinds ['confirmation','refund']; notificationSweepStuck(env, interval, kinds) exported"
  - "refund-mail.local.test.ts: claim, dedupe and sweep retry proven on lab p31-refunds through the Worker client"
affects: [31-06 (edits worker.ts sweep call sites; both already use the default kinds), 31-13 (hand-over)]
tech-stack:
  added: []
  patterns: [optional dep with its own try/catch after a money write, sweep routing by notification kind]
key-files:
  created:
    - apps/web/lib/checkout/refund-mail.local.test.ts
  modified:
    - apps/web/lib/checkout/money-events.ts
    - apps/web/lib/checkout/money-events.test.ts
    - apps/web/lib/checkout/settle.ts
    - apps/web/lib/checkout/settle.test.ts
    - apps/web/lib/checkout/notify.ts
    - apps/web/lib/checkout/notify.test.ts
    - apps/web/tests/integration/checkout-server-db.spec.ts
    - apps/web/tests/integration/webhook-replay.spec.ts
decisions:
  - "The mail guard reads refund.metadata?.vamos_source !== 'app' on the mail line itself (not only the appSource flag), so the D-03 guard is visible where the mail starts"
  - "A refund sweep row without a claim id warns with stage refund_no_claim; an unbound deliverRefund warns with refund_unbound"
  - "notify.ts exports notificationSweepStuck so the local test runs the production sweep SQL, not a copy"
metrics:
  duration: "about 9 min (2026-10-13 13:09Z to 13:18Z)"
  completed: 2026-10-13
  tasks: 2
  files: 9
---

# Phase 31 Plan 05: Refund mail wired into the webhook and the sweep Summary

When `stripe_charge_refunded_record` answers `'recorded'` for a CHF refund the app did not make, the webhook consumer now calls `mailCustomerRefund` with the booking from the SQL row and that Stripe refund's own `refund.amount`. The call has its own try/catch, so the webhook answer never depends on it. A refund mail that failed is retried by the hourly and nightly notification sweep: rows of kind `refund` go to `deliverRefundMailByClaim`, and confirmations keep their own path.

## Commits

| Task | Commit | What |
|------|--------|------|
| 1 RED | d16338a4 | money-events.test.ts: 8 mail cases. settle.test.ts: production deps through `handleStripeMessage` (recorded / already / no booking_id) plus a source pin on the duplicate path |
| 1 GREEN | 1a6065ac | money-events.ts mail hook and dep type; settle.ts `bookingId` plus the `mailCustomerRefund` binding |
| 2 RED | e66627af | notify.test.ts: 7 routing cases (default kinds updated in the old case); refund-mail.local.test.ts |
| fix | d19c317d | two integration specs: the `recordChargeRefund` stand-ins answer `bookingId: null` (tsc) |
| 2 GREEN | 3936bf1b | notify.ts routing, default kinds, `deliverRefund` binding, `notificationSweepStuck`; local fixture fix |

## Verification

- `apps/web` `vitest run` on money-events, settle, settle-errors, notify and refund-mail tests: 263/263 passed (5 files).
- Task 2 verify command exactly as written in the plan: notify plus money-events 82/82; `refund-mail.local.test.ts` on lab p31-refunds (port 45222 from LAB_DB_URL) 2 passed, 0 skipped; `pnpm check:db-fences` "all 8 checks passed (1285 files scanned)". Exit 0.
- Local log: `.planning/phases/31-refunds-in-stripe/logs/31-05-refund-mail-local.log`, ending `Tests 2 passed (2)` and `exit=0`.
- `apps/web` `tsc --noEmit -p tsconfig.json`: exit 0 after d19c317d (log `logs/31-05-tsc.log`, `exit=0`).
- Acceptance greps: `outcome === "recorded"` matches inside `handleChargeRefundedWithDeps` (l.272), and that line carries the `vamos_source !== "app"` guard. `"confirmation", "refund"` matches both default kinds. The `settle.ts` diff touches only the `recordChargeRefund` return, one `mailCustomerRefund` dep line and its import.
- The local test proves, on the real definers through the Worker client options (`vamos_edge` → `vamos_system`, `fetch_types: false`): one row of kind `refund` with dedupe `booking:refund:<re_id>`, locale `de` from the booking, `sent_at` and `provider_message_id` set. A second call writes no row and sends nothing. A failing send leaves `failed_at` with `error = send_failed`. `notification_sweep('0 seconds', ['refund'])` returns that row. The sweep's refund route sends it with the amount equal to the recorded `booking_refunds.refund_rappen` and sets `sent_at`, and the row then leaves the sweep. The alert stand-in was never called.
- No Stripe, no Resend, no live database touched. Fixture rows on the lab use random tags and are committed (same convention as stripe-fee.local.test.ts).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] tsc red in two integration specs after the dep type change**
- **Found during:** final tsc
- **Issue:** `tests/integration/checkout-server-db.spec.ts:415` and `webhook-replay.spec.ts:177,249` build `recordChargeRefund` stand-ins that answer `{ outcome }` only.
- **Fix:** they now answer `bookingId: null`. They are not used in those scenarios. Commit d19c317d. These files were outside the plan's `files_modified`.

**2. [Rule 1 - Test fixture] Leg insert under replica mode needs `original_scheduled_at`**
- **Found during:** first local run (it failed in beforeAll, so the tests showed as skipped and the run exited 1)
- **Fix:** the fixture sets `original_scheduled_at`, `estimated_duration_minutes`, `pax` and `bags`, as the assign and chauffeur-delete fixtures do. Commit 3936bf1b.

**3. [Design note] `notificationSweepStuck` exported from notify.ts**
- The wrapper's sweep SQL moved into an exported function, so the local test runs the production query (text[] via `sql.array(k, 1009)`) instead of a copy. Same SQL text, no behaviour change.

**4. [Acceptance grep note] `grep -c "refund_failed|assignment_customer|time_change|flight_no" notify.ts` returns 1, not 0**
- The match is the existing `row.flight_no` column read (l.199). It was there on the base commit and is not a notification kind. No lifecycle kind was added (C-04).

**5. [Test design] settle.test.ts proves the binding with a behaviour test, not only a source pin**
- The test mocks `./refund-mail` and extends the file's `./stripe` and `asSystem` mocks (`retrieveCharge`, `findSessionIdForPaymentIntent`, a `stripe_charge_refunded_record` row). It then checks that `handleStripeMessage(env, charge.refunded)` calls `mailCustomerRefund(env, { bookingId, stripeRefundId, refundRappen })` only for `'recorded'` with a `booking_id`. The source pin for the duplicate path was also added, as the plan asked.

## Not verified

- The hourly and nightly sweep run on a Worker build (worker.ts calls `sweepStuckNotifications(env)` with the default kinds, so refund rows are now included; plan 31-06 owns worker.ts). Proven here at function level and on the lab DB only.
- A real Resend send and a real Stripe refund event end to end: that is the pre-ship real refund (D-13).
- A sweep that also has stuck confirmation rows on the lab: the local test filters to its own claim id so that other plans' rows sharing the lab are not sent.

## Known Stubs

None.

## Threat Flags

None. T-31-21 to T-31-24 are implemented and tested: only `'recorded'`, app refunds skipped, claim dedupe proven on the DB, the mail in its own try/catch with the answer unchanged, the amount taken from `refund.amount` and the retry using the recorded `refund_rappen`, and a failure log carrying the event and refund ids only (asserted to have no amount or address). T-31-25: only `refund` was added, which the kind check already allows.

## TDD Gate Compliance

Task 1: RED d16338a4, then GREEN 1a6065ac. Task 2: RED e66627af, then GREEN 3936bf1b. One fix commit in between (d19c317d, types only).

## Self-Check: PASSED

- FOUND: apps/web/lib/checkout/refund-mail.local.test.ts
- FOUND: d16338a4, 1a6065ac, e66627af, d19c317d, 3936bf1b

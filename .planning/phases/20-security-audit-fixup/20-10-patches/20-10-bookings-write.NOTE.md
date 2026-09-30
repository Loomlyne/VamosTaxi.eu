# 20-10 staff cancel patches (not applied). Apply from the repo root, in this order, after the other hand-over is on main:

1. `git apply -p1 20-10-bookings-write.patch`        apps/web/lib/ops/bookings-write.ts
2. `git apply -p1 20-10-bookings-write-test.patch`   new lib/ops/staff-cancel-by-hand.test.ts + the pin in lib/ops/refund.test.ts (was: "applyStripeRefund" required, now: forbidden)
3. `git apply -p1 20-10-paid-cancel-cleanup.patch`   deletes applyStripeRefund, its types, markRefundFailed, liveKeyRefused and their tests (only after 1, because bookings-write.ts is the last caller)

All three pass `git apply --check` against HEAD a98e89b3 of fix/phase-20-refunds-by-hand. If the hand-over moved bookings-write.ts,
re-cut hunk 1 by hand; the intended lines are:

- delete line 9 import loadCapturedPaymentRow, replace line 13 import applyStripeRefund by finishPaidCancel
- delete `const refundMode = ...` (line 127)
- replace the `if (refundMode === "pending_ops" ...) {...} else if (refundMode === "auto_full") {...}` block (150-168) by one call:
  `await finishPaidCancel(env, { booking_id, refund_mode, refund_rappen, stripe_payment_intent_id: null })`
  = no Stripe refund call, "Refund due" stays (SQL leaves pending_ops), the customer gets the normal cancellation mail at once
  (T4 line full_captured for more than 24 h, T5 line pending_ops inside 24 h). Mail is best-effort.

Verified in a scratch copy: staff-cancel-by-hand (4), bookings-write (12), paid-cancel (12), refund.test all green except the OpsDetail file read (no app/ops in the scratch copy); tsc clean for the touched files.
Red-before: the 3 new staff-cancel tests fail against the current bookings-write.ts.
Depends on ops_cancel_booking leaving refund_status pending_ops (database package 1.2), else the dashboard still shows the old "Refund due / none" path.

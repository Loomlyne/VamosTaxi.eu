---
status: complete
phase: 09-booking-lifecycle-customer-self-service
source:
  - 09-01-SUMMARY.md
  - 09-02-SUMMARY.md
  - 09-03-SUMMARY.md
  - 09-04-SUMMARY.md
  - 09-05-SUMMARY.md
  - 09-06-SUMMARY.md
  - 09-07-SUMMARY.md
  - 09-08-SUMMARY.md
  - 09-09-SUMMARY.md
  - 09-10-SUMMARY.md
  - 09-11-SUMMARY.md
  - 09-12-SUMMARY.md
started: 2026-09-12T11:00:00Z
updated: 2026-09-12T13:19:13Z
---

## Current Test

number: 8
name: Ops remaining refund on cancelled paid booking
expected: |
  REFUND on VT-26-0720 writes booking_refunds or shows honest Failed.
awaiting: recorded

## Tests

### 1. Hosted Zurich SQL
expected: original_scheduled_at, refund_status, submit_review, ops_mark_complete/no_show on yaumjzvylngfjhtuffqs
result: pass

### 2. Staging Worker vamos
expected: printed worker vamos, 100% 327b4881, /booking-detail /manage-booking /bookings /review /cancellation 200
result: pass

### 3. Ops Complete
expected: VT-26-0723 Complete click → bookings.status completed, Complete/No-show/Cancel gone
result: pass

### 4. Ops Cancel
expected: VT-26-0720 Cancel booking → status cancelled, booking_events booking.status_changed confirmed→cancelled, not status refunded
result: pass

### 5. /cancellation D-02
expected: 24 hours / 6 hours copy, no 75% customer tier
result: pass

### 6. /api/dev/db-smoke
expected: empty 404 leak gate (not a public health URL)
result: pass

### 7. On main
expected: PR #33 squash a1d6c56
result: pass

### 8. Ops remaining refund
expected: Stripe test refund + booking_refunds, or honest Failed
result: issue
reported: "Could not refund 87796e94-5968-482b-8537-43a7eda55a01"
severity: major

## Summary

total: 8
passed: 7
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Dummy-card paid cancel writes booking_refunds (or honest Failed) + Resend"
  status: failed
  reason: "Ops REFUND toast Could not refund uuid. Status stays cancelled, refund_status none, refunded_rappen 0. Close bar allows honest Failed."
  severity: major
  test: 8
  root_cause: "POST /api/staff/bookings/:id/refund returned not-ok. Payment row exists (id 17, captured, PI present, 12000 rappen)."
  artifacts: []
  missing: []
  debug_session: ""

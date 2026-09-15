---
status: complete
phase: 18-ops-pricing-source
source: [18-01-SUMMARY.md, 18-02-SUMMARY.md, 18-03-SUMMARY.md, 18-04-SUMMARY.md, 18-05-SUMMARY.md, 18-06-SUMMARY.md, 18-07-SUMMARY.md]
started: 2026-09-14T17:25:00Z
updated: 2026-09-15T09:15:00Z
---

## Current Test

number: 7
name: Extra wait not in Stripe pay-now
expected: |
  Extra wait hours are not in the Stripe Checkout pay-now amount. Charge CHF. Meet & greet and free airport wait stay included.
awaiting: complete

## Tests

### 1. Hosted SQL applied (not db push)
expected: Owner applied 20260914190000_quote_rate_book_live_classes.sql then 20260914191000_vehicle_class_any_photo.sql on the hosted project used by vamostaxi.site. Never restore onto yaumjzvylngfjhtuffqs. Agent did not supabase db push.
result: pass
reason: STATE 2026-09-14 — owner apply via db query --linked on Zurich.

### 2. Save is draft; Publish is the only public flip
expected: On dashboard.vamostaxi.site /pricing — Save creates draft (Draft mark). Discard confirm returns live. Typing without Save is gone. Publish confirm shows the change list. A gap 409 keeps the draft and jump-to-fix works.
result: pass
reported: Owner closed 18-07 Task 3 on 2026-09-15. Agent did not click Publish.

### 3. Delete class + Publish → no public card
expected: Delete a class + Publish → vamostaxi.site home has no card for that class (D-31). Not grey. Not CHF 000.
result: pass
reported: Owner close 2026-09-15 after restart (2026-09-14 UAT had failed on invented Economy).

### 4. Change start/per-km + Publish → D-15 recipe
expected: Change start/per-km + Publish → next quote is start + (all km × per-km) + bands (275.20-style), not invented CHF.
result: pass
reported: Owner close 2026-09-15.

### 5. New class + photo + Publish → typed name on home
expected: Add class with photo + Publish → home shows the name they typed (D-29 D-30).
result: pass
reported: Owner close 2026-09-15.

### 6. Hide from public + Publish
expected: Hide + Publish → class still listed, Select off, CHF 000 (D-32).
result: pass
reported: Owner close 2026-09-15.

### 7. Extra wait not in Stripe pay-now
expected: Extra wait is not in the Stripe Checkout pay-now amount (D-23). Charge CHF. No sk_live_. No vamostaxi.eu.
result: pass
reason: extra-wait-no-offsession.test.ts green (intent + bookings-map). Owner close 2026-09-15. Agent did not Publish.

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]

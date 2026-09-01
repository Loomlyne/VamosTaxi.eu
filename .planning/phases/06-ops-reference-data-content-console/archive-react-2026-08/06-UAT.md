---
status: testing
phase: 06-ops-reference-data-content-console
source: [06-01-SUMMARY.md through 06-17-SUMMARY.md, 06-VERIFICATION.md]
started: 2026-09-01T12:36:02Z
updated: 2026-09-01T12:36:02Z
---

## Current Test

number: 1
name: Staff sign-in page on dashboard host
expected: |
  https://dashboard.vamostaxi.site/sign-in shows a real staff form (Email, Password, yellow Staff sign in). Not a DC mock, not localStorage, not vamostaxi.site/ops.
awaiting: user response

## Tests

### 1. Staff sign-in page on dashboard host
expected: https://dashboard.vamostaxi.site/sign-in shows a real staff form (Email, Password, yellow Staff sign in). Not a DC mock, not localStorage, not vamostaxi.site/ops.
result: pending

### 2. Admin password sign-in
expected: Sign in as koussayzayeni@gmail.com. Session starts. Because MFA is not enrolled, the next screen is Accept invite / set password, then TOTP — not the live board.
result: pending

### 3. Enrol TOTP (aal2)
expected: Scan the QR (or enter the secret) in an authenticator, type the 6-digit code. After that, ops pages load. Hosted staff row shows mfa_enrolled=true and one MFA factor.
result: pending

### 4. Ops shell, not dispatch
expected: After MFA, the sidebar has fleet, pricing, coupons, customers, content, reviews, settings, staff, profile. No live board, no Bookings, no Calendar, no assign/refund/phone booking.
result: pending

### 5. Reference screens, no invented CHF
expected: Vehicles, chauffeurs, coupons, reviews, customers, settings open. Empty lists stay empty. Any money field is CHF 000 / blank until the owner matrix. No fake bookings.
result: pending

### 6. Public site unchanged
expected: https://vamostaxi.site still the public DC site. Ops is only on dashboard.vamostaxi.site.
result: pending

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps

[none yet]

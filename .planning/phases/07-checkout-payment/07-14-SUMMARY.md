---
phase: 07-checkout-payment
plan: 14
subsystem: ui
tags: [guest, account, manage-booking]

requires:
  - phase: 07-checkout-payment
    provides: checkout details + pay-link
provides:
  - D-39 guest no-password
  - D-40 Finish payment
  - D-41 manage unpaid copy
---

# Plan 07-14 Summary

Guest details has no password field. Create-account radio does not ask
for a password either — later signup with the same email claims via
AUTH-01 `tg_link_customer_on_signup`. No Google / Apple / phone-verify.

Account DC: Finish payment when `vamosTrip` still has a lock + quote_id,
href `/checkout/payment`. Full bookings history stays Phase 8.

Manage-booking DC: unpaid copy when status is pending/quote (`?unpaid=1`
for the mock). Paid stays confirmed.

No new migration. Claim trigger already exists. Hosted SQL not applied.
No deploy (07-15).

## Verification

- `pnpm i18n:check` passed (2365 keys)
- vitest guest-details + guest-account: 3 passed

## Self-Check: PASSED

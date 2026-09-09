---
status: partial
phase: 07-checkout-payment
source: [07-01-SUMMARY.md, 07-02-SUMMARY.md, 07-03-SUMMARY.md, 07-04-SUMMARY.md, 07-05-SUMMARY.md, 07-06-SUMMARY.md, 07-07-SUMMARY.md, 07-08-SUMMARY.md, 07-09-SUMMARY.md, 07-10-SUMMARY.md, 07-11-SUMMARY.md, 07-12-SUMMARY.md, 07-13-SUMMARY.md, 07-14-SUMMARY.md, 07-15-SUMMARY.md, 07-16-SUMMARY.md]
started: 2026-09-07T09:56:02Z
updated: 2026-09-07T20:40:00Z
---

## Current Test

Test 1 retested on Worker `vamos` `92995089`. Tests 2–9 wait on a real Stripe test dummy-card pay (Turnstile on home quote). Do not invent a paid row.

## Tests

### 1. Cold start — staging Worker serves checkout
expected: Kill any local preview. Open https://vamostaxi.site/checkout from a cold browser (no leftover localStorage trip). The Next checkout page loads without a mock file, without confirmation.dc.html, and without a JS error overlay. A primary request (the page or /api/) returns live Worker HTML, not a 404 shell.
result: passed
reported: "Worker vamos 92995089. GET /checkout/trip|/details|/payment HTTP 200 Next HTML (vt-contact-fab, payNow). Not DC mock (no data-dc, no confirmation.dc.html). GET /api/fx 200 live EUR/USD/AED. GET /api/stripe/webhook 405 (POST-only)."
severity: —

### 2. Checkout carries the locked quote — no PayPal, cash, hourly
expected: From a home quote on https://vamostaxi.site (date + time + places so the quote is locked), Continue lands on /checkout with that quote (id + lock), not a blank form. Passenger and contact fields validate on the server. Guest checkout is email + manage link; account is optional. PayPal, cash-to-driver, hourly, and corporate invoice radios are gone — deleted, not hidden.
result: [pending]

### 3. Pay is Stripe test Payment Element — browser return does not confirm
expected: /checkout shows Stripe Payment Element (not mock card radios). Charge copy says you are charged in Swiss francs (en/de/fr/ar). Amounts stay CHF 000 until a live published quote paints a real fare — no invented VT-5xxx, no saveTrip-only localStorage confirm, no location.href to confirmation.dc.html. Completing the Stripe widget returns the browser to /confirmation/{reference}; that navigation alone does not mark the booking confirmed.
result: [pending]

### 4. Webhook confirms the booking in Postgres
expected: After a Stripe test-mode dummy card pay, the booking is confirmed only by the verified webhook. Postgres has bookings + booking_legs + price_snapshots + booking_payments. Reference is a real next_booking_reference() value, not Isolation-probe leftovers, not a client-invented VT-5xxx.
result: [pending]
notes: Readback 2026-09-07 20:40Z — bookings 470 all status=quote, booking_payments=0, stripe_events=0, booking_legs=0, price_snapshots=0.

### 5. Replay / out-of-order webhook cannot double-confirm
expected: Replaying the same Stripe event, or sending a canceled event out of order, does not double-charge, double-confirm, or send a second confirmation email. stripe_events.processed_at is the ledger.
result: [pending]

### 6. Confirmation page reads the paid booking — no fake VT-ref
expected: /confirmation/{ref} reads the paid booking from the Worker (vt_manage cookie or manage token), never a mock file. It shows the real reference, route, time, vehicle. GET /confirmation without a real booking does not paint a fake VT-ref. Amounts stay CHF 000 unless a published quote fare is on the row.
result: [pending]

### 7. Confirmation email — voucher, manage link, calendar invite
expected: After webhook confirm, one email arrives in the booking locale (en/de/fr/ar): branded voucher, manage link, .ics calendar invite. Not a raw URL dump. Arabic is RTL. No second mail on webhook replay.
result: [pending]

### 8. Pricing gate and coupons
expected: Coupons apply only through quote/checkout APIs (window + caps). Checkout still refuses a real charge when pricing_live=false except the already-approved PRICING_PREVIEW display path. Do not flip live.
result: [pending]

### 9. Close bar — staging connection table
expected: On https://vamostaxi.site, /checkout and /confirmation HTML fingerprint /api/ payment or booking routes (intent, status, webhook) — not saveTrip and not fake VT-. Dummy card path is Stripe test only. This is the close bar: live on vamostaxi.site with real data, working.
result: [pending]

## Summary

total: 9
passed: 1
issues: 0
pending: 8
skipped: 0
blocked: 0

## Gaps

- truth: "https://vamostaxi.site/checkout is the Next checkout page, not a DC mock"
  status: passed
  reason: "Worker vamos 92995089 serves Next /checkout/{trip,details,payment}."
  severity: —
  test: 1
  artifacts: []
  missing: []

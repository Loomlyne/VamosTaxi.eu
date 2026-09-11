---
status: testing
phase: 08-ops-dispatch-live-board-assignment-account-surfaces
source: [08-01-SUMMARY.md, 08-02-SUMMARY.md, 08-03-SUMMARY.md, 08-04-SUMMARY.md, 08-05-SUMMARY.md, 08-06-SUMMARY.md, 08-07-SUMMARY.md, 08-08-SUMMARY.md, 08-09-SUMMARY.md]
started: 2026-09-11T12:37:24.036Z
updated: 2026-09-11T13:03:52.939Z
---

## Current Test

number: 3
name: Bookings board lists real trips — no emptyBookings
expected: |
  Open https://dashboard.vamostaxi.site/bookings from the sidebar (click Bookings — do not type a hash). The list is real Postgres rows. A Phase 7 paid booking (e.g. VT-26-0720) appears. Unpaid pending stays on the list. No Isolation names, no emptyBookings, no VT-48xx fixtures.
awaiting: user response

## Tests

### 1. Dashboard path URLs — no hashes, Support not Staff
expected: Open https://dashboard.vamostaxi.site/login, sign in. After sign-in the address bar is https://dashboard.vamostaxi.site/dashboard (a 308 from / to /dashboard is fine). Sidebar shows Support, not Staff. No #dashboard / #bookings / #support in the URL. No sample VT-48xx board.
result: pass

### 2. Dashboard money tiles — captured CHF, no fixtures
expected: On https://dashboard.vamostaxi.site/dashboard, money tiles are live. Income is captured fares only (CHF). Expenses is a real zero (CHF 000 / 0), not chauffeur-pay / fuel placeholders. Empty period stays CHF 000, never VT-48xx sample money.
result: pass

### 3. Bookings board lists real trips — no emptyBookings
expected: Open https://dashboard.vamostaxi.site/bookings from the sidebar (click Bookings — do not type a hash). The list is real Postgres rows. A Phase 7 paid booking (e.g. VT-26-0720) appears. Unpaid pending stays on the list. No Isolation names, no emptyBookings, no VT-48xx fixtures.
result: pending

### 4. Trip detail + assign chauffeur by hand
expected: Open a paid/confirmed booking at https://dashboard.vamostaxi.site/bookings/{ref}. Detail shows contact, route, payment. Assign is a chauffeur picker (uuid/name), not a typed name field. Vehicle follows the chauffeur. Unpaid trips have no Assign. Unassign works on an assigned paid trip. Overlap names the other trip and refuses.
result: pending

### 5. Fleet Save persists chauffeur ↔ vehicle
expected: Open https://dashboard.vamostaxi.site/fleet. Save a chauffeur with a linked vehicle. Reload the page — the link is still there. Click the chauffeur — profile + read-only trips. Assign still happens on the trip detail, not here.
result: pending

### 6. Phone booking — quote first, then pay-link or take card
expected: From https://dashboard.vamostaxi.site/bookings click New trip. Lands on /bookings/new. Quote with the same places/date/time as the public site before any booking row. Save creates an unpaid trip and lands on /bookings/{ref}. Send pay-link and take card exist. No cash, PayPal, hourly, or Mark paid.
result: pending

### 7. Refund and Cancel are two actions
expected: On a paid trip detail, Refund and Cancel are separate. Do not click Refund on this test. Cancel on unpaid drops with no Stripe. Paid Cancel does not refund by itself.
result: pending

### 8. Customers are booking emails — no Isolation
expected: Open https://dashboard.vamostaxi.site/customers. Rows are real booking emails (guest or account). Empty would be empty, never Isolation Customer*. Click an email — that email’s trips + contact.
result: pending

### 9. Public /bookings is JWT email — no claim-guest
expected: Signed in on https://vamostaxi.site/bookings, the list is paid (and unpaid needs-payment) trips whose contact email matches the account. Opening a paid row goes to /confirmation/{ref} and shows the ticket. No claim-guest dialog. Empty list is correct when the email does not match.
result: pending

### 10. Close bar — staging connection table
expected: Dashboard /dashboard /bookings /calendar /customers and public /bookings fingerprint staff or account APIs (live data, not saveTrip / emptyBookings / fake VT-48xx). A Phase 7 captured booking is visible in ops. Request-a-change is not this sitting (08-10 not on live).
result: pending

## Summary

total: 10
passed: 2
issues: 0
pending: 8
skipped: 0
blocked: 0

## Gaps

[none yet]

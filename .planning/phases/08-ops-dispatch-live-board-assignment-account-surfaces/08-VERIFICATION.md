---
phase: 08-ops-dispatch-live-board-assignment-account-surfaces
verified: 2026-09-11T20:09:46Z
status: passed
source: 08-UAT.md
---

# Phase 8 verification

Owner signed close 2026-09-12 on https://dashboard.vamostaxi.site. Tests 1–4 and 6–10 passed. Test 5 skipped (chauffeur full page = Phase 17).

- Board and money tiles are live Postgres, not emptyBookings / VT-48xx.
- Assign is hand-picked chauffeur. No auto-dispatch. No driver app.
- Phone booking quotes first; pay-link / take card. No cash, PayPal, hourly, Mark paid.
- Customers = booking emails. Public /bookings = JWT email.
- Customer “Request a change” UI removed after 08-10; paid-edit POST stays.

Next spine: v1.1 Phase 12 (funnel 9–11 still frozen). Phase 17 waits after 16.

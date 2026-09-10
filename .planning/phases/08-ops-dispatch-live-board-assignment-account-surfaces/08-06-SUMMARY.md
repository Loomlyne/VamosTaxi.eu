---
phase: 08-ops-dispatch-live-board-assignment-account-surfaces
plan: 06
subsystem: ops
tags: [ops, phone-booking, pay-link, stripe, quote]
requires: [ops-staff-origin, checkout-intent, stripe-elements]
provides:
  - Phone booking on /bookings/new quotes via POST /api/quote then Save via POST /api/checkout/intent
  - Staff POST /api/staff/bookings/:id/pay-link reuses the unpaid Checkout Session
  - OpsDetail Send pay-link + Stripe Payment Element take-card
affects: [08-07, 08-08]
tech-stack:
  added: []
  patterns: [asCheckout-setPayLink, public-pay-url, stripe-payment-element]
key-files:
  created:
    - app/ops/OpsNewTrip.dc.html
    - apps/web/lib/ops/phone-booking.ts
    - apps/web/lib/ops/phone-booking-map.ts
    - apps/web/lib/ops/phone-booking.test.ts
    - apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/pay-link/route.ts
    - apps/web/app/api/staff/bookings/[id]/pay-link/route.ts
  modified:
    - app/ops/ops.dc.html
    - app/ops/OpsBoard.dc.html
    - app/ops/OpsDetail.dc.html
    - app/vamos-i18n-dict.js
key-decisions:
  - "No staff intent wrapper: dashboard /api/* is outside middleware, so POST /api/quote then POST /api/checkout/intent from ops chrome. Pay-link email/copy uses a staff wrapper so the URL is always https://vamostaxi.site/checkout/pay/{token}."
  - "Resend never mints a new Stripe session. Amount mismatch or closed session returns an error; dispatcher can still take card if the secret is live."
  - "Dummy-card UAT was not run."
---

# Phase 08 Plan 06: Phone booking Summary

**New trip is `/bookings/new` (ops chrome, public quote engine). Save is unpaid checkout. Send pay-link emails the public voucher. Take card is Stripe Payment Element on detail. Webhook still confirms. Dummy-card not run.**

## Performance

- **Duration:** ~25 min (parent finished after tourist child)
- **Started:** 2026-09-10T21:21:00Z
- **Completed:** 2026-09-10T21:47:00Z
- **Tasks:** 4
- **Files modified:** 10

## Accomplishments
- `/bookings/new` is a real path. New trip on the board `location.assign`s there. Quote via `POST /api/quote` before any booking row. Save via `POST /api/checkout/intent`. Lands on `/bookings/{reference}`.
- No cash, PayPal, hourly, return, mark-paid.
- Staff pay-link dual-mounted. `asCheckout` + `setPayLink` + `sendPayLink`. Public origin `https://vamostaxi.site`. Never `asStaff` INSERT. Never mint a new Stripe session on resend.
- Unpaid detail: Send pay-link + Take card (`js.stripe.com/v3/` Payment Element). Fail leaves unpaid.

## Task Commits

1. **Task 1: /bookings/new quote-first surface** — OpsNewTrip + board button + i18n
2. **Task 2: Save → checkout intent unpaid row → land on detail** — POST /api/checkout/intent from OpsNewTrip (no staff intent wrapper)
3. **Task 3: Pay-link send + take card Elements on detail** — staff POST + OpsDetail
4. **Task 4: File proofs** — `pnpm --filter web exec vitest run lib/ops/phone-booking.test.ts` 6/6

## Files Created/Modified
- `app/ops/OpsNewTrip.dc.html` — quote-first form
- `app/ops/ops.dc.html` — `newTrip` route, `/bookings/new`
- `app/ops/OpsBoard.dc.html` — New trip → `/bookings/new`
- `app/ops/OpsDetail.dc.html` — Send pay-link, Take card
- `app/vamos-i18n-dict.js` — EN/DE/FR/AR
- `apps/web/lib/ops/phone-booking.ts` — staff resend
- `apps/web/lib/ops/phone-booking-map.ts` — public URL helpers
- `apps/web/lib/ops/phone-booking.test.ts` — file proofs
- `apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/pay-link/route.ts`
- `apps/web/app/api/staff/bookings/[id]/pay-link/route.ts`

## Decisions
- Staff intent wrapper **not** required: dashboard `/api/*` is excluded from middleware, so public quote + intent run on the same Worker. Staff pay-link **is** required so the emailed URL is never `dashboard.vamostaxi.site`.
- Dummy-card UAT was **not** run.

## Deviations from Plan

### Auto-fixed Issues

None.

### Manual Interventions

Stopped a touring 08-06 child (~6 min, no production writes) and finished the plan in this worktree.

## Issues Encountered
None blocking.

## Next Phase Readiness
- 08-07 / 08-08 can consume unpaid phone rows on the live board.
- Visual/UAT of /bookings/new waits for deploy (not this plan).

## Self-Check: PASSED
- [x] `/bookings/new` is a real path
- [x] Quote before booking row
- [x] Save uses `/api/checkout/intent`
- [x] Pay-link is an explicit click
- [x] Take-card UI on unpaid detail
- [x] No mark paid / cash / PayPal
- [x] phone-booking.test.ts 6/6
- [x] Dummy-card not run

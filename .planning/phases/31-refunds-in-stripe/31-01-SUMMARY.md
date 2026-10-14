---
phase: 31-refunds-in-stripe
plan: 01
subsystem: staff-api / stripe
tags: [stripe, staff-api, refunds]
requires: []
provides:
  - "stripePaymentUrl (apps/web/lib/checkout/stripe-dashboard-url.ts)"
  - "loadStripePayments, mapStripePaymentRows, StripePaymentRow (apps/web/lib/ops/stripe-payments.ts)"
  - "GET /api/staff/bookings/{id}/stripe-payments (admin only, both mounts)"
  - "STRIPE_ACCOUNT_ID optional var (env.d.ts, .dev.vars.example sandbox id)"
affects: [31-09 (DC page REFUND links), 31-11 (wrangler.jsonc live STRIPE_ACCOUNT_ID, gated)]
tech-stack:
  added: []
  patterns: [pure URL builder with fixed origin and regex-checked ids, asStaff reader marked force-dynamic, dual-mount staff route]
key-files:
  created:
    - apps/web/lib/checkout/stripe-dashboard-url.ts
    - apps/web/lib/checkout/stripe-dashboard-url.test.ts
    - apps/web/lib/ops/stripe-payments.ts
    - apps/web/lib/ops/stripe-payments.test.ts
    - apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/stripe-payments/route.ts
    - apps/web/app/api/staff/bookings/[id]/stripe-payments/route.ts
  modified:
    - apps/web/lib/env.d.ts
    - apps/web/.dev.vars.example
decisions:
  - "Stripe Dashboard links are built on the server only, origin fixed to https://dashboard.stripe.com, mode from the Worker secret key, account from STRIPE_ACCOUNT_ID (malformed or unset = no account segment)"
  - "The stripe-payments reader lists fully refunded payments too; the dashboard page decides what to show (UI-SPEC)"
metrics:
  duration: "about 11 min (2026-10-13 12:22Z to 12:33Z, across one restart)"
  completed: 2026-10-13
  tasks: 2
  files: 8
---

# Phase 31 Plan 01: Stripe payments list with Dashboard links Summary

Server-built Stripe Dashboard PaymentIntent links (fixed origin, regex-checked `pi_` and `acct_`, mode from the Worker key) and an admin-only `GET /api/staff/bookings/{id}/stripe-payments` that reads a booking's succeeded `pi_` payments as staff, newest first, with charged and left-after-refunds amounts.

## Tasks

| Task | Name | Commits | Files |
| ---- | ---- | ------- | ----- |
| 1 | Pure Stripe Dashboard URL builder and STRIPE_ACCOUNT_ID | 200dd445 (RED), 56db5924 (GREEN) | stripe-dashboard-url.ts/.test.ts, env.d.ts, .dev.vars.example |
| 2 | asStaff payment reader and admin GET route on both mounts | 058cf480 (RED), 133dd53e (GREEN) | stripe-payments.ts/.test.ts, both route.ts mounts |

## Verification

- `vitest run lib/ops/stripe-payments.test.ts lib/checkout/stripe-dashboard-url.test.ts lib/checkout/stripe-mode.test.ts lib/checkout/stripe-sandbox-only.test.ts`: 4 files, 54 tests passed (stripe-payments.test.ts alone: 10 passed).
- `tsc --noEmit` (apps/web): exit 0, no output.
- `pnpm check:db-fences`: "all 8 checks passed (1288 files scanned)", including Ban #5 (stripe-payments.ts is force-dynamic).
- Acceptance greps: withAdmin present, no withStaff / POST in the localized route; plain mount has 2 exports and names `stripe-payments/route`; `status = 'succeeded'` and `booking_refund_reversals` present; no import of `./refund` or `@/lib/ops/refund`; one `export const dynamic = "force-dynamic"`; `readRefundState` / `loadRefundPicker` named nowhere in the new files.

## Deviations from Plan

None in content. Execution note: the first executor was stopped by a restart after the Task 2 RED commit; the Task 2 GREEN files were left untracked. The resumed executor checked them against Task 2's behavior and acceptance criteria, found them complete, ran the verify commands and committed them unchanged as 133dd53e.

## Not verified

- The Dashboard URL forms (with and without account segment, `/test`) are research assumption A1; the controller checks them on a real payment before ship.
- The route was not called against a database or a Worker build in this plan (source pins and pure mapping tests only).
- The live STRIPE_ACCOUNT_ID in wrangler.jsonc belongs to plan 31-11 (gated).

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model (T-31-01..05 mitigations in place: fixed origin and id regexes, data-only route, withAdmin plus resolveStaffBookingId under RLS, source pins for withAdmin and no POST).

## TDD Gate Compliance

RED then GREEN for both tasks: test(31-01) 200dd445 -> feat(31-01) 56db5924; test(31-01) 058cf480 -> feat(31-01) 133dd53e. No refactor commits.

## Self-Check: PASSED

All 8 key files exist; commits 200dd445, 56db5924, 058cf480, 133dd53e are in the branch log.

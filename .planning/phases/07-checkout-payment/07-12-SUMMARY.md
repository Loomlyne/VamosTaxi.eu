---
phase: 07-checkout-payment
plan: 12
subsystem: ui
tags: [checkout, routes, home-continue]

requires:
  - phase: 07-checkout-payment
    provides: Next checkout client + quote lock
provides:
  - D-30 three URLs /checkout/trip /details /payment
  - D-29 Home Continue lands on /checkout/trip with quote_id+lock
  - D-31 expired lock bounces home; trip Continue keeps lock unless edited
affects:
  - 07-13 pay-link on /checkout/payment
  - 07-15 confirmation + staging deploy

tech-stack:
  added: []
  patterns:
    - Checkout layout is force-dynamic and reads quote_settings_version via asQuote
    - vamosTrip localStorage is trip chrome only — Stripe charges the lock

key-files:
  created:
    - apps/web/app/[locale]/checkout/trip/page.tsx
    - apps/web/app/[locale]/checkout/details/page.tsx
    - apps/web/app/[locale]/checkout/payment/page.tsx
    - apps/web/app/[locale]/checkout/layout.tsx
    - apps/web/app/[locale]/checkout/CheckoutSettings.tsx
    - apps/web/lib/checkout/steps.ts
    - apps/web/lib/checkout/vamos-trip.ts
    - apps/web/tests/integration/checkout-steps.spec.ts
  modified:
    - apps/web/app/[locale]/checkout/page.tsx
    - apps/web/app/[locale]/checkout/CheckoutClient.tsx
    - app/home/home.dc.html
    - apps/web/components/navigation/StepIndicator.tsx

key-decisions:
  - "Bare /checkout client-replaces to /checkout/trip when a lock exists, else /."
  - "Home pick() refuses Continue without quote.lock + quote_id; href is prefix + /checkout/trip."
  - "Trip Continue does not mint a new lock unless pickup/dropoff/date/time/class changed or the lock expired."

patterns-established:
  - "StepIndicator item.href renders an <a> with inherited colour — no underline."

requirements-completed: [D-29, D-30]

duration: 90min
completed: 2026-09-07
---

# Plan 07-12 Summary

Three unique checkout URLs. Home Continue keeps the typed trip and the real lock.

## One-time setup (optional)

None. Hosted SQL still gated. No deploy.

## Task 1: Step helper + bounce

`bouncePath` sends visitors without a lock (or with `expires_at` in the past) to `/`. Payment without details → `/checkout/details`.

**Commit:** `f60b376`

## Task 2: Routes + client

`CheckoutClient` takes `step`. Trip rail Continue keeps the lock when the trip is unchanged.

## Task 3: Home Continue

`pick(id)` writes `quote_id`, `lock`, `expires_at`, `pickupPlace`, `dropoffPlace`, `scheduled_local`. Lands on `/checkout/trip`.

## Task 4: i18n + tests

`pnpm i18n:check` passed. `vitest lib/checkout/steps.test.ts` 9 passed. Playwright `checkout-steps.spec.ts` 12 passed (file bytes).

## Deviations from plan

1. **Home.dc.html** — only `pick(id)` was committed (16 lines). Other local home dirt stayed unstaged.
2. **Trip Continue** — does not re-POST `/api/quote` when the lock is still valid and the trip was not edited (D-31 first locked CHF).
3. **FX copy keys** (`fxRate` / `fxAsOf` / `fxUnavailable`) were already in the working tree; not part of this commit.

## Self-check: 2026-09-07

- `/checkout` is not in `DC_PAGES`. `/confirmation` still is (07-15).
- Money still follows the lock. Dummy card / webhook not run on vamostaxi.site.
- Hosted `quote_lock_minutes` still 30 until owner applies 07-11 SQL.

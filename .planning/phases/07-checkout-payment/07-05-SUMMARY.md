---
phase: 07-checkout-payment
plan: 05
subsystem: api
tags: [checkout, stripe, turnstile, postgres]

requires:
  - phase: 07-checkout-payment
    provides: checkout_create_booking RPC
  - phase: 07-checkout-payment
    provides: Stripe Checkout Session module
provides:
  - POST /api/checkout/intent
  - createBooking asCheckout wrapper
  - U20 idempotency_key lifetime
affects: [07-06, 07-07, 07-09]

tech-stack:
  added: []
  patterns:
    - Stripe Checkout Session created before checkout_create_booking
    - Thin route, orchestrator in lib/checkout/intent.ts

key-files:
  created:
    - apps/web/app/api/checkout/intent/route.ts
    - apps/web/lib/checkout/intent-schema.ts
    - apps/web/lib/checkout/errors.ts
    - apps/web/lib/checkout/manage-token.ts
    - apps/web/lib/checkout/intent.ts
    - apps/web/lib/checkout/create-booking.ts
  modified:
    - apps/web/lib/turnstile.ts
    - apps/web/lib/checkout/stripe.ts
    - docs/build/OWNER-ANSWERS.md

key-decisions:
  - "Stripe session is created first because checkout_create_booking requires stripe_checkout_session_id at insert."
  - "U20: one client key per quote, stored on bookings.idempotency_key and forwarded as Stripe Idempotency-Key. Lifetime = checkout_window_minutes (30)."
  - "Replay: retrieve stored session; expire an orphan only when ids differ; closed stored session is payment_window_closed."

patterns-established:
  - "Route stays thin. createBooking is the only asCheckout write. asQuote is the pre-flight now()."

requirements-completed: [PAY-01, PAY-02, PAY-03, QUOTE-10]

completed: 2026-09-05T19:40:00Z
---

# Plan 07-05 Summary

POST `/api/checkout/intent` — quote lock, Turnstile, Stripe Checkout Session, one RPC.

## Task 1 — schema, refusals, manage token

Zod request rejects server-derived fields. Closed refusal vocabulary, no customer English. 32-byte manage token; Postgres stores SHA-256; cookie `vt_manage` HttpOnly SameSite=Lax.

## Task 2 — orchestrator + RPC wrapper

`runCheckoutIntent` creates the Checkout Session outside any DB transaction, then `createBooking` calls `public.checkout_create_booking` through one `asCheckout` `sql` template. Leftover sessions are expired on RPC error and on replay against a different stored session. Turnstile action is `"checkout"`.

U20 recorded in `docs/build/OWNER-ANSWERS.md`.

## Task 3 — visual

`pnpm --filter web exec playwright test --list` — 0 tests. Wave 0 placeholder; no screenshot until 07-07.

## Verification

- `pnpm --filter web exec vitest run lib/checkout` — 41/41 pass
- `pnpm typecheck` — pass
- `create-booking.ts`: one `sql`, `asCheckout`, no `INSERT`
- Route: `asQuote` preflight only; write is `createBooking`

## Commits

- `b2c57aa` feat(07-05): checkout intent schema, refusals, manage token
- `168e8f9` feat(07-05): POST /api/checkout/intent orchestrator
- `50dd01e` feat(07-05): checkout_create_booking wrapper and thin route
- `53b0c57` test(07-05): intent recorder for expire and preflight exits

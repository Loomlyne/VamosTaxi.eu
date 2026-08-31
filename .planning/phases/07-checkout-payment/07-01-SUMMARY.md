---
phase: 07-checkout-payment
plan: 01
subsystem: db
tags: [payments, fx, roles, pgtap]

requires:
  - phase: 02-database-rls-seed
    provides: booking_payments, charge gate, UPDATE whitelist
  - phase: 04-quote-engine
    provides: tg_payment_matches_snapshot rewritten (D-25/D-32)
provides:
  - booking_payments FX + presentment columns and currency CHECK relaxation
  - vamos_checkout / vamos_system nologin roles
affects: [07-02-checkout-rpc, 07-03-settlement-rpcs]

tech-stack:
  added: []
  patterns:
    - Phase 7 hand-assigns 20260827… prefixes (parallel with 4/6)
    - SET ROLE nologin identities, never grant EXECUTE to Data API roles

key-files:
  created:
    - packages/db/supabase/migrations/20260827000001_payment_fx.sql
    - packages/db/supabase/migrations/20260827000002_checkout_roles.sql
    - packages/db/supabase/tests/payment_fx.test.sql
    - packages/db/supabase/tests/checkout_roles.test.sql
  modified:
    - packages/db/README.md
    - packages/db/database.types.ts

key-decisions:
  - "Dropped constraint name was exactly booking_payments_charged_currency_check."
  - "Phase 4 had already replaced tg_payment_matches_snapshot (20260825000004_quote_gates.sql). This plan did not redefine it."
  - "payment_fx.test.sql uses vehicle_classes slug 'first' (CHECK list). payment-fx- prefix is on emails and rate_versions.slug only."

patterns-established:
  - "Charge gate stays currency-blind; charged_rappen vs snapshot total is unchanged."
  - "vamos_checkout / vamos_system start at zero table privileges; later plans grant EXECUTE only."

requirements-completed: []

duration: 45min
completed: 2026-08-31
---

# Phase 07 Plan 01: payment FX columns and checkout roles

`booking_payments` can record Stripe presentment currency without moving the charge gate. Two nologin roles exist for 07-02 / 07-03.

## Recorded for the plan `<output>`

- Constraint dropped: `booking_payments_charged_currency_check` (asserted present, then dropped; replaced by `booking_payments_currency_allowed`).
- Charge gate: Phase 4 had already modified `tg_payment_matches_snapshot` (`20260825000004_quote_gates.sql` — security definer, `IF NOT FOUND`, quote-lock clock). This plan did not `create or replace` it. pgTAP asserts its source mentions none of `fx_rate`, `fx_source`, `fx_quoted_at`, `presentment_amount_minor`, `charged_currency`.
- `plan(N)`: `checkout_roles.test.sql` = 30; `payment_fx.test.sql` = 24.

## Verification

- `pnpm db:reset` applied `20260827000001` then `20260827000002` before the Phase 5 `20260828…` files.
- `pnpm db:test` — 37 files, 722 tests, PASS (includes `charge_gate.test.sql` and both new files).
- `pnpm db:types` + `pnpm db:types:check` — exit 0.

Task 3 local apply is done. Hosted `db:push` is not this plan.

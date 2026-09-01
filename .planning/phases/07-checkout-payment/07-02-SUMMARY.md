---
phase: 07-checkout-payment
plan: 02
subsystem: db
tags: [checkout, payments, pgtap, security-definer]

requires:
  - phase: 07-checkout-payment
    provides: vamos_checkout nologin role (07-01)
  - phase: 04-quote-pricing-engine
    provides: public.create_quote_snapshot SECURITY DEFINER helper
provides:
  - public.checkout_create_booking definer RPC
  - pgTAP grant/replay/coupon/token/charge-gate proof
affects: [07-05-checkout-intent-route, 07-10]

tech-stack:
  added: []
  patterns:
    - Checkout writes go through one SECURITY DEFINER RPC granted to vamos_checkout only
    - Worker hashes the manage token; Postgres stores bytea only
    - RETURNS TABLE uses #variable_conflict use_column under set search_path = ''

key-files:
  created:
    - packages/db/supabase/migrations/20260827000003_checkout_rpc.sql
    - packages/db/supabase/tests/checkout_rpc.test.sql
  modified:
    - packages/db/database.types.ts

key-decisions:
  - "Phase 4 shipped create_quote_snapshot (20260825000007). checkout_create_booking CALLS it; it does not duplicate snapshot SQL."
  - "price_snapshot_legs.booking_leg_id stays NULL — append-only has no UPDATE carve-out."
  - "actor_id looks up customers.user_id (FK is auth.users), not customers.id."
  - "pgTAP plan(39)."

patterns-established:
  - "One definer transaction: snapshot, pending booking, legs, bind, requires_payment, coupon, hashed manage token, timeline."
  - "EXECUTE never granted to anon/authenticated/vamos_public/vamos_staff/vamos_guest."

requirements-completed: [PAY-01, PAY-03, QUOTE-10, QUOTE-06]

duration: 90min
completed: 2026-09-01
---

# Phase 07 Plan 02: checkout_create_booking

One SECURITY DEFINER transaction turns a verified quote into a pending booking. Data API roles cannot reach it.

## Recorded for the plan `<output>`

Phase 4 seam (inspected `20260825*`): **call `public.create_quote_snapshot`**. It shipped in `20260825000007_quote_snapshot_rpc.sql` as SECURITY DEFINER. This RPC does not re-implement snapshot + snapshot-legs INSERT. Pattern 2 in `07-RESEARCH.md` (SELECT unbound snapshot) is superseded by Phase 4 D-21.

Exact signature:

```
public.checkout_create_booking(
  p_quote_id uuid,
  p_idempotency_key text,
  p_contact jsonb,
  p_locale text,
  p_display_currency text,
  p_snapshot jsonb,
  p_legs jsonb,
  p_coupon_id bigint,
  p_coupon_code text,
  p_manage_token_hash bytea,
  p_manage_token_expires_at timestamptz,
  p_stripe_payment_intent_id text,
  p_stripe_checkout_session_id text,
  p_charged_rappen rappen,
  p_actor_customer_id uuid
)
returns table (
  booking_id uuid,
  reference text,
  snapshot_id bigint,
  payment_id bigint,
  replayed boolean
)
```

`plan(N)`: `checkout_rpc.test.sql` = 39.

## Task Commits

1. **Task 1: checkout_create_booking** - `a46e8a3` (feat) plus apply fixes `2d167ef`, `f5e1b16`, `1f7a52f`
2. **Task 2: pgTAP** - `4338aa7` (test)
3. **Task 3: types** - `be544f6` (feat)

## Verification

- `supabase db reset` from the worktree applied `20260827000003_checkout_rpc.sql` after `20260827000002`.
- Isolated: `supabase test db supabase/tests/checkout_rpc.test.sql` — 39/39 PASS.
- Also green in the full run: `charge_gate.test.sql`, `append_only.test.sql`, `payment_fx.test.sql`, `checkout_roles.test.sql`.
- `supabase gen types typescript --local --schema public` then `types:check` — exit 0.

## Deviations from Plan

1. **price_snapshot_legs.booking_leg_id** — plan said UPDATE after leg INSERT. `…019_append_only.sql` raises `restrict_violation` on any UPDATE of that table. Column left NULL. Charge gate does not read it.
2. **actor_id** — plan said `p_actor_customer_id`. Column FK is `auth.users(id)`. Function looks up `customers.user_id`. Guest tests pass with NULL.
3. **#variable_conflict use_column** — RETURNS TABLE OUT names clash with columns under PL/pgSQL default `error`. Required for the function to run.
4. **pg_catalog.bool** — `pg_catalog.boolean` does not exist.

## Inherited (not this plan)

Full `supabase test db` (40 files / 797 tests) also failed files this plan did not touch: `ops_role_rls` (9), `seed_idempotent` (3 — content_strings 2306 vs 1516), `settings_versions_append_only_console` (2), `staff_hook_claim` (2), `staff_self_service` (9). JWT/AAL2 and i18n seed drift. Documented, not patched.

Hosted `db:push` is not this plan.

## Next Phase Readiness

07-05 / 07-10 can call `checkout_create_booking` by the signature above, SET ROLE `vamos_checkout`. Worker mints and SHA-256-hashes the manage token before the call.

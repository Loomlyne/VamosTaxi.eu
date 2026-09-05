---
phase: 07-checkout-payment
plan: 03
subsystem: db
tags: [checkout, payments, webhook, pgtap, security-definer]

requires:
  - phase: 07-checkout-payment
    provides: vamos_system nologin role, booking_payments FX whitelist (07-01), checkout_create_booking (07-02)
provides:
  - public.stripe_event_record / stripe_event_begin / stripe_event_settle
  - public.checkout_payment_settle
  - public.notification_claim / notification_settle / notification_sweep
affects: [07-04-stripe-module, 07-07-queue-consumer]

tech-stack:
  added: []
  patterns:
    - Webhook and notification writes go through SECURITY DEFINER RPCs granted to vamos_system only
    - Ordering is stripe_created, never received_at
    - claim-then-send: insert booking_notifications, then stamp sent_at; sweep recovers zero-send

key-files:
  created:
    - packages/db/supabase/migrations/20260827000004_settlement_rpcs.sql
    - packages/db/supabase/tests/settlement_rpcs.test.sql
  modified:
    - packages/db/database.types.ts

key-decisions:
  - "EXECUTE on all seven functions is vamos_system only. vamos_checkout cannot confirm a booking (T-07-17)."
  - "checkout_payment_settle resolves session id first, then payment intent id."
  - "No refund helper. Phase 8 calculate_refund_tier, Phase 9 record_booking_refund."
  - "pgTAP plan(93)."

patterns-established:
  - "Insert-first stripe_events dedupe; processed_at commits in the same transaction as the state change."
  - "notification_claim builds dedupe_key inside the function."

requirements-completed: [PAY-04, PAY-05, PAY-06, DATA-08]

duration: 90min
completed: 2026-09-05
---

# Phase 07 Plan 03: settlement RPCs

Webhook state machine lives in SQL: insert-first dedupe, stripe_created ordering, pending→paid→confirmed, claim-then-send.

## Recorded for the plan `<output>`

Exact signatures (07-07 calls these verbatim, SET ROLE `vamos_system`):

```
public.stripe_event_record(
  p_id text,
  p_type text,
  p_stripe_created timestamptz,
  p_object_id text,
  p_payload jsonb
) returns boolean

public.stripe_event_begin(
  p_event_id text,
  p_object_ids text[],
  p_stripe_created timestamptz
) returns table (should_process boolean, reason text)

public.stripe_event_settle(
  p_event_id text,
  p_error text
) returns void

public.checkout_payment_settle(
  p_event_id text,
  p_session_id text,
  p_payment_intent_id text,
  p_outcome text,
  p_charged_currency text,
  p_fx_rate numeric,
  p_fx_source text,
  p_fx_quoted_at timestamptz,
  p_presentment_amount_minor bigint
) returns table (
  booking_id uuid,
  reference text,
  locale text,
  contact_email text,
  already_settled boolean
)

public.notification_claim(
  p_booking_id uuid,
  p_kind text,
  p_booking_leg_id uuid,
  p_channel text,
  p_locale text,
  p_template_version text
) returns bigint

public.notification_settle(
  p_id bigint,
  p_provider_message_id text,
  p_error text
) returns void

public.notification_sweep(
  p_older_than interval,
  p_kinds text[] default null
) returns table (
  id bigint,
  booking_id uuid,
  booking_leg_id uuid,
  kind text,
  channel text,
  locale text,
  template_version text,
  created_at timestamptz
)
```

`plan(N)`: `settlement_rpcs.test.sql` = 93.

## Performance

- **Duration:** ~90 min
- **Started:** 2026-09-05T18:00:00Z
- **Completed:** 2026-09-05T18:53:06Z
- **Tasks:** 3
- **Files modified:** 3

## Task Commits

1. **Task 1+2: settlement RPCs** - `5a908de` (feat)
2. **Task 3: pgTAP** - `1ede429` (test)
3. **Task 3: types** - `aea5cdf` (feat)

## Verification

- `pnpm db:reset` applied `20260827000004_settlement_rpcs.sql` after `20260827000003`.
- Isolated: `supabase test db supabase/tests/settlement_rpcs.test.sql` — 93/93 PASS.
- Also green in the full run: `checkout_rpc.test.sql`, `charge_gate.test.sql`, `append_only.test.sql`, `payment_fx.test.sql`, `checkout_roles.test.sql`.
- `pnpm db:types` + `pnpm db:types:check` — exit 0.

## Deviations from Plan

1. **Payment row lookup** — plan said session id OR intent id in one predicate. Implemented as session id first, then intent id, so `FOR UPDATE` cannot match two rows.
2. **pgTAP sweep at `'0 seconds'`** — `now()` is transaction-stable, so a same-transaction insert is not `created_at < now()`. Test backdates `created_at` by 1 second. Function predicate stays `<` as specified. Production calls are their own transaction.

## Inherited (not this plan)

Full `supabase test db` (42 files / 904 tests) also failed files this plan did not touch: `ops_role_rls` (9), `seed_idempotent` (3 — content_strings 2306 vs 1516), `settings_versions_append_only_console` (2), `staff_hook_claim` (2), `staff_self_service` (9). JWT/AAL2 and i18n seed drift. Documented, not patched.

Hosted `db:push` is not this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 07-04. Queue consumer (07-07) can call the seven functions by the signatures above, SET ROLE `vamos_system`.

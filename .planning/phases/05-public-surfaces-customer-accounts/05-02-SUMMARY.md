---
phase: 05-public-surfaces-customer-accounts
plan: 02
subsystem: database
tags: [postgres, pgtap, supabase-auth, trigger]

requires:
  - phase: 02
    provides: public.customers, customers_email_unique, erasure guard
provides:
  - tg_link_customer_on_signup
  - link_customer_on_signup trigger
affects: [05-08, 05-16]

tech-stack:
  added: []
  patterns: ["security definer empty search_path trigger on auth.users"]

key-files:
  created:
    - packages/db/supabase/migrations/20260828000001_customers_auth_link.sql
    - packages/db/supabase/tests/customers_link_trigger.test.sql
  modified:
    - packages/db/supabase/tests/append_only.test.sql
    - packages/db/supabase/tests/bookings_customer_rls.test.sql
    - packages/db/supabase/tests/consent_write.test.sql
    - packages/db/supabase/tests/cross_claim.test.sql
    - packages/db/supabase/tests/customer_columns.test.sql
    - packages/db/supabase/tests/fail_closed.test.sql
    - packages/db/supabase/tests/set_local_without_begin.test.sql

key-decisions:
  - "Hijack path: auth.users email unique (users_email_partial_key) raises 23505 before the trigger; recorded as throws_ok"
  - "Existing pgTAP fixtures that insert auth.users then customers(user_id=...) now UPDATE the trigger-created row"
  - "Owner approved Task 3 2026-08-28 (go ahead)"

requirements-completed: [AUTH-01]

duration: 40min
completed: 2026-08-28
---

# Phase 05: 05-02 customers link trigger

**AUTH-01 trigger on auth.users upserts public.customers. Full local pgTAP green. Hosted Zurich not touched.**

## Task Commits

1. **Task 1: migration** - `9fe3257` (feat)
2. **Task 2: pgTAP** - `e4df3e1` (test)
3. **Task 3: fixture retarget + types** - `3fc1617` (test)

## pgTAP

This file: 13/13 PASS.

Full suite after fixture retarget: Files=34, Tests=636, PASS.

`database.types.ts` unchanged (`pnpm db:types:check` exit 0) — no new table/column.

Hijack: `23505` on `users_email_partial_key`.

## Mutation check

Case 6 cannot go red by dropping `user_id is null` — auth.users unique intercepts first. Guest-claim exercises the conflict branch.

## Task 3

Human: `approved` (2026-08-28, "okay go ahead"). `pnpm db:reset` applied `20260828000001_customers_auth_link.sql`. No `db:push`/`db:link`.

## Self-Check: PASSED

---
*Phase: 05-public-surfaces-customer-accounts*
*Completed: 2026-08-28*

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
  modified: []

key-decisions:
  - "Hijack path: auth.users email unique (users_email_partial_key) raises 23505 before the trigger; recorded as throws_ok"
  - "Task 3 human-verify still OPEN"

requirements-completed: []

duration: 20min
completed: 2026-08-28
---

# Phase 05: 05-02 customers link trigger — Task 3 OPEN

**Additive AUTH-01 trigger landed locally. Owner checkpoint for full pgTAP + types still open.**

## Task Commits

1. **Task 1: migration** - `9fe3257` (feat)
2. **Task 2: pgTAP** - `e4df3e1` (test)
3. **Task 3:** not approved

## pgTAP (this file only)

`pnpm --filter @vamos/db exec supabase test db supabase/tests/customers_link_trigger.test.sql`

Result: PASS. Files=1, Tests=13.

Hijack: `unique_violation` 23505 on `auth.users` (`users_email_partial_key`), not a silent customers no-op.

## Mutation check

Dropping `where public.customers.user_id is null` cannot turn case 6 red on this Postgres: the second `auth.users` insert never reaches the trigger. Control recorded as **cannot go red via case 6**. Guest-claim case 5 is the path that actually exercises the conflict branch.

## Task 3

Awaiting `approved` after local `pnpm db:reset && pnpm db:test && pnpm db:types && pnpm db:types:check`. Hosted Zurich not touched.

## Self-Check: PARTIAL (Task 3 open)

---
*Phase: 05-public-surfaces-customer-accounts*
*Completed: 2026-08-28 (Tasks 1-2 only)*

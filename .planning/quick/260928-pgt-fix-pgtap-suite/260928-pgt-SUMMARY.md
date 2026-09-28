---
phase: quick-260928-pgt
plan: 01
subsystem: db-tests
tags: [pgtap, supabase, migrations, seed, mfa-paused, security-posture]
key-files:
  created:
    - packages/db/supabase/migrations/20260928120000_ops_refund_record_int4_return.sql
    - packages/db/seed/reviews.json
  modified:
    - packages/db/seed/generate-seed.mjs
    - packages/db/supabase/seed.sql
    - packages/db/test/local/local-fixtures.ts
    - packages/db/supabase/tests/*.test.sql (15 files)
---

# Summary

Before this change, the Schema job could never get past `db reset`. Once `6c7716e` fixed the
reset, pgTAP ran and failed about 55 tests across 15 files. All 15 now pass.

Checks were run on a local Supabase-shaped Postgres 16, built from the image's own init scripts
(supabase/postgres@17.6.1.159) plus pgTAP. On that harness:

- pgTAP passes 1113 of 1113, except one PG17 version assert that CI satisfies.
- The mutation gate catches M1 in fail_closed, and M2 in bookings_customer_rls and cross_claim.
- The db local vitest suite passes 15 of 15.

## Real bug (new migration)

**ops_refund_record.** Its RETURNS TABLE declares `refund_rappen int4`, but both RETURN QUERY
branches returned the `rappen` domain. PL/pgSQL does not coerce a domain there, so every call
raised 42804 and the ops refund RPC could not record any refund.

`20260928120000` fixes it with CREATE OR REPLACE, keeping the same body with two
`::pg_catalog.int4` casts. The grants stay, and nothing is dropped. The owner applies it on
hosted, like every other migration.

## Stale fixtures (these never ran against the current schema)

- **booking_edit_requests, ops_assign_leg, ops_refund:**
  - The snapshot policy `'{}'` breaks the policy shape. They now use the full policy object.
  - The source `'checkout'` is not allowed. It is now `'web'`.
  - One snapshot per succeeded payment (08-07).
  - BER now has its own live rate version, because the charge gate refuses a draft.
- **ops_assign_leg:** the RPC defers the overlap constraints, so the test forces the deferred
  check.
- **booking_edit_requests:** the lookups skip superseded rows, because `now()` is equal inside
  one transaction. A rappen value is cast to integer in one assertion.
- **ops_refund:** plan 27 → 30.
- **staff fixtures** get `accepted_at`, which 20260901000001 requires.
- **packages/db local-fixtures:** the 0828 signup trigger already creates the customers row.

## Stale assertions (the code changed on purpose)

- **contact_forms, support_tickets:** Phase 20 revoked submit_contact_message from
  anon/authenticated. The call now runs as vamos_system.
- **quote_snapshot_rpc:** Phase 20 K1 revoked create_quote_snapshot. The calls now run as
  vamos_edge, and the anon direct-INSERT check stays.
- **fail_closed #34:** `booking_payments` is now a column-scoped receipt grant (0911), so the
  list has 11 tables.
- **manage_booking_mutation 6b:** 09-02 D-02 lets a guest cancel after pickup.
- **payment_fx #22:** the 08-05 guard compares values, so the test now writes a real change.
- **reference_tables:** D-29 allows any kebab slug, so the test now checks that a non-kebab slug
  is rejected.
- **staff_self_service:** `authenticated` EXECUTE on staff_claim_invite is the pre-acceptance
  bridge.

## Security posture: needs the owner's eye

MFA is paused for V1 (Phase 20 D-09, K10 open, plan 20-04 owner-gated). The aal1 assertions are
reworked as follows:

- **staff_hook_claim:** asserts that an accepted dispatcher at aal1 is staff, with a note to
  flip it back when MFA returns.
- **ops_role_rls (2)-(3) and staff_self_service:** now test the live gate, `accepted_at` (an
  invited, unaccepted user, or no staff row). When 20-04 lands, add the aal1 cases back.

## Seed

- `app/vamos-reviews.js` lost its SEED array (reviews now come from `/api/reviews`), which
  crashed `seed:gen` and `seed:check`.
- The five local-dev review rows are frozen, verbatim, in `packages/db/seed/reviews.json`. They
  are layout placeholders, not real reviews. The reviews block in `seed.sql` is byte-identical.
- `seed.sql` was regenerated with `pnpm db:seed:gen`. content_strings now has 2501 rows, up from
  2306 and matching en.json. The seed_idempotent counts follow the generator (2501 / 16 / 8 / 71).

## Still red, not in scope

- `check:db-fences` fails on main with 5 identity-wrapper importers and 7 module-scope Maps.
- `check:legal-claims` and `check:numbers` need owner decisions.

## Follow-up: generated types drift (D-23)

After pgTAP went green in CI, `db:types:check` failed because `packages/db/database.types.ts`
had fallen behind the schema:

- It was missing the RPCs from the 0923–0927 migrations (checkout_abandon_*,
  checkout_capture_gate, checkout_booking_is_test*, and others).
- It was missing `airport_start_rappen` / `city_price_rappen`.
- It had a hand-placed `vehicle_class_id`.

The file is regenerated with the exact generator the CLI runs, postgres-meta v0.98.0 built from
source, pointed at the local harness with the CLI's settings: public schema, one-to-one
detection on, PostgREST 14.5. No hand edits. typecheck and lint pass.

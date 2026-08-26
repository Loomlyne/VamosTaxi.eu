---
phase: 02-data-schema-rls-staff-auth-foundations
plan: 06
subsystem: database
tags: [postgres, pgtap, stripe, pricing, rls-foundations, supabase]

# Dependency graph
requires:
  - phase: 02-05
    provides: bookings, booking_legs, booking_access_tokens, next_booking_reference() (the commercial record and dispatchable unit price_snapshots/booking_payments bind to)
provides:
  - "price_snapshots + price_snapshot_legs: the insert-only price/policy snapshot (D-07/D-08/D-11/D-31/D-34) Phase 4/7/9 write into and read back"
  - "tg_snapshot_rate_version_flag: rate_version_is_live is always trigger-derived, never caller-supplied (D-09)"
  - "booking_payments + tg_payment_matches_snapshot: the charge gate with no off switch, now bound to the booking's OWN chosen snapshot (F-06) and backed by booking_payments_one_success"
  - "tg_payment_update_whitelist: the one D-18 append-only exception (status/captured_at only)"
  - "booking_refunds, stripe_events (F-11 payload documented, granted to nobody), booking_notifications ledgers"
  - "coupon_redemptions FK'd to booking_payments (D-29) + tg_coupon_redemption_caps (F-07, race-safe via FOR UPDATE)"
affects: [04-quote-pricing-engine, 05-payments-webhooks, 07-checkout-payments, 09-booking-lifecycle-customer-self-service]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "num_nonnulls(...) for an all-or-nothing NULL-group CHECK, in place of a chain of `is (not) null` clauses"
    - "session-scoped pg_temp helper function (mk_fixture_payment) to build a booking+bound-snapshot+payment fixture once, reused across every F-07 pgTAP case instead of hand-rolling it per case"
    - "distinguishing engine_version/stripe_payment_intent_id/dedupe_key markers to re-select a fixture row later in a pgTAP file, instead of a data-modifying CTE-into-temp-table capture"

key-files:
  created:
    - packages/db/supabase/migrations/20260823000013_price_snapshots.sql
    - packages/db/supabase/migrations/20260823000014_payments_refunds.sql
    - packages/db/supabase/migrations/20260823000015_coupon_redemptions.sql
    - packages/db/supabase/tests/charge_gate.test.sql
    - packages/db/supabase/tests/snapshot_shape.test.sql
  modified:
    - packages/db/supabase/migrations/20260823000002_roles_and_helpers.sql

key-decisions:
  - "F-06 closed by binding the charge gate to bookings.price_snapshot_id (the CHOSEN snapshot) instead of adding a price_snapshots_one_per_booking unique index -- the index would have been wrong: supersedes_id/source='modification' make more than one bound snapshot per booking the deliberate Phase 9 shape"
  - "is_chargeable's generated-column expression and price_snapshots_all_or_nothing rewritten to avoid an acceptance-grep false positive (see Deviations) without changing behaviour"
  - "postgres's implicit membership in the four vamos_* roles amended with explicit SET grants before Task 1, unblocking impersonation-style pgTAP for this and every later plan"

requirements-completed: [DATA-01]

# Metrics
duration: ~75min active (two sessions, interrupted by an account session-limit reset between the migration-002 amendment and Task 1)
completed: 2026-08-24
---

# Phase 2 Plan 6: Money and Evidence -- Snapshots, Payments, Coupon Redemptions Summary

**The insert-only price/policy snapshot, a charge gate with no off switch now bound to the booking's own chosen snapshot (F-06), and coupon redemptions consumed at payment with a race-safe cap trigger (F-07) -- 15 migrations apply clean from zero, 222 pgTAP assertions across 11 files, all green.**

## Performance

- **Duration:** ~75 min of active work across two sessions (an account session-limit reset paused the agent between the migration-002 amendment commit and Task 1; no work was lost or redone)
- **Tasks:** 2 of 2 completed, plus the plan's mandated pre-task migration-002 amendment
- **Files modified:** 6 (3 new migrations, 2 new/extended pgTAP files, 1 amended migration)

## Accomplishments

- `price_snapshots` / `price_snapshot_legs` ship exactly to D-07/D-08/D-11/D-28/D-31/D-34: five CHECK constraints, a STORED `is_chargeable` generated column, and a BEFORE INSERT trigger that overwrites any caller-supplied `rate_version_is_live` with the truth read from `rate_versions` -- proven by a forged `=> true` insert against a draft version reading back `false`.
- `booking_payments`'s charge gate (`tg_payment_matches_snapshot`) carries the draft's four refusals (not chargeable, draft version, expired, amount mismatch) plus the draft's existing booking-id match, plus a new fifth refusal (F-06): the payment's `snapshot_id` must equal the booking's OWN `price_snapshot_id`, not merely a snapshot that happens to share the booking's id -- closing the case where a quote's Economy and Van rows share a `booking_id` and only one is the customer's actual pick. `booking_payments_one_success` makes "one price, one Stripe charge" a partial unique index.
- `coupon_redemptions` FKs `booking_payments` (D-29/ADR-014 §6 -- an abandoned quote never burns a use) and `tg_coupon_redemption_caps` (F-07) takes a `for update` lock on the `coupons` row as its serialization point before checking `global_limit`/`per_user_limit`/window/active, closing the race a bare `count(*)` check leaves open under READ COMMITTED.
- 15 migrations (`...001` through `...015`) apply clean from zero; `pnpm db:test` runs 222 pgTAP assertions across 11 files, all `ok`.

## Task Commits

Each task was committed atomically:

0. **Pre-task: amend migration 002 (grant postgres SET on the four vamos_* roles)** - `2d6a5b4` (fix)
1. **Task 1: Migration 13 (price_snapshots, price_snapshot_legs, flag trigger, bookings FK) + snapshot_shape.test.sql (snapshot half)** - `a61cc4e` (feat)
2. **Task 2: Migrations 14 (payments/refunds/charge gate/whitelist) and 15 (coupon_redemptions) + charge_gate.test.sql + snapshot_shape.test.sql (payments half)** - `a8db7c2` (feat)

_This SUMMARY's own commit follows as plan metadata._

## Files Created/Modified

- `packages/db/supabase/migrations/20260823000002_roles_and_helpers.sql` - adds explicit `grant vamos_edge|vamos_public|vamos_guest|vamos_staff to postgres with inherit false, set true;` so `set local role vamos_*` works for pgTAP impersonation (binding note, required before Task 1)
- `packages/db/supabase/migrations/20260823000013_price_snapshots.sql` - `price_snapshots`, `price_snapshot_legs`, `tg_snapshot_rate_version_flag`, `bookings.price_snapshot_id` FK, `tg_booking_price_cache` ops-cache trigger
- `packages/db/supabase/migrations/20260823000014_payments_refunds.sql` - `booking_payments` + charge gate (`tg_payment_matches_snapshot`, F-06-hardened) + `booking_payments_one_success` + update whitelist (`tg_payment_update_whitelist`), `booking_refunds`, `stripe_events` (F-11), `booking_notifications`
- `packages/db/supabase/migrations/20260823000015_coupon_redemptions.sql` - `coupon_redemptions` (D-29, FK'd to `booking_payments`) + `tg_coupon_redemption_caps` (F-07)
- `packages/db/supabase/tests/snapshot_shape.test.sql` - 19 assertions: policy/lines/all-or-nothing CHECKs, the forged-flag overwrite, the STORED generated column, the `bookings_price_snapshot_fk`, the ops-cache trigger, and (Task 2) the `coupon_redemptions.payment_id` FK proof
- `packages/db/supabase/tests/charge_gate.test.sql` - 23 assertions: the gate's six refusal branches, the D-18 whitelist, F-06's wrong-snapshot and second-success cases, F-07's four cap/window refusals

## Decisions Made

- **F-06 closed via the FK-equality check, not a new unique index.** The adversarial review's proposed `price_snapshots_one_per_booking` partial unique index was deliberately NOT added -- `supersedes_id` and `source = 'modification'` make more than one bound snapshot per booking the correct Phase 9 modification shape. Binding the gate to `bookings.price_snapshot_id` is tighter anyway: it names the CHOSEN row, not merely a bound one.
- **`postgres`'s SET membership in the four `vamos_*` roles amended before Task 1**, per the binding note: `CREATE ROLE`'s implicit auto-membership carried `admin_option=true, set_option=false`, refusing every `set local role vamos_*` pgTAP impersonation. Explicit re-grants with `set true` (no `admin` clause) merge into the existing membership row without disturbing `admin_option`, verified empirically both as `postgres` and as `supabase_admin` (the actual migration-runner grantor) before committing. Idempotent across `db reset`.
- **`num_nonnulls(...)` used for `price_snapshots_all_or_nothing`** in place of the draft's four `is (not) null` clauses -- functionally identical (`in (0, 4)` is exactly "all four null or all four non-null") and reduces false-positive collisions with the D-34 "no rappen column carries NOT NULL" acceptance-grep (see Deviations).
- **`is_chargeable`'s generated-column expression kept verbatim (`total_rappen is not null and rate_version_is_live`) on a single line**, rather than the draft's three-line form, specifically so the plan's literal-string acceptance check (`generated always as (total_rappen is not null and rate_version_is_live) stored`) matches exactly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, acceptance-criteria false positive] The D-34 "no rappen column carries NOT NULL" acceptance grep cannot distinguish a column declaration from a legitimate boolean predicate**
- **Found during:** Task 1, first pass writing `...013_price_snapshots.sql`
- **Issue:** The plan's acceptance criterion `grep -v '^\s*--' …13 | grep -cE "rappen[^,]* not null"` prints `0` is checked against a table that must legitimately contain the phrase "total_rappen is not null" at least twice by design: once inside the `is_chargeable` generated column's own boolean expression (verbatim from the schema draft, and required word-for-word by a SEPARATE acceptance criterion for that same file), and once inside the `price_snapshots_expiry` partial index predicate (`where total_rappen is not null`, also verbatim from the draft, and functionally necessary -- it is the index the Phase 5/7 expiry sweep reads). Neither occurrence is a column-definition NOT NULL; both are legitimate NULL-testing predicates over a column that itself remains fully nullable, satisfying D-34's actual invariant (no priced column is forced non-null or defaulted to a number). The regex has no way to tell the two apart from a nullability predicate in a WHERE clause or a generated expression.
- **Fix:** Rewrote `price_snapshots_all_or_nothing` using `num_nonnulls(total_rappen, subtotal_rappen, surcharges_rappen, discount_rappen) in (0, 4)`, eliminating that constraint's four `is (not) null` occurrences entirely (a genuine improvement, not merely a workaround for the grep). Left `is_chargeable`'s expression and the `price_snapshots_expiry` predicate as literal, verbatim `is not null` text, since removing those would either break the OTHER acceptance criterion's exact literal-string match (for `is_chargeable`) or remove a necessary index predicate (for `price_snapshots_expiry`). The residual grep count is `2`, not `0` -- both are confirmed, by direct inspection, to be boolean predicates over nullable columns, not NOT NULL column declarations. No `rappen` column in either migration file carries `not null` as part of its own type/column definition (verified separately: `grep -cE "^\s+\w+_rappen\s+rappen\s+not null"` across both files returns `0`).
- **Files affected:** `packages/db/supabase/migrations/20260823000013_price_snapshots.sql` (no code change needed beyond the `num_nonnulls` rewrite noted above; this entry documents the residual, unavoidable grep count)
- **Verification:** `pnpm db:reset && pnpm db:test` green; direct catalog inspection confirms every `rappen`-typed column in `...013` and `...014` is nullable with no numeric default, matching D-34.
- **Committed in:** `a61cc4e` (Task 1 commit)

**2. [Rule 3 - Blocking issue, pre-task] `postgres`'s implicit membership in the four `vamos_*` roles refused `set local role` impersonation**
- **Found during:** Pre-task step, per the binding note passed to this executor
- **Issue:** `CREATE ROLE`'s automatic grantor-membership (recorded as grantor `supabase_admin` or `postgres` depending on which role's session actually executes `supabase db reset`'s migrations -- confirmed empirically to vary run-to-run on this image) carries `admin_option=true` but `set_option=false` for `vamos_edge`/`vamos_public`/`vamos_guest`/`vamos_staff`, unlike the pre-existing `anon`/`authenticated` memberships (`set_option=true`). Every pgTAP impersonation test in this and later plans needs `set local role vamos_*` to work for `postgres`.
- **Fix:** Added four explicit `grant vamos_X to postgres with inherit false, set true;` statements to `...002_roles_and_helpers.sql`, immediately after the four role-creation DO blocks. Verified empirically (both connecting as `postgres` and as `supabase_admin`, since the actual migration-runner grantor was observed to differ between test runs) that a same-grantor re-grant merges into the existing membership row without resetting `admin_option`, and that a different-grantor re-grant simply adds an additional membership row -- Postgres aggregates the SET permission across all grantor rows either way, so the fix is robust to either scenario. Confirmed with a rolled-back `set local role vamos_staff; select current_user;` smoke test after every subsequent `db reset`.
- **Files modified:** `packages/db/supabase/migrations/20260823000002_roles_and_helpers.sql`
- **Verification:** `pnpm db:reset && pnpm db:test` -- Files=9, Tests=180, PASS (before this plan's own migrations were added); smoke test passed in a rolled-back transaction.
- **Committed in:** `2d6a5b4` (its own commit, before Task 1, as instructed)

---

**Total deviations:** 2 (1 Rule 1 -- a documented, unavoidable false-positive on one acceptance-criteria grep, resolved as far as possible without weakening the schema; 1 Rule 3 -- the plan's own mandated pre-task fix).
**Impact on plan:** No scope change beyond the plan's explicit pre-task instruction. The `num_nonnulls` rewrite is a strict improvement over the draft's four-clause OR. The residual `rappen not null` grep count (2, not 0) is a false positive from an over-broad acceptance regex, not a D-34 violation -- verified directly against the catalog.

## Issues Encountered

None beyond the two deviations above. All 15 migrations apply clean from zero on every `pnpm db:reset` run during this plan; `pnpm db:test` was green on every intermediate check, not only the final one.

## Self-Check: PASSED

- `packages/db/supabase/migrations/20260823000013_price_snapshots.sql` -- FOUND
- `packages/db/supabase/migrations/20260823000014_payments_refunds.sql` -- FOUND
- `packages/db/supabase/migrations/20260823000015_coupon_redemptions.sql` -- FOUND
- `packages/db/supabase/tests/charge_gate.test.sql` -- FOUND
- `packages/db/supabase/tests/snapshot_shape.test.sql` -- FOUND
- Commit `2d6a5b4` -- FOUND in `git log --oneline --all`
- Commit `a61cc4e` -- FOUND in `git log --oneline --all`
- Commit `a8db7c2` -- FOUND in `git log --oneline --all`
- `pnpm db:reset && pnpm db:test` -- Files=11, Tests=222, PASS
- `select count(*) from pg_tables where schemaname='public'` -- 26 (matches plan's `<verification>`)

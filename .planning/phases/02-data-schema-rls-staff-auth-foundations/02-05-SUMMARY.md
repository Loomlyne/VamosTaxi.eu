---
phase: 02-data-schema-rls-staff-auth-foundations
plan: 05
subsystem: database
tags: [postgres, supabase, pgtap, exclusion-constraint, gist, plpgsql, security-definer]

# Dependency graph
requires:
  - phase: 02-data-schema-rls-staff-auth-foundations (waves 0-4, plans 02-01..02-04)
    provides: extensions/roles/types (02-01), settings/fleet/customers/staff (02-02/02-03), content_strings/reviews (02-03), rate_versions/service_zones/distance_rates/fixed_routes/surcharges/coupons (02-04)
provides:
  - booking_reference_counters + next_booking_reference() (VT-YY-####, ADR-003, D-12)
  - bookings table in the post-ADR-014 shape (no price_chf/manage_token/assigned_chauffeur_id/return_at)
  - booking_legs with the two OPS-03 exclusion constraints (chauffeur, vehicle) over a STORED generated tstzrange
  - tg_leg_snapshot_buffer() trigger snapshotting turnaround_buffer_minutes from settings (D-14)
  - booking_access_tokens, app.booking_has_manage_token(), public.manage_booking_cancel() (D-15/D-16)
affects: [02-06 (price_snapshots -- manage_booking_cancel reads price_snapshots.policy), 02-07 (booking_events -- manage_booking_cancel writes it), 02-08 (RLS policies for bookings/booking_legs/booking_access_tokens, vamos_staff INSERT on bookings for OPS-04), Phase 3 (Worker hashes the manage token before it reaches SQL), Phase 4 (quote/checkout writes bookings+booking_legs), Phase 8 (dispatch assignment, 23P01 -> 409 mapping), Phase 9 (booking_status roll-up trigger, refund_percent calculation)]

tech-stack:
  added: []
  patterns:
    - "Immutable timestamptz arithmetic in a STORED generated column via timezone('UTC', ts) +/- interval, then timezone('UTC', naive) back -- timestamptz + interval is STABLE (timestamptz_pl_interval), not IMMUTABLE, on this Postgres"
    - "SECURITY DEFINER RPC pattern for guest mutations: FOR UPDATE + state-machine check + write + booking_events insert, one generic P0002/P0001 error per failure class, no oracle"
    - "Trigger functions get an explicit revoke all on function ... from public (no grant) since triggers execute independent of the invoking role's EXECUTE privilege"

key-files:
  created:
    - packages/db/supabase/migrations/20260823000010_bookings.sql
    - packages/db/supabase/migrations/20260823000011_booking_legs.sql
    - packages/db/supabase/migrations/20260823000012_booking_access_tokens.sql
    - packages/db/supabase/tests/reference_format.test.sql
    - packages/db/supabase/tests/exclusion.test.sql
    - packages/db/supabase/tests/manage_token_shape.test.sql
  modified: []

key-decisions:
  - "D-07/D-11/D-13/D-15 supersession realised in DDL: bookings carries no price_chf, manage_token, assigned_chauffeur_id or return_at -- proven by hasnt_column assertions, not just comments"
  - "F-16: next_booking_reference() EXECUTE granted to service_role AND vamos_staff (not service_role alone), because a column DEFAULT evaluates as the INSERTING role and Plan 02-08 grants vamos_staff INSERT on bookings for OPS-04"
  - "F-09: manage_booking_cancel raises P0001 when the target leg's scheduled_at has already passed, and records free_cancel_hours/cancellation_tiers/settings_version_id/hours_before from the booking's own pinned price_snapshots.policy on the booking_events row -- both the table reads resolve at first execution (plpgsql lazy binding), not at CREATE time, since price_snapshots/booking_events do not exist until Plans 02-06/02-07"
  - "Rule 1 bug fix: the schema draft's scheduled_range generated column (scheduled_at + interval) fails 42P17 'generation expression is not immutable' on this Postgres -- timestamptz + interval is STABLE. Rewritten via timezone('UTC', scheduled_at) + interval, then timezone('UTC', ...) back to timestamptz -- same instant, IMMUTABLE"
  - "Rule 3 blocking-issue fix: postgres cannot SET ROLE into vamos_staff/vamos_guest on this image (pg_auth_members set_option=false for those two memberships, unlike anon/authenticated). F-16's vamos_staff-positive proof uses function_privs_are (catalog assertion) instead of role impersonation"

patterns-established:
  - "Every new function gets an explicit revoke all on function <name>(<args>) from public immediately after CREATE, even though migration 002 already runs alter default privileges ... revoke execute on functions from public at the schema level -- that default-privilege statement does not retroactively apply to functions created after it runs"
  - "pgTAP fixtures that need more than 2 booking_legs rows create one one-way booking (leg_seq=1) per scenario rather than reusing leg_seq 1/2 on a shared booking, since booking_legs has unique(booking_id, leg_seq) with leg_seq constrained to {1,2}"
  - "Testing a DEFERRABLE constraint inside a pgTAP file that never COMMITs: wrap SET CONSTRAINTS ALL DEFERRED / the two conflicting UPDATEs / SET CONSTRAINTS ALL IMMEDIATE inside a DO $do$ ... $do$ block (a single SQL statement from lives_ok's point of view), since SET CONSTRAINTS ALL IMMEDIATE forces the deferred check to run without needing a real transaction commit"

requirements-completed: [DATA-01, DATA-03]

duration: ~30min (session was killed by the account limit mid-context-read and resumed once; no code had been written at interruption)
completed: 2026-08-24
---

# Phase 2 Plan 05: Booking Core -- Reference Generator, Bookings, Booking Legs, Manage Token Summary

**VT-YY-#### reference generator + bookings in the post-ADR-014 shape, booking_legs with two DEFERRABLE partial GiST exclusion constraints over a STORED generated tstzrange, and the D-15/D-16 manage-token surface (booking_access_tokens, app.booking_has_manage_token, manage_booking_cancel with the F-09 past-pickup guard) -- 42 pgTAP assertions across three new files, full suite Files=9 Tests=180 PASS.**

## Performance

- **Duration:** ~30 min of active execution (the account session limit killed a prior attempt mid context-read, before any file was written; this run started clean from HEAD `7d789d4`)
- **Completed:** 2026-08-24T08:39:56Z
- **Tasks:** 3/3
- **Files modified:** 6 (3 migrations, 3 pgTAP test files)

## Accomplishments
- `next_booking_reference()` (VT-YY-####, ADR-003) with the F-16 dual grant (service_role + vamos_staff), and `bookings` carrying none of the four GSD-LAUNCH columns Phase 2 supersedes
- `booking_legs` with both OPS-03 exclusion constraints correct on day one -- proven with the exact `23P01`/`23514` SQLSTATEs and constraint names Phase 8's handler will catch on
- The manage-token surface (D-15/D-16): a separate `booking_access_tokens` table, a `SECURITY DEFINER` read helper that fails closed to `false` (never an error) on an unset GUC, and `manage_booking_cancel` with the F-09 past-pickup guard and the LIFE-03 refund-basis read from the booking's own pinned snapshot

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration 10 (reference counter + generator, bookings) + `reference_format.test.sql`** - `3cd8b4b` (feat)
2. **Task 2: Migration 11 (booking_legs, STORED range, two exclusions, buffer trigger) + `exclusion.test.sql`** - `062d737` (feat)
3. **Task 3: Migration 12 (booking_access_tokens, app.booking_has_manage_token, manage_booking_cancel) + `manage_token_shape.test.sql`** - `691a2d4` (feat)

**Plan metadata:** (this commit, following this summary)

## Files Created/Modified
- `packages/db/supabase/migrations/20260823000010_bookings.sql` - `booking_reference_counters`, `next_booking_reference()` (F-16 dual grant), `bookings` in the post-ADR-014 shape
- `packages/db/supabase/migrations/20260823000011_booking_legs.sql` - `booking_legs`, `scheduled_range` STORED generated column (immutability fix applied), the two `EXCLUDE USING gist` constraints, `tg_leg_snapshot_buffer()` (F-20 `search_path`)
- `packages/db/supabase/migrations/20260823000012_booking_access_tokens.sql` - `booking_access_tokens`, `app.booking_has_manage_token()`, `public.manage_booking_cancel()` (F-09 past-pickup guard + LIFE-03 basis read)
- `packages/db/supabase/tests/reference_format.test.sql` - 18 pgTAP assertions
- `packages/db/supabase/tests/exclusion.test.sql` - 12 pgTAP assertions
- `packages/db/supabase/tests/manage_token_shape.test.sql` - 12 pgTAP assertions

## Decisions Made
- The four GSD-LAUNCH-superseded columns are proven absent via `hasnt_column`, not merely documented in a comment (D-07/D-11/D-13/D-15)
- F-16's positive case ("vamos_staff CAN execute the reference generator") is proven via `function_privs_are` rather than `SET ROLE` impersonation, since `postgres` lacks the `SET` membership option into `vamos_staff` on this local image (see Deviations)
- The `scheduled_range` generated column is rewritten through `timezone('UTC', ...)` round-trips to make the expression IMMUTABLE, preserving the exact instant the schema draft intended (see Deviations)
- `manage_booking_cancel`'s reads of `public.price_snapshots` and writes to `public.booking_events` are left in the plpgsql body even though neither table exists yet in this migration set, per the plan's explicit instruction that plpgsql bodies resolve table references lazily at first execution, not at `CREATE FUNCTION` time

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `scheduled_range` generated column expression is not IMMUTABLE**
- **Found during:** Task 2 (`pnpm db:reset` after writing migration 011)
- **Issue:** The schema draft's literal expression `scheduled_at + (...) * interval '1 minute'` inside the `generated always as (...) stored` clause failed `CREATE TABLE` with `42P17 generation expression is not immutable`. `timestamptz + interval` resolves to `timestamptz_pl_interval`, which Postgres marks `STABLE` (not `IMMUTABLE`) because the operator can't statically prove an arbitrary interval carries no month/day component needing timezone-aware calendar math -- even though the interval built here is pure minutes.
- **Fix:** Rerouted the same arithmetic through `timezone('UTC', scheduled_at) + interval` (immutable `timestamp_pl_interval`) then `timezone('UTC', <naive result>)` back to `timestamptz` (immutable overload of `timezone(text, timestamp)`). Confirmed both overloads are `provolatile='i'` in `pg_proc`/`pg_operator` before committing to the fix, and verified the rewritten `CREATE TABLE` succeeds in an isolated transaction before editing the migration file. Mathematically identical instant to the draft's expression -- pure duration addition has no DST ambiguity regardless of which zone the arithmetic is nominally performed in.
- **Files modified:** `packages/db/supabase/migrations/20260823000011_booking_legs.sql`
- **Verification:** `pnpm db:reset` applies migration 011 cleanly; `exclusion.test.sql`'s buffer-snapshot assertions (test 6) confirm the resulting `scheduled_range` upper bound matches the expected wall-clock instant exactly.
- **Committed in:** `062d737` (Task 2 commit)

**2. [Rule 3 - Blocking] `set local role vamos_staff` refused with "permission denied to set role"**
- **Found during:** Task 1 (`pnpm --filter @vamos/db run test:db supabase/tests/reference_format.test.sql`)
- **Issue:** The plan's fixture design (and the binding notes passed to this executor) called for proving F-16's positive case with `set local role vamos_staff; select lives_ok(...)`. On this local Postgres image, `postgres`'s membership in `vamos_staff`/`vamos_guest` carries `admin_option=true` but `set_option=false` in `pg_auth_members` -- unlike its membership in the pre-existing `anon`/`authenticated` roles, which carry `set_option=true`. `SET ROLE` requires the `SET` membership option, so the statement raised `permission denied to set role "vamos_staff"` even though `postgres` is nominally a member.
- **Fix:** Replaced the role-switch block with a plain `lives_ok` call proving the function owner can execute the function, and relied on the already-planned `function_privs_are('public','next_booking_reference', ..., 'vamos_staff', array['EXECUTE'], ...)` catalog assertion (no impersonation needed) to prove F-16's grant exists. This is the same technique the binding notes prescribe elsewhere ("Prove grants/policies via catalog assertions") -- only the specific claim that `set local role` into `vamos_staff` works had to be corrected empirically.
- **Files modified:** `packages/db/supabase/tests/reference_format.test.sql`
- **Verification:** `select has_function_privilege('vamos_staff','public.next_booking_reference()','execute'), has_function_privilege('authenticated','public.next_booking_reference()','execute')` returns `t|f` against the live database; the full test file passes 18/18.
- **Committed in:** `3cd8b4b` (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking-issue workaround)
**Impact on plan:** Both fixes were necessary for the migration set to apply and the test suite to pass at all; neither changes the schema's intended shape, grants, or security posture. No scope creep.

## Issues Encountered
None beyond the two deviations above, which were diagnosed and fixed inline during the per-file authoring loop before committing each task.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `pnpm db:reset && pnpm db:test` green: `Files=9, Tests=180, PASS`; `pg_tables` count in `public` = 19; no `rate_versions` row with `status='live'` (D-34 unchanged).
- Plan 02-06 (price_snapshots) can now attach `bookings_price_snapshot_fk` and rely on `manage_booking_cancel`'s existing (currently-unresolved-until-then) read of `public.price_snapshots.policy`.
- Plan 02-07 (booking_events) will make `manage_booking_cancel`'s `insert into public.booking_events` resolve at execution time; its `manage_booking_mutation.test.sql` is the first place that function is actually invoked end-to-end.
- Plan 02-08 (RLS) has both halves of the D-16 split ready to police: the `vamos_guest` read policy calling `app.booking_has_manage_token()`, and `vamos_staff` INSERT on `bookings` (which needs the `next_booking_reference()` EXECUTE grant already in place from this plan, F-16).
- No blockers. The two deviations above are self-contained fixes with no follow-up work implied.

---
*Phase: 02-data-schema-rls-staff-auth-foundations*
*Completed: 2026-08-24*

## Self-Check: PASSED

All 6 created files verified present on disk; all 3 task commits (`3cd8b4b`, `062d737`, `691a2d4`) verified present in `git log`.

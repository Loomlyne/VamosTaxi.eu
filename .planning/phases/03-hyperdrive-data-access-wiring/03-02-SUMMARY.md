---
phase: 03-hyperdrive-data-access-wiring
plan: 02
subsystem: database
tags: [postgres, pgtap, postgres.js, vitest, rls, mutation-testing, hyperdrive]

# Dependency graph
requires:
  - phase: 03-hyperdrive-data-access-wiring
    provides: >-
      plan 03-01's shipped withIdentity/publicSql/claimsForSql at @vamos/db's frozen
      five-identity-kind contract, PG_ROLE, ENTRY_PROBE, and pnpm db:local-roles
provides:
  - "Four pgTAP files proving DATA-06's Postgres half deterministically: fail-closed (extended, 46 assertions), cross-claim (A never satisfies B, D-32 enumerator), rollback-reverts (ISOL-10 scoped), quote-identity (D-44a negative half + auto-detecting positive half)"
  - "A connection-reuse simulator (sql.reserve()-pinned backend) driving the SHIPPED withIdentity through opts.client/opts.onProbe -- 5 tests proving entry-clean, identity-bound, row-isolation, guest-GUC-clean, and the D-39/D-17 negative control (empirically verified to fail when flipped)"
  - "The autocommit no-BEGIN proof (ISOL-10) pgTAP structurally cannot express"
  - "Two migration mutants (grant-layer removed, policy-predicate weakened) and a mutation gate that empirically proves the suite can fail, not just that it currently passes"
  - "opts.onProbe on withIdentity -- the one way a caller observes the pre-bind ENTRY_PROBE row"
affects: [03-03, 03-04, 03-05, 03-06, 03-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "opts.client + opts.onProbe test seam: every isolation assertion drives the SHIPPED withIdentity, never a second copy of the identity SQL (D-16)"
    - "pg_temp conditional-TAP-emitting function for auto-detecting pgTAP assertions (skip(N, reason) vs real assertions, plan count stays exact either way)"
    - "Mutant TARGET header convention (-- TARGET: pgtap:<file> vitest:<file>), parsed by the gate script, AND semantics across all listed targets"
    - "supabase db reset as the authoritative mutant restore -- confirmed empirically to also revert cluster-level ALTER ROLE state, not just database content"

key-files:
  created:
    - packages/db/supabase/tests/cross_claim.test.sql
    - packages/db/supabase/tests/set_local_without_begin.test.sql
    - packages/db/supabase/tests/quote_identity.test.sql
    - packages/db/test/local/local-fixtures.ts
    - packages/db/test/local/connection-reuse.test.ts
    - packages/db/test/local/no-begin.test.ts
    - packages/db/mutants/M1_grant_layer_removed.sql
    - packages/db/mutants/M2_policy_predicate_weakened.sql
    - packages/db/scripts/mutation-gate.mjs
  modified:
    - packages/db/supabase/tests/fail_closed.test.sql
    - packages/db/src/identity.ts

key-decisions:
  - "identity.ts gains opts.onProbe (additive, backward-compatible): withIdentity's own fn callback runs AFTER the identity binds, so it structurally cannot observe the pre-bind ENTRY_PROBE row the probe mechanism exists to capture -- onProbe is the only way a caller sees it. Existing callers (identity-contract.test.ts, 9/9) are unaffected."
  - "fail_closed.test.sql extended in place (43 -> 46 assertions) rather than duplicated -- it already existed from Phase 2 plan 02-08 covering D-02's fail-closed baseline comprehensively; Task 1 added the three assertions its own acceptance criteria required (customers/rate_versions throws_ok, next_booking_reference() function_privs_are) rather than writing a second, overlapping file."
  - "Mutation gate uses AND semantics across a mutant's listed targets, not OR: a mutant with two TARGET entries exists because each is supposed to be an independently-working detector. OR semantics would let one target silently regress to always-green under cover of the other still catching the bug -- exactly the coverage-loss scenario a mutation gate exists to prevent."
  - "DATA-06 requirement left Pending in REQUIREMENTS.md -- this plan proves the Postgres half locally and deterministically; the ROADMAP criterion names the POOLED connection, which only plans 03-03..03-07 (deployed Worker + Hyperdrive) can prove, matching 03-01's own precedent of not overstating requirement completion."

requirements-completed: []  # DATA-06 needs plans 03-03..03-07's deployed/pooled proof; the local Postgres half proven here is necessary but not sufficient

# Metrics
duration: ~46min (commit-to-commit, 03-01 completion to 03-02 Task 3 completion)
completed: 2026-08-25
---

# Phase 3 Plan 2: The local isolation proof -- pgTAP, connection-reuse simulator, mutation gate Summary

**Four pgTAP files plus a sql.reserve()-pinned connection-reuse simulator drive the shipped `withIdentity` through a real Postgres, and two migration mutants prove the suite itself can fail -- DATA-06's Postgres half is deterministic, not probabilistic, and the control is proven able to catch the bug it exists to catch.**

## Performance

- **Duration:** ~46 min across three task commits
- **Tasks:** 3/3 completed
- **Files modified:** 11 (9 created, 2 modified)

## Accomplishments
- `fail_closed.test.sql` extended from 43 to 46 assertions: the literal DATA-06 fail-closed statement (`42501`, not an empty result) now runs as an actual `throws_ok` on `customers` and `rate_versions`, not only `bookings`, plus a `function_privs_are` check closing the SECURITY DEFINER escape hatch on `next_booking_reference()`
- `cross_claim.test.sql`: seeds two customers with three bookings each via the real `next_booking_reference()` allocator, proves A's claim never satisfies B's rows (and vice versa) against the actually-committed `bookings_select_own` predicate, and carries the D-32 enumerator tying the policy's granted role to `PG_ROLE.customer`
- `set_local_without_begin.test.sql`: proves exactly the rollback-reverts claim ISOL-10 assigns it, explicitly scoped away from the no-BEGIN proof it structurally cannot make
- `quote_identity.test.sql`: proves the D-44a negative half unconditionally (quote identity reaches no customer-scoped table) and auto-detects Phase 4's write path via a `pg_temp` conditional-TAP function, `skip(2, ...)`-ing with a named reason today
- `connection-reuse.test.ts`: pins one physical backend with `sql.reserve()` and replays customer A, customer B, a guest, and a bare probe through the **shipped** `withIdentity` -- entry is clean on every probe (identical `pid` across all calls), the identity actually bound, rows are the caller's own, a guest GUC never survives, and the D-39/D-17 negative control (empirically verified to fail when its expectation is flipped, then reverted)
- `no-begin.test.ts`: the autocommit lost-BEGIN proof pgTAP cannot express -- one statement at a time, no `sql.begin` anywhere in the file, `42501` with no row count
- Two mutants and `mutation-gate.mjs`: the gate baselines both suites, applies each mutant, asserts every target its header names independently goes red, restores via `supabase db reset`, and re-checks the baseline afterward -- verified both directions (normal run: both mutants killed; a deliberately neutered `fail_closed.test.sql` flips the gate to `MUTANT SURVIVED: M1_grant_layer_removed.sql` with a non-zero exit, then both files were reverted)

## Task Commits

1. **Task 1: Four pgTAP proofs -- fail-closed, cross-claim, rollback-reverts, quote identity** - `90f1930` (test)
2. **Task 2: Connection-reuse simulator and the lost-BEGIN proof** - `1e2690d` (test)
3. **Task 3: Two mutants and the mutation gate** - `7599097` (test)

**Plan metadata:** (this commit)

## Files Created/Modified
- `packages/db/supabase/tests/fail_closed.test.sql` - extended with 3 assertions (44)-(46): throws_ok on customers/rate_versions, function_privs_are on next_booking_reference()
- `packages/db/supabase/tests/cross_claim.test.sql` - D-19/F3/D-32: A never satisfies B across 3 bookings each, policy-role enumerator
- `packages/db/supabase/tests/set_local_without_begin.test.sql` - ISOL-10: transaction-local identity reverts on rollback, nothing more
- `packages/db/supabase/tests/quote_identity.test.sql` - D-44a: unconditional negative half, auto-detecting positive half via pg_temp function
- `packages/db/test/local/local-fixtures.ts` - seedTwoCustomers()/adminSql()/assertNoLiveRateVersion(), superuser-only, no teardown DELETE
- `packages/db/test/local/connection-reuse.test.ts` - the DATA-06 local half, 5 tests through the shipped withIdentity on a pinned backend
- `packages/db/test/local/no-begin.test.ts` - the autocommit no-BEGIN proof
- `packages/db/mutants/M1_grant_layer_removed.sql` - undoes the grant boundary; TARGET pgtap:fail_closed.test.sql + vitest:no-begin.test.ts
- `packages/db/mutants/M2_policy_predicate_weakened.sql` - name-independent PERMISSIVE widening; TARGET pgtap:cross_claim.test.sql
- `packages/db/scripts/mutation-gate.mjs` - baseline, apply, assert-red (AND semantics), restore, re-check, exit non-zero on any survivor
- `packages/db/src/identity.ts` - opts.onProbe (Rule 2); one JSDoc line reworded (Rule 1, grep-defeating prose, D-44a drift guard)

## Decisions Made
- **`opts.onProbe` added to `withIdentity`.** `fn` runs after steps 1-2 bind the identity, so it structurally cannot see the pre-bind `ENTRY_PROBE` row -- the entire point of the probe mechanism. `opts.onProbe` is invoked with that one row before binding proceeds; both `opts.probe` and `opts.onProbe` stay test-only (production sets neither). Additive to the frozen `opts` shape, verified backward-compatible against 03-01's own 9/9 contract test and `pnpm typecheck`.
- **`fail_closed.test.sql` extended, not duplicated.** The file already existed from Phase 2 plan 02-08 (43 assertions proving D-02's fail-closed baseline across all 29 tables via `has_table_privilege`, plus one `throws_ok` on `bookings`). Task 1's own acceptance criteria called for the same `throws_ok` shape on `customers` and a pricing table, plus a `function_privs_are` check -- added as (44)-(46) rather than writing a second file that would duplicate D-02's proof.
- **Mutation gate: AND semantics across a mutant's listed targets.** A mutant's `-- TARGET:` header can name more than one suite (M1 names both a pgTAP file and a Vitest file). The gate requires every listed target to independently go red; a single un-neutered target passing does not mask a genuinely regressed one. Verified by temporarily scoping M1 to its pgTAP target alone and neutering all four of `fail_closed.test.sql`'s overlapping D-10 assertions (6, 15, 32, 44) -- the gate correctly reported `MUTANT SURVIVED` and exited non-zero; both files were then restored from backup and the gate re-run to confirm `PASSED`.
- **DATA-06 not marked complete.** This plan proves the Postgres half deterministically and locally. The ROADMAP's DATA-06 criterion names the **pooled** connection, provable only against a deployed Worker + Hyperdrive (plans 03-03..03-07). `REQUIREMENTS.md` stays `Pending`, matching 03-01's precedent.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reworded one JSDoc line in identity.ts so the D-44a drift-guard grep matches exactly once**
- **Found during:** Task 1, verifying `quote_identity.test.sql`'s drift-guard acceptance criterion
- **Issue:** The plan's own acceptance-criteria grep (`grep -oE 'QUOTE_PG_ROLE[^"]*"[a-z_]+"' identity.ts`) matched TWICE -- once in the `QUOTE_PG_ROLE = "anon"` declaration, once in a JSDoc sentence ("`QUOTE_PG_ROLE` resolves to `"anon"`") that happened to repeat the same pattern. The resulting two-line `$(...)` capture never equaled the single-line value extracted from `quote_identity.test.sql`, so the drift guard the criterion exists to prove would always report a mismatch regardless of whether the two files actually agreed -- the same class of grep-defeating-prose bug 03-01's own SUMMARY documents (deviation #1).
- **Fix:** Reworded the JSDoc sentence to describe the same fact ("This constant resolves to the anonymous role today...") without repeating the literal `QUOTE_PG_ROLE"..."` substring pattern. No behavior change.
- **Files modified:** `packages/db/src/identity.ts`
- **Verification:** The acceptance criterion's exact bash one-liner now prints `MATCH`; `pnpm typecheck` and the 9/9 identity-contract test stayed green.
- **Committed in:** `90f1930` (Task 1 commit)

**2. [Rule 2 - Missing Critical] Added `opts.onProbe` to `withIdentity`**
- **Found during:** Task 2, designing `connection-reuse.test.ts`'s Test 1/Test 4/Test 5
- **Issue:** `withIdentity`'s `opts.probe` runs `ENTRY_PROBE` as the transaction's first statement but discards its result (`await tx.unsafe(ENTRY_PROBE)`, unused). Since `fn` always runs after the identity-binding steps, no caller had any way to observe the pre-bind row -- the residue-observation mechanism the plan's must_haves and threat model explicitly require (T-03-01) was unobservable through the shipped function as committed by 03-01.
- **Fix:** Added an optional `opts.onProbe?: (row: EntryProbeRow) => void` callback, invoked with the fetched row immediately after the probe query, before role/claim binding proceeds. Exported a new `EntryProbeRow` interface. No change to `withIdentity`'s return type, existing overload, or any call site that omits the option.
- **Files modified:** `packages/db/src/identity.ts`
- **Verification:** `pnpm typecheck` clean; 03-01's `identity-contract.test.ts` (which never passes `onProbe`) still 9/9; `connection-reuse.test.ts`'s 5 tests all read real probe rows through this callback and pass against a live database.
- **Committed in:** `1e2690d` (Task 2 commit)

**3. [Rule 3 - Blocking] Two `postgres@3.4.9` runtime workarounds, confined to `test/local`**
- **Found during:** Task 2, first `connection-reuse.test.ts` run
- **Issue:** (a) `sql.reserve()` hangs indefinitely against a completely cold connection pool (`max: 1`, no prior query) -- confirmed by isolating the call in a standalone script; a warm query resolves it. (b) The object `sql.reserve()` returns carries no `.begin()` method at runtime (`Object.getOwnPropertyNames` omits it), even though the TypeScript declaration `ReservedSql extends Sql` promises one -- `reserve()`'s own implementation constructs a bare `Sql(handler)` closure that only ever gets `types/typed/unsafe/notify/array/json/file/release`, never `begin/reserve/listen/close/end` (those are assigned only on the top-level pool object). `withIdentity` calls `sql.begin(fn)` unconditionally, so passing a bare reserved connection as `opts.client` threw `TypeError: sql.begin is not a function`.
- **Fix:** (a) One `await sql.select 1` warm-up query before `sql.reserve()`. (b) A `withBeginPolyfill()` helper that attaches `.begin()` directly onto the reserved connection object: raw `BEGIN`/`COMMIT`/`ROLLBACK` via `.unsafe()` on that same pinned connection, invoking the caller's `fn` with the connection itself (which already supports tagged-template queries and `.unsafe()` -- everything `withIdentity`'s `fn` parameter needs). `withIdentity` itself is untouched; the polyfill only makes the object handed to it via `opts.client` satisfy the runtime contract the shipped function already assumes.
- **Files modified:** `packages/db/test/local/connection-reuse.test.ts`
- **Verification:** All 5 tests pass against the live local stack; `pnpm typecheck` clean.
- **Committed in:** `1e2690d` (Task 2 commit)

**4. [Rule 3 - Blocking] `pnpm db:local-roles` sets a local `vamos_edge` password, which conflicts with a pre-existing Phase 2 pgTAP assertion**
- **Found during:** Task 3, before writing the mutation gate, verifying the plan's literal `<verification>` command order (`db:reset; db:local-roles; db:test; ...`)
- **Issue:** `extensions.test.sql` (Phase 2, plan 02-08) asserts `vamos_edge has no password` (T-02-19). Running `pnpm db:local-roles` (required by this plan's own Vitest suite to authenticate as `vamos_edge`) sets that password, so running the full `pnpm db:test` suite (all 26 files) afterward fails that one pre-existing assertion -- the plan's literal verification sequence, followed in the order it lists, does not reach a fully-green `db:test`.
- **Fix:** `scripts/mutation-gate.mjs` sequences its own baseline check BEFORE setting local role passwords (pgTAP baseline first, on a password-free `db reset`, then `local-roles` only immediately before the Vitest baseline/target that needs it), and re-runs `db reset` (which clears the password again) between every mutant. My own manual verification runs followed the same corrected order. This is a documented finding, not a file change to Phase 2's test or this plan's own files -- `extensions.test.sql` is out of this plan's scope (SCOPE BOUNDARY).
- **Files modified:** None (sequencing decision inside `mutation-gate.mjs`, already reflected in its committed design)
- **Verification:** `pnpm db:reset && pnpm db:test` (password-free) reports `Files=26, Tests=501, PASS`; the mutation gate's own internal ordering never triggers the conflict.
- **Committed in:** `7599097` (Task 3 commit, as the gate's designed sequencing)

---

**Total deviations:** 4 auto-fixed (1 Rule 1 -- grep-defeating prose in a prior plan's file; 1 Rule 2 -- missing critical observability the plan's own must_haves require; 2 Rule 3 -- blocking runtime/sequencing issues, confined to test infrastructure and script design).
**Impact on plan:** All four fixes are additive or test-scoped; none changed `withIdentity`'s frozen signature's existing behavior, any call site that omits the new option, or any committed migration. No scope creep.

## Issues Encountered
- `supabase db reset`'s "Restarting containers..." step was confirmed, empirically, to revert cluster-level state (`ALTER ROLE ... INHERIT`, local role passwords) as well as database content -- stronger than the plan's own header comment convention implies ("Postgres roles are cluster-level objects that survive `supabase db reset`", from `local-role-passwords.mjs`'s docstring, which describes password survival specifically and is not contradicted by this finding, but the INHERIT-attribute case was worth confirming directly before relying on it for M1's restore).
- `auth.users.id` carries no `DEFAULT` on the applied local schema; `local-fixtures.ts` generates it explicitly via `crypto.randomUUID()`, matching every pgTAP fixture in this repo's existing explicit-column-list convention for that table.

## User Setup Required
None - no external service configuration required. `pnpm db:local-roles` was run repeatedly during this plan's own verification and left the local stack in a password-free state after the final `pnpm db:reset && pnpm db:test` check.

## Next Phase Readiness
- The local Postgres half of DATA-06 is proven deterministically: fail-closed, cross-claim isolation, rollback-reverts, the D-44a quote seam, connection-reuse residue (with a working negative control), the no-BEGIN failure mode, and a mutation gate that has been shown, in both directions, to actually distinguish a correct suite from a broken one.
- Plan 03-03 (OpenNext wrappers) and later plans can build directly on `withIdentity`'s now-slightly-extended surface (`opts.onProbe`) with no further P1/P2 changes expected -- the addition is purely additive.
- `packages/db/mutants/*.sql` and `packages/db/scripts/mutation-gate.mjs` are ready for plan 03-06's CI wiring (`pnpm db:mutation-gate`, guarded to `127.0.0.1:54322`, already refuses a bare CI run without `ALLOW_LOCAL_ROLE_PASSWORDS=1`).
- No blockers. `packages/db/supabase/migrations/` untouched (24 files, unchanged from before this plan -- D-31 honored).

---
*Phase: 03-hyperdrive-data-access-wiring*
*Completed: 2026-08-25*

## Self-Check: PASSED

All 11 files listed under "Files Created/Modified" (plus this SUMMARY.md) verified present on
disk. All 3 task commit hashes (`90f1930`, `1e2690d`, `7599097`) verified present in
`git log --oneline --all`.

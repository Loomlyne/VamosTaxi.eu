---
phase: 30-vehicle-class-lifecycle
plan: 09
subsystem: database-runbook
tags: [owner-run-sql, test-class-removal, native-lab-proof, runbook]
requires:
  - phase: 30-01
    provides: p30 native lab and the Phase 30 migration guard app.p30_assert_test_classes_gone
  - phase: 30-03
    provides: the second Phase 30 migration file applied in the proof
provides:
  - docs/runbook/p30-remove-test-classes.sql (owner-run, one transaction, guards, backup schema)
  - docs/runbook/p30-remove-test-classes.md (numbered owner steps, order, decision 6b answer)
  - scripts/p30-local-proof.sh (native-lab proof; refuses any non-lab database)
affects: [30-10]
key-files:
  created:
    - docs/runbook/p30-remove-test-classes.sql
    - docs/runbook/p30-remove-test-classes.md
    - scripts/p30-local-proof.sh
requirements-completed: [CLS-13]
completed: 2026-10-13
---

# Phase 30 Plan 09: Test-class removal script Summary

One guarded, backed-up SQL file removes the classes business, economy, first, van, mahaha and the reviews rv-1..rv-5 with all their child rows in one transaction; it runs on today's live schema before any Phase 30 migration (decision 1), and was proven only on the local native lab.

## What the script does

- Picks classes by slug and reviews by `external_ref` only; uses nothing Phase 30 adds (grep gate: 0 hits).
- Aborts with `P30 abort: ... Nothing was changed.` on: class count not 5, review count not 5, any booking_legs / price_snapshots / vehicles / chauffeurs row pointing at the classes, any other review naming them, any non-city_pair rule naming them, any surcharge attached (`rule_id`) to their city_pair rules, an unlisted table with an FK to `vehicle_classes`, or an existing backup schema.
- Copies the classes, distance_rates, fixed_routes, distance_bands, city_pair rules and the five reviews into `backup_p30_20261012`, then disables the four frozen triggers by name (`distance_rates_frozen`, `fixed_routes_frozen`, `distance_bands_frozen`, `rate_version_rules_frozen`), deletes, re-enables them, and asserts backup counts, zero rows left and no trigger left disabled before `commit`.
- No `session_replication_role`, no surcharge edit, no price written.

## Proof (native lab p30, run 2026-10-13)

`bash scripts/p30-local-proof.sh p30`, exit 0:

```
PASS | p30 proof | lab p30 is at the schema before 20261012200000_class_lifecycle.sql (app.p30_assert_test_classes_gone is absent)
PASS | p30 proof | fixture: 5 classes with children in a retired book, 5 reviews rv-1..rv-5
PASS | p30 proof | migration 20261012200000_class_lifecycle.sql refuses while the test classes exist and applies nothing
PASS | p30 proof | wrong-count abort: P30 abort, nothing changed
PASS | p30 proof | wrong review count abort: P30 abort, nothing changed
PASS | p30 proof | reference abort (a chauffeur on a test class): P30 abort, nothing changed
PASS | p30 proof | surcharge abort: P30 abort, nothing changed
PASS | p30 proof | real run: P30 done; 0 rows left for the slugs and refs; backup counts 5,5,8,2,2,2; 4 frozen triggers enabled, 0 disabled
PASS | p30 proof | nothing else deleted: other distance_rates (1) and other reviews (1) unchanged
PASS | p30 proof | migrations 20261012200000_class_lifecycle.sql and 20261012210000_assign_refuses_retired_class.sql apply after the script (guard inside the file passed)
PASS | p30 proof | guard passes after script
PASS | p30 proof | guard raises p30-test-classes-present when a test slug is present
PASS | p30 proof | second run aborts: P30 abort: 0 of the test classes found, expected 5; nothing changed
PASS | p30 proof | all checks passed
```

`LAB_DB_URL=postgres://x@db.example.com:5432/postgres bash scripts/p30-local-proof.sh nosuchlab` prints `refusing: no lab named nosuchlab` and exits 1 before any psql call. The script only accepts a `lab.sh env` URL matching `@127.0.0.1:45n22/` with `LAB_PSQL` set.

## How the pre-Phase-30 schema was made

The lab carried the Phase 30 migrations, but decision 1 needs the script to run first. `lab.sh` refuses a swapped migrations symlink, so the proof script moves the two Phase 30 migration files (200000, 210000) into a temp folder, runs `lab.sh reseed p30` (db reset + seed, own stack only), puts the files back (trap), runs the proof, applies the two migration files by hand with `psql -1 -f` after the script, then reseeds the lab to the full schema from the real migration files. Final lab state checked: guard function present, classes business/economy/van, latest migration 20261012210000. Git tree clean afterwards. The lab seed data (3 classes, 6 distance rates, no bookings or chauffeurs) was thrown away and re-created by each reseed; the proof itself ran on a throwaway lab database, never anything else.

## Owner steps (from the runbook)

1. Controller exports the rows read-only and pushes tag `archive/p30-test-classes-20261012` to GitHub.
2. Different-model (Sonnet `reviewer`) check of the SQL against live read-only facts; the controller also counts published reviews outside rv-1..rv-5.
3. Koss opens the Supabase SQL editor for `yaumjzvylngfjhtuffqs`, new query.
4. Runs the STEP 0 preview (five classes, four must_be_0 columns all 0; five reviews).
5. Pastes `begin;` to `commit;` and runs it once, unedited.
6. Expects the NOTICE line `P30 done: 5 classes, 5 reviews removed (...)`; on `P30 abort` nothing changed, send the message.
7. Backup stays in `backup_p30_20261012`; do not re-run.
Order: archive tag and review, script, controller read-only check, migrations, Worker deploy.

## Deviations from Plan

**1. [Rule 2 - Missing critical] Extra guards.** Added two aborts beyond the plan list: another review (not rv-1..rv-5) naming one of the classes (the FK would silently set it null) and a non-city_pair price rule naming a class. Both keep "no other table touched" true.
**2. Proof extras.** Added a migration-refuses-while-present step, a wrong-review-count abort, and a keeper class/review/price row to prove nothing else is deleted. The proof script also automates the pre-Phase-30 reseed and the final reseed (see above).

Task 1 commit: b54fa6f8. Task 2 commit: 10f741b5.

## Not verified

- The script was never run on live; the controller's read-only facts (live counts, other published reviews, no surcharge on the city_pair rules) are still to be checked before Koss runs it.
- No UI file touched; the public-site effect (decision 6b) is described in the runbook from the planning-time read, not re-checked in a browser.

## Known Stubs

None.

## Self-Check: PASSED

# Phase 30 deferred items (out of scope for the plan that found them)

## D-30-03-1: staff sessions see no rows of distance_bands and rate_version_rules (found in 30-03 Task 1)

On a database built from the migration files (lab p30), `distance_bands` (20260906000001) and
`rate_version_rules` (20260913180000) carry only RESTRICTIVE policies for `vamos_staff`
(`*_staff_all`, `*_admin_*`), with no permissive policy. `distance_rates`, by contrast, has the
`_staff_gate` (restrictive) plus `_staff_all` (permissive, `using (true)`) pair from 20260823000023.
With row level security on and no permissive policy, a staff session reads and writes none of their
rows: as `vamos_staff` with admin claims, `select count(*) from distance_bands` returned 0 while the
table held rows, and `forkLiveRateVersion` (a staff transaction) copied zero bands and zero
rules into the new draft.

Not verified on the live database (off limits). The controller should read the live policy list
(`pg_policy` for the two tables) before deciding. If live matches the files, new price books lose
their distance bands and rules on every fork, and a migration adding the permissive policies is
needed (a migration is a Phase 30 controller decision; none was written here).

30-03's real-database test (`rate-book-clone-retired.local.test.ts`) adds a permissive policy on
those two tables for the duration of the test only (disposable lab), so it proves the clone SQL
itself, and drops it afterwards.

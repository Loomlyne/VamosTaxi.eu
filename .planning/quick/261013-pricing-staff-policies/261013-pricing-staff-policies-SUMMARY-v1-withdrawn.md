---
phase: quick-261013-pricing-staff-policies
plan: 01
subsystem: database
tags: [rls, pricing, distance_bands, rate_version_rules]
requirements-completed: [DEC-2026-10-13-2]
key-files:
  created:
    - packages/db/supabase/migrations/20261012250000_pricing_staff_policies.sql
    - packages/db/supabase/tests/pricing_staff_policies.test.sql
    - apps/web/lib/ops/rate-book-fork-bands-rules.local.test.ts
metrics:
  started: "2026-10-13 23:38 +04"
  completed: "2026-10-13 23:47 +04 (typecheck finished 00:07 +04, machine under load)"
---

# Quick 261013 Pricing staff policies Summary

Two PERMISSIVE `vamos_staff` policies (`distance_bands_staff_read_write`, `rate_version_rules_staff_read_write`, `for all using (true) with check (true)`) so staff sessions read these tables again; the restrictive is_staff gate, admin-only insert/update/delete policies and frozen triggers are untouched.

## Commits (branch fix/pricing-staff-policies, not pushed)

- `51f5a39e` fix(pricing): migration 20261012250000 + pgTAP `pricing_staff_policies.test.sql`
- `2c03b7ef` test(pricing): `rate-book-fork-bands-rules.local.test.ts`

## Verified (clock = Asia/Dubai, 2026-10-13 unless noted)

- 23:42 `lab.sh up pricing-pol --no-dash`: up (first attempt 23:39 failed only because `node_modules` was missing; `pnpm install --frozen-lockfile` fixed it, no lockfile change).
- 23:45 `lab.sh pgtap pricing-pol`: `PASS | pgtap | Files=118, Tests=3474`; log line `pricing_staff_policies.test.sql .. ok` (25 assertions). Whole existing suite green, no other file edited.
- 23:46:14 local test with migration applied: 1 passed.
- 23:46:25 both policies dropped on the lab only; 23:46:27 same test: FAILED (`expected [] to deeply equal [3 bands]`, the new draft had no bands).
- 23:46:32 migration file re-applied verbatim (`psql -v ON_ERROR_STOP=1 -f`); `pg_policies` shows both `*_staff_read_write` PERMISSIVE; 23:46:33 test: 1 passed.
- Test file has 0 `create policy`/`drop policy`, 0 `seed-live-like`. Migration has exactly 2 `create policy`.
- 00:07 (2026-10-14) `pnpm typecheck`: exit=0 (all workspaces).
- Lab left up: slot 4, public http://localhost:4740, db 127.0.0.1:45422, 2 of 2 PIDs alive, session endpoint 200.

## Not verified

- No full `test:unit`, `gate:local`, no browser/Pricing UI run, no Worker-level click-through (orchestrator's job).
- Nothing run against the live database; migration not applied anywhere but the lab.

## Failed

- Nothing in the final state. During authoring: pgTAP first run failed 10/25 (my fixture errors, see below); first lab `up` failed on missing `node_modules`.

## Deviations

- [Rule 1 - test bug] Dispatchers cannot read `rate_versions` (admin-only restrictive ALL policy), so my first dispatcher fixtures (join to `rate_versions`, `insert ... select from rate_versions`) saw nothing. Ids are now resolved as superuser into a temp table readable by `vamos_staff`; data-modifying CTEs replaced with a `pg_temp.psp_rows()` helper.
- [Plan allowance used] Dispatcher INSERT on a draft book raises `23001` (frozen trigger), not `42501`: the trigger reads `rate_versions` as the caller, a dispatcher sees no row, status reads as non-draft. It is still refused; C3/C4 assert `23001` and say why. The admin-only insert policy is still in place (A3/A4 prove presence; C5-C8 prove dispatcher update/delete hit 0 rows).
- [Rule 3] `pnpm install --frozen-lockfile` in the worktree (lockfile unchanged).
- Task 1 commit hook check "worktree-agent-* branch" skipped on purpose: task said to work on `fix/pricing-staff-policies` in this checkout.

## Hand-over notes

- `public.region_premiums` has the identical restrictive-only shape (same bug). Out of signed scope, not changed.
- Once Phase 30 lands, its `rate-book-clone-retired.local.test.ts` temporary `p30_clone_test_all` policy is redundant (this migration provides the permissive policy) and can be removed in a follow-up.
- `git diff --stat origin/main` also shows a 4-line difference in `.planning/decisions/2026-10-13-p30-ship-p31-lines-rls-fix.md`; not from my commits (local `main`/`origin/main` differ on that planning note).
- Logs: `.planning/quick/261013-pricing-staff-policies/logs/` (untracked, not committed).

## Self-Check: PASSED

Commits 51f5a39e and 2c03b7ef exist; the three files exist; no docs artifacts committed.

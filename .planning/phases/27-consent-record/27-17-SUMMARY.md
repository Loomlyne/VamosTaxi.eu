COMPLETE: D-03a built (grant)

# Phase 27 Plan 17: sign-up agreement grant Summary

## Built
- `packages/db/supabase/migrations/20261002110000_signup_agreement_grant.sql`: one statement, EXECUTE on `record_account_agreement` to `vamos_system` only.
- `packages/db/supabase/tests/signup_agreement_grant.test.sql`: 15 pgTAP assertions (grants, definer, sign-up shape, 22023 refusals, table 42501, consent_log unchanged, anon/authenticated 42501).
- `account_agreement_records.test.sql`: 'record: no other role' list now anon, authenticated; comment updated. Plan count unchanged (66).
- `packages/db/test/local/signup-agreement.test.ts`: write as vamos_system via `publicSql` (rolled back), anon and authenticated rejected with 42501.

## Commits
- 7b142afb feat(27-17): grant record_account_agreement to vamos_system for /sign-up
- cea2a685 test(27-17): sign-up agreement write through the Worker client options

## Commands and results
- `local-stack-27.sh start`: ok. `migrate`: refused (LegacyMigrationMissingRemoteError, ordering). `reset` (59322 stack only) was needed and applied all migrations.
- `local-stack-27.sh test`: account_agreement_records.test.sql ok, signup_agreement_grant.test.sql ok, Result: PASS.
- `VAMOS_LOCAL_DB_PORT=59322 vitest run test/local/signup-agreement.test.ts`: 3/3 pass.
- Acceptance greps: grant count 1, forbidden words 0, seed.sql/database.types.ts clean, one 2026100211 migration, `fetch_types` count 0 in the new test.

## Deviations
- Stack NOT stopped after Task 2: the orchestrator ordered it left running for a later plan. The `docker ps ... vamos-taxi-270 == 0` criterion is therefore intentionally not met.
- `checkout-account.test.ts` (run alongside per the plan's verify command) has 3 failures: `password authentication failed for user "vamos_edge"` on this stack (role passwords not set locally, same cause as the known extensions test 12). Not caused by this plan; the other 2 tests in it pass. Not changed.

## Not verified
- Anything hosted: 20261002110000 must be applied on hosted before the Worker deploy (control session).

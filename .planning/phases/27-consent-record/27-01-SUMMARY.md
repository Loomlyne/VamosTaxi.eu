---
phase: 27-consent-record
plan: 01
subsystem: database
tags: [consent, supabase, pgtap, security-definer]
requires: []
provides:
  - "public.consent_choice(p_policy_version text, p_as_of timestamptz default null): 0 or 1 row, anon-only EXECUTE"
  - "scripts/local-stack-27.sh: port-shifted local Supabase stack on 5932x"
affects: [27-05, 28, 29]
key-files:
  created:
    - scripts/local-stack-27.sh
    - packages/db/supabase/migrations/20261002100000_consent_choice_reader.sql
    - packages/db/supabase/tests/consent_choice_reader.test.sql
    - packages/db/test/local/consent-reader.test.ts
  modified:
    - packages/db/database.types.ts
requirements: [META-03, META-05]
completed: 2026-09-30
---

# Phase 27 Plan 01: Consent choice reader Summary

One SECURITY DEFINER reader, `public.consent_choice`, returns the latest consent_log row for the bound subject under one policy version, optionally as of a time T, proven by pgTAP and through the Worker client options on this worktree's own stack.

## Commits
- d72abb96 feat(27-01): port-shifted local Supabase stack 27 on 5932x
- 48408d03 feat(27-01): consent_choice reader with pgTAP proof
- cdb16435 test(27-01): Worker-client proof of consent_choice, regenerate types

## What was built
- `scripts/local-stack-27.sh`: project `vamos-taxi-270`, ports 593xx, inspector 8283 (free, checked with lsof), scratch `/tmp/vamos-sb27`. Guard refuses any 543xx or 55322/56322/57322/58322/60322 in the scratch config. Creates the hook secret `/tmp/vamos-sb27/hook-secret.txt` (mode 600, never printed, not in git), adds `http://localhost:4290/**` and the `[auth.hook.send_email]` block for the 27-14 auth e2e. Subcommands: start, stop, reset, migrate, test, types, url, status, hook-secret-path.
- Migration `20261002100000_consent_choice_reader.sql`: language sql, stable, security definer, `search_path = ''`, no arrays, no DML, no table grant. Revoked from public and authenticated; EXECUTE to anon only. Filter by version first, then `recorded_at <= p_as_of`, order `recorded_at desc, id desc`, limit 1. Subject only from the GUC `request.vamos.consent_subject`.
- pgTAP `consent_choice_reader.test.sql`, 24 assertions: R1-R8, G1 (anon yes; authenticated, vamos_guest, vamos_public, vamos_system, PUBLIC no), G2 (prosecdef, proconfig `search_path=""`), G3 (anon select on consent_log still 42501), G4 (no or empty GUC gives 0 rows), G5 (record_consent then reader).
- Worker-client test `consent-reader.test.ts`, in one rolled-back transaction (verified 0 fixture rows left).
- `database.types.ts` gains `consent_choice` (11 lines added).

## Commands run and results
- `pnpm install --frozen-lockfile`: done.
- `local-stack-27.sh start`, `reset`, role passwords set on `supabase_db_vamos-taxi-270`: ok.
- Scratch config: `grep -E "5[45678]322|60322|543[0-9][0-9]"` prints nothing; `auth.hook.send_email` count 1; hook secret file non-empty.
- RED: with the pgTAP file and no migration, the new file failed (function missing).
- GREEN: after `reset`, `consent_choice_reader.test.sql .. ok` (24/24).
- Function definition md5 read-back (local): `e6bc2f771c9bdff2ab23ee636034d749`.
- `VAMOS_LOCAL_DB_PORT=59322 pnpm --filter @vamos/db exec vitest run test/local/consent-reader.test.ts`: 1 file passed, 1 test passed.
- `supabase gen types ... | diff -q - packages/db/database.types.ts`: no difference.
- Acceptance greps on the migration: one 2026100210* file; security definer 1; `search_path = ''` 1; no table grants; `to anon` count 1; no other grants. `grep -c 54322` on the Worker test: 0.

## Baseline red on main before 27
Full pgTAP on unchanged code (76 files, 1754 tests), 2 files red, neither caused by this plan:
- `seed_idempotent.test.sql` tests 33 (content_strings count have 2660, want 2626) and 36 (no-param-reason keys have 94, want 75): stale counts, as research Pitfall 2 predicted. Not fixed here.
- `extensions.test.sql` test 12 "vamos_edge has no password": fails because the plan requires setting the role passwords for the Worker-client test. It is an effect of that step, not a main defect. Not fixed.

The same two files are the only reds after the 27-01 changes.

## Runtime type pinned
With `fetch_types: false` and `types: pgArrayTypes`, `recorded_at` arrives as a JS `Date` (asserted `instanceof Date` and exact ISO value). Booleans arrive as `boolean`. Generated TS type is `string` (types file); plan 27-05 must treat the runtime value as `Date`.

## Other stacks
Container IDs of the other sessions' Supabase stacks (54322, 55322, 56322, 57322, 58322, 60322) were not started, stopped or connected to by me. A before/after `docker ps` diff showed churn, but only in other sessions' stacks (vamos-taxi-265 restarted by its own session, others in their own labels). Every command I ran targeted `--workdir /tmp/vamos-sb27` and container `supabase_db_vamos-taxi-270`.

## Deviations from Plan
- **[Rule 1 - Bug] `pg_catalog.nullif` does not exist.** `NULLIF` is SQL syntax, not a function, so the research body fails to apply. The migration uses plain `nullif(...)`, which is safe under `search_path = ''`. All other identifiers stay schema-qualified.
- pgTAP plan count corrected from 25 to 24 after counting the assertions (first written count was wrong).
- Worker-client test uses a pinned postgres client with the Worker's exact option set (via `withIdentity`'s `opts.client`) so the fixtures roll back; role `anon` is set by `withIdentity` itself.

## Not verified
- Hosted apply, and hosted `rolbypassrls` check on `postgres` (research A1): left to the control session; nothing touched hosted.
- The auth worker e2e (27-14) not run here; only its stack prerequisites are in place.

## Known Stubs
None.

## Self-Check: PASSED
Files exist; commits d72abb96, 48408d03, cdb16435 on `gsd/phase-27-consent-record`.

---
phase: 28-pixel-pageview
plan: 01
requirements: [META-09]
key-files:
  created:
    - packages/db/supabase/migrations/20261007240000_booking_meta_click_ids.sql
    - packages/db/supabase/tests/booking_meta_click_ids.test.sql
    - packages/db/test/local/meta-click-ids.test.ts
  modified:
    - scripts/db-access-fence-allowlist.json
    - packages/db/database.types.ts
---
# Phase 28 Plan 01: database side of META-09

Two nullable columns `bookings.meta_fbp` / `meta_fbc` (no default, format CHECKs), a guard trigger that
refuses a new or changed value on any non-pending booking for every role, and the definer writer
`public.checkout_set_meta_click_ids(uuid,text,text)` (EXECUTE vamos_checkout only, 55000 unless pending,
P0002 unknown id, NULLs clear).

- Migration number used: `20261007240000`. Checked 2026-10-03 against `git branch -r`, `git log --all --name-only` and origin/main: unused. Controller must confirm (fare-lines holds `...230000`).
- Stack: `vamos-taxi-280`, ports 613xx (DB 61322), inspector 8483. Baseline pgTAP on unchanged code: green (only the new RED file failed).
- Commits: RED test, GREEN migration, Worker-client proof + types.
- Copy-insert grep (`insert into public.bookings ... select`): none. The only insert into bookings in migrations is `checkout_create_booking` with explicit columns.

## Deviations
1. [Rule 1 - Bug] Plan/research regex `[A-Za-z0-9_-]{1,500}` is invalid in Postgres (repetition max 255, error 2201B). Replaced by `[A-Za-z0-9_-]+`; the `length(meta_fbc) <= 600` check bounds it. 28-05's TS regex must use the same pattern.
2. [Rule 2 - Security] The trigger function was executable by PUBLIC (caught by the existing `extensions.test.sql` F-13 test). Added `revoke all ... from public` and a pgTAP assertion.
3. pgTAP staff case needs an aal2 admin JWT claim plus a staff row; fixture added, and a check that staff really sees the row so the refusal is the trigger and not row security.

## Verified
pgTAP full run from a zero reset: 100 files, 2700 tests, PASS. Worker-client test and consent-reader test: 5 passed. `pnpm check:db-fences` pass. Types diff = the two columns and the function.

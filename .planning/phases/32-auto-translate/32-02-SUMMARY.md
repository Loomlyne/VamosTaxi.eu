---
phase: 32-auto-translate
plan: 02
subsystem: translate-database
tags: [postgres, rls, pgtap, security-definer, translation-cache, i18n]
requires: [32-01]
provides:
  - public.translations (context review only) + translation_read, system_translation_put_machine, system_translation_mark
  - public.reviews.language + review_ref(body), review_translation_source(ref), system_review_language_source/set
  - public.support_messages.detected_lang, support_message_translations, booking_note_translations (staff-only)
  - system_support_translation_source/put/fail, system_support_form_message_id, system_booking_note_source, system_booking_note_translation_put/fail, system_translation_backlog
  - system_extra_labels_missing, system_extra_label_fill
  - apps/web/lib/translate/store.ts (one wrapper per definer function)
affects: [32-05, 32-06, 32-07, 32-08, 32-12]
tech-stack:
  added: []
  patterns: ["definer-only writes for vamos_system", "jsonb per-language rows, no arrays", "note_hash keys translations to the current note", "upsert where origin is machine (human wins)"]
key-files:
  created:
    - packages/db/supabase/migrations/20261012260000_translations_cache.sql
    - packages/db/supabase/migrations/20261012270000_reviews_language.sql
    - packages/db/supabase/migrations/20261012280000_support_and_note_translations.sql
    - packages/db/supabase/migrations/20261012290000_extra_labels_system_fill.sql
    - packages/db/supabase/tests/translations_cache.test.sql
    - packages/db/supabase/tests/reviews_language.test.sql
    - packages/db/supabase/tests/support_note_translations.test.sql
    - packages/db/supabase/tests/extra_labels_system_fill.test.sql
    - apps/web/lib/translate/store.ts
    - apps/web/lib/translate/store.test.ts
  modified:
    - packages/db/supabase/tests/reviews_column_grants.test.sql
    - packages/db/supabase/tests/audit_trigger.test.sql
    - packages/db/database.types.ts
decisions:
  - "prompt_version is nullable (a mark before any put has none); done rows require it. Customer-text writers read it per language entry (`prompt_version` key in p_rows); store.ts adds it from a promptVersion argument"
  - "system_translation_put_machine returns the stored row (translated_text, origin, status), so a caller serves a human text when one exists"
  - "system_translation_mark stores a reason only when it matches ^[a-z_]{1,40}$, else 'other'; it refuses status other than rejected/failed (22023)"
  - "A rejected answer never replaces a done row (support and note put); booking-note put/fail delete rows of an earlier note_hash, so the table holds the current note only"
  - "Backlog kinds match jobs-contract.ts: 'support', 'note', 'review'; limit clamped to 1..200"
  - "Customer-text put functions ignore unknown keys/statuses; a done entry with a blank or >8000-char body is stored as rejected with no body; an invalid detected language is stored as null"
metrics:
  duration: 21min
  started: 2026-10-14T03:04+04:00
  completed: 2026-10-14T03:25+04:00
  tasks: 4
  files: 13
---

# Phase 32 Plan 02: Translator database Summary

Postgres side of the translator: a public-safe review translation cache where a machine write can never overwrite a human row, staff-only (enable + force RLS) tables for translated customer messages and booking notes, a review language column with an opaque sha256 ref, a system writer for extra names that keeps his typed values, pgTAP proof for every access rule, Phase 32 types, and the Worker wrappers in `apps/web/lib/translate/store.ts`.

## Task 0: migration numbers (controller-supplied, owner signed 2026-10-14 ~00:25)

| Purpose | Timestamp | File |
|---|---|---|
| translations_cache | 20261012260000 | `packages/db/supabase/migrations/20261012260000_translations_cache.sql` |
| reviews_language | 20261012270000 | `packages/db/supabase/migrations/20261012270000_reviews_language.sql` |
| support_and_note_translations | 20261012280000 | `packages/db/supabase/migrations/20261012280000_support_and_note_translations.sql` |
| extra_labels_system_fill | 20261012290000 | `packages/db/supabase/migrations/20261012290000_extra_labels_system_fill.sql` |

Task 0 automated check passed: newest on origin/main `20261012230000`, newest on origin/phase-31-refunds-in-stripe `20261012240000_refund_check_reader.sql`; all four sort after both and are unique. (PR #81 holds `250000` and `300000`; no collision.)

## Tasks

| # | Task | Commit |
|---|---|---|
| 0 | Migration numbers (already in frontmatter) | none (check only) |
| 1 | Cache, review language/ref, extras fill (3 migrations + pgTAP) | `ece5d335` |
| 2 | Staff-only message and note translations (migration + pgTAP) | `08bd27df` |
| 3 | Types + store wrappers + store test | `f8e6c20c` |

## Local lab (left running for plans 05/07/08/12)

- Name `p32`, slot 1, native runtime, state `~/.vamos-scratch/lab-p32`.
- Supabase: db `127.0.0.1:45122`, api `45121`, shadow `45120`. Workers: public `http://localhost:4710`, dashboard `http://dashboard.localhost:4711`, fakes `http://127.0.0.1:4717`, inspectors 9711/9712.
- The plan-end `lab.sh pgtap p32` reset and replayed every migration (all four Phase 32 files included) and restored the lab data; the Workers were up afterwards (`lab.sh status p32`: 3/3 pids, `/api/auth/session` 200). If a Worker holds a stale connection, `lab.sh up p32` restarts it.

## Verification (2026-10-14, local lab only)

- Task 1 touched pgTAP (`~/.vamos-scratch/lab-p32/logs/pgtap-task1.log`): translations_cache 47/47, reviews_language 32/32, reviews_column_grants 27/27, extra_labels_system_fill 22/22, db_privilege_hardening green (W5-08: service_role EXECUTE still only the five staff_digest_* functions), extra_labels green. No `not ok`, `# Looks like` or `ERROR`.
- Task 2 (`pgtap-task2.log`): support_note_translations 74/74; support_tickets and db_privilege_hardening re-run green.
- Full suite `bash scripts/test-lab/lab.sh pgtap p32`: `PASS | pgtap | Files=125, Tests=3765`; `grep -c '^not ok'` = 0.
- `apps/web/node_modules/.bin/vitest run lib/translate/store.test.ts lib/db/system-reads.test.ts`: 2 files, 23 tests passed (system-reads guard scans the new asSystem blocks too).
- `node scripts/check-db-access-fences.mjs`: all 8 checks passed.
- `tsc --noEmit` apps/web: exit 0; packages/db: exit 0 (`evidence/32-02-typecheck-t3.log`). `eslint` on store.ts + store.test.ts: exit 0.
- Acceptance greps: `where translations.origin = 'machine'` = 1; review_ref revoke line = 1, grant line = 1; `force row level security` = 2; `alter table public.bookings` (non-comment) = 0; `system_booking_note_translation_fail` = 2 and security definer; every `create or replace function` has `security definer` and `set search_path = ''` (3/3, 4/4, 8/8, 2/2); no `drop table`/`drop column`; types grep = 5; store.ts `insert into|update public.` = 0.

## Deviations from Plan

### Auto-fixed

1. **[Rule 1 - Bug] audit_trigger.test.sql pinned 16 tg_audit_row triggers.** The new `audit_translations` trigger made the full suite fail test 14 (have 17). Updated the pin to 17 with the reason in the label. File `packages/db/supabase/tests/audit_trigger.test.sql`, commit `f8e6c20c`.
2. **Types could not come from the pinned CLI without Docker.** `supabase gen types` 2.115.0 (`--db-url` and `--local`) runs the `postgres-meta` container; the one attempt failed (the container could not reach `127.0.0.1:45122`). Docker is off-limits for Vamos, so I did not retry it. Instead: generated with the native CLI 2.119.0 (`--local --workdir` on lab p32), formatted it with the repo's prettier 3.9.6 (`--parser typescript --no-semi`, the generator's formatter), and applied **only the Phase 32 hunks** to the committed file (3 tables, `reviews.language`, `support_messages.detected_lang`, 18 functions; HEAD conventions kept, e.g. `Args: never`). Proof: every line that still differs between the committed file and the native output was already different between HEAD and the native output (generator-version template: `NonNullable<Json>`, `never` for generated columns, `Record<PropertyKey, never>`), except one intentional `Args: never` line. **Not run:** the real 2.115 `db:types:check`. CI's database job runs it on the PR. If it shows a layout difference, regenerate in CI's layout; never hand-merge.
3. **Contract details not in the interface block** (see decisions): nullable `prompt_version` with a per-entry key in p_rows; `put_machine` returns the stored row; extras fill and customer-text put return int counts; `review_ref` is `security definer` (acceptance requires it on every function; it is `immutable parallel safe`); `translations` also revokes vamos_staff, vamos_checkout and vamos_system (defensive, D-05: no staff screen); the twice-serialised jsonb string is unwrapped in every jsonb function (memory worker-pg-client-no-arrays).

### Not done / for later plans

- When a customer empties a booking note, the rows of the old note stay (no screen reads them, D-12). A reader must compare `note_hash` with the current note. A later plan can delete them in the nightly sweep.
- `translation_read` runs on the cached HYPERDRIVE binding (publicSql). Right after a put, a read can return a cached miss for the cache TTL. Plan 05 should serve the row that `putMachineTranslation` returns, not re-read.

## Threat Flags

| Flag | File | Description |
|---|---|---|
| threat_flag: rest-rpc | 20261012260000 / 20261012270000 | `translation_read`, `review_translation_source` and `review_ref` are EXECUTE for `anon` (as the plan says), so Supabase REST `/rest/v1/rpc/...` reaches them with no Worker rate limit. They return only published-review text and its cached translations, which anon can already read through REST column grants. No model call sits behind them. |

## Known Stubs

None.

## Machine note for the controller

A Colima Docker daemon is running with an ALMAR Supabase stack (`supabase_*_almar-7e68d805`) next to lab p32. The machine rule allows one local Supabase stack at a time. I did not touch it.

## Self-Check: PASSED

- Files exist: the four migrations, the four new pgTAP files, `store.ts`, `store.test.ts`; the modified `reviews_column_grants.test.sql`, `audit_trigger.test.sql`, `database.types.ts`.
- Commits in `git log`: `ece5d335`, `08bd27df`, `f8e6c20c`.

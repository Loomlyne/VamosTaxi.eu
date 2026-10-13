---
phase: 31-refunds-in-stripe
plan: 03
subsystem: database / refunds
tags: [migration, postgres, definer, pgtap, refunds]
requires: []
provides:
  - "public.refund_check_read(jsonb): nightly refund check reader, vamos_system only (31-05 cron)"
  - "public.notification_claim_refund(uuid, text, text): one refund mail claim per Stripe refund (31-04/31-06)"
  - "public.notification_refund_read(int8): booking, Stripe refund id and recorded refund_rappen for an unsent refund claim (31-06 send and sweep)"
  - "database.types.ts entries for the three functions"
affects: [31-04, 31-05, 31-06, 31-13, Phase 30 30-01 (database.types.ts merge), controller live apply]
tech-stack:
  added: []
  patterns: [plpgsql STABLE definer reader with #variable_conflict use_column, claim keyed on a Stripe id, temp tables granted to vamos_system in pgTAP]
key-files:
  created:
    - packages/db/supabase/migrations/20261012220000_refund_check_reader.sql
    - packages/db/supabase/tests/refund_check_reader.test.sql
  modified:
    - packages/db/database.types.ts
decisions:
  - "Migration number 20261012220000 given by the owner through the controller (31-CONTEXT S-10, question form 2026-10-13 ~16:20 +04); Task 1 gate recorded, no stop"
  - "refund_check_read returns payment_found and site_reversed as NULL (not false) for an element that is not an object or whose id is not a string, so such a row is entirely NULL"
  - "notification_refund_read joins booking_refunds on the same booking as the claim, not on the Stripe id alone"
  - "Types hand-applied in the committed prettier style from the native CLI 2.119.0 output; pinned CLI 2.115.0 needs Docker and was not used"
metrics:
  duration: "about 8 min (2026-10-13 12:42Z to 12:50Z)"
  completed: 2026-10-13
  tasks: 3
  files: 3
---

# Phase 31 Plan 03: Refund check reader migration Summary

One additive migration, `20261012220000_refund_check_reader.sql` (md5 `a7f3ae95a3130a0ce3943cfa27cf660a`), adds three SECURITY DEFINER functions for vamos_system only: the nightly refund check reader (one row per Stripe refund in input order, reference and amounts only, raises `too_many_refunds` above 500), the per-refund customer mail claim (dedupe `booking:refund:<re_id>`, refused unless the refund is recorded on that booking, locale from the booking) and the claim reader that hands the sweep Stripe's recorded amount. pgTAP 52/52 in the new file, full suite PASS (117 files, 3488 tests) on this phase's own native lab stack.

## Task 1: migration number (gate already answered)

The owner gave `20261012220000` through the controller: 31-CONTEXT S-10, question form 2026-10-13 ~16:20 +04. It sorts after origin/main (`20261012190000`) and Phase 30 (`20261012210000`). No other Phase 31 file takes a number. No commit (no files).

## Commits

| Task | Commit | What |
|------|--------|------|
| 2 | 9a5aa235 | migration (three definers, grants, comments) + `refund_check_reader.test.sql` (plan 52) |
| 3 | 5a66c275 | `database.types.ts`: the three functions, 33 lines added, 0 removed |

## Verification

- Task 2 automated check passed: 3 `security definer`, exactly 3 `grant execute ... to vamos_system` lines, no table DDL or write outside the claim insert into booking_notifications, `too_many_refunds` present, 2 `language plpgsql`. `service_role` appears only on the three revoke lines; `kind_check` 0 times (C-04 untouched).
- New pgTAP file on the lab (after applying the file there): 52/52 ok.
- `scripts/test-lab/lab.sh pgtap p31-refunds` (reset from zero with every migration in this tree, then the whole suite): `PASS | pgtap | Files=117, Tests=3488`, `refund_check_reader.test.sql ... ok`. Log: `.planning/phases/31-refunds-in-stripe/logs/31-03-pgtap.log` (`exit=0`); suite log `~/.vamos-scratch/lab-p31-refunds/logs/pgtap.log`.
- Types: native CLI 2.119.0 `gen types typescript --db-url <lab> --schema public`, compared with the committed file by word count. Before the edit, 33 words differed. After it, 6 differ, all generator style (`NonNullable`, `PropertyKey`, `Record`, `never`, `boolean`/`unknown` spellings), as in Phase 29. So the tree's types were otherwise up to date and the diff adds only the three functions. `tsc --noEmit --strict` on the file passes.
- No command targeted the live project. No `db push`, `link` or `--linked`.

## Lab stack (left running for 31-05, 31-06, 31-13)

- Name `p31-refunds`, project `vamos-lab-p31-refunds`, slot 2, native runtime, database `127.0.0.1:45222` (API 45221). State `~/.vamos-scratch/lab-p31-refunds`. After the pgTAP run the lab data is back (seed-live-like, roles, admin), and the migration is at `20261012220000`.
- No Workers: the stack was started without `lab.sh up` (see deviation 1). Before a browser run, `lab.sh up p31-refunds` reuses this lab.env and stack, then builds and starts the Workers.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Lab stack started without `lab.sh up`**
- **Found during:** Task 3
- **Issue:** `lab.sh up` always runs a full `opennextjs-cloudflare build` on a fresh tree (no `.open-next/worker.js`) and starts the Workers. This job's rules forbid full builds.
- **Fix:** a helper outside the repo (`/private/tmp/p31-labhelper/stack-up.sh`) loads lab.sh's own functions and runs the same steps as `up` up to and including the lab data: pick_slot, make_workdir, check_own_stack, write_lab_env, start_stack, write_sb_env, data_steps. It skips the build and the Workers. The lab.env, workdir and symlinks match `lab.sh up` exactly, so `lab.sh pgtap/env/up/destroy p31-refunds` all work on it.
- **Files modified:** none in the repo

**2. [Rule 1 - Plan fixture impossible] Locale fallback not covered by a booking with locale 'it'**
- **Found during:** Task 2
- **Issue:** `bookings.locale` has `check (locale in ('en','de','fr','ar'))`, and check constraints still apply under `session_replication_role = replica`, so a booking with locale 'it' cannot exist.
- **Fix:** the test covers de, en and fr bookings giving de, en and fr. The `else 'en'` and `coalesce(…, 'en')` fallback stays as a guard but cannot be reached with today's schema.

**3. [Rule 3 - Blocking] Types generated with the native CLI, not the pinned 2.115.0**
- **Found during:** Task 3
- **Issue:** `pnpm exec supabase gen types --db-url` (2.115.0) runs pg-meta in a Docker container. That container could not reach the host database and the run failed. It was one attempt, the container exited, and nothing was retried on Docker (owner rule: no Docker for Vamos).
- **Fix:** I followed the Phase 29 recipe: generated with native 2.119.0 and hand-applied the delta in the committed style. The token comparison is above.

**4. [Test design] Fixture ids exposed to vamos_system through granted temp tables**
- vamos_system has no SELECT on bookings, so the booking ids, the reader output and the claim ids sit in temp tables granted to vamos_system. The assertions on those values run after `reset role`.

## Not verified

- `pnpm db:types:check` with the pinned CLI (needs Docker): whole-file byte identity is not proven. The controller's clean-clone check is the proof.
- The live apply: that is the controller's md5-guarded ritual. On live, `service_role` keeps no EXECUTE because this migration revokes it explicitly; the ACL assertions are written to hold on live too.
- Concurrency of two simultaneous claims of the same refund: covered by the unique `dedupe_key` (same mechanism as notification_claim), not tested with two sessions here.

## Notes for later plans

- C-03: `database.types.ts` will conflict with Phase 30's 30-01 at merge. Whichever phase lands second regenerates the file after merging origin/main.
- The claim needs the `booking_refunds` row first, so the Worker claims after `stripe_charge_refunded_record` returns `'recorded'` (D-10).

## Known Stubs

None.

## Threat Flags

None. The three functions are the surface the plan's threat model names: T-31-10 to T-31-15 mitigated and pinned by pgTAP (grants, STABLE, column list, dedupe, search_path).

## Self-Check: PASSED

- FOUND: packages/db/supabase/migrations/20261012220000_refund_check_reader.sql
- FOUND: packages/db/supabase/tests/refund_check_reader.test.sql
- FOUND: packages/db/database.types.ts (3 function names)
- FOUND: 9a5aa235, 5a66c275

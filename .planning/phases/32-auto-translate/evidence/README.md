# Phase 32 evidence

The `*.log` files in this folder are gitignored (`.gitignore` line 40, `*.log`). They stay on the
Mac in this worktree; this file is the committed record of what each run proved. Clock times are
Dubai (+04), read from the logs.

## Plan 32-12, Task 1: Chromium proof on the local Worker

| Run | When | Head | Result | Log |
|---|---|---|---|---|
| Earlier frame attempt (before the 32-10 fix) | 2026-10-14 05:09:53-05:20 | before c92bfe20 | superseded by the full run; API statuses only | `browser-smoke-api.log` |
| Smoke (seed + sign-in only, no frames) | 2026-10-14 05:25:40 (4 s) | c92bfe20 | seed rc=0, 7 review refs, dashboard sign-in through the confirm page, exit=0 | `browser-smoke.log` |
| Full run, surfaces A, B, C | 2026-10-14 05:25:57-05:50:47 (1489 s) | c92bfe20 | A 16 pass 0 fail, B 16 pass 0 fail, C 16 pass 0 fail; exit=0 | `browser.log`, `browser-api.log` |

- Frames: 1440, 1024, 768, 390 px x en, de, fr, ar for each surface (A dashboard rail and the
  removed `/pages`, `/legal` addresses; B support ticket overlay; C home review card).
- Every frame also checks C1 (no sideways scroll), C2 (`lang`/`dir`), C3 (`VamosLocale.coverage`
  empty for de/fr/ar), C6 (targets >= 44 px), C7 (no vendor or model name, no "machine", no
  `ß` in German), C8 (no page error), C10 (no `%s`, `{{` or key names).
- Review translation requests before the first tap: 0 in 16 of 16 home frames.
- Requests to a live vamostaxi host: 0 (aborted by the script if any had been made).
- Lab: `p32` (native Supabase stack, local Worker build, `VAMOS_DEV_REMOTE_BINDINGS=0`, so the
  Worker has no `AI` binding). Seed: `apps/web/tests/e2e-worker/translate-seed.sql`
  (synthetic rows only, no amounts). Script and runner: `translate-browser.e2e.mjs`,
  `translate-run.sh` (commit `f31eacba`).

### The one stubbed route, and why

Only `POST /api/staff/tickets/<id>/reply-translate` is stubbed (Playwright route), and only for
two states of the reply box: **ready** and **too long**. The local Worker has no `AI` binding,
so the real route can only answer "failed"; the ready state (translated text, blank line, 20
hyphens, blank line, his text) needs a translated answer to exist. The **failed** reply state
was proven against the real route (no binding). Everything else is real: the routes, the local
database, the seeded cache rows that serve the German and Arabic review translations and the
translated customer messages, and the missing binding for every failure path.

### Bugs the browser run found (fixed before the full run)

- Pending and failed customer messages with no detected language showed no note. Fixed in
  plan 32-10 follow-up: `20ca2fba` (test), `c92bfe20` (fix): they now show "Translating…" and
  "Translation not available".

## Merge and types (Task 0 of the run)

| Check | When | Result | Log |
|---|---|---|---|
| Tests touched by the origin/main merge (Phase 31 #82) | 04:41 | 1 red: the Phase 31 refund-check source pin assumed its block was last before `return;`. Fixed in `24916f3e` (pin allows the translate sweep after it; 03:00 order pinned) | `merge-tests.log` (exit=1, before the fix) |
| Typecheck after the merge | 04:42 | exit=0 | `merge-typecheck.log` |
| Generated types vs native CLI 2.119 | 05:01:44 | merged `database.types.ts` has 242 entries, native output 242; none only on one side; the differing blocks are the CLI-version layout, the same blocks that differ before the merge | `types-compare.log` |
| `db:types:check` with the pinned 2.115 CLI | not run | needs Docker (`postgres-meta` container); Docker is not used for Vamos | none |

## No-database gate run (before the browser run)

| Run | When | Head | Result | Log |
|---|---|---|---|---|
| `gate:local` without `test:db-lab` | 04:56:41-04:58:35 | 29a66a2e | web unit: 518 files passed, 26 skipped; 6606 tests passed, 57 skipped; exit=0 | `gate-local-nodb.log` |

The earlier run of the same chain found 3 unit reds from the removed `content-string-edit`
spec, fixed in `29a66a2e` before this run.

## Plan 32-12, Task 2: full local gates and pgTAP on the merged branch

Started 2026-10-14 12:15:20 at head `fb13271e`: the `gate:local` chain with `test:db-lab`
replaced by `lab.sh dbtests p32 --keep` (same DB tests, stack kept), then full pgTAP
`lab.sh pgtap p32`, then destroy and lock release, then the static checks (`test:scripts`,
`db:seed:check`, `check:db-fences`, `i18n:fill --check`). Logs: `gate-local.log`, `pgtap.log`,
`static.log`.

Task 2 results, 2026-10-14, head fb13271e (merged with origin/main 8ef7e82d), one lane, logs in `evidence/`:
- `gate-local.log` 12:15:20-12:18:22, exit=0: check:public-env, typecheck, lint:css, lint, i18n:check (2698 keys), check:legal-claims, check:numbers, build, test:unit (scripts 45/0; packages/db 14; emails 360; apps/web 6607 passed, 57 skipped, 518 files), DB tests via `lab.sh dbtests p32 --keep` (packages/db test/local 76; apps/web `.local.test.ts` 11 + 44), all pass.
- `pgtap.log` 12:17:44-12:18:15, exit=0: full suite Files=126, Tests=3833, PASS.
- `static.log` 12:18:19-12:18:22, exit=0: test:scripts, db:seed:check (no drift), check:db-fences, i18n:fill --check (0 gaps), each exit 0.
- Stack lock taken 12:16:33, lab p32 destroyed and lock released 12:18:19.

## Incident: stack lock held by a dead agent

The first 32-12 agent died at about 05:50 (API error) holding the one-stack lock
`~/.vamos-scratch/stack.lock` and the lab `p32` from 05:00 (`lock.log`: `05:00:49 acquired
(p32)`) until the orchestrator released both at 12:13. The controller was told. The Task 2
script holds the lock only for the database part, with an EXIT trap that releases it.

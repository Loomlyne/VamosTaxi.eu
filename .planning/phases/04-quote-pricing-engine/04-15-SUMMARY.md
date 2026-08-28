---
phase: 04-quote-pricing-engine
plan: 15
subsystem: database
tags: [postgres, pgtap, security-definer, quote-snapshot, quote-04, quote-05, quote-10]

# Dependency graph
requires:
  - phase: 03-hyperdrive-data-access-wiring
    provides: >-
      QUOTE_PG_ROLE="anon", quote_identity.test.sql auto-detecting D-44a seam (skip until this plan)
  - phase: 04-quote-pricing-engine (plan 04-05)
    provides: quote_lock_expires_at, shown_alternatives, tg_snapshot_lines_reconcile, eight-key policy
  - phase: 04-quote-pricing-engine (plan 04-06)
    provides: quote read RPCs; definer + revoke + grant convention this file matches
provides:
  - public.create_quote_snapshot SECURITY DEFINER write door (D-44a path a)
  - Postgres-authoritative expired-lock raise (D-25) that inserts nothing
  - Two-clock write (quote_lock_expires_at from p_lock_exp, expires_at from checkout_window_minutes)
affects: [04-14, phase-07-checkout, quote identity, asQuote]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Quote write surface is one definer RPC; tables stay revoked from anon (direct INSERT is 42501)"
    - "p_lock_exp <= now() raises restrict_violation inside the write transaction (D-25)"
    - "expires_at derived from settings_versions.checkout_window_minutes; never an argument"
    - "rate_version_is_live is not an argument; tg_snapshot_rate_version_flag overwrites from the table (D-33)"

key-files:
  created:
    - packages/db/supabase/migrations/20260825000007_quote_snapshot_rpc.sql
    - packages/db/supabase/tests/quote_snapshot_rpc.test.sql
  modified:
    - packages/db/supabase/tests/quote_identity.test.sql
    - packages/db/supabase/tests/reference_tables.test.sql
    - packages/db/database.types.ts
    - packages/db/README.md

key-decisions:
  - "Path (a) taken: SECURITY DEFINER RPC, QUOTE_PG_ROLE stays anon. Path (b) vamos_quote nologin not taken."
  - "qi-policy fixture now sets checkout_window_minutes=30 so the live D-44a call does not raise on an unanswered window."

patterns-established:
  - "Named-argument RPC calls in pgTAP cast text/smallint/rappen explicitly — integer literals are int4 and fail to resolve against int2."
  - "Empty-search_path definer body schema-qualifies every type; constraint SQLSTATEs are never swallowed."

requirements-completed: [QUOTE-04, QUOTE-05, QUOTE-10]

# Metrics
duration: 11min
completed: 2026-08-28
---

# Phase 4 Plan 15: Quote Snapshot Write RPC Summary

**`public.create_quote_snapshot` is the anonymous quote identity's only write door: SECURITY DEFINER, EXECUTE for `anon`/`authenticated`, no table grant; an expired lock raises `restrict_violation` and inserts nothing.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-08-28T12:51:21Z
- **Completed:** 2026-08-28T13:02:19Z
- **Tasks:** 3/3
- **Files modified:** 6

## Accomplishments

- `create_quote_snapshot` granted EXECUTE to `anon, authenticated` only; PUBLIC revoked; no SELECT/INSERT/UPDATE/DELETE table grant. Under `set local role anon`, a launch-state call (every price argument omitted) lives, and a direct `insert into public.price_snapshots` is `42501`.
- D-25: `p_lock_exp` in the past raises `restrict_violation` (23001) and leaves the `price_snapshots` count unchanged. D-33: a snapshot against seeded `seed-placeholder` (draft) has `rate_version_is_live = false` and `is_chargeable = false`. D-23/D-43: `quote_lock_expires_at` equals the passed exp; `expires_at` is `now() + checkout_window_minutes` and differs when the lock is offset.
- `quote_identity.test.sql` runs its D-44a-live assertion instead of its skip, with `plan(5)` unchanged. `tg_snapshot_lines_reconcile` still fires through the RPC.

## Task Commits

Each task was committed atomically:

1. **Task 1: create_quote_snapshot — the definer write door** - `7f48855` (feat)
2. **Task 2: pgTAP — the expired-lock raise, and turning the Phase 3 seam test green** - `ba8b0aa` (test)
3. **Task 3: [BLOCKING] Apply from zero and run the full suite** - `faa81ff` (chore)

**Plan metadata:** (this commit)

## Files Created/Modified

- `packages/db/supabase/migrations/20260825000007_quote_snapshot_rpc.sql` - definer write RPC, revoke/grant, two-clock insert, legs fan-out
- `packages/db/supabase/tests/quote_snapshot_rpc.test.sql` - 22 assertions (privs, prosecdef, launch state, two clocks, expired lock, null window, empty legs, two-leg fan-out, lines reconcile, 42501)
- `packages/db/supabase/tests/quote_identity.test.sql` - positive half rewritten to the real signature; `plan(5)` kept
- `packages/db/supabase/tests/reference_tables.test.sql` - `plan(41)` + `has_function create_quote_snapshot`
- `packages/db/database.types.ts` - regenerated (`create_quote_snapshot` in Functions)
- `packages/db/README.md` - ordinal 07 marked landed

## Decisions Made

- Path (a): one definer function, not a `vamos_quote` role. `QUOTE_PG_ROLE` stays `"anon"`.
- `quote_identity` fixture `qi-policy` now inserts `checkout_window_minutes = 30`. The RPC raises on a null window; leaving the fixture unanswered would turn the live seam into a failure.
- pgTAP named-argument calls cast `'…'::text`, `1::smallint`, and `10::public.rappen`. Without those casts Postgres 17 cannot resolve the function (int4 vs int2, unknown vs text).

## Deviations from Plan

None - plan executed exactly as written, with one inherited verification miss recorded below (not an auto-fix).

**Total deviations:** 0 auto-fixed.
**Impact on plan:** None.

## Issues Encountered

- `pnpm db:seed:check` exits 1 on this worktree: committed `seed.sql` has `content_strings=1516`; the generator (after 04-08 i18n) would emit `1584`. Drift is inherited from `gsd/04-08-schema-errors`. Out of this plan's `files_modified`. Regenerating would fail Task 3's "no file outside files_modified" gate. `pnpm db:reset` still seeds the committed file and `pnpm db:test` is green (609 assertions / 32 files).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for Phase 7's checkout transaction — the first real caller of `create_quote_snapshot`. `/api/quote` still must not call it (D-21).
- `asQuote` still resolves to `anon`; the write door is EXECUTE on one function.
- Path (b) `vamos_quote nologin` not taken. `source = 'ops_phone'` is an argument; Phase 4 passes `'web'` only.

## Verification log

```
pnpm db:reset          exit 0  (31 migrations from zero, including 07)
pnpm db:test           exit 0  (Files=32, Tests=609, including quote_identity D-44a live)
pnpm db:seed:check     exit 1  (inherited 04-08 content_strings drift; see Issues)
pnpm db:types:check    exit 0
```

Single-file: `pnpm --filter @vamos/db run test:db supabase/tests/quote_snapshot_rpc.test.sql` exit 0 (22).
`quote_identity.test.sql` TAP: `ok 4 - … (D-44a live)` not skip.
`grep -c create_quote_snapshot packages/db/database.types.ts` >= 1.
`git diff --name-only` after Task 3 showed only `packages/db/database.types.ts`.

## Self-Check: PASSED

- Key files exist on disk.
- `git log --oneline --all --grep=04-15` returns the three task commits plus this metadata commit.
- Task 1–3 `<acceptance_criteria>` greps re-run; all print the required values.
- Plan-level `db:reset` / `db:test` / `db:types:check` green. `db:seed:check` red for inherited reasons documented above — not a 04-15 production defect.

---
*Phase: 04-quote-pricing-engine*
*Completed: 2026-08-28*

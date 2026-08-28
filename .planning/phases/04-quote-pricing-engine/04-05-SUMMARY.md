---
phase: 04-quote-pricing-engine
plan: 05
subsystem: database
tags: [postgres, pgtap, price-snapshots, quote-lock, charge-gate, quote-04, quote-05]

# Dependency graph
requires:
  - phase: 02-data-schema-rls-staff-auth-foundations
    provides: price_snapshots, booking_payments, tg_payment_matches_snapshot, tg_append_only
  - phase: 04-quote-pricing-engine (plan 04-04)
    provides: Phase 4 ordinals 01–02 landed; surcharge predicates
provides:
  - price_snapshots.shown_alternatives (D-22 board)
  - price_snapshots.quote_lock_expires_at second clock (D-25/D-43)
  - tg_snapshot_lines_reconcile (D-07 arithmetic identity)
  - Eight-key price_snapshots_policy_shape
  - tg_payment_matches_snapshot security definer + IF NOT FOUND + lock clause (D-32/D-25)
  - rate_version_is_live = live|retired was-published (D-26)
  - settings_versions.service_area_geojson nullable (D-17)
  - quote_lock_clock + snapshot_lines_reconcile pgTAP
affects: [04-06, 04-09, 04-10, quote engine, checkout charge path]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two clocks on price_snapshots — quote_lock_expires_at vs expires_at; gate reads both"
    - "create or replace must re-revoke PUBLIC EXECUTE; function_privs_are + prosecdef catalog assert"
    - "BEFORE INSERT name order is load-bearing (lines_reconcile before rate_version_flag)"
    - "Reconcile skips non-array lines so CHECK price_snapshots_lines_array still owns that refusal"

key-files:
  created:
    - packages/db/supabase/migrations/20260825000003_snapshot_alternatives.sql
    - packages/db/supabase/migrations/20260825000004_quote_gates.sql
    - packages/db/supabase/tests/quote_lock_clock.test.sql
    - packages/db/supabase/tests/snapshot_lines_reconcile.test.sql
  modified:
    - packages/db/supabase/tests/charge_gate.test.sql
    - packages/db/supabase/tests/reference_tables.test.sql
    - packages/db/supabase/tests/append_only.test.sql
    - packages/db/supabase/tests/bookings_customer_rls.test.sql
    - packages/db/supabase/tests/bookings_manage_token_rls.test.sql
    - packages/db/supabase/tests/manage_booking_mutation.test.sql
    - packages/db/supabase/tests/snapshot_shape.test.sql
    - packages/db/database.types.ts
    - packages/db/README.md

key-decisions:
  - "quote_lock_expires_at backfill is empty-table only; no disable-trigger; carve-out deferred"
  - "service_area_geojson NULL fails closed in Worker — never NOT NULL (D-17)"
  - "PRICING_PREVIEW has no database representation (D-33)"
  - "D-50 proofs temporarily grant INSERT/SELECT so the gate is reachable under role switch"

patterns-established:
  - "Priced snapshot fixtures must carry lines that sum to total_rappen (reconcile)"
  - "Eight-key policy jsonb required on every price_snapshots insert"

requirements-completed: [QUOTE-04, QUOTE-05, QUOTE-10]

# Metrics
duration: ~25min
completed: 2026-08-28
---

# Phase 4 Plan 05: Snapshot Alternatives + Quote Gates Summary

**Database half of QUOTE-04/05: second clock, dispute board, lines-reconcile identity, hardened charge gate — a psql session cannot pay against an expired quote lock.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-28 (worktree gsd/04-05-quote-gates @ 13ee5bd)
- **Completed:** 2026-08-28
- **Tasks:** 3
- **Files modified:** 14 (+ this summary)

## Self-Check

| Check | Result |
|-------|--------|
| `pnpm db:reset` | PASSED — 28 migrations from zero |
| `pnpm db:test` | PASSED — Files=29, Tests=**545**, Result: PASS |
| `pnpm db:seed:check` | PASSED (no drift) |
| `pnpm db:types:check` | PASSED |
| `shown_alternatives` / `quote_lock_expires_at` / `service_area_geojson` in types | present |
| `plan(37)` reference_tables; prosecdef + vamos_guest in quote_lock_clock | present |
| No invented CHF in new migrations/tests | present |

**Self-Check: PASSED**

## Accomplishments

- `shown_alternatives` jsonb board + `quote_lock_expires_at` NOT NULL (three-step empty-table path) + eight-key policy CHECK + `tg_snapshot_lines_reconcile` security definer.
- Charge gate: security definer, `IF NOT FOUND`, refuses past lock while payment window open; PUBLIC EXECUTE re-revoked; flag is live|retired (D-26); `service_area_geojson` nullable object CHECK only.
- pgTAP: past lock + future window → 23001 under postgres, authenticated, and vamos_guest; append-only lock; prosecdef; retired/draft flags; lines refusal cases.
- Fixtures cascade-repaired for NOT NULL lock + eight-key policy + priced lines sum.

## Task Commits

1. **Task 1: snapshot shape migration** — `9e467f1` (feat)
2. **Task 2: quote gates migration** — `ef9d9f5` (feat)
3. **Task 3: pgTAP + types + README + fixture cascade** — `bbe1694` (test)

**Plan metadata:** (this commit) `docs(04-05): complete plan summary`

## Files Created/Modified

- `...003_snapshot_alternatives.sql` — alternatives, lock clock, policy CHECK, lines reconcile
- `...004_quote_gates.sql` — hardened gate, was-published flag, service_area_geojson
- `quote_lock_clock.test.sql` / `snapshot_lines_reconcile.test.sql` — new proofs
- `charge_gate.test.sql` + five other fixture files — lock/policy/lines
- `reference_tables.test.sql` — plan(37) three new columns
- `database.types.ts` / `README.md` — types + ordinals 03/04 landed

## Decisions Made

- Followed plan: no PostGIS, no re-add of quote_lock_minutes/checkout_window_minutes, no PRICING_PREVIEW switch, no disable-trigger on backfill.
- Reconcile returns early when `lines` is not an array so `price_snapshots_lines_array` still owns that CHECK (BEFORE triggers run first).

## Deviations from Plan

### Auto-fixed Issues

**1. [Blocking] Fixtures outside charge_gate broke under NOT NULL lock + eight-key policy + lines reconcile**

- **Found during:** Task 3 full suite
- **Issue:** Any `insert into price_snapshots` without `quote_lock_expires_at`, eight policy keys, or (when priced) lines summing to total failed. Plan `files_modified` listed only charge_gate among repairs.
- **Fix:** Cascade eight-key policy + lock column + priced lines into append_only, bookings_customer_rls, bookings_manage_token_rls, manage_booking_mutation, snapshot_shape (same class of fix as 04-04 fixture cascade).
- **Verification:** `pnpm db:test` — 545 pass
- **Committed in:** `bbe1694`

**2. [Rule 1] lines reconcile vs non-array lines**

- **Found during:** snapshot_shape case (2)
- **Issue:** BEFORE trigger called `jsonb_array_elements` on `{}` → 22023 before CHECK 23514.
- **Fix:** Skip reconcile body when `jsonb_typeof(lines) <> 'array'`.
- **Committed in:** `bbe1694` (migration tweak)

**Total deviations:** 2 auto-fixed  
**Impact on plan:** Required for suite green; no product-scope creep.

## Issues Encountered

None beyond expected fixture fallout and BEFORE-trigger ordering vs CHECK.

## User Setup Required

None.

## Next Phase Readiness

- 04-06 can add `create_quote_snapshot` write door (no INSERT grant added here).
- 04-10 can fail-closed on NULL `service_area_geojson`.
- Branch `gsd/04-05-quote-gates` ready to merge; no hosted push from this plan.

## Self-Check: PASSED

---
*Phase: 04-quote-pricing-engine*  
*Plan: 04-05*

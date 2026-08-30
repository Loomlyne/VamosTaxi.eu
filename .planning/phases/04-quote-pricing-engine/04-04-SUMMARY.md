---
phase: 04-quote-pricing-engine
plan: 04
subsystem: database
tags: [postgres, pgtap, surcharges, predicates, rate-versions, seed, quote-03, quote-11]

# Dependency graph
requires:
  - phase: 02-data-schema-rls-staff-auth-foundations
    provides: surcharges, service_zones, tg_rate_version_transition, seed generator
  - phase: 04-quote-pricing-engine (plan 04-02)
    provides: predicates.ts union / empty-predicate engine behaviour
provides:
  - surcharges.predicate jsonb + quantity_source (D-09)
  - Publish gate refuses draft→live while any ACTIVE surcharge has empty predicate
  - service_zones.zone_type + tags (D-10); no iata inference
  - Seeded oversized_luggage + return_trip (ten surcharges total)
  - night predicate 20:00–06:00 Europe/Zurich from shared NIGHT_WINDOW (D-39)
  - U38 five blank predicates labelled; seed-placeholder unpublishable until owner answers
affects: [04-05, 04-06, 04-14, quote engine, rate publish UI]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fourth completeness clause on tg_rate_version_transition covers every active surcharge including kind=included"
    - "create or replace must re-revoke PUBLIC EXECUTE; proven by function_privs_are"
    - "NIGHT_WINDOW single source for settings_versions and night surcharge predicate"
    - "U38 empty predicates stay '{}'; gate blocks publish rather than guessing rules"

key-files:
  created:
    - packages/db/supabase/migrations/20260825000001_surcharge_predicate.sql
    - packages/db/supabase/migrations/20260825000002_service_zone_types.sql
    - packages/db/supabase/tests/surcharge_predicate.test.sql
  modified:
    - packages/db/seed/generate-seed.mjs
    - packages/db/supabase/seed.sql
    - packages/db/supabase/tests/rate_version_publish.test.sql
    - packages/db/supabase/tests/charge_gate.test.sql
    - packages/db/supabase/tests/pricing_frozen.test.sql
    - packages/db/database.types.ts
    - packages/db/README.md

key-decisions:
  - "Predicate shape not CHECKed in SQL — engine reports unknown kind (plan 04-02); avoids second drifting copy of the TS union"
  - "No GIN on service_zones.tags at eight rows; sequential scan is correct"
  - "return_trip.percent stays null (D-46); percentage lives on settings_versions.round_trip_discount_percent"
  - "U38 five rows keep '{}'; intentional unblock for owner airport/ski rules"

patterns-established:
  - "Publish fixtures that draft→live must set a non-empty predicate before the transition"
  - "Phase 4 migration ordinals reserved in README before any file is written"

requirements-completed: [QUOTE-03, QUOTE-11]

# Metrics
duration: ~15min execution + close-out
completed: 2026-08-28
---

# Phase 4 Plan 04: Surcharge Predicate + Zone Types Summary

**Surcharge applicability is versioned data: predicate + quantity_source columns, zone_type/tags, publish gate on empty predicates, ten seeded codes including oversized_luggage and return_trip.**

## Performance

- **Duration:** ~15 min implementation + close-out verify
- **Started:** 2026-08-28T11:42:43+04:00 (first task commit)
- **Completed:** 2026-08-28
- **Tasks:** 4
- **Files modified:** 10 (plus this summary)

## Self-Check

| Check | Result |
|-------|--------|
| `pnpm db:seed:check` | PASSED (no drift) |
| `pnpm db:test` | PASSED — Files=27, Tests=**525**, Result: PASS |
| Artifacts (migrations 01/02, surcharge_predicate.test.sql) | present |
| Seed: oversized_luggage, return_trip, surcharges=10, local_time_window | present |
| night 20:00–06:00; no 22:00 in seed | present |
| U38 empty-predicate comments on five codes | present (≥6 U38 mentions in generator) |

**Self-Check: PASSED**

## Accomplishments

- Additive migrations: `surcharges.predicate` / `quantity_source` with pairing CHECK; fourth clause on `tg_rate_version_transition` refuses empty active predicates (including `included`); PUBLIC EXECUTE re-revoked after replace.
- `service_zones.zone_type` + `tags` with vocabulary CHECK; no iata backfill (D-10).
- Seed: ten surcharges; night from shared `NIGHT_WINDOW` 20:00–06:00 Europe/Zurich; airports/cities/ski typed and tagged; five U38 blanks labelled.
- pgTAP gate proof + repaired `rate_version_publish` case (c); types regenerated; charge_gate / pricing_frozen fixtures given predicates so the new gate does not break Phase 2 proofs.

## Task Commits

Each task was committed atomically:

1. **Task 1: The two additive migrations** - `ab417b4` (feat)
2. **Task 2: Seed the two new surcharges, the predicates and the zone types** - `24ae36b` (feat)
3. **Task 3: pgTAP — the predicate gate, and repairing the landed publish proof** - `1203eae` (test)
4. **Task 4: [BLOCKING] Apply from zero and run the full suite** - `d6d5fd7` (feat: types + fixture fixes)

**Plan metadata:** (this commit) `docs(04-04): complete plan summary`

## Files Created/Modified

- `packages/db/supabase/migrations/20260825000001_surcharge_predicate.sql` — predicate columns + publish gate fourth clause
- `packages/db/supabase/migrations/20260825000002_service_zone_types.sql` — zone_type + tags
- `packages/db/supabase/tests/surcharge_predicate.test.sql` — columns, CHECKs, privs, gate ±, seed U38 reality
- `packages/db/supabase/tests/rate_version_publish.test.sql` — plan(18); fixture predicates around case (c)
- `packages/db/supabase/tests/charge_gate.test.sql` / `pricing_frozen.test.sql` — predicates so draft→live still proves original behaviour
- `packages/db/seed/generate-seed.mjs` / `packages/db/supabase/seed.sql` — ten codes, typed zones
- `packages/db/database.types.ts` — four new columns
- `packages/db/README.md` — Phase 4 reserved ordinals table

## Decisions Made

- Followed plan: no jsonb shape CHECK; no GIN on tags; U38 stays empty; D-46 null amounts on new rows.
- Task 4 deviation (necessary): Phase 2 fixtures in `charge_gate` and `pricing_frozen` also draft→live with blank default predicates — set `{"kind":"always"}` so those proofs still pass under the fourth gate clause (same class of fix as rate_version_publish case (c)).

## Deviations from Plan

### Auto-fixed Issues

**1. [Blocking] Fixtures outside rate_version_publish broke under the new gate**

- **Found during:** Task 4 (full suite after reset)
- **Issue:** `charge_gate.test.sql` and `pricing_frozen.test.sql` publish drafts whose surcharges inherit `predicate = '{}'`, so the fourth gate clause refused transitions those tests exist to prove.
- **Fix:** Set non-empty predicates on fixture surcharges before draft→live (same pattern as Task 3’s rate_version_publish repair).
- **Files modified:** `packages/db/supabase/tests/charge_gate.test.sql`, `packages/db/supabase/tests/pricing_frozen.test.sql`
- **Verification:** `pnpm db:test` — 525 pass
- **Committed in:** `d6d5fd7` (Task 4)

---

**Total deviations:** 1 auto-fixed (blocking fixture repair)
**Impact on plan:** Required for correctness of the new gate against existing suite; no scope creep.

## Issues Encountered

None beyond the expected fixture fallout from the empty-predicate publish gate.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Engine and quote RPCs (04-05+) can read `predicate` / `zone_type` / `tags` as versioned data.
- `seed-placeholder` remains unpublishable until U38 owner answers (04-14 / OWNER-ANSWERS).
- Branch `gsd/04-04-surcharge-predicate` ready to merge; do not push hosted migrations from this plan alone (phase-close step).

---
*Phase: 04-quote-pricing-engine*
*Plan: 04-04*
*Completed: 2026-08-28*

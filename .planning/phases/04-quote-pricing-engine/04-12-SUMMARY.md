---
phase: 04-quote-pricing-engine
plan: 12
subsystem: api
tags: [postgres, pgtap, aerodatabox, flight, kv, nextjs, cloudflare-workers]

requires:
  - phase: 04-quote-pricing-engine
    provides: plan 04-08 quote error vocabulary and plan 04-15 snapshot RPC ordinal 07
provides:
  - "booking_legs.flight_checked_at / flight_time_source with paired CHECK (D-20)"
  - "booking_events.kind CHECK recreated with 18 values including flight.autofilled"
  - "lookupFlight — one shot, three degradations, never first-record (D-19, D-52, D-47)"
  - "GET /api/flight/:no with GEO_CACHE three TTL tiers, success-only"
affects: [04-13, 04-14, phase-5-widget, phase-7-checkout, phase-9-delay-shift]

tech-stack:
  added: []
  patterns:
    - "No-key AeroDataBox path is the shipping config (ADR-014 §4 / D-47)"
    - "Landing-source ladder as an explicit ordered list, not nested ternaries"
    - "Overnight multi-record → action disambiguate before any array indexing"
    - "GEO_CACHE flight:{NUMBER}:{DATE} — success-only, no customer id in the key"

key-files:
  created:
    - packages/db/supabase/migrations/20260825000008_flight_provenance.sql
    - packages/db/supabase/tests/flight_provenance.test.sql
    - apps/web/lib/flight/aerodatabox.ts
    - apps/web/lib/flight/aerodatabox.test.ts
    - apps/web/lib/flight/fixtures.ts
    - apps/web/app/api/flight/[no]/route.ts
  modified:
    - packages/db/supabase/tests/reference_tables.test.sql
    - packages/db/database.types.ts
    - packages/db/README.md
    - apps/web/lib/pricing/rateBook.ts
    - apps/web/lib/quote/engine.test.ts

key-decisions:
  - "booking_legs is not append-only; no column whitelist to extend for Phase 9 UPDATEs"
  - "FLIGHT_NUMBER_RE rejects L318 while accepting U24321 (letter+digit prefix needs 3–4 following digits)"
  - "Route uses quoteErrorResponse from 04-08; respond.ts / geo reverse are not on this base"

patterns-established:
  - "Pattern: regex gate before key check before fetch so a malformed number never buys a unit"
  - "Pattern: KV TTL 90s same-day / 30min next-day / 6h beyond, never below KV's 60s floor"

requirements-completed: [QUOTE-08]

duration: 22 min
completed: 2026-08-28
---

# Phase 4 Plan 12: Flight provenance + AeroDataBox one-shot lookup Summary

**One-shot AeroDataBox lookup with three honest failures, overnight disambiguation instead of first-record, and additive `flight_checked_at` / `flight_time_source` plus `flight.autofilled` so Phase 9 has something to shift.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-08-28T13:40:13Z
- **Completed:** 2026-08-28T14:02:22Z
- **Tasks:** 3/3 completed (Task 2 TDD = test + feat)
- **Files modified:** 11

## Accomplishments

- Additive provenance columns on `booking_legs` with paired both-null-or-both-set CHECK (non-null source requires `flight_no`); `booking_events.kind` rewritten with all 18 kinds including `flight.autofilled`
- `lookupFlight` refuses malformed before fetch, degrades to `provider_unavailable` with no key (ADR-014 §4 shipping config), never takes the first overnight record
- `GET /api/flight/[no]` is `force-dynamic`, caches only a successful single-record lookup at `flight:{NUMBER}:{YYYY-MM-DD}`, Worker-limit TODO(04-13), no Turnstile

## Task Commits

Each task was committed atomically:

1. **Task 1: The provenance columns, the eighteenth event kind, and apply** - `2596e9c` (feat)
2. **Task 2 RED: AeroDataBox client tests** - `861b96d` (test)
3. **Task 2 GREEN: AeroDataBox one-shot lookup** - `a20bf2b` (feat)
4. **Task 3: GET /api/flight/:no with its three TTL tiers** - `419023c` (feat)

**Plan metadata:** (this commit)

_Note: TDD tasks may have multiple commits (test → feat → refactor)_

## Files Created/Modified

- `packages/db/supabase/migrations/20260825000008_flight_provenance.sql` — provenance columns + kind CHECK
- `packages/db/supabase/tests/flight_provenance.test.sql` — 12-assertion pgTAP proof
- `packages/db/supabase/tests/reference_tables.test.sql` — plan 41 → 43, two `has_column`
- `packages/db/database.types.ts` — regenerated, not hand-edited
- `packages/db/README.md` — ordinal 08 marked landed
- `apps/web/lib/flight/fixtures.ts` — hand-written AeroDataBox shapes, not live captures
- `apps/web/lib/flight/aerodatabox.ts` — `lookupFlight`, `normaliseFlightNumber`, `FLIGHT_NUMBER_RE`
- `apps/web/lib/flight/aerodatabox.test.ts` — 24 tests, 0 skipped
- `apps/web/app/api/flight/[no]/route.ts` — GET handler, GEO_CACHE, `quoteErrorResponse`
- `apps/web/lib/pricing/rateBook.ts` — inherited `night_window_tz` assignability so `next build` typechecks
- `apps/web/lib/quote/engine.test.ts` — inherited `DistanceRateRow[]` so mixed-null fixture typechecks

## Decisions Made

- Asserted `20260823000019_append_only.sql` does not whitelist `booking_legs`; skipped the append-only UPDATE proofs (plan item 9 is conditional)
- Kept reserved ordinal `20260825000008` after `supabase migration new` produced `20260828134247` (sorts after 07)
- Route errors go through 04-08 `quoteErrorResponse` because 04-11 `respond.ts` is not on this worktree base (`depends_on: [04-08, 04-15]`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Inherited Next.js typecheck so `pnpm build` can list the new route**
- **Found during:** Task 3 (`pnpm build` / `pnpm typecheck`)
- **Issue:** `MappedSettingsSnapshot` intersection kept `night_window_tz` as `string` while the mapper assigned `string | null`; `engine.test.ts` inferred literal `null` rappen fields
- **Fix:** mapper falls back to `Europe/Zurich`; mixed-null fixture asserted as `DistanceRateRow[]`
- **Files modified:** `apps/web/lib/pricing/rateBook.ts`, `apps/web/lib/quote/engine.test.ts`
- **Verification:** `pnpm typecheck` exit 0; `pnpm build` exit 0 with `ƒ /api/flight/[no]`
- **Committed in:** `419023c` (Task 3)

**2. [Rule 1 - Bug] Regex must reject `L318` while accepting `U24321`**
- **Found during:** Task 2 GREEN
- **Issue:** drafted `^[A-Z0-9]{2}\\d{1,4}$` treats `L318` as `L3`+`18`
- **Fix:** `^(?:[A-Z]{2}\\d{1,4}|[A-Z][0-9]\\d{3,4})$`
- **Files modified:** `apps/web/lib/flight/aerodatabox.ts`
- **Verification:** 24/24 vitest
- **Committed in:** `a20bf2b` (Task 2)

---

**Total deviations:** 2 auto-fixed (1 blocking inherited typecheck, 1 regex tightness)
**Impact on plan:** No scope creep. Seed.sql not regenerated (not in `files_modified`).

## Issues Encountered

- `pnpm db:seed:check` exits 1 — inherited `content_strings` drift (04-08 i18n vs committed seed). Plan listed seed as not in `files_modified`; did not regenerate.
- `next build` printed `Error: ENVIRONMENT_FALLBACK` during static generation; process still exited 0 and listed `ƒ /api/flight/[no]`.

## User Setup Required

None - no external service configuration required. `FLIGHT_API_KEY` stays optional (ADR-014 §4). No AeroDataBox account invented.

## Next Phase Readiness

- Provenance columns ready for Phase 7 lock write and Phase 9 delay shift
- Widget (Phase 5) can call `GET /api/flight/:no` and must keep pickup time editable on every degradation
- Plan 04-13 owns the Worker rate-limit binding behind `TODO(04-13)`
- Live-key `dateLocalRole` probe remains 04-14 Task 3; disambiguation default already covers either answer

## Self-Check: PASSED

- Key files exist on disk
- `git log --oneline --grep=04-12` has production commits
- Task 1: `pnpm db:reset` 0 (08 last), `pnpm db:test` 0 (33 files / 623 tests), focused pgTAP 0, `flight.autofilled` ≥1, 18 unique kinds, CHF grep 0, `pnpm db:types:check` 0
- Task 2: vitest `lib/flight` 0 (24 passed, 0 skipped), no `setInterval`/`buffer_minutes`/`[0]` in code, `Europe/Zurich` and `disambiguate` present
- Task 3: `pnpm build` 0 with `/api/flight/[no]`, `force-dynamic` 1, `TODO(04-13)` 1, no Turnstile / `err.message` / `statusText` / customer id in the route
- `pnpm typecheck` 0 after inherited mapper/test typing fix

---
*Phase: 04-quote-pricing-engine*
*Completed: 2026-08-28*

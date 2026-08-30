---
phase: 04-quote-pricing-engine
plan: 01
subsystem: testing
tags: [vitest, fast-check, integer-arithmetic, pricing-kernel, half-up]

requires:
  - phase: 03-hyperdrive-data-access-wiring
    provides: vitest@4.1.11 already pinned in packages/db; identity-contract unit suite
provides:
  - Vitest + fast-check in apps/web at exact pins matching packages/db
  - Root pnpm test:unit (web + @vamos/db identity-contract, no Docker/network)
  - PR gate step for unit tests
  - apps/web/lib/pricing/round.ts integer rounding kernel
affects:
  - 04-quote-pricing-engine (every later pricing module imports round.ts)
  - CI gate job

tech-stack:
  added: [vitest@4.1.11, fast-check@4.9.0]
  patterns:
    - integer-ratio half-up kernel with no float helpers under lib/pricing/
    - root test:unit = pnpm -r run test (db test = identity-contract only)

key-files:
  created:
    - apps/web/vitest.config.ts
    - apps/web/lib/pricing/round.ts
    - apps/web/lib/pricing/round.test.ts
  modified:
    - package.json
    - apps/web/package.json
    - packages/db/package.json
    - .github/workflows/pr.yml
    - pnpm-lock.yaml

key-decisions:
  - "fast-check 4.9.0 approved by owner Koss after legitimacy checkpoint (ndubien / dubzzz)"
  - "packages/db test script narrowed to identity-contract so test:unit never hits deployed/DATA-06 or local Docker"
  - "vitest passWithNoTests so empty web suite is green before kernel tests land"

patterns-established:
  - "Pattern: pricing kernel imports nothing, throws RangeError on unsafe integers, unit-free tests (D-46)"
  - "Pattern: one vitest major (4.1.11) across the monorepo; exact pins, no carets"

# Plan frontmatter lists QUOTE-03/QUOTE-05 as the phase goals this kernel serves;
# left empty here — full requirement proof is later plans (pipeline, snapshot).
requirements-completed: []

duration: 13min
completed: 2026-08-28
---

# Phase 04 Plan 01: Wave 0 test tooling + integer rounding kernel Summary

**Vitest 4.1.11 + fast-check 4.9.0 pinned in apps/web; root `test:unit` green in CI; integer half-up kernel (`roundHalfUp` / `percentOf` / `percentToHundredths` / `perKm`) with 40 property+table proofs**

## Performance

- **Duration:** 13 min
- **Started:** 2026-08-28T07:32:49Z
- **Completed:** 2026-08-28T07:45:30Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Human-approved fast-check legitimacy gate recorded; package installed at exact 4.9.0
- Vitest matched packages/db at 4.1.11; `pnpm test:unit` reaches both workspaces without Docker, network, or Hyperdrive probes
- Integer rounding kernel is the single arithmetic door for every later priced line (D-07 / D-53)

## Task Commits

Each task was committed atomically:

1. **Task 1: Package legitimacy gate — fast-check** - (no code commit; human checkpoint)
2. **Task 2: Install Vitest + fast-check, wire vitest.config.ts and the PR gate** - `0560ddf` (feat)
3. **Task 3: The integer rounding kernel** - `8ef0f77` (test RED) + `a177a19` (feat GREEN)

**Plan metadata:** (this commit)

_Note: TDD Task 3 used separate RED then GREEN commits._

## Task 1 — fast-check legitimacy (human-approved)

Owner **Koss** approved install before any `pnpm add`. Observed facts recorded for the SUMMARY:

| Field | Value |
|-------|-------|
| Verdict | **approved** |
| Publisher / maintainer | `ndubien` (Nicolas DUBIEN / GitHub `dubzzz`) |
| Repository | `git+https://github.com/dubzzz/fast-check.git` |
| Latest | `4.9.0` |
| Created | 2017-12-28 |
| `scripts.postinstall` | empty / none |
| Weekly downloads | ~36,611,939 (2026-08-20..26) |
| License | MIT |

`vitest` needed no new audit (already landed in packages/db@4.1.11). `zod` remains deferred to plan 04-08 (05-RESEARCH Approved).

## Files Created/Modified

- `apps/web/vitest.config.ts` — node env, `lib/**` + `tests/unit/**`, `passWithNoTests`, forks pool
- `apps/web/lib/pricing/round.ts` — four exports; no imports; RangeError guards
- `apps/web/lib/pricing/round.test.ts` — table + 3× `fc.assert` (numRuns 500)
- `apps/web/package.json` — vitest@4.1.11, fast-check@4.9.0, `test` / `test:watch`
- `package.json` — `test:unit`: `pnpm -r --if-present run test`
- `packages/db/package.json` — `test` → identity-contract only (see deviation)
- `.github/workflows/pr.yml` — step `Unit tests (kernel + route contracts)` after typecheck
- `pnpm-lock.yaml` — lockfile for the two new pins

## Decisions Made

- Pin fast-check at the npm latest confirmed at install time (`4.9.0`), exact, no caret
- Narrow packages/db default `test` to `test/local/identity-contract.test.ts` so recursive unit never runs deployed probes or Docker-backed local suites (preserves Hyperdrive free quota; matches must_haves)
- `passWithNoTests: true` on web vitest config so Wave 0 empty suite exits 0

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] packages/db `test` pulled infra suites**
- **Found during:** Task 2 verify (`pnpm test:unit`)
- **Issue:** After Phase 3, `vitest run` included `test/local` Docker tests and `test/deployed` (PROBE_BASE_URL from local env) — fails offline and burns Hyperdrive quota. Plan must_haves require no database / no network / no Docker.
- **Fix:** `packages/db` script `test` now runs only `test/local/identity-contract.test.ts` (Phase 3 withIdentity contract). `test:local` / `test:deployed` unchanged for the database CI job.
- **Files modified:** `packages/db/package.json`
- **Verification:** `pnpm test:unit` exits 0; no PROBE/deployed output; 9 identity-contract + 40 round tests green
- **Committed in:** `0560ddf` (Task 2)

**2. [Rule 2 - Missing Critical] empty web vitest suite exited 1**
- **Found during:** Task 2 verify before kernel tests existed
- **Issue:** `vitest run` with zero matching files exits non-zero; plan says empty run is green
- **Fix:** `passWithNoTests: true` in `apps/web/vitest.config.ts`
- **Files modified:** `apps/web/vitest.config.ts`
- **Verification:** empty run exit 0; after Task 3, 40 tests pass
- **Committed in:** `0560ddf` (Task 2)

---

**Total deviations:** 2 auto-fixed (2 missing critical)
**Impact on plan:** Required for must_haves (offline unit gate). No scope creep; deployed/DATA-06 remain in the database CI job only.

## Issues Encountered

- Vite native-loader warning on `apps/web/vitest.config.ts` (ESM in CJS package) — warning only; suite runs. Not fixed (plan names `.ts`; cosmetic).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for plan 04-02 (next Wave 1 / subsequent pricing modules can import `round.ts`)
- No blockers; CHF matrix still open (D-46) — kernel stays unit-free

## Self-Check: PASSED

- [x] key-files.created exist on disk
- [x] git log greps 04-01 ≥ 1 commit
- [x] Task acceptance greps / vitest green
- [x] Plan verification: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test:unit` exit 0
- [x] fast-check legitimacy recorded with publisher / repo / downloads
- [x] No CHF strings under `apps/web/lib/pricing/`

---
*Phase: 04-quote-pricing-engine*
*Completed: 2026-08-28*

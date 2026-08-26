---
phase: 03-hyperdrive-data-access-wiring
plan: 05
subsystem: database
tags: [vitest, undici, hyperdrive, cloudflare-graphql, workers-analytics-engine, postgres, cloudflare-workers]

# Dependency graph
requires:
  - phase: 03-hyperdrive-data-access-wiring
    provides: >-
      plan 03-04's shipped apps/isolation-probe (closed nine-member impl union, gate/dispatch/
      report shape, x-vamos-probe secret, waitUntil-drain nonce protocol) and
      packages/db/test/fixtures/two-customers.ts's seedFixtures()/assertNoLiveRateVersion()
      (D-45 customer/guest/staff triples); plan 03-01/03-02's shipped withIdentity/ENTRY_PROBE/
      EntryProbeRow contract the probe's impl=correct calls through
provides:
  - "packages/db/test/support/drive.ts — drive()/adjacencySet(), pinned-socket concurrency driver + the adjacency-set definition (pid/t0/t1/customer) implemented verbatim, with the honest S-is-coverage-not-assurance bound documented inline"
  - "packages/db/test/support/hyperdrive-metrics.ts — p50Latency (WAE quantileExactWeighted, D-23) and cacheStatusWindow (Cloudflare GraphQL, A5), both throwing a named HyperdriveMetricsConfigError rather than a shape that reads as 'no leak found'"
  - "packages/db/test/support/config-allowlist.json — D-03's checked-in probe/app Hyperdrive id pinning, ids null and provisioned=false until plan 03-07"
  - "packages/db/test/deployed/config-preconditions.test.ts — DATA-05's direct-string half (fact, not measurement): port 5432, login role, caching.disabled, the 25/15/5 pool split, the allowlist gate, and the source-side prepare:true check"
  - "packages/db/test/deployed/negative-controls.test.ts — NC1/NC2/NC3/NC6 as mutants, NC4/NC5 as hazards, NC5+ as a labelled positive control, impl=session as the U27 companion finding"
  - "packages/db/test/deployed/data-06-isolation.test.ts — the adjacency-set assertion: V1-V5 validity gates before A1-A4 leakage assertions, across customer/guest/staff pairings (D-45)"
affects: [03-06, 03-07]

# Tech tracking
tech-stack:
  added:
    - "undici 8.10.0 (exact-pinned devDependency of packages/db) — Node 26's global fetch does not expose setGlobalDispatcher without importing the package itself; confirmed empirically before adding it"
  patterns:
    - "drive()'s issue-order-preserving results array + a claimIndex() counter shared across concurrency workers — strict global A/B alternation regardless of which worker resolves which index first"
    - "adjacencySet() groups by pid, sorts by the DATABASE SERVER's t0 (never the client's), and keeps array-adjacent cross-identity pairs where q.t0 > p.t1 — 'nothing between them' falls out of adjacency in a sorted list for free"
    - "Literal-string acceptance greps (exact counts, not floors) forced a doc-comment discipline: mentioning a grepped term in prose duplicates the match count, so quantileExactWeighted/Date.now()/describe.skipIf/THE ENTIRE DESIGN IS VOID appear in code exactly where the grep expects and nowhere else in prose"
    - "hyperdrive-metrics.ts's two readers read their Cloudflare credential differently by design: p50Latency takes accountId/token as explicit parameters (Analytics Engine SQL API's own bearer differs from the GraphQL API's), cacheStatusWindow reads CF_ACCOUNT_ID/CF_ANALYTICS_TOKEN from process.env directly (its signature has no room for them) — both throw the same named HyperdriveMetricsConfigError"

key-files:
  created:
    - packages/db/test/support/drive.ts
    - packages/db/test/support/hyperdrive-metrics.ts
    - packages/db/test/support/config-allowlist.json
    - packages/db/test/deployed/config-preconditions.test.ts
    - packages/db/test/deployed/negative-controls.test.ts
    - packages/db/test/deployed/data-06-isolation.test.ts
  modified:
    - packages/db/package.json
    - pnpm-lock.yaml

key-decisions:
  - "undici added as an exact-pinned (no caret) devDependency, and drive() issues every probe request through undici's OWN fetch export, never globalThis.fetch — setGlobalDispatcher only constrains requests issued through the same module instance that received it, and Node 26's built-in fetch is a separate undici instance from the npm package"
  - "cacheStatusWindow's GraphQL dataset/dimension names (hyperdriveQueriesAdaptiveGroups, cacheStatus) are a best-effort shape following Cloudflare's standard viewer->accounts->Groups convention, confirmed against the live schema only at the first deployed run (plan 03-07) — this file is designed now, run later, matching every other execution-time-checked item in this plan (D-32...D-43)"
  - "config-preconditions.test.ts reads CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID (the repo's existing Cloudflare API credential naming, per STATE.md's blocker) for the Hyperdrive REST config-read API, distinct from CF_ACCOUNT_ID/CF_ANALYTICS_TOKEN which hyperdrive-metrics.ts uses for the Analytics Engine SQL and GraphQL Analytics APIs — two different Cloudflare API surfaces, two different scoped credentials"
  - "config-allowlist.json's shape adds app_identity_production/app_public_production as separate top-level keys ('and their production twins') alongside app_identity/app_public/probe_identity — probe_identity has no production twin since D-20 forbids the probe Worker from having a production environment at all"
  - "data-06-isolation.test.ts's A1 assertion drops the 'excludes the other identity's references' half for the staff/staff pairing only — dispatcher staff visibility is not customer-scoped by design (a staff RLS policy legitimately shows the full booking set), so asserting exclusivity there would fail correctly-functioning code; the 'includes own references' half still runs for all three pairings"
  - "NC1's D-39 rule ('if residue is 0, record U27 and NC1 still fails') is implemented as an explicit throw gated on residue.length===0 specifically, layered on top of the literal Code-Example-8 {residue,orphaned,leaked}!==({0,0,0}) assertion — the compound-object check alone would let NC1 pass on zero residue plus nonzero orphaned/leaked, which is weaker than D-39's literal wording"
  - "requirements-completed left empty, matching 03-01/03-02/03-04's precedent — this plan proves nothing at runtime (source only, typecheck + inert-when-skipped verified); DATA-05/DATA-06 both still need plan 03-07's deployed, pooled proof against real Hyperdrive/Cloudflare infrastructure"

requirements-completed: []  # DATA-05/DATA-06 need plan 03-07's deployed proof; this plan ships the harness as source only (D-30), verified by typecheck + `vitest run test/deployed` reporting every test skipped

# Metrics
duration: ~35min
completed: 2026-08-25
---

# Phase 3 Plan 5: The deployed-isolation harness — driver, adjacency set, preconditions, negative controls, isolation gate Summary

**A pinned-socket concurrency driver and adjacency-set calculator, a WAE/cacheStatus metrics reader, a checked-in Hyperdrive config allowlist, and three `test/deployed` Vitest files (config preconditions, six negative controls split into mutants/hazards/a positive control, and the DATA-06 validity-gates-then-leakage-assertions isolation gate) — all inert without `PROBE_BASE_URL`, all typechecking clean, execution deferred to plan 03-07.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3/3 completed
- **Files modified:** 8 (6 created, 2 modified — `packages/db/package.json` for the `undici` devDependency, `pnpm-lock.yaml` regenerated by `pnpm install`)

## Accomplishments
- `packages/db/test/support/drive.ts`: `drive()` refuses a `localhost`/`127.0.0.1` `baseUrl`, pins the undici socket count with `setGlobalDispatcher(new Agent({ connections, pipelining: 0 }))`, drives strict global A/B alternation, and MEASURES `peakInFlight` with an increment/decrement counter around every request; `adjacencySet()` implements 03-RESEARCH.md's pid/t0/t1/customer definition verbatim, with the honest "S is coverage, not assurance — a deterministic bug is caught at S=1" bound documented inline
- `packages/db/test/support/hyperdrive-metrics.ts`: `p50Latency` (the WAE `quantileExactWeighted(0.5)`/`(0.95)` percentile query, single literal call site via a shared `quantileExpr()` helper) and `cacheStatusWindow` (Cloudflare GraphQL, A5's `cacheStatus`-never-`hit` + non-zero-query-count gate) — both throw a named `HyperdriveMetricsConfigError` rather than an empty/zero shape that would read as "no leak found"
- `packages/db/test/support/config-allowlist.json`: D-03's checked-in pinning — `app_identity`/`app_public` + their production twins + `probe_identity`, ids `null` and `provisioned: false` until plan 03-07
- `packages/db/test/deployed/config-preconditions.test.ts`: six fail-fast assertions reading every configured Hyperdrive config through the Cloudflare REST API — port 5432 (never Supavisor's 6543), login role (never `postgres`/`authenticator`), `caching.disabled` per config kind, the 25/15/5 `origin_connection_limit` split, the probe-vs-app id allowlist gate, and a source-side read of `packages/db/src/identity.ts` confirming `prepare: true` and the absence of `prepare: false`
- `packages/db/test/deployed/negative-controls.test.ts`: NC1 (`session_in_txn`)/NC2 (`nobegin`)/NC3 (`nowrapper`)/NC6 (`cached`) as mutants that fail the job if green; NC4 (`abandon`)/NC5 (`waituntil_captured`) as hazards that fail INCONCLUSIVE if unobserved or if residue follows a confirmed dirty origin; NC5+ (`waituntil_fenced`) labelled a positive control so the mutant rule never applies to it; `impl=session` recorded as the U27 companion finding, never a pass/fail of NC1
- `packages/db/test/deployed/data-06-isolation.test.ts`: validity gates V1 (real Cloudflare-routed probes)/V2 (genuine concurrency)/V3 (non-degenerate fixture)/V4 (`S >= PROBE_MIN_ADJACENCY` floor + shared backends)/V5 (A5's `cacheStatus` gate) run FIRST and fail with the word INCONCLUSIVE on any violation; only then do A2 (U2 tripwire)/A3 (clean entry incl. `guest_at_entry`)/A4 (clean follower on every adjacency pair)/A1 (`arrayContaining` both halves, ISOL-11) say anything about leakage — run three times over customer/guest/staff pairings (D-45) via `it.each`

## Task Commits

1. **Task 1: The concurrency driver and the metrics reader** - `de9df84` (feat)
2. **Task 2: Config preconditions and the probe/app config-id allowlist** - `faa9852` (feat)
3. **Task 3: Negative controls and the DATA-06 isolation gate** - `a677054` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `packages/db/test/support/drive.ts` - `drive()`/`adjacencySet()`, the pinned-socket concurrency driver and adjacency-set calculator
- `packages/db/test/support/hyperdrive-metrics.ts` - `p50Latency()`/`cacheStatusWindow()`, the WAE percentile and Hyperdrive `cacheStatus` readers
- `packages/db/test/support/config-allowlist.json` - the checked-in D-03 probe/app Hyperdrive config id pinning
- `packages/db/test/deployed/config-preconditions.test.ts` - DATA-05's direct-string half, six fail-fast config assertions
- `packages/db/test/deployed/negative-controls.test.ts` - NC1-NC6 mutant/hazard/positive-control/finding split
- `packages/db/test/deployed/data-06-isolation.test.ts` - the DATA-06 adjacency-set gate: V1-V5 then A1-A4, three D-45 pairings
- `packages/db/package.json` - `undici` added as an exact-pinned devDependency
- `pnpm-lock.yaml` - regenerated for the new devDependency

## Decisions Made
See `key-decisions` in the frontmatter above for the full list with rationale. Summary:
- `undici`'s own `fetch` export is used throughout `drive.ts`, never `globalThis.fetch` — confirmed empirically that Node 26's built-in fetch and the `undici` npm package are separate module instances, so only requests issued through the same instance that received `setGlobalDispatcher` are actually pinned.
- `hyperdrive-metrics.ts`'s GraphQL dataset/dimension names for Hyperdrive's `cacheStatus` are a best-effort shape (no live schema available to verify against locally) — flagged in the file's own header comment as confirmed at the first deployed run, matching this plan's own "designed now, run in P6/03-07" framing for the rest of the harness.
- Two different Cloudflare credential pairs are used across the new files by design: `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` for the Hyperdrive Configs REST API (`config-preconditions.test.ts`), `CF_ACCOUNT_ID`/`CF_ANALYTICS_TOKEN` for the Analytics Engine SQL and GraphQL Analytics APIs (`hyperdrive-metrics.ts`) — matching the plan's own literal env var names for the latter (Task 1's action text) and the repo's pre-existing Cloudflare credential naming (`STATE.md`'s blocker) for the former.
- `data-06-isolation.test.ts`'s A1 assertion skips the "excludes the other identity's rows" half specifically for the staff/staff pairing, since dispatcher staff visibility is legitimately not customer-scoped — asserting exclusivity there would fail correctly-functioning code, not catch a bug.
- D-39's "NC1 still fails on zero residue" rule is implemented as an explicit, separately-gated throw on top of the literal Code Example 8 assertion, because the compound `{residue,orphaned,leaked} !== {0,0,0}` check alone is satisfiable with residue=0 as long as orphaned or leaked is non-zero — weaker than D-39's literal wording, which cares about residue specifically.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] First-draft doc comments duplicated literal grep targets, failing the plan's own exact-count acceptance criteria**
- **Found during:** Task 1 verification (`hyperdrive-metrics.ts`) and Task 2 verification (`config-preconditions.test.ts` was clean on first pass) and Task 3 verification (`negative-controls.test.ts`)
- **Issue:** The plan's acceptance criteria specify EXACT `grep -c` counts (not floors) for several literal strings — `quantileExactWeighted` "prints `1`", `Date.now()` "prints `0`", `describe.skipIf` "prints `1`", `THE ENTIRE DESIGN IS VOID` "prints `1`". The first draft of `hyperdrive-metrics.ts` mentioned `quantileExactWeighted` and `Date.now()` in prose doc comments in addition to the one legitimate code occurrence, and `config-preconditions.test.ts`/`negative-controls.test.ts` similarly mentioned `describe.skipIf`/`THE ENTIRE DESIGN IS VOID` in header-comment prose alongside the real code line — pushing each grep count above the required exact value.
- **Fix:** Rephrased the prose mentions (e.g. "a weighted-quantile call", "a local client-side wall-clock delta", "the file-level skip guard", "the design is void if it ever returns a row count") so each literal string appears exactly once, at its real code site, and nowhere else.
- **Files modified:** `packages/db/test/support/hyperdrive-metrics.ts`, `packages/db/test/deployed/config-preconditions.test.ts`, `packages/db/test/deployed/negative-controls.test.ts`
- **Verification:** Re-ran the exact `grep -c` commands from each task's acceptance criteria; all now print the required exact value.
- **Committed in:** `de9df84`, `faa9852`, `a677054` (each fixed before its own task's commit — no separate follow-up commit needed)

---

**Total deviations:** 1 auto-fixed (Rule 1 — a correctness issue against the plan's own literal acceptance criteria, not a runtime bug). No scope creep; no change to any file's actual behavior or exported contract.

## Issues Encountered
- The local Vitest suite (`test/local`) and `pnpm db:mutation-gate` both failed on the FIRST run of this session with `password authentication failed for user "vamos_edge"` — this was pre-existing local environment drift (the local role passwords set by a prior session's `pnpm db:local-roles` do not survive a `supabase db reset`, and this session's local stack had been reset since the last time roles were set), not caused by any file this plan touches (confirmed via `git status` — no `test/local/**` files are in this plan's diff). Re-ran `pnpm db:test` (must precede `db:local-roles` per this plan's own binding notes) then `pnpm db:local-roles`, after which `test/local` (15/15) and `pnpm db:mutation-gate` (2 mutants killed, baseline restored) both passed clean. `pnpm db:mutation-gate`'s own final `supabase db reset` step wipes the local role passwords again, so `pnpm db:local-roles` was re-run once more before the final `test/local` confirmation.
- `pnpm db:mutation-gate` appeared to hang/fail under an external 90-second `timeout` wrapper used for a quick sanity check — this was the wrapper's timeout being too tight for the full mutant-apply-then-`supabase db reset`-restore cycle, not a real failure; re-run without the tight external timeout completed in well under 90s of actual work and passed.

## User Setup Required

None - no external service configuration required. `PROBE_BASE_URL`, `PROBE_SECRET`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CF_ACCOUNT_ID`, `CF_ANALYTICS_TOKEN`, and the three real Hyperdrive config ids in `config-allowlist.json` all stay unset/`null` — every one of them is plan 03-07's job once the owner's Cloudflare account and Supabase staging credentials exist (D-29).

## Next Phase Readiness
- Plan 03-06 (CI wiring / ESLint fences) can reference this plan's new files in its greps and its `pr.yml`/`deploy-staging.yml` job definitions — `test/deployed` is a well-defined, always-skippable target for a CI job that only runs the three files when `PROBE_BASE_URL` is present.
- Plan 03-07 (deployment) needs to: fill `config-allowlist.json`'s three real Hyperdrive config ids and flip `provisioned` to `true`; set `PROBE_BASE_URL`/`PROBE_SECRET`/`CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`/`CF_ACCOUNT_ID`/`CF_ANALYTICS_TOKEN` in CI; run `pnpm --filter @vamos/db exec vitest run test/deployed` against the real staging probe for the first time — at which point `cacheStatusWindow`'s best-effort GraphQL dataset/dimension shape gets its first real-schema confirmation (recorded as a decision above, not a deviation, since verifying it locally was never possible).
- DATA-05's p50 stays `DEFERRED (no staging Worker)` — `p50Latency` exists and is exercised by nothing in this plan's own test files yet (the isolation gate's V5 check uses `cacheStatusWindow` only, not `p50Latency`); wiring `p50Latency` into an actual DATA-05 assertion is also plan 03-07's job once a staging Worker has written WAE points.
- No blockers. `packages/db/supabase/migrations/` untouched (D-31 honored) — confirmed via `git status` before every commit in this plan.

---
*Phase: 03-hyperdrive-data-access-wiring*
*Completed: 2026-08-25*

## Self-Check: PASSED

All 9 files listed under "Files Created/Modified" (plus this SUMMARY.md itself) verified
present on disk. All 3 task commit hashes (`de9df84`, `faa9852`, `a677054`) verified present in
`git log --oneline --all`.

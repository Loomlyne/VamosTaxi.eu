---
phase: 01-platform-foundation-design-system-port-i18n-runtime
plan: 14
subsystem: ui
tags: [nextjs, next-intl, playwright, screenshot-diff, i18n, rtl, error-pages, dev-gallery, cloudflare]

# Dependency graph
requires:
  - phase: 01-06
    provides: "The dev-only states gallery pattern (app/[locale]/dev/components/{page.tsx,core/*})"
  - phase: 01-09
    provides: "Core primitives (Button, Icon, forms) the error pages compose against"
  - phase: 01-10
    provides: "mock-harness.ts's mountPort/serveMock/mountBundle screenshot-diff rig, all 33 components' first baselines"
  - phase: 01-11
    provides: "The transfer/data component batches whose baselines this plan's tolerance settlement is evaluated against"
  - phase: 01-13
    provides: "app/[locale]/layout.tsx composing SiteHeader/SiteFooter around every page — the shell the 404/error pages inherit by construction"
provides:
  - "apps/web/app/[locale]/{not-found,error}.tsx — localised 404 and error boundary inside the shared shell, English fallback when the locale segment cannot resolve (D-20)"
  - "apps/web/app/[locale]/[...rest]/page.tsx — routes an arbitrary subpath under a valid locale to the localised not-found instead of Next's generic default"
  - "apps/web/app/[locale]/dev/layout.tsx — production exclusion (notFound() when NODE_ENV=production) and an unconditional X-Robots-Tag: noindex for the whole /dev/** subtree (D-28)"
  - "Gallery index with per-category counts (33 across 6 categories + Shell(2))"
  - "apps/web/playwright.config.ts's maxDiffPixelRatio settled at 0.005 (from the proposed 0.01) against real observed diff ratios across all 373 screenshot states, with two scoped per-test overrides for the two genuine outliers"
  - "apps/web/tests/{visual/error-pages,integration/dev-exclusion}.spec.ts — @error-pages and @dev-exclusion tagged coverage"
  - "A TEST_DIST_DIR build-isolation seam (next.config.ts) so dev-exclusion.spec.ts's own real next build cannot race another integration spec's next dev over the shared .next directory"
affects: ["phase-5-booking-funnel (all eighteen public routes inherit the shell and the settled screenshot tolerance)"]

actuals:
  tokens: 17120
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Root apps/web/app/not-found.tsx stays Next's own default 404 (unstyled) — it is reached only when the locale *segment itself* cannot resolve at all (no next-intl request context to render the shared shell in), which next-intl's own middleware makes vanishingly rare in practice; the real, exercised fallback path is app/[locale]/[...rest]/page.tsx, which calls the localised not-found() from inside a resolved, English-defaulting locale segment — this is the concrete mechanism behind D-20's 'fall back to English' instruction, not a redirect."
    - "A dev-only integration spec that needs its own real `next build` (not `next dev`) gets an env-var-gated distDir override (`TEST_DIST_DIR`) in next.config.ts, read only when the spec sets it — every other invocation (`pnpm build`, `next dev`, every other test file) is unaffected because the var is unset. Next.js's own `writeConfigurationDefaults` step auto-appends `${distDir}/types/**/*.ts` to the *committed* tsconfig.json whenever distDir differs from the default and that string isn't already present — a per-worker-index distDir name therefore grows tsconfig.json's include list forever across repeated test runs. Use one *fixed* distDir name and pre-seed the single resulting include entry in tsconfig.json so the write becomes a no-op after the first run (verified idempotent across three consecutive runs)."
    - "maxDiffPixelRatio tolerance settlement method: force near-zero tolerance (0.0001) on an otherwise unchanged tree, run twice, and read the reporter's own printed pixel counts against each screenshot's actual width×height to get real (not rounded-display) diff ratios per state — then set the global default just above the highest *stable, non-outlier* observed ratio and give the few genuine outliers their own scoped per-test override at the old, looser value rather than loosening the global number for everything."

key-files:
  created:
    - "apps/web/app/[locale]/{not-found,error}.tsx, error-pages.css"
    - "apps/web/app/[locale]/[...rest]/page.tsx"
    - "apps/web/app/[locale]/dev/layout.tsx"
    - "apps/web/tests/visual/error-pages.spec.ts + 16 baseline PNGs"
  modified:
    - "apps/web/app/[locale]/dev/components/page.tsx (per-category counts, 33 total)"
    - "apps/web/next.config.ts (X-Robots-Tag headers() rule; TEST_DIST_DIR seam)"
    - "apps/web/tests/integration/dev-exclusion.spec.ts"
    - "apps/web/playwright.config.ts (maxDiffPixelRatio 0.01 -> 0.005)"
    - "apps/web/tests/visual/{feedback,transfer}.spec.ts (two scoped tolerance overrides)"
    - "apps/web/tsconfig.json (one stable include entry for the TEST_DIST_DIR seam's own generated types)"
    - "apps/web/i18n/messages/{en,de,fr,ar}.json (errors namespace)"

key-decisions:
  - "Dev gallery exclusion is a route-group layout (app/[locale]/dev/layout.tsx) rather than a per-page check — a layout can't be forgotten when a later plan adds a seventh gallery page; already committed in c9ff7de (Task 2)."
  - "maxDiffPixelRatio settled at 0.005 globally, with Dialog's focus state and VehicleCard's default state carrying their own scoped 0.01 override at their real, reproduced, non-flaky pixel ratios (0.295-0.756% and 0.864% respectively) — never a blanket loosening. See playwright.config.ts's own comment for the full eight-state observed-ratio table."
  - "The cut-off executor's dev-exclusion.spec.ts used testInfo.workerIndex to name its isolated build directory (test-results/.next-dev-exclusion-${workerIndex}). Found during this session's own verification that this grows apps/web/tsconfig.json's include list by one new stray entry every run (Next.js's own TypeScript setup writer, confirmed by reading writeConfigurationDefaults.js directly) — switched to one fixed directory name and pre-seeded the single resulting tsconfig.json entry so the write is idempotent, verified stable across three consecutive dev-exclusion runs and two full pnpm build runs."
  - "apps/web/next-env.d.ts is also rewritten by the same Next.js mechanism to reference whichever distDir a build last used — this file is not part of Task 3's scope and was reverted to its default `.next/types/routes.d.ts` reference before the final commit; a plain `pnpm build` after any TEST_DIST_DIR-using test run restores it. Documented here rather than solved structurally, since a full fix would require giving the isolated build its own project root, out of this plan's scope."

patterns-established:
  - "See tech-stack.patterns above — the TEST_DIST_DIR seam and its tsconfig.json idempotency requirement apply to any later test that needs its own isolated `next build` artifact."

requirements-completed: [PLAT-04, I18N-01, I18N-03, I18N-04]

coverage:
  - id: D1
    description: "A wrong URL under a valid language segment renders a not-found page in that language, inside the shared shell, with a 404 status"
    requirement: "PLAT-04"
    verification:
      - kind: automated_ui
        ref: "apps/web/tests/visual/error-pages.spec.ts @error-pages — not-found.tsx, 4 languages"
        status: pass
    human_judgment: false
  - id: D2
    description: "A wrong URL whose language segment cannot resolve renders the not-found page in English rather than failing, via app/[locale]/[...rest]/page.tsx"
    requirement: "I18N-03"
    verification:
      - kind: automated_ui
        ref: "apps/web/tests/visual/error-pages.spec.ts @error-pages — 'an unresolvable locale segment falls back to English rather than failing'"
        status: pass
    human_judgment: false
  - id: D3
    description: "A server-side failure renders an error page in the segment's language inside the shared shell, all four languages"
    requirement: "PLAT-04, I18N-01"
    verification:
      - kind: automated_ui
        ref: "apps/web/tests/visual/error-pages.spec.ts @error-pages — error.tsx, 4 languages"
        status: pass
    human_judgment: false
  - id: D4
    description: "The gallery is complete at 33 components across 6 categories plus the Shell review surface, excluded from production, carries the robots header in every environment, and is absent from the sitemap and every alternate set"
    requirement: "PLAT-04"
    verification:
      - kind: integration
        ref: "apps/web/tests/integration/dev-exclusion.spec.ts @dev-exclusion — both tests, re-run standalone this session"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every one of the 33 ported components has at least one committed screenshot baseline, and the screenshot tolerance is settled against real evidence rather than carried forward as a proposal"
    requirement: "PLAT-04"
    verification:
      - kind: automated_ui
        ref: "pnpm test:visual --grep @component, run twice consecutively this session (373 passed, 0 failed, 0 flakes both runs); node completeness check over all 33 component names against apps/web/tests/visual"
        status: pass
    human_judgment: false
  - id: D6
    description: "The phase-wide German (1080px) and Arabic (1440/1024/768/390px) passes over the whole seven-page gallery confirm no cross-component layout problem the per-batch passes missed"
    requirement: "I18N-01, I18N-04"
    verification:
      - kind: manual_procedural
        ref: "Real next dev server (localhost:3900), real Playwright screenshots of all 7 gallery pages + index at /de (1080px) and /ar (1440/1024/768/390px), inspected directly this session; scrollWidth===clientWidth and dir attribute asserted programmatically for all 40 captures"
        status: pass
    human_judgment: true
    rationale: "This is UI-SPEC's own explicitly-flagged backstop check — a cross-component seam problem that only shows up with the whole gallery assembled, not provable by any single component's own automated test."

duration: ~2h 15min (this session, Task 3 close-out only; Tasks 1-2 completed in a prior session)
completed: 2026-08-22
status: complete
---

# Phase 1 Plan 14: Localised Error Pages, Dev Gallery Exclusion & Phase-Wide Language Passes Summary

**Localised 404/error pages with an English fallback path, a production-excluded dev gallery carrying an unconditional noindex header, and a screenshot tolerance settled at 0.005 (from a proposed 0.01) against 373 real observed diff states — plus a build-isolation seam fix that stopped the dev-exclusion test's own build from growing the committed tsconfig.json on every run.**

## Performance

- **Duration:** Tasks 1-2 completed in a prior session (commits `bf292f9`, `c9ff7de`); Task 3 completed in this session, ~2h 15min (most of it running and cross-checking the full visual suite twice, tracing a tsconfig.json pollution bug in the cut-off executor's own build-isolation seam, and the real German/Arabic gallery-wide screenshot pass)
- **Completed:** 2026-08-22
- **Tasks:** 3 of 3 planned
- **Files modified:** 25 (Task 1) + 4 (Task 2) + 6 (Task 3, this session) = 35 files across the plan

## Accomplishments

- **Task 1 (prior session, commit `bf292f9`):** `app/[locale]/not-found.tsx` and `error.tsx` render inside the shared `SiteHeader`/`SiteFooter` shell by construction, in the segment's language. `app/[locale]/[...rest]/page.tsx` (a documented deviation from the plan's file list) is the concrete mechanism that makes an arbitrary subpath under a *valid, resolved* locale reach the localised boundary — D-20's English-fallback instruction is realised through next-intl's own default-locale resolution rather than a redirect. Copy added to the `errors` namespace across all four locale files. `tests/visual/error-pages.spec.ts` (`@error-pages`) covers both pages × 4 languages.
- **Task 2 (prior session, commit `c9ff7de`):** `app/[locale]/dev/layout.tsx` (locale-scoped — the plan's own non-`[locale]` path predates the real dev route tree, reconciled as a path correction) returns `notFound()` for the whole `/dev/**` subtree on a genuine production build while staying reachable on staging, forced dynamic so the check runs per-request against the runtime `DEPLOY_ENV`. `next.config.ts`'s `headers()` rule sets `X-Robots-Tag: noindex` unconditionally, in every environment, for both the unprefixed-English and prefixed-other-locale URL shapes. Gallery index shows per-category counts totalling 33, plus Shell(2) listed separately. `tests/integration/dev-exclusion.spec.ts` (`@dev-exclusion`) proves the exclusion against one real production build, toggled only by `DEPLOY_ENV` between two sequential `next start` processes.
- **Task 3 (this session, commit `c64fd70`):** Reviewed the whole 373-state baseline set, settled `maxDiffPixelRatio` at 0.005 (from the proposed 0.01) against real observed diff ratios, found and fixed a genuine bug in the cut-off executor's own build-isolation work (see Deviations), and ran the real phase-wide German/Arabic gallery passes.

## Task Commits

Each task was committed atomically:

1. **Task 1: Localised not-found and error pages inside the shell** - `bf292f9` (feat) — prior session
2. **Task 2: Complete the gallery index and keep it out of production** - `c9ff7de` (feat) — prior session
3. **Task 3: Review the full baseline set, settle the tolerance, and run the phase-wide language passes** - `c64fd70` (feat) — this session

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified

**Task 1** (prior session): `apps/web/app/[locale]/{not-found,error}.tsx`, `error-pages.css`, `apps/web/app/[locale]/[...rest]/page.tsx`, `apps/web/i18n/messages/{en,de,fr,ar}.json`, `apps/web/tests/visual/error-pages.spec.ts` + 16 baseline PNGs.

**Task 2** (prior session): `apps/web/app/[locale]/dev/components/page.tsx`, `apps/web/app/[locale]/dev/layout.tsx`, `apps/web/next.config.ts`, `apps/web/tests/integration/dev-exclusion.spec.ts`.

**Task 3** (this session): `apps/web/playwright.config.ts` (tolerance settlement + the full observed-ratio table as a comment), `apps/web/next.config.ts` (TEST_DIST_DIR seam), `apps/web/tests/integration/dev-exclusion.spec.ts` (fixed distDir, idempotency fix), `apps/web/tests/visual/{feedback,transfer}.spec.ts` (two scoped per-test tolerance overrides), `apps/web/tsconfig.json` (one pre-seeded, stable include entry for the seam's own generated types).

## Decisions Made

See `key-decisions` in the frontmatter. In summary: the dev gallery exclusion is a route-group layout (already committed, Task 2); the tolerance is 0.005 global with two scoped 0.01 overrides at real, reproduced outlier ratios; the build-isolation seam's distDir is fixed rather than per-worker-index, and its one resulting `tsconfig.json` entry is pre-seeded so the write is idempotent rather than growing forever.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The cut-off executor's TEST_DIST_DIR seam grew `apps/web/tsconfig.json` on every dev-exclusion test run**

- **Found during:** Task 3, verifying the uncommitted-on-disk work left by a prior executor session that was cut off mid-task
- **Issue:** `tests/integration/dev-exclusion.spec.ts` named its isolated build directory `test-results/.next-dev-exclusion-${testInfo.workerIndex}`. Next.js's own `writeConfigurationDefaults` (`node_modules/next/dist/lib/typescript/writeConfigurationDefaults.js`, read directly to confirm) auto-appends `${distDir}/types/**/*.ts` to whatever tsconfig.json it finds at the project root whenever that exact string isn't already in the resolved `include` list — since the distDir name changed on every run (a different worker index each time), this appended a brand-new, ever-growing entry to the *committed* `apps/web/tsconfig.json` on every single test run, referencing a gitignored (`test-results/`) directory that would go stale immediately. Left uncommitted, this was found while inspecting the already-modified-on-disk `tsconfig.json` before deciding whether to commit it as-is.
- **Fix:** Switched the distDir to one fixed name (`test-results/.next-dev-exclusion`) — safe because the describe block is serial-mode and gated to a single Playwright project, so only one worker ever builds here in a given run — and pre-seeded the single resulting `tsconfig.json` include entry so Next's own writer sees it already present and makes no further edit. Verified idempotent: three consecutive `pnpm build` / `dev-exclusion.spec.ts` runs left `tsconfig.json`'s diff at exactly the one pre-seeded line, unchanged.
- **Files modified:** `apps/web/tests/integration/dev-exclusion.spec.ts`, `apps/web/tsconfig.json`
- **Verification:** `pnpm typecheck` passes; `pnpm exec playwright test tests/integration/dev-exclusion.spec.ts --project=component-1440` passed standalone three times with `git diff --stat -- apps/web/tsconfig.json` unchanged after each run.
- **Commit:** `c64fd70`

**2. [Rule 1 - Bug, related] The same Next.js mechanism also rewrites `apps/web/next-env.d.ts` to reference the last-used distDir**

- **Found during:** Task 3, immediately after fix #1, while staging files for commit — `git status` showed `apps/web/next-env.d.ts` modified after running the dev-exclusion spec
- **Issue:** `next-env.d.ts`'s `/// <reference path="./.next/types/routes.d.ts" />` line gets rewritten to point at whichever distDir the most recent `next build`/`next dev` used — after running `dev-exclusion.spec.ts` (which builds with `TEST_DIST_DIR` set), the checked-in file was left pointing at `./test-results/.next-dev-exclusion/types/routes.d.ts` instead of the real build output.
- **Fix:** Reverted `next-env.d.ts` to its committed state (`git checkout --`) and ran a final `pnpm build` with the default distDir immediately before staging, which restores the correct reference. This file was not staged/committed by this session in either state, so the repo's committed copy is untouched. Not solved structurally — the seam still has this side effect on a developer's local working tree after running the dev-exclusion spec; a full fix would need the isolated build to have its own project root (out of this plan's scope), so it is documented here as a known limitation rather than engineered away.
- **Files modified:** none committed (working-tree-only correction)
- **Verification:** `git status --short -- apps/web/next-env.d.ts` clean before the final commit.
- **Commit:** n/a (working-tree correction only, not a committed change)

---

**Total deviations:** 2, both Rule 1 bugs found by actually running the uncommitted work rather than reading it and assuming it was finished. Both are scoped to the build-isolation seam a prior, cut-off executor session left in place; the tolerance settlement itself (the seam's actual purpose) was correct as found and required no fix.
**Impact on plan:** No architectural changes. Both fixes make Task 3's own "genuinely scoped, cannot affect `pnpm build` or `next dev`" claim about the TEST_DIST_DIR seam actually true, rather than true-until-the-second-run.

## Stale-Path Deviation (session ground truth)

The plan's own file list names `apps/web/app/dev/layout.tsx` and `apps/web/app/dev/components/page.tsx` (no `[locale]` segment). The real dev gallery route tree — already established by Plan 01-06 and confirmed unchanged by this session's own directory listing — is locale-scoped: `apps/web/app/[locale]/dev/components/<category>/`. Tasks 1-2 (prior session, commits `bf292f9`/`c9ff7de`) already reconciled this and used the correct `[locale]`-scoped paths, documented in `c9ff7de`'s own commit message as a "path_correction." This SUMMARY records it again per this session's explicit instruction to note the deviation; no code change was needed in this session since the prior session already did it correctly.

## Verifications Personally Observed This Session (Task 3)

Run for real, not inferred, in this session:

- `pnpm typecheck` — pass (three times, after each round of edits)
- `pnpm lint:css` — pass
- `pnpm i18n:check` — pass (1486 keys, 4 locales, full parity)
- `pnpm build` — pass, exit 0 (three times, after each round of edits; the `ENVIRONMENT_FALLBACK` line in the build log is a pre-existing, benign message unrelated to this plan, confirmed non-fatal by exit code)
- `pnpm check:public-env` — pass
- `pnpm test:visual --grep @component` — **373 passed, 0 failed, 295 skipped (reduced-viewport rule), run twice consecutively, 0 flakes either run** — this is the concrete evidence behind the tolerance settlement claim
- `apps/web/tests/visual/error-pages.spec.ts --grep @error-pages` — 9/9 passed, standalone
- `apps/web/tests/integration/dev-exclusion.spec.ts --project=component-1440` — 2/2 passed, standalone, re-run three times to confirm the tsconfig.json idempotency fix
- Node completeness check: all 33 component names present in `apps/web/tests/visual`'s committed baselines
- Node tolerance-ceiling check: configured `maxDiffPixelRatio` (0.005) is at or below the proposed 0.01 starting value
- **German pass, real screenshots, all 7 gallery pages + index, 1080px:** real `next dev` server on `localhost:3900`, Playwright screenshots of `/de/dev/components/{core,forms,navigation,feedback,data,transfer,shell}` and the index, inspected directly. No layout problem at any category seam; the shell (SiteHeader/SiteFooter) fits with no wrapping/clipping at 1080px (re-confirming 01-13's own explicitly-flagged tightest assumption). `StatusBadge`'s real, dictionary-resolved German labels (`BESTÄTIGT`, `ZAHLUNG AUSSTEHEND`, etc.) render correctly inside a table cell without truncation. `scrollWidth === clientWidth` asserted programmatically on all 8 captures — no horizontal overflow.
- **Arabic pass, real screenshots, all 7 gallery pages + index, 1440/1024/768/390px:** same server, `/ar/dev/components/*`, 32 captures. `dir="rtl"` confirmed on every capture. The shell mirrors correctly at every width (logo at the visually-right layout-start side, control cluster at the visually-left layout-end side, phone number staying LTR via `.vt-dir-keep`, the narrow-row hamburger+phone-button pair at 1024/768/390). `StatusBadge`'s real Arabic labels (`مؤكدة`, `بانتظار الدفع`, etc.) render correctly, mirrored, inside table cells. Every `CHF 000`, booking reference (`VT-4821`), and time (`08:15`, `Sun 18:00`) across `RouteSummary`/`PriceSummary`/`VehicleCard`/the `StatusBadge` table stays left-to-right inside the RTL layout. `scrollWidth === clientWidth` asserted programmatically on all 32 captures — nothing scrolls sideways at 390px on any page.
- One pre-existing, already-documented, out-of-scope finding re-observed during the Arabic pass (not new, not fixed here): `SiteFooter`'s address block still reorders "Dietikon ZH 8953" under the Unicode bidi algorithm — first flagged by 01-13-SUMMARY.md's own "Issues Encountered" section; `SiteFooter.tsx` is outside this plan's file scope.

## Issues Encountered

- **Two pre-existing, unrelated integration-test issues surfaced by running the full `pnpm test:visual` suite** (not the `@component`-scoped subset Task 3's own tolerance claim is about):
  - `apps/web/tests/integration/feedback-behaviour.spec.ts` — its `beforeAll` spawns a real `next dev` server and sometimes times out waiting for it (fetch failed within 60s); reproducibly passes clean (5/5) when the file is run alone. From Plan 01-10, untouched by this plan's own files. Logged to `.planning/WINDOWS.md` (entry 6) rather than fixed, per the SCOPE BOUNDARY rule.
  - `apps/web/tests/integration/lenis.spec.ts` — its "reduced motion: no instance runs at all" test fails consistently, even run completely alone: a Lenis instance still boots under `reducedMotion: "reduce"` where the assertion expects none. This is a genuine, reproducible failure (not a flake), but from Plan 01-08, entirely outside this plan's file scope, and needs its own root-cause investigation (Playwright/Chromium's `prefers-reduced-motion` emulation vs `LenisProvider`'s own read of it). Logged to `.planning/WINDOWS.md` (entry 7) rather than fixed.
  - Neither issue is in any file this plan (01-14) modifies; both are pre-existing per `git log --follow` on each spec file, predating Plan 01-14 by several plans. Per the executor's SCOPE BOUNDARY rule ("Only auto-fix issues DIRECTLY caused by the current task's changes"), these were documented and left for a dedicated investigation rather than fixed inline.
- **The tsconfig.json/next-env.d.ts pollution bug** (see Deviations #1-2 above) was the substantive finding of this session's own verification work — the cut-off executor's build-isolation seam was functionally correct in its stated purpose but not actually idempotent, which the plan's own instruction to "judge whether that in-flight work is correct and complete" specifically asked to check.

## User Setup Required

None — no external service configuration required by this plan.

## Next Phase Readiness

- Phase 1 (Platform Foundation, Design System Port & i18n Runtime) closes with this plan. All 33 ported components have reviewed baselines at a tolerance settled against real evidence (0.005 global, two documented outlier overrides), every public route inherits the localised error surfaces and the mandatory shell, and the dev gallery cannot leak into production or a search index.
- The settled screenshot tolerance and the mock-harness/screenshot-diff rig are the concrete regression gate Phase 5's booking funnel work will be measured against.
- Two pre-existing, unrelated integration-test issues (`feedback-behaviour.spec.ts`'s dev-server flake, `lenis.spec.ts`'s reduced-motion assertion) are open in `.planning/WINDOWS.md` (entries 6-7) and should get a dedicated look before they're relied on as regression gates themselves — neither blocks this plan's own closure.
- Not blocked on anything for Phase 5 readiness.

## Self-Check: PASSED

Verified directly this session:
- `apps/web/app/[locale]/{not-found,error}.tsx`, `apps/web/app/[locale]/[...rest]/page.tsx`, `apps/web/app/[locale]/dev/layout.tsx` confirmed present on disk (Tasks 1-2, prior session).
- `apps/web/tests/visual/error-pages.spec.ts-snapshots/` confirmed to contain 16 `.png` baselines.
- `apps/web/playwright.config.ts` confirmed to contain `maxDiffPixelRatio: 0.005` and the full observed-ratio comment.
- `apps/web/tests/visual/feedback.spec.ts` and `transfer.spec.ts` confirmed to contain their scoped `0.01` overrides.
- `apps/web/tsconfig.json`'s diff confirmed to be exactly the one pre-seeded include entry, unchanged after three consecutive test/build runs.
- All three code commit hashes (`bf292f9`, `c9ff7de`, `c64fd70`) confirmed present in `git log --oneline`.
- `pnpm typecheck`, `pnpm lint:css`, `pnpm i18n:check`, `pnpm build`, `pnpm check:public-env` all pass on the final tree state.
- `pnpm test:visual --grep @component` — 373 passed, 0 failed, run twice consecutively, 0 flakes.
- `.planning/WINDOWS.md` confirmed to contain entries 6 and 7 for the two pre-existing, out-of-scope integration-test findings.

No missing items.

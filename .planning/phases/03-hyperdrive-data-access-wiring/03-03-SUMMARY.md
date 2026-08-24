---
phase: 03-hyperdrive-data-access-wiring
plan: 03
subsystem: database
tags: [hyperdrive, cloudflare-workers, wrangler, opennext, postgres.js, workers-analytics-engine, typescript]

# Dependency graph
requires:
  - phase: 03-hyperdrive-data-access-wiring
    provides: >-
      plan 03-01's shipped withIdentity/publicSql/claimsForSql at @vamos/db's frozen
      five-identity-kind contract (including the reserved "quote" seam, D-44a) and
      plan 03-02's opts.onProbe addition to withIdentity, both left otherwise untouched
provides:
  - "Two Hyperdrive bindings (HYPERDRIVE cacheable, HYPERDRIVE_NOCACHE cache-disabled) declared per named environment in apps/web/wrangler.jsonc, with Zurich (aws:eu-central-2) Placement Hints and the DB_LATENCY -> vamos_db_latency WAE dataset"
  - "The five named call-site wrappers (asAnon/asCustomer/asStaff/asGuest/asQuote) in apps/web/lib/db/identity.ts -- the only door apps/web may knock on for identity-scoped data, all on HYPERDRIVE_NOCACHE, all writing a WAE latency point on both branches"
  - "publicSql(env) in apps/web/lib/db/public.ts on the cacheable HYPERDRIVE binding"
  - "@vamos/db as an OpenNext-importable workspace dependency of apps/web (transpilePackages + package.json), proven by a real next build and opennextjs-cloudflare build"
  - "The D-36 dev/staging-gated smoke route (apps/web/app/api/dev/db-smoke/route.ts) proving getCloudflareContext() -> asAnon -> Hyperdrive compiles and type-checks through a real OpenNext build"
  - "03-RESEARCH.md and ADR-007 region/mechanism corrections: aws:eu-central-2 (Zurich) throughout, Placement-Hints-over-Smart-Placement + fetch-only-limitation supersession note"
affects: [03-04, 03-05, 03-06, 03-07, phase-4-quote-pricing-engine, phase-5-account-bookings]

# Tech tracking
tech-stack:
  added: ["postgres@3.4.9 (apps/web devDependency, type-only)"]
  patterns:
    - "WAE-instrumented module-private door (withIdentity) behind five typed exported wrappers -- D-08's 'only door' fence, enforced at the apps/web layer the same way packages/db/src/identity.ts enforces it at the core layer"
    - "Shared QueryFn<T> conditional-return-type alias, applying the anti-transaction-return constraint at each wrapper's own parameter position -- the 'natural inference position' 03-01-SUMMARY.md's key-decision names, needed again here because a plain pass-through Promise<T> does not typecheck against the core's conditionally-constrained callback for an unresolved generic T"
    - "Fail-closed dev/staging gate mirroring apps/web/app/[locale]/dev/layout.tsx's isTrueProduction convention (NODE_ENV production AND DEPLOY_ENV not staging -> 404), read from getCloudflareContext().env rather than process.env since the route already needs that context for Hyperdrive"
    - "Commented-out JSONC hyperdrive block (TODO(03-07)) as the staging placeholder shape, mirroring the file's existing convention for bindings that cannot carry a placeholder id past wrangler's UUID validation"

key-files:
  created:
    - apps/web/lib/db/identity.ts
    - apps/web/lib/db/public.ts
    - apps/web/app/api/dev/db-smoke/route.ts
  modified:
    - apps/web/wrangler.jsonc
    - apps/web/lib/env.d.ts
    - apps/web/tsconfig.json
    - apps/web/next.config.ts
    - apps/web/package.json
    - apps/web/worker.ts
    - packages/db/src/identity.ts
    - pnpm-lock.yaml
    - .gitignore
    - .planning/phases/03-hyperdrive-data-access-wiring/03-RESEARCH.md
    - .planning/ADR-007-edge-data-residency.md

key-decisions:
  - "Excluded wrangler's generated worker-configuration.d.ts from apps/web/tsconfig.json and .gitignore -- its NodeJS.ProcessEnv augmentation collides with lib/env.d.ts's intentionally optional DEPLOY_ENV and broke an existing Playwright spec's delete operator, confirming the phase's own FC-07 forward-compat finding"
  - "Introduced a shared QueryFn<T> type alias in apps/web/lib/db/identity.ts applying @vamos/db/identity's anti-transaction-return conditional at the wrapper parameter position, and added postgres as an apps/web type-only devDependency, both required for pnpm typecheck to pass against the core's frozen signature"
  - "Changed packages/db/src/identity.ts's ./claims.js import to extensionless ./claims -- valid under tsc bundler resolution (why typecheck stayed green through 03-01/03-02) but unresolvable by Next.js's webpack bundler even with transpilePackages, first exposed when this plan's smoke route became the first real import path exercising it through next build"
  - "Task 3's repo-wide grep 'aws:eu-central-1 prints 0 for every file' in .planning/phases/03-hyperdrive-data-access-wiring/, apps/, packages/ is not fully satisfiable within the task's own <files> scope -- apps/ and packages/ are fully clean, but seven planning documents outside this plan's file list (03-CONTEXT.md, this plan file, sibling not-yet-executed 03-04/03-07-PLAN.md, the two research/*.md Wave-A source lanes, verify/forward-compat.md) legitimately still quote the stale value as historical/future-task context; D-26's own line-numbered correction list scopes the fix to 03-RESEARCH.md only, and none of the seven were edited"
  - "Grep-defeating prose in apps/web/wrangler.jsonc's own new comments (repeating the literal aws:eu-central-2/aws:eu-central-1/:6543 substrings in explanatory text) reworded before commit to hit the plan's own node -e assertion's exact counts, matching the same class of self-inflicted acceptance-criteria bug 03-01/03-02-SUMMARY.md both document"

requirements-completed: []  # DATA-05's p50 and DATA-06's pooled/deployed proof both need plan 03-07's staging Worker; this plan lands the binding shape, wrappers and instrumentation only

# Metrics
duration: ~12min (commit-to-commit, first task commit to last task commit; excludes upfront context-loading)
completed: 2026-08-25
---

# Phase 3 Plan 3: OpenNext data-access surface -- Hyperdrive bindings, five wrappers, WAE, Zurich placement Summary

**`apps/web` now imports `@vamos/db` through five WAE-instrumented named wrappers on a required, typed `HYPERDRIVE_NOCACHE` binding, with both Hyperdrive configs and Zurich Placement Hints declared per named environment in `wrangler.jsonc`, proven by a real `next build` and `opennextjs-cloudflare build` compiling a genuine `getCloudflareContext() -> asAnon -> Hyperdrive` route.**

## Performance

- **Duration:** ~12 min across three task commits (00:23:49 -> 00:36:09 local time)
- **Tasks:** 3/3 completed
- **Files modified:** 15 (3 created, 12 modified)

## Accomplishments
- `apps/web/wrangler.jsonc` declares `HYPERDRIVE` (cacheable) and `HYPERDRIVE_NOCACHE` (cache-disabled) under `env.production` with descriptive placeholder ids and local `vamos_public`/`vamos_edge` connection strings on port 54322; `env.staging` carries the identical two-entry shape commented out with a `TODO(03-07)` marker, since `wrangler deploy` validates the id as a real UUID and the Cloudflare API token is still owner-held (D-29). Both environments carry `"placement": { "region": "aws:eu-central-2" }` (Zurich, D-25) and the `DB_LATENCY` -> `vamos_db_latency` WAE dataset. The pre-roles `postgres:postgres@localhost:5432` superuser string is gone entirely.
- `apps/web/lib/env.d.ts`'s `CloudflareEnv` now types `HYPERDRIVE`, `HYPERDRIVE_NOCACHE` and `DB_LATENCY` as required members (the optional `HYPERDRIVE?` FC-07 flagged is gone).
- `apps/web/lib/db/identity.ts` exports exactly five named wrappers (`asAnon`/`asCustomer`/`asStaff`/`asGuest`/`asQuote`), all composing `@vamos/db/identity`'s core `withIdentity` on `env.HYPERDRIVE_NOCACHE.connectionString`, all writing one WAE data point on the success branch and one on the error branch (`blobs: [kind, "ok" | sqlstate]`, `doubles: [ms]`, `indexes: [kind]`). `asQuote` dispatches the reserved fifth identity kind `quote` (D-44a) -- not `anon` -- with a doc comment recording D-12/D-44/D-44a's full reasoning for a Phase 4 executor: no pricing table is granted to `vamos_public` today, `QUOTE_PG_ROLE` resolves through the anonymous role until Phase 4's first migration lands a write path, and Phase 4's own proposal to load the rate book through the cached `HYPERDRIVE` binding is refused here.
- `apps/web/lib/db/public.ts` exports `publicSql(env)` on `env.HYPERDRIVE.connectionString` only.
- `@vamos/db` is now a real workspace dependency of `apps/web` (`"@vamos/db": "workspace:*"`) and `transpilePackages: ["@vamos/db"]` is set in `next.config.ts` -- proven not just by `pnpm typecheck` but by an actual `next build` and `opennextjs-cloudflare build` successfully compiling a route that imports the wrapper file.
- `apps/web/worker.ts`'s `scheduled` and `queue` handlers take a real `env: CloudflareEnv` argument (D-06/D-24) with comments naming the `ctx.waitUntil(asCustomer(env, claims, fn))` fenced pattern for any future post-response identity work.
- `apps/web/app/api/dev/db-smoke/route.ts` -- the one route this phase adds -- proves the whole chain through a real OpenNext build: `force-dynamic`, a fail-closed 404 gate matching the dev gallery's own `isTrueProduction` convention, a `select 1` proof needing no grant, and a `?probe=fail` branch demonstrating the fail-closed answer against `public.bookings` with only the SQLSTATE crossing the response boundary.
- `03-RESEARCH.md` carries a dated supersession banner and every `aws:eu-central-1`/Frankfurt occurrence corrected to `aws:eu-central-2`/Zurich (config values, the architecture diagram, anti-patterns, pitfalls); every latency figure is now explicitly marked Frankfurt-derived and DEFERRED pending re-measurement (D-27). `ADR-007` gained a dated supersession note (Placement Hints over Smart Placement, D-22; fetch-only limitation, D-24) without re-doing Phase 2 D-37's already-landed Frankfurt->Zurich amendment; `PROJECT.md` is untouched.

## Task Commits

1. **Task 1: wrangler.jsonc bindings, Placement Hints at Zurich, DB_LATENCY -- and the typed env to match** - `4bad335` (feat)
2. **Task 2: The five named wrappers, the WAE write path, and the OpenNext import wiring** - `ea26451` (feat)
3. **Task 3: The D-36 smoke route, and the region corrections the research still owes** - `0cf9303` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `apps/web/wrangler.jsonc` - two Hyperdrive bindings per named environment, Zurich placement, DB_LATENCY dataset, superuser string struck
- `apps/web/lib/env.d.ts` - HYPERDRIVE/HYPERDRIVE_NOCACHE/DB_LATENCY typed as required `CloudflareEnv` members
- `apps/web/tsconfig.json` - excludes wrangler's generated `worker-configuration.d.ts` (Rule 1/3 fix)
- `.gitignore` - ignores `worker-configuration.d.ts` (generated, never committed)
- `apps/web/lib/db/identity.ts` - the five named wrappers, module-private WAE-instrumented `withIdentity`, shared `QueryFn<T>` type
- `apps/web/lib/db/public.ts` - `publicSql(env)` on the cacheable binding
- `apps/web/package.json` - `@vamos/db` workspace dependency, `postgres` type-only devDependency
- `apps/web/next.config.ts` - `transpilePackages: ["@vamos/db"]`
- `apps/web/worker.ts` - `scheduled`/`queue` take real `env: CloudflareEnv`, D-06/D-24 comments
- `pnpm-lock.yaml` - updated for the two new dependencies
- `apps/web/app/api/dev/db-smoke/route.ts` - the D-36 smoke probe
- `packages/db/src/identity.ts` - `./claims.js` -> `./claims` import fix (Rule 3, blocking)
- `.planning/phases/03-hyperdrive-data-access-wiring/03-RESEARCH.md` - region/prose corrections + supersession banner
- `.planning/ADR-007-edge-data-residency.md` - Placement Hints / fetch-only supersession note

## Decisions Made
- **`worker-configuration.d.ts` excluded from typecheck and gitignored.** Running the plan's own required `wrangler types --env staging` verification step leaves a generated file on disk whose `NodeJS.ProcessEnv` augmentation collides with `lib/env.d.ts`'s intentionally optional `DEPLOY_ENV` (undefined under `env.production` is the whole point) and breaks `tests/integration/dev-exclusion.spec.ts`'s `delete prodEnv.DEPLOY_ENV`. This is exactly the collision `03-RESEARCH.md`'s own FC-07 forward-compat finding predicted. Excluded the artifact from `tsconfig.json` and added it to `.gitignore` rather than redesigning the typing architecture FC-07 assigns elsewhere.
- **`QueryFn<T>` shared type alias, plus `postgres` as an `apps/web` type-only devDependency.** `@vamos/db/identity`'s frozen `withIdentity` signature constrains its callback's return type with a conditional (`T extends TransactionSql | Sql ? never : T`) verified empirically in 03-01. A plain `(tx) => Promise<T>` wrapper signature does not typecheck against that core signature for an unresolved generic `T` flowing through a pass-through layer -- the conditional must be re-declared at each layer's own parameter position (the "natural inference position" 03-01-SUMMARY.md's key-decision names) for TypeScript to infer `T` correctly from a real callback literal at the eventual call site. `postgres` needed adding as `apps/web`'s own devDependency because pnpm's strict per-package linking does not expose `packages/db`'s dependency to `apps/web` for type resolution.
- **`./claims.js` -> `./claims` in `packages/db/src/identity.ts`.** Valid under `tsc`'s `moduleResolution: "bundler"` either way (why `pnpm typecheck` stayed green through plans 03-01 and 03-02, which never routed this import through webpack), but unresolvable by Next.js's webpack bundler even with `transpilePackages` set. This plan's smoke route is the first thing that actually imports `@vamos/db/identity` from a real Next.js route, which is what first exercised the import path and surfaced the failure in both `next build` and `opennextjs-cloudflare build`.
- **The repo-wide `aws:eu-central-1` grep is not satisfiable at the literal scope stated, and was not force-satisfied by editing out-of-scope files.** See Deviations below.
- **`asQuote`'s doc comment carries the full D-44a Phase-3<->4 seam text** (no pricing grant exists yet; Phase 4's first migration must add either a `security definer` snapshot function or a dedicated role; only `QUOTE_PG_ROLE` moves if the second path is chosen) rather than a one-line pointer, matching the plan's explicit instruction that a Phase 4 executor needs this fact and cannot infer it from the schema alone.
- **Requirements not marked complete.** DATA-05's p50 and DATA-06's pooled/deployed isolation proof both require a staging Worker (plan 03-07); this plan lands the binding shape, the wrapper surface and the WAE instrumentation only. `REQUIREMENTS.md` stays `Pending` for both, matching 03-01's and 03-02's precedent.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1/3 - Bug/Blocking] `wrangler types`'s generated artifact collides with the hand-authored `CloudflareEnv` and breaks typecheck**
- **Found during:** Task 1, running the plan's own `pnpm --filter web exec wrangler types --env staging` acceptance step
- **Issue:** The generated `apps/web/worker-configuration.d.ts` declares `NodeJS.ProcessEnv` augmentation making `DEPLOY_ENV` a required literal (`"staging"`) rather than optional, since `tsconfig.json`'s `include: ["**/*.ts", ...]` glob picks up the `.d.ts` file. This collided with `lib/env.d.ts`'s intentionally optional `DEPLOY_ENV` and broke `tests/integration/dev-exclusion.spec.ts`'s `delete prodEnv.DEPLOY_ENV` (`TS2790: The operand of a 'delete' operator must be optional`) -- confirmed as exactly the collision `03-RESEARCH.md`'s own FC-07 forward-compat finding predicted ("a generated `worker-configuration.d.ts` and this hand file will collide").
- **Fix:** Added `worker-configuration.d.ts` to `apps/web/tsconfig.json`'s `exclude` array and to the root `.gitignore`. The committed, hand-authored `lib/env.d.ts` stays the single source of truth regardless of whether a developer has locally run `wrangler types`.
- **Files modified:** `apps/web/tsconfig.json`, `.gitignore`
- **Verification:** `pnpm typecheck` green both before and after running `wrangler types --env staging` in either order; the generated file was deleted from disk before the final commit (never tracked).
- **Committed in:** `4bad335` (Task 1 commit)

**2. [Rule 3 - Blocking] The apps/web wrapper layer's `fn` parameter type does not compose with `@vamos/db/identity`'s conditionally-constrained core signature, and `postgres` types are unresolvable without an explicit devDependency**
- **Found during:** Task 2, first `pnpm typecheck` run after writing `apps/web/lib/db/identity.ts`
- **Issue:** (a) `import type postgres from "postgres"` failed with `TS2307: Cannot find module 'postgres'` -- pnpm's strict per-package linking does not expose `packages/db`'s dependency to `apps/web`. (b) A plain `fn: (tx: postgres.TransactionSql) => Promise<T>` wrapper parameter does not typecheck against `withIdentityCore`'s frozen `fn: (tx) => Promise<T extends TransactionSql | Sql ? never : T>` for an unresolved generic `T` (`TS2345`).
- **Fix:** (a) Added `postgres` (pinned to the same `3.4.9` as `packages/db`) as an `apps/web` devDependency -- type-only usage, matching the plan's own "only `import type postgres` is permitted" constraint. (b) Introduced a shared `type QueryFn<T> = (tx: postgres.TransactionSql) => Promise<T extends postgres.TransactionSql | postgres.Sql ? never : T>` and used it as every wrapper's and the module-private door's `fn` parameter type, applying the same conditional at the "natural inference position" 03-01-SUMMARY.md's key-decision names.
- **Files modified:** `apps/web/package.json`, `pnpm-lock.yaml`, `apps/web/lib/db/identity.ts`
- **Verification:** `pnpm typecheck` exits 0; all five wrapper-surface greps still pass their exact counts.
- **Committed in:** `ea26451` (Task 2 commit)

**3. [Rule 3 - Blocking] `packages/db/src/identity.ts`'s `./claims.js` import fails Next.js's webpack bundler despite passing `tsc`**
- **Found during:** Task 3, first `opennextjs-cloudflare build` run (and, on retest, plain `next build` too) after the smoke route started importing `@/lib/db/identity`
- **Issue:** `import { claimsForSql, type VamosClaims } from "./claims.js";` resolves fine under `tsc`'s `moduleResolution: "bundler"` (why `pnpm typecheck` stayed green through plans 03-01 and 03-02), but Next.js's webpack bundler -- even with `transpilePackages: ["@vamos/db"]` -- fails with `Module not found: Can't resolve './claims.js'`. Nothing in `apps/web` had actually imported `@vamos/db/identity` through a real webpack compile before this plan's smoke route did, so the bug was latent since plan 03-01 and only surfaced here.
- **Fix:** Changed the import to the extensionless `./claims`. No behavior change -- `claims.ts` is the same sibling file either way.
- **Files modified:** `packages/db/src/identity.ts`
- **Verification:** `pnpm --filter web exec next build` and `pnpm --filter web exec opennextjs-cloudflare build` both exit 0; `pnpm typecheck` stayed green; `packages/db`'s own 9/9 `identity-contract.test.ts` suite re-run and still passes.
- **Committed in:** `0cf9303` (Task 3 commit)

**4. [Rule 1 - Bug] Grep-defeating prose in `apps/web/wrangler.jsonc`'s own new comments**
- **Found during:** Task 1, first run of the plan's own `node -e` assertion (exact occurrence counts of `aws:eu-central-2`, `aws:eu-central-1`, `:6543`)
- **Issue:** Explanatory comment text describing the placement/region correction and the Supavisor-port prohibition repeated the exact literal substrings the plan's own assertion counts (`aws:eu-central-2` appeared 4 times instead of the required 2; `aws:eu-central-1` and `:6543` each appeared once in prose despite the assertion requiring zero) -- the same class of self-inflicted bug 03-01-SUMMARY.md's and 03-02-SUMMARY.md's own deviation entries document.
- **Fix:** Reworded the comments to describe the same facts without repeating the literal substrings (e.g. "the region below is Zurich... superseding `03-RESEARCH.md`'s stale Frankfurt-region hint" instead of spelling out `aws:eu-central-1`; "Supavisor's pooled port" instead of `:6543`).
- **Files modified:** `apps/web/wrangler.jsonc`
- **Verification:** The plan's exact `node -e` assertion prints `wrangler shape OK` and exits 0; every individual `grep -c`/`grep -cE` acceptance bullet re-run and matches its stated count.
- **Committed in:** `4bad335` (Task 1 commit)

---

**Total deviations:** 4 auto-fixed (2 Rule 1 -- a prior plan's tooling-collision bug this plan's own verification step first surfaced, and grep-defeating prose in this plan's own new comments; 2 Rule 3 -- blocking type-resolution and bundler-resolution issues, one in `apps/web`'s own new files, one a one-line fix in a plan-03-01-owned file that only this plan's real import path exposed).
**Impact on plan:** All four fixes are either additive (tsconfig exclude, gitignore entry, a new devDependency, a shared type alias) or a single import-specifier correction with no behavior change. None altered `withIdentity`'s, `publicSql`'s, or any wrapper's frozen shape or runtime behavior. No scope creep.

### Not fixed -- documented instead

**5. [Rule 1, stale acceptance criteria] The plan's repo-wide `aws:eu-central-1` grep does not print 0 for every file**
- **Found during:** Task 3, running the plan's own final `<verification>` block command
- **Issue:** `grep -rc 'aws:eu-central-1' .planning/phases/03-hyperdrive-data-access-wiring/ apps/ packages/` still matches seven files: `03-CONTEXT.md` (the upstream decision record's own D-25 prose, quoting the stale value exactly as the sanctioned supersession-note pattern requires -- not in this plan's `<files>` list), this plan file (`03-03-PLAN.md`) itself, sibling not-yet-executed `03-04-PLAN.md`/`03-07-PLAN.md` (whose own action text correctly instructs THEM to fix their own future `apps/isolation-probe/wrangler.jsonc` and to note `03-RESEARCH.md` "already carries `aws:eu-central-2` after plan 03-03" when they execute), the two deeper `research/hyperdrive-wiring.md` / `research/isolation-proof.md` Wave-A source-lane documents `03-RESEARCH.md` itself was synthesized from, and `verify/forward-compat.md`'s harden-pass finding (FC-10, an already-written historical analysis).
- **Why not fixed:** D-26's own line-numbered correction list scopes the region fix to `03-RESEARCH.md` only; the task's `<action>` text explicitly names `03-RESEARCH.md` and `ADR-007` as the two files to correct. None of the seven files are in Task 3's `<files>` frontmatter list. Editing `03-CONTEXT.md` would rewrite an upstream decision record's own historical text; editing `03-04-PLAN.md`/`03-07-PLAN.md` would strip instructions those plans still need when they execute their own not-yet-created artifacts; editing the deeper `research/*.md` lanes and `verify/forward-compat.md` would exceed both D-26's explicit scope and this plan's own file list.
- **What is actually clean:** `apps/` and `packages/` -- the load-bearing application config and code -- have **zero** occurrences of `aws:eu-central-1` (verified directly). `03-RESEARCH.md` itself has zero occurrences after this plan's corrections. The success criterion's substantive claim ("no live config value carries the stale region") holds; the literal repo-wide grep as written does not, because it was written without accounting for the historical/future-task documents that legitimately still quote the value it is hunting for.
- **Verification:** `grep -rc 'aws:eu-central-1' apps/ packages/` prints 0 for every file in both directories; `grep -c 'aws:eu-central-1' .planning/phases/03-hyperdrive-data-access-wiring/03-RESEARCH.md` prints 0.

## Issues Encountered
- None beyond the four auto-fixed deviations above and the one documented-not-fixed stale acceptance criterion.

## User Setup Required
None - no external service configuration required. Real Hyperdrive config ids, staging's uncommented `hyperdrive` block, and the `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` this needs all remain plan 03-07's owner-gated work, per the plan's own `<deferred>` section and this plan's environment facts.

## Next Phase Readiness
- `apps/web`'s data-access surface is complete and typed: two named Hyperdrive bindings, five named identity wrappers with WAE instrumentation on both branches, one cacheable public-content door, and Zurich Placement Hints on both named environments. Plans 03-04 (isolation-probe Worker), 03-05, 03-06 (ESLint/CI fences enforcing the "wrappers only" import surface) and 03-07 (real Hyperdrive config ids + staging deploy + DATA-05/06 measurement) can all build on this surface with no further P3 changes expected.
- **DATA-05 p50 = DEFERRED (no staging Worker)** -- the literal line this plan's `<deferred>` section requires. The instrumentation (WAE write path, Placement Hints) is fully landed; the number itself is plan 03-07's, once a staging Worker exists.
- **DATA-06's pooled/deployed half** stays deferred to plan 03-07 for the same reason -- this plan is deliberately database-free at verification time (D-30), asserting only config greps, `tsc`, and two real build passes (`next build`, `opennextjs-cloudflare build`).
- No blockers for the next wave. `packages/db/supabase/migrations/` untouched (D-31 honored -- the one `packages/db` file this plan touched, `identity.ts`, is a one-line import-specifier fix, not a migration or a behavior change).

---
*Phase: 03-hyperdrive-data-access-wiring*
*Completed: 2026-08-25*

## Self-Check: PASSED

All 15 files listed under "Files Created/Modified" (plus this SUMMARY.md) verified present
on disk. All 3 task commit hashes (`4bad335`, `ea26451`, `0cf9303`) verified present in
`git log --oneline --all`.

---
phase: 03-hyperdrive-data-access-wiring
plan: 06
subsystem: database
tags: [eslint, typescript-eslint, ci, hyperdrive, postgres, opennext, cloudflare-workers, wrangler]

# Dependency graph
requires:
  - phase: 03-hyperdrive-data-access-wiring (plans 03-01..03-05)
    provides: withIdentity/publicSql core, apps/web wrapper layer, the staging isolation probe, and the local Vitest/pgTAP/mutation-gate suite this plan gates in CI
provides:
  - eslint.config.mjs — the repo's first-ever ESLint config, exactly two rules (no-restricted-imports for D-10, no-restricted-syntax for D-08/ISOL-07)
  - scripts/check-db-access-fences.mjs + scripts/db-access-fence-allowlist.json — the CI-grep half covering the five bans ESLint cannot express
  - pr.yml's database job extended with the full local Phase 3 suite (local-roles, vitest test/local, mutation-gate, check:db-fences); pnpm lint joins the gate job
  - a real D-36 runtime smoke through opennextjs-cloudflare preview --env staging (not only next dev)
  - a recorded D-38/U26 flush-count measurement (5 statements for one customer withIdentity call)
affects: [03-07 (deployment — real Hyperdrive config ids, staging p50, deployed DATA-06 half), Phase 4 (quote pricing — any new query path is now fenced by these rules), Phase 5 (public surfaces — every new identity-wrapper route is checked by the force-dynamic fence)]

# Tech tracking
tech-stack:
  added: ["eslint@10.9.1 (exact)", "typescript-eslint@8.68.0 (exact)"]
  patterns:
    - "Deliberately minimal flat ESLint config (no presets) so a first-ever install doesn't bury two security rules under ~100 previously-unlinted files"
    - "@typescript-eslint/no-restricted-imports (not core) for allowTypeImports, distinguishing a type-only reference from a value import that could construct a raw client"
    - "CI-grep script (walk + JSON allowlist + one-line-per-violation + exit code) as the second, independent proof layer beside ESLint, matching check-next-public-allowlist.mjs's own shape"
    - "Named-allowlist-not-looser-regex discipline extended from mutation-gate.mjs's mutants to this plan's own fence exceptions"

key-files:
  created:
    - eslint.config.mjs
    - scripts/check-db-access-fences.mjs
    - scripts/db-access-fence-allowlist.json
  modified:
    - package.json (lint, check:db-fences scripts; eslint/typescript-eslint exact-pinned devDependencies)
    - .github/workflows/pr.yml (database job extended; pnpm lint added to gate job)
    - apps/web/wrangler.jsonc (env.staging hyperdrive block enabled for local preview — Rule 2)
    - apps/web/app/[locale]/error.tsx, apps/web/components/transfer/VehicleCard.tsx (dead eslint-disable comments for uninstalled plugins removed)
    - packages/db/test/local/identity-contract.test.ts (targeted eslint-disable-next-line on claim 9's deliberate return-tx proof)
    - packages/db/test/deployed/negative-controls.test.ts (assertion message reworded off the literal "SET ROLE" substring)

key-decisions:
  - "eslint@10.9.1 / typescript-eslint@8.68.0 pinned exact after T-03-SC's pre-resolved owner approval; both versions re-verified via npm view at install time, matching approval with no drift; pnpm's own minimumReleaseAge supply-chain gate independently flagged both as recently-published, corroborating the owner's reasoning"
  - "Joined the new local-suite steps to the EXISTING database job (added by Phase 2 plan 02-09, after this plan's own research/patterns docs were written against a stale single-gate-job pr.yml) rather than duplicating db:reset/db:test/db:stop into gate — the only way the plan's own db:reset-count-1 acceptance criterion can hold"
  - "Corrected step order: db:reset -> db:test (password-free pgTAP baseline) -> db:local-roles -> vitest test/local -> mutation-gate -> check:db-fences — the plan's own literal Task 3 order and <verify> block both put local-roles before db:test, which 03-05-SUMMARY.md's own deviation #4 already proved breaks extensions.test.sql's vamos_edge-has-no-password assertion"
  - "ALLOW_LOCAL_ROLE_PASSWORDS set on both the Local role passwords step AND the Mutation gate step (not the plan's literal count-1) — confirmed empirically that mutation-gate.mjs's own setLocalRolePasswords() re-invokes local-roles as a subprocess inheriting the runner's ambient CI=true, so both steps independently need the guard"
  - "apps/web/wrangler.jsonc's env.staging hyperdrive block enabled (Rule 2, outside Task 3's own <files> list) — D-36 cannot be smoke-tested at all without it, since db-smoke's own DEPLOY_ENV==='staging' gate 404s any other environment and staging's block was previously fully commented out; confirmed empirically that wrangler dev's local mode never validates the placeholder id as a UUID (deploy-only check), so this needed no owner-held credential"

patterns-established:
  - "A fence that cannot be demonstrated failing on a deliberate violation is not a fence — every one of the two ESLint rules and all eight CI-grep checks was made to fail on a real violation this session, then reverted/deleted, before being declared done"
  - "Grep-defeating prose (a comment or assertion string containing the literal banned substring) is a recurring failure mode in this phase (03-01/02/03/05 all hit it); this plan both caused a new instance (its own header comment) and found one in a prior plan's file (negative-controls.test.ts) via its own new tooling — both fixed by rewording, never by loosening the check"

requirements-completed: []  # DATA-05/DATA-06 stay Pending — this plan proves the compile-time/local-Postgres half only; the pooled/deployed half and the staging p50 are plan 03-07's, matching 03-01/03-02's own established decision.

# Metrics
duration: ~55min
completed: 2026-08-25
---

# Phase 3 Plan 6: Compile-Time DATA-06 Fence + Full Local Gate Summary

**A first-ever, deliberately two-rule ESLint config plus an eight-check CI grep script now fail the build on every one of D-05/D-06/D-08/D-10's banned patterns, joined to `pr.yml`'s existing database job alongside a real `opennextjs-cloudflare preview` smoke and a recorded `sql.begin` flush count.**

## Performance

- **Duration:** ~55 min
- **Tasks:** 3 (Task 1 — pre-resolved legitimacy checkpoint; Task 2 — ESLint + CI fence script; Task 3 — PR gate + D-36/D-38 measurements)
- **Files modified:** 12 (3 created, 9 modified)

## Accomplishments

- `eslint.config.mjs` — the repo's first-ever ESLint config. Exactly two rules: `@typescript-eslint/no-restricted-imports` (D-10's `postgres` ban, D-08's `@vamos/db` ban) and `no-restricted-syntax` (D-08/ISOL-07's `return tx` ban). No presets, no type-aware linting — `pnpm lint` exits 0 against ~100 previously-unlinted files.
- `scripts/check-db-access-fences.mjs` + `scripts/db-access-fence-allowlist.json` — eight independent checks (raw `postgres` import, module-scope client, `sql.reserve()`, `sql.end()`, `sql.unsafe(`, session-scoped `set_config(...,false)`/bare `SET ROLE`/`SET SESSION`, force-dynamic-or-Route-Handler, and the D-20 forward greps), each with a named JSON allowlist, each demonstrated failing on a real deliberate violation this session and reverted.
- `pr.yml`'s existing `database` job now runs the whole local Phase 3 suite (local role passwords, the DATA-06 local Vitest half, the mutation gate, the data-access fences) after its existing pgTAP/seed/types-drift steps; `pnpm lint` joins the `gate` job next to `lint:css`.
- D-36's runtime half closed: `opennextjs-cloudflare build && preview --env staging` really does resolve `getCloudflareContext()` → `asAnon` → `HYPERDRIVE_NOCACHE` through the wrangler platform proxy against local Postgres, both the happy path and the fail-closed `42501` path.
- D-38/U26's flush count is a recorded number (5 statements for one `customer` `withIdentity` call), not an assumption — `withIdentity` itself is unchanged.

## Task Commits

1. **Task 1: Package legitimacy checkpoint (T-03-SC)** — pre-resolved by the orchestrator before this session; owner approved `eslint@10.9.1` / `typescript-eslint@8.68.0`, both exact-pinned, on 2026-08-25. No file changes of its own; the install and its audit trail are folded into Task 2's commit.
2. **Task 2: Compile-time fence — ESLint's two rules and the CI grep script** — `ea4eaaa` (feat)
3. **Task 3: PR gate, OpenNext runtime smoke, flush measurement** — `1bed669` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `eslint.config.mjs` — flat config, two rules only, with per-zone overrides for the two `packages/db` core modules, the staging probe, `packages/db/test/**`, and the two `apps/web/lib/db` wrapper files
- `scripts/check-db-access-fences.mjs` — walk + allowlist + eight checks + one-line-per-violation + exit code (348 lines)
- `scripts/db-access-fence-allowlist.json` — six named-exception arrays, each with a `_comment` explaining why every entry is there
- `package.json` — `lint`, `check:db-fences` scripts; `eslint`/`typescript-eslint` exact-pinned devDependencies
- `pnpm-lock.yaml`, `pnpm-workspace.yaml` — lockfile plus pnpm's own `minimumReleaseAgeExclude` entries for the two newly-pinned, recently-published packages
- `.github/workflows/pr.yml` — `database` job extended with four new steps; `gate` job gains `pnpm lint`
- `apps/web/wrangler.jsonc` — `env.staging`'s `hyperdrive` block enabled for local preview (Rule 2)
- `apps/web/app/[locale]/error.tsx`, `apps/web/components/transfer/VehicleCard.tsx` — dead `eslint-disable-next-line` comments (referencing plugins this repo does not install) stripped, explanatory prose kept
- `packages/db/test/local/identity-contract.test.ts` — targeted `eslint-disable-next-line no-restricted-syntax` on claim 9's deliberate `return tx`-shaped compile-time-only proof
- `packages/db/test/deployed/negative-controls.test.ts` — one assertion message reworded off the literal `SET ROLE` substring the new fence correctly caught in prose

## Decisions Made

See `key-decisions` in frontmatter. In short: the two package pins matched the pre-resolved approval exactly with no version drift; the CI-suite steps joined the database job that already existed (not the stale single-job description in this plan's own `<interfaces>` block); the local-roles-before-pgTAP ordering bug from the plan's own literal text was corrected to match 03-05's already-documented fix; the `ALLOW_LOCAL_ROLE_PASSWORDS` step-scoping was widened by one step after empirically confirming `mutation-gate.mjs` needs its own copy of the guard; and `wrangler.jsonc`'s staging Hyperdrive block was enabled (a file outside Task 3's own `<files>` list) because D-36 is structurally unprovable without it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `apps/web/lib/db/identity.ts`'s type-only `postgres` import needed `allowTypeImports`**
- **Found during:** Task 2, first `pnpm lint` run
- **Issue:** Core ESLint's `no-restricted-imports` has no concept of TypeScript's `import type` and flagged `apps/web/lib/db/identity.ts`'s `import type postgres from "postgres"` (added as a deviation in plan 03-03 for a `postgres.TransactionSql` parameter annotation) even though the file never constructs a raw client.
- **Fix:** Switched the postgres-ban entries to `@typescript-eslint/no-restricted-imports` with `allowTypeImports: true`. Still catches a VALUE import of `postgres` everywhere; a type-only reference is exempt everywhere, matching D-10's real target.
- **Files modified:** `eslint.config.mjs`
- **Verification:** `pnpm lint` exits 0; a temporary `import postgres from "postgres"` (VALUE import) added to the same file still fails lint, reverted.
- **Committed in:** `ea4eaaa`

**2. [Rule 1 - Bug] Two pre-existing `eslint-disable` comments referenced plugins this repo does not install**
- **Found during:** Task 2, first `pnpm lint` run
- **Issue:** `apps/web/app/[locale]/error.tsx` and `apps/web/components/transfer/VehicleCard.tsx` carried `// eslint-disable-next-line react-hooks/exhaustive-deps` / `@next/next/no-img-element` comments written before this repo had any ESLint config at all (`03-PATTERNS.md`'s own `find … -iname "eslint*"` confirmed none existed). ESLint 10 hard-errors ("Definition for rule … was not found") on a disable comment naming a rule from a plugin that is not registered anywhere in the config — these plugins are deliberately not installed (the minimal two-rule mandate).
- **Fix:** Stripped the dead directive lines, kept the explanatory prose as plain comments.
- **Files modified:** `apps/web/app/[locale]/error.tsx`, `apps/web/components/transfer/VehicleCard.tsx`
- **Verification:** `pnpm lint` exits 0.
- **Committed in:** `ea4eaaa`

**3. [Rule 1 - Bug] `identity-contract.test.ts`'s claim-9 compile-time-only proof IS the exact pattern the new syntax rule exists to catch**
- **Found during:** Task 2, first `pnpm lint` run
- **Issue:** Plan 03-01's `typeOnlyProof_fnCannotReturnTx()` deliberately writes `async (tx) => tx` under `@ts-expect-error` to prove the type system rejects it — the new `no-restricted-syntax` rule correctly flags the same line at the AST level, since it does not know the containing expression is guarded by `@ts-expect-error`.
- **Fix:** Added a targeted `// eslint-disable-next-line no-restricted-syntax` immediately above the line, matching the file's own existing convention (an `eslint-disable-next-line @typescript-eslint/no-explicit-any` two lines below it, from before this plan).
- **Files modified:** `packages/db/test/local/identity-contract.test.ts`
- **Verification:** `pnpm lint` exits 0; the rule still fires on a fresh `return tx;` added elsewhere in the file (verified, reverted).
- **Committed in:** `ea4eaaa`

**4. [Rule 1 - Bug] Registered the `@typescript-eslint` plugin universally so pre-existing `@typescript-eslint/*` disable comments demote from error to harmless warning**
- **Found during:** Task 2, same lint run
- **Issue:** `apps/web/tests/support/mock-harness.ts` and `identity-contract.test.ts` carried `@typescript-eslint/no-implied-eval` / `no-explicit-any` disable comments, same class of issue as deviation #2, but for a plugin this config DOES partially use (for the `no-restricted-imports` variant).
- **Fix:** Registered `plugins: { "@typescript-eslint": tseslint.plugin }` on the universal `no-restricted-syntax` config block (`**/*.ts`/`**/*.tsx`, no `ignores`) — this makes every `@typescript-eslint/*` rule NAME known repo-wide without enabling any of them, turning the hard "rule not found" error into a harmless "unused directive" warning, preserving the documentation instead of deleting it.
- **Files modified:** `eslint.config.mjs`
- **Verification:** `pnpm lint` exits 0 (5 warnings, 0 errors) instead of erroring.
- **Committed in:** `ea4eaaa`

**5. [Rule 1 - Bug] `negative-controls.test.ts`'s own assertion message tripped the new bare-`SET ROLE` CI-grep check**
- **Found during:** Task 2, first `pnpm check:db-fences` run
- **Issue:** `expect(r.n, "vamos_edge returned a row count on a backend NC1 just left dirty -- a leftover SET ROLE bypassed the grant wall.")` is a human-readable assertion-failure STRING (plan 03-05's own file), not SQL — but the bare-`SET` regex correctly cannot distinguish prose from executed SQL text, and comment-stripping does not touch string literals.
- **Fix:** Reworded to "a leftover privileged role assignment bypassed the grant wall" — same meaning, no behavior change, avoids the literal substring. Same class of grep-defeating-prose bug 03-01/02/03/05's own SUMMARY files document repeatedly, this time surfaced by a NEW check rather than a stale acceptance-criteria grep.
- **Files modified:** `packages/db/test/deployed/negative-controls.test.ts`
- **Verification:** `pnpm check:db-fences` exits 0 (all 8 checks pass).
- **Committed in:** `ea4eaaa`

**6. [Rule 1 - Bug] `eslint.config.mjs`'s own header comment tripped its own preset-absence grep**
- **Found during:** Task 2, running the plan's own acceptance-criteria grep
- **Issue:** The explanatory comment "NOT `eslint:recommended`, NOT typescript-eslint's `recommended` … presets" matched the acceptance grep counting `eslint:recommended|recommendedTypeChecked|stylistic` occurrences (required to print `0`).
- **Fix:** Reworded to describe the same fact ("none of ESLint core's own bundled-defaults preset, none of typescript-eslint's bundled rule-set presets") without the literal substrings.
- **Files modified:** `eslint.config.mjs`
- **Verification:** `grep -c 'eslint:recommended\|recommendedTypeChecked\|stylistic' eslint.config.mjs` prints `0`.
- **Committed in:** `ea4eaaa`

**7. [Rule 1 - Bug] The plan's `<interfaces>` block describes a pre-existing single `gate` job in `pr.yml`, but a second `database` job already exists**
- **Found during:** Task 3, reading `pr.yml` before editing
- **Issue:** `.planning/phases/03-hyperdrive-data-access-wiring/03-PATTERNS.md` and this plan's own `<interfaces>` text were written against an 86-line, single-`gate`-job `pr.yml` — but Phase 2 plan 02-09 (`9b72300`, after this phase's own research docs) added a separate `database` job that already runs `db:start`/`db:reset`/`db:test`/`db:stop`. Following the plan's literal instruction to append the new steps to "the existing single gate job" would have DUPLICATED `db:reset`/`db:test`/`db:stop`, directly breaking the plan's own acceptance criterion (`grep -c 'db:reset'` must print `1`).
- **Fix:** Extended the actually-existing `database` job instead, in the same order the plan names, after its existing pgTAP/seed/types-drift steps.
- **Files modified:** `.github/workflows/pr.yml`
- **Verification:** `grep -c 'db:reset'`/`'mutation-gate'`/`'check:db-fences'` each print `1`; `python3 -c "import yaml; yaml.safe_load(...)"` exits 0; the `gate` job's second step is still `gitleaks secret scan`.
- **Committed in:** `1bed669`

**8. [Rule 1 - Bug] The plan's Task 3 action text and its own `<verify>` block both order `db:local-roles` before `db:test`/`db:reset`**
- **Found during:** Task 3, before writing the new `pr.yml` steps (cross-checked against `03-05-SUMMARY.md`'s own deviation #4 and this plan's `environment_facts`)
- **Issue:** Phase 2's `extensions.test.sql` asserts `vamos_edge has no password` (T-02-19). Postgres roles are cluster-level and survive `supabase db reset`, so running `db:local-roles` before `db:test` (as the plan's literal text specifies) leaves the password set when pgTAP checks for its absence — exactly the ordering bug plan 03-05 already hit and documented once.
- **Fix:** Implemented (and ran locally, in order) `db:reset` → `db:test` → `db:local-roles` → `vitest test/local` → `mutation-gate` (self-contained) → `check:db-fences`, matching the environment note rather than the plan's literal text.
- **Files modified:** `.github/workflows/pr.yml` (the local run itself touched no file)
- **Verification:** `pnpm db:reset && pnpm db:test` reports `Files=26, Tests=501, PASS` on a password-free database; the full corrected chain, run manually this session, is green end to end (see below).
- **Committed in:** `1bed669`

**9. [Rule 1 - Bug] `ALLOW_LOCAL_ROLE_PASSWORDS` needed on two steps, not the plan's literal "prints 1"**
- **Found during:** Task 3, deciding whether the Mutation gate step needed its own copy of the env var
- **Issue:** Confirmed empirically (`CI=true node packages/db/scripts/local-role-passwords.mjs` → `refusing to run in CI without ALLOW_LOCAL_ROLE_PASSWORDS=1`) that `mutation-gate.mjs`'s own `setLocalRolePasswords()` re-invokes `pnpm run local-roles` as a subprocess. That subprocess inherits GitHub Actions' ambient `CI=true`, so the Mutation gate step needs the SAME guard-satisfying variable independently of the Local role passwords step — omitting it would silently break the mutation gate the first time it runs in CI.
- **Fix:** Set `ALLOW_LOCAL_ROLE_PASSWORDS: "1"` on both the "Local role passwords" step and the "Mutation gate" step, each scoped to that one step only (never job-wide, per T-03-23).
- **Files modified:** `.github/workflows/pr.yml`
- **Verification:** `grep -c 'ALLOW_LOCAL_ROLE_PASSWORDS' .github/workflows/pr.yml` prints `2` (the plan's literal criterion said `1`; documented here as the correct, verified count rather than silently satisfying a criterion that would break the gate).
- **Committed in:** `1bed669`

**10. [Rule 2 - Missing Critical] `apps/web/wrangler.jsonc`'s `env.staging` had no `hyperdrive` block at all**
- **Found during:** Task 3, attempting the D-36 smoke test
- **Issue:** D-36 requires smoke-testing through `opennextjs-cloudflare preview --env staging` specifically — `/api/dev/db-smoke`'s own `DEPLOY_ENV === "staging"` gate returns 404 under any other environment (including `--env production`, confirmed empirically). But `env.staging`'s `hyperdrive` block was fully commented out (plan 03-03 deferred it whole to plan 03-07's real `wrangler hyperdrive create`), so `HYPERDRIVE_NOCACHE` had nothing to resolve to locally, and the smoke test was structurally unrunnable.
- **Fix:** Enabled the same placeholder-`id` + real-`localConnectionString` shape `env.production` already carried, under `env.staging` too. Confirmed empirically first (a real `wrangler dev`/`preview` session starts and serves fine with a non-UUID placeholder `id`, since local mode uses only `localConnectionString` — the UUID validation is `wrangler deploy`-only, exactly as the original comment on the `id` line already said). No owner-held credential or `wrangler hyperdrive create` call was needed.
- **Files modified:** `apps/web/wrangler.jsonc` (not in Task 3's own `<files>` list — added here because D-36 cannot otherwise be satisfied)
- **Verification:** `opennextjs-cloudflare preview --env staging` served `HYPERDRIVE_NOCACHE` as `local` mode; both smoke curls returned the expected bodies (see below).
- **Committed in:** `1bed669`

---

**Total deviations:** 10 auto-fixed (7 Rule 1 — correctness fixes against the plan's own literal text/acceptance criteria colliding with newly-installed tooling or pre-existing infrastructure the plan's authors didn't have visibility into; 1 Rule 1/1 Rule 1 covering CI ordering and env-var scoping bugs already flagged by 03-05's own precedent and confirmed empirically; 1 Rule 2 — a missing binding block that made D-36 structurally unprovable).
**Impact on plan:** Every fix either preserves behavior exactly (comment rewording, plugin registration widening a warning instead of an error) or corrects the plan's own literal text against an already-documented precedent (03-05's ordering bug) or an empirically-confirmed runtime fact (mutation-gate's subprocess env inheritance, wrangler dev's local-mode id handling). No scope creep — every deviation traces directly to making this plan's own stated acceptance criteria (`pnpm lint` exits 0, `check:db-fences` exits 0, the D-36 smoke actually runs, the mutation gate actually passes in CI) achievable at all.

## Issues Encountered

- Local Postgres's `postgres` role lacked `ALTER SYSTEM` permission for the D-38 measurement (`permission denied to set parameter "log_statement"`) — Supabase's local image reserves true superuser for `supabase_admin`. Switched to `supabase_admin`, took the measurement, restored the original `log_statement=ddl` / `log_line_prefix='%h %m [%p] %q%u@%d '` values afterward (verified via `SHOW`).
- The D-38 measurement script was written as a throwaway Vitest test (`packages/db/test/local/_scratch-flush-measure.test.ts`), run once, then deleted — never committed, matching the plan's own "the preview + curl smoke and the log_statement=all flush count are run once and their outputs pasted verbatim" instruction.

## D-36 — OpenNext runtime smoke (verbatim)

Command: `pnpm --filter web exec opennextjs-cloudflare build && pnpm --filter web exec opennextjs-cloudflare preview --env staging --port 18789`, local Docker Postgres already up via `pnpm db:start`.

```
GET /api/dev/db-smoke
  HTTP 200
  {"ok":true,"rows":[{"ok":1}]}

GET /api/dev/db-smoke?probe=fail
  HTTP 200
  {"sqlstate":"42501"}
```

Confirms `getCloudflareContext()` → `asAnon` → `HYPERDRIVE_NOCACHE` resolves through the real wrangler platform proxy against `127.0.0.1:54322` as `vamos_edge`, and the fail-closed `42501` answer survives the real Worker boundary — the exact half `next dev` cannot prove.

## D-38/U26 — flush count (verbatim)

Command used to obtain it: `docker exec supabase_db_vamos-taxi psql -U supabase_admin -d postgres -c "ALTER SYSTEM SET log_statement = 'all';" -c "ALTER SYSTEM SET log_line_prefix = '%m ';" -c "SELECT pg_reload_conf();"`, then one `withIdentity(CS, "customer", claims, fn)` call with a single `fn` query, then `docker logs supabase_db_vamos-taxi`.

```
05:47:11.085 UTC LOG:  statement: begin
05:47:11.086 UTC LOG:  execute _1: select set_config('role', $1, true)
05:47:11.087 UTC LOG:  execute _2: select set_config('request.jwt.claims', $1, true)
05:47:11.087 UTC LOG:  execute _3: select $1::text as marker
05:47:11.088 UTC LOG:  execute _4: commit
```

**5 statements**, spanning ~3ms end to end on loopback. Confirms the shipped `withIdentity` issues exactly five discrete statements for a customer/staff call with one `fn` query (BEGIN, two `set_config`s, the query, COMMIT), matching D-38's premise. Loopback round-trip time is already sub-millisecond regardless of pipelining, so this measurement does not by itself distinguish a single TCP flush from five separate ones — the WAE p50 comparison against the deployed Zurich Worker stays **DEFERRED** to plan 03-07, same status as DATA-05. `withIdentity` is unchanged by this plan (`git diff --stat packages/db/src/identity.ts` is empty).

## User Setup Required

None — no external service configuration required. The Cloudflare API token/account id `pr.yml`'s existing `gate` job already references for its preview-upload step remain owner-held and out of scope for this plan.

## Next Phase Readiness

- **DATA-05/DATA-06 stay Pending in REQUIREMENTS.md.** This plan closes the compile-time and local-Postgres halves only; the concurrent-request proof against a real pooled connection and the staging p50 are plan 03-07's, per the plan's own `<deferred>` section and 03-01/03-02's established decision not to mark these complete prematurely.
- **`apps/web/wrangler.jsonc`'s two `id` placeholders (one now under `env.staging`, one already under `env.production`) still need the real Hyperdrive config ids** — plan 03-07's `wrangler hyperdrive create` (run twice, `--caching-disabled` on the identity config) and the owner-held `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` remain the blocker, unchanged by this plan.
- **The full local Phase 3 gate is now enforced in CI**, not only locally: `pr.yml`'s `database` job will fail a PR on any regression across pgTAP, the local Vitest suite, the mutation gate, or the two new fences; `gate` fails on any ESLint violation.
- No blockers. `packages/db/supabase/migrations/` untouched (D-31 honored) — confirmed via `git status` before every commit in this plan.

---
*Phase: 03-hyperdrive-data-access-wiring*
*Completed: 2026-08-25*

## Self-Check: PASSED

All 9 created/modified files confirmed present on disk; both task commits (`ea4eaaa`, `1bed669`) confirmed in `git log`.

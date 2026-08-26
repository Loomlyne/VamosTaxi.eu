---
phase: 03-hyperdrive-data-access-wiring
plan: 04
subsystem: database
tags: [jose, jwt, postgres, postgres.js, cloudflare-workers, hyperdrive, github-actions, rls]

# Dependency graph
requires:
  - phase: 03-hyperdrive-data-access-wiring
    provides: >-
      plan 03-01's shipped withIdentity/publicSql/claimsForSql at @vamos/db's frozen
      five-identity-kind contract, PG_ROLE, ENTRY_PROBE, EntryProbeRow, and the ./verify export
      forward-declared in packages/db/package.json; plan 03-02's opts.onProbe addition and the
      postgres@3.4.9 sql.reserve()/sql.begin() quirks its SUMMARY documents
provides:
  - "packages/db/src/verify.ts — verifyAccessToken(token, opts) with jose: refuses HS256, checks issuer/audience against a Supabase project's JWKS, maps the verified payload onto VamosClaims (never user_metadata)"
  - "apps/isolation-probe — a new staging-only Cloudflare Worker package (@vamos/isolation-probe), no production environment, no deploy script, unmatched by the web pnpm filter, importing the shipped withIdentity from @vamos/db"
  - "The closed nine-member impl union dispatched through a Record<Impl,handler> (empirically verified to fail typecheck when a member is removed) — impl=correct/cached call withIdentity with opts.probe:__VAMOS_ISOLATION_PROBE__; the other seven construct each NC1-NC6/mutant/hazard sequence the harden findings require"
  - "packages/db/test/fixtures/two-customers.ts — seedFixtures() minting real Supabase Auth users through the Admin API for a customer pair, a guest pair (one manage-token-reachable booking each) and a staff pair (D-45); assertNoLiveRateVersion() as the harness precondition"
  - "Three D-20 structural gates in .github/workflows/deploy-production.yml's gate job, one failing closed (not skipping) when Cloudflare credentials are unavailable"
affects: [03-05, 03-06, 03-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "verifyAccessToken(token, opts) — explicit pre-network HS256 refusal via decodeProtectedHeader before jwtVerify, algorithms allowlist [RS256,ES256], enumerate-don't-spread claim mapping mirroring claims.ts"
    - "Closed impl union via Record<Impl,handler> — TypeScript fails the build if a member is added without a handler, verified empirically (removed abandon's handler, tsc failed with TS2741, restored)"
    - "impl vs kind as two independent query parameters on the same probe endpoint — the same failure-mode construction runs against customer/staff (verified bearer claims) or guest (?manageTokenHash= hex, a claim deliberately independent of the bearer token that only proves the caller is real)"
    - "waituntil_captured's held-transaction pattern: fn blocks on an internal Promise released from inside ctx.waitUntil, so the transaction genuinely stays open across the response boundary instead of auto-committing before waitUntil even starts"
    - "Manage-token fixture cardinality: one booking_access_tokens row per manage token (UNIQUE token_hash), so a guest FixtureIdentity reports exactly one reachable reference even though bookingsEach unreachable siblings are seeded alongside it"

key-files:
  created:
    - packages/db/src/verify.ts
    - apps/isolation-probe/package.json
    - apps/isolation-probe/wrangler.jsonc
    - apps/isolation-probe/tsconfig.json
    - apps/isolation-probe/src/index.ts
    - packages/db/test/fixtures/two-customers.ts
  modified:
    - .github/workflows/deploy-production.yml
    - pnpm-lock.yaml

key-decisions:
  - "verifyAccessToken(token, opts: {supabaseUrl, audience?}) — no env argument, matching packages/db's own D-07 discipline of never depending on OpenNext env; the probe supplies supabaseUrl from its own SUPABASE_URL var, added to wrangler.jsonc's vars block (not in the plan's literal wrangler.jsonc action text, but required for verifyAccessToken to have a JWKS endpoint at all; a public project URL, not a secret)"
  - "impl and kind are two independent query parameters, not one combined dispatch — the plan's <interfaces> block names the impl union and D-45's guest/staff pairs but does not specify how a single probe endpoint selects which IdentityKind a given impl runs against; kind=customer/staff use the verified bearer token's own claims, kind=guest uses ?manageTokenHash='s hex value (never the bearer token's claims), kind=anon/quote bind no claim"
  - "waituntil_captured/waituntil_fenced/abandon report their result via an in-isolate Map drained by a ?drain=<nonce> follow-up request on the same /probe path, gated by PROBE_SECRET only — the plan explicitly allows this as 'the out-of-band channel that needs no new table'"
  - "Guest FixtureIdentity.references is a one-element array, not bookingsEach — booking_access_tokens.token_hash carries a UNIQUE constraint, so one manage-token claim can legally open exactly one booking (matching DATA-03's own real-world semantics); bookingsEach unreachable bookings are still seeded alongside it as negative-check fixture data"
  - "Staff pair minted without completing TOTP enrollment — aal2 is a genuine Auth-server fact verifyAccessToken reads from whatever the real token carries, not something a fixture can forge; recorded as a fixture limitation for plan 03-07, not silently assumed away"
  - "VAMOS_OWNER_URL is the new env var name for the fixture's direct Postgres superuser connection (never set by this plan) — matches the local-fixtures.ts/adminSql() convention and 03-RESEARCH.md's OWNER_URL naming; plan 03-07 is the first to set it in CI"
  - "postgres added as apps/isolation-probe's own direct dependency (not just transitive via @vamos/db) — the mutant/hazard handlers import postgres directly to construct sequences withIdentity never produces, and pnpm's strict linking does not expose a transitive dependency to a package that has not declared it itself"
  - "requirements-completed left empty — matching 03-01/03-02's precedent: this plan proves nothing at runtime (D-30's own framing, 'source only, verified by typecheck and grep'); DATA-06 needs plan 03-07's deployed, pooled proof"

requirements-completed: []  # DATA-06 needs plan 03-07's deployed proof against real Hyperdrive/Cloudflare infrastructure; this plan ships the deployed half as source only (D-30)

# Metrics
duration: ~55min (research/context-loading heavy; commit-to-commit span was short since all three tasks were written and verified in one continuous pass)
completed: 2026-08-25
---

# Phase 3 Plan 4: The deployed DATA-06 half — probe Worker, token verification, fixtures, production gates Summary

**A staging-only `apps/isolation-probe` Worker exposing a closed nine-member `impl` union behind a constant-time-gated, bearer-verified endpoint, importing the shipped `withIdentity`; `packages/db/src/verify.ts`'s `jose`-based Supabase token verifier; `two-customers.ts`'s customer/guest/staff fixture triples seeded through the real Supabase Auth Admin API; and three `deploy-production.yml` gates that fail a build shipping the probe, its build output, or its secret.**

## Performance

- **Duration:** ~55 min (heavy on reading 03-RESEARCH.md/isolation-proof.md/applied migrations before writing; the three task commits landed within about two minutes of each other once writing started)
- **Tasks:** 3/3 completed
- **Files modified:** 8 (6 created, 2 modified — including `pnpm-lock.yaml`, updated by `pnpm install` for the new workspace package)

## Accomplishments
- `packages/db/src/verify.ts` exports `verifyAccessToken(token, opts)`: refuses HS256 by decoding the protected header before any JWKS network call, verifies against the Supabase project's JWKS with an explicit `[RS256, ES256]` algorithm allowlist and issuer/audience checks, and maps the verified payload onto `VamosClaims` by enumerating fields (never `user_metadata`)
- `apps/isolation-probe` exists as a real workspace package: `@vamos/isolation-probe` (unmatched by `pnpm --filter web`), `private: true`, no `deploy` script, `typecheck`/`build` (`wrangler deploy --dry-run --outdir dist`) only, `postgres`/`@vamos/db` as runtime deps
- `wrangler.jsonc` is a single flat staging-only shape — no per-environment blocks at all — with the Zurich Placement Hint (`aws:eu-central-2`, D-25), three Hyperdrive bindings (`HYPERDRIVE_NOCACHE`/`HYPERDRIVE_APP`/`HYPERDRIVE_CACHED`) carrying descriptive placeholder ids for plan 03-07, and the `__VAMOS_ISOLATION_PROBE__` compile-time `define` constant (D-20)
- `apps/isolation-probe/src/index.ts` (563 lines): gate (constant-time `PROBE_SECRET`, opaque 404, mandatory `verifyAccessToken`) → dispatch (closed `impl` union through a `Record<Impl,handler>`, empirically proven to fail `tsc` when a handler is removed) → report (five `ENTRY_PROBE` fields including `guestAtEntry`, `sqlstate` from `err.code` only, never a message or stack). `impl=correct`/`cached` call the shipped `withIdentity`; `session_in_txn`/`session`/`nobegin`/`nowrapper`/`waituntil_captured`/`abandon` construct the exact wrong sequences 03-HARDEN.md's ISOL-01..05 findings require; `waituntil_fenced` is the labelled positive control
- `packages/db/test/fixtures/two-customers.ts` seeds three real pairs (customer/guest/staff) through the Supabase Admin API, refusing to run unless `SUPABASE_URL` names `SUPABASE_STAGING_REF`; every insert is schema-legal against the applied migrations, no legs, no amounts, no teardown DELETE against the append-only `bookings` table
- `.github/workflows/deploy-production.yml`'s `gate` job gained three D-20 steps: no `apps/isolation-probe/dist`, no `isolation-probe` string under `apps/web`/`packages/db/src`, and `PROBE_SECRET` absent from the production Worker's secret list — the last one fails closed (not skipped) when `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` are unavailable, which is the case today

## Task Commits

1. **Task 1: Token verification and the staging-only probe package** - `c25e6cb` (feat)
2. **Task 2: The probe fetch handler — closed impl union, secret gate, entry reporting** - `a5b2a9b` (feat)
3. **Task 3: Schema-legal fixtures with guest and staff pairs, and the three production gates** - `286e146` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `packages/db/src/verify.ts` - `verifyAccessToken(token, opts)`, HS256-refusing, jose-based Supabase access-token verification
- `apps/isolation-probe/package.json` - `@vamos/isolation-probe`, private, no deploy script, typecheck/build scripts, `@vamos/db`+`postgres` deps
- `apps/isolation-probe/wrangler.jsonc` - single flat staging shape, Zurich placement, three Hyperdrive bindings, `SUPABASE_URL` var, `__VAMOS_ISOLATION_PROBE__` define
- `apps/isolation-probe/tsconfig.json` - extends `tsconfig.base.json`, `types: ["node", "@cloudflare/workers-types"]`
- `apps/isolation-probe/src/index.ts` - the probe fetch handler, all nine `impl` handlers
- `packages/db/test/fixtures/two-customers.ts` - `seedFixtures()`, `FixtureIdentity`, `FixturePairs`, `assertNoLiveRateVersion()`
- `.github/workflows/deploy-production.yml` - three D-20 structural gates added to the `gate` job
- `pnpm-lock.yaml` - updated for the new `@vamos/isolation-probe` workspace package and its dependencies

## Decisions Made
- **`verifyAccessToken`'s options shape.** `{ supabaseUrl, audience? }`, no `env` argument — `packages/db` never depends on OpenNext `env` (D-07's existing discipline for `withIdentity`), and the caller (the probe, later `apps/web`) is what actually has a Cloudflare `env`. Required adding `SUPABASE_URL` to `wrangler.jsonc`'s `vars` block, one step beyond the plan's literal wrangler action text (which lists only `DEPLOY_ENV`) — a Supabase project URL is public (it ships in every browser bundle), so this is a non-secret addition, not a deviation from D-20's secret-handling rules.
- **`impl` and `kind` as two independent query parameters.** The plan's `<interfaces>` block freezes the nine-member `impl` union and D-45 requires a guest and a staff pair in the adjacency set, but neither specifies how one probe endpoint selects which `IdentityKind` a given `impl` construction runs against. Implemented `?kind=anon|customer|staff|guest|quote` alongside `?impl=`, so the SAME failure-mode construction (e.g. `correct`) can be driven against any of the three D-45 pairings without a combinatorial explosion of `impl` variants. For `kind=guest`, the bound claim comes from `?manageTokenHash=`'s hex value — deliberately independent of the verified bearer token's own claims, which exist only to prove the caller is a real, verified identity (closing the probe against anonymous fuzzing), not to supply the guest's DB-visible claim.
- **`waituntil_captured`'s held-transaction construction.** A naive `sql.begin(async (tx) => { ...bind...; return tx; })` auto-commits the instant `fn` resolves — which happens synchronously, before the HTTP response is even constructed — so returning `tx` immediately would not actually demonstrate failure mode #10 (a transaction still open when `waitUntil` work runs after the response). Implemented instead as `fn` blocking on an internal `Promise` that only the `ctx.waitUntil` continuation resolves (after a short delay, so the response has genuinely been handed back first); only then does the SELECT on that same `tx` run and COMMIT. This is the plan's own discretion territory (Task 2 names the outcome — "run a SELECT on that same tx" — not the exact construction).
- **Guest `FixtureIdentity.references` is a one-element array.** `booking_access_tokens.token_hash` carries a `UNIQUE` constraint, so a single manage-token hash cannot legally cover more than one row — DATA-03's real product semantics are exactly "one manage-token claim opens exactly one booking". `bookingsEach` (default 3) bookings are still seeded per guest identity so unreachable sibling rows exist for a harness that wants to prove a guest sees its own booking and nothing else.
- **Staff pair's `aal2` gap recorded, not forged.** `app.is_staff()` requires `aal2` (Phase 2 D-05), which is a genuine Auth-server fact from a completed TOTP challenge — `verifyAccessToken` reads whatever the real token actually carries and this fixture cannot manufacture it through the Admin API. The staff pair is minted as a real, verified identity (satisfying D-45's adjacency-set requirement) with a documented limitation that exercising `app.is_staff()`'s `aal2` gate end-to-end is plan 03-07's obligation, not assumed away here.
- **`VAMOS_OWNER_URL`** is the new env var name for the fixture's direct Postgres superuser connection (matching `local-fixtures.ts`'s `adminSql()` convention and `03-RESEARCH.md`'s `OWNER_URL` naming for the deployed context) — never set by this plan; plan 03-07 is the first to configure it in CI.
- **`postgres` added as `apps/isolation-probe`'s own direct dependency.** The plan's Task 1 action text lists only `@vamos/db` under dependencies, but the mutant/hazard handlers (`session_in_txn`, `session`, `nobegin`, `nowrapper`, `abandon`, `waituntil_captured`) import `postgres` directly to construct sequences `withIdentity` deliberately never produces. pnpm's strict linking does not expose a transitive dependency (postgres via `@vamos/db`) to a package that has not declared it itself — omitting it would have made `pnpm install` succeed but the import unresolvable at the type/bundle level. [Rule 3 - Blocking]
- **`requirements-completed` left empty**, matching 03-01/03-02's precedent: D-30 frames this entire plan as "source only, verified by typecheck and grep" — DATA-06 needs plan 03-07's deployed, pooled proof before it can be marked complete.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `postgres` missing from `apps/isolation-probe/package.json`'s dependencies**
- **Found during:** Task 1/Task 2 boundary, before writing `src/index.ts`'s mutant/hazard handlers
- **Issue:** The plan's Task 1 action text lists only `@vamos/db` as a dependency, but Task 2's mutant/hazard handlers construct raw `postgres.js` sequences (`sql.begin`, `sql.unsafe`) that `withIdentity` never produces — they need to `import postgres from "postgres"` directly. pnpm's strict linking would not resolve that import from a transitive dependency alone.
- **Fix:** Added `"postgres": "3.4.9"` (the same pin `packages/db`/`apps/web` already use) to `apps/isolation-probe/package.json`'s `dependencies`.
- **Files modified:** `apps/isolation-probe/package.json`
- **Verification:** `pnpm --filter @vamos/isolation-probe run typecheck` and `wrangler deploy --dry-run` both succeed.
- **Committed in:** `c25e6cb` (Task 1 commit — added before Task 2 needed it)

**2. [Rule 3 - Blocking] `@types/node` missing from `apps/isolation-probe/package.json`'s devDependencies**
- **Found during:** Task 1, first `pnpm typecheck` run
- **Issue:** `tsconfig.json`'s `types: ["node", "@cloudflare/workers-types"]` (per the plan's own Task 1 action) requires `@types/node` to be resolvable; `tsc` failed with `TS2688: Cannot find type definition file for 'node'` without it declared as a direct devDependency.
- **Fix:** Added `"@types/node": "26.2.0"` (the same pin `packages/db`/`apps/web` already use) to `devDependencies`.
- **Files modified:** `apps/isolation-probe/package.json`
- **Verification:** `pnpm typecheck` (root) exits 0, all four workspace packages report `Done`.
- **Committed in:** `c25e6cb` (Task 1 commit)

**3. [Rule 1 - Bug] `import type { VamosClaims } from "@vamos/db/verify"` — not a real export**
- **Found during:** Task 2, first `pnpm typecheck` run
- **Issue:** `src/index.ts` initially imported `VamosClaims` as a type-only import from `@vamos/db/verify`, but `verify.ts` only imports `VamosClaims` from `./claims` for its own internal use — it never re-exports it. `tsc` failed with `TS2459: Module "@vamos/db/verify" declares 'VamosClaims' locally, but it is not exported`.
- **Fix:** Changed the import to pull `VamosClaims` from `@vamos/db/claims` (its canonical source, already exported there) instead, leaving `verify.ts`'s own export surface untouched.
- **Files modified:** `apps/isolation-probe/src/index.ts`
- **Verification:** `pnpm --filter @vamos/isolation-probe run typecheck` exits 0.
- **Committed in:** `a5b2a9b` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 3 — blocking dependency/type-resolution issues, 1 Rule 1 — an incorrect import path). None changed the shipped `withIdentity`/`verify.ts` contract, any acceptance-criteria grep target, or the closed `impl` union's shape. No scope creep.

## Issues Encountered
- `pnpm install --frozen-lockfile` (Task 1's own first verification command) failed on the very first run with `ERR_PNPM_OUTDATED_LOCKFILE`, because adding a new workspace package (`apps/isolation-probe`) necessarily changes `pnpm-lock.yaml` — expected sequencing (a plain `pnpm install` updates the lockfile once, then `--frozen-lockfile` succeeds on every subsequent run, confirmed), not a defect. `pnpm-lock.yaml`'s diff is included in Task 1's commit.
- No wrangler.jsonc jsonc-comment parity issue found, but a hand-written Python JSON-comment-stripper used for an early sanity check falsely flagged the file as invalid (it treated `//` inside a `postgres://...` connection-string value as a comment marker) — this was a flaw in the throwaway check script, not the file; `wrangler deploy --dry-run` (the real jsonc parser) parses it cleanly, confirmed.

## User Setup Required

None - no external service configuration required. The three Hyperdrive config ids in `wrangler.jsonc`, `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ANON_KEY`/`VAMOS_OWNER_URL`/`SUPABASE_STAGING_REF` for the fixture, and `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` for the new production gate all stay descriptive placeholders or unset — every one of them is plan 03-07's job once the owner's Cloudflare account and Supabase credentials exist (D-29).

## Next Phase Readiness
- Plan 03-05 (the deployed harness — validity gates, negative-control assertions, the adjacency-set gate itself) can now import `seedFixtures`/`FixtureIdentity`/`FixturePairs` from `packages/db/test/fixtures/two-customers.ts` and drive `apps/isolation-probe`'s `/probe?impl=&kind=` endpoint directly — both are typechecked and bundle cleanly (`wrangler deploy --dry-run`).
- Plan 03-06 (CI wiring / ESLint fences) has three real `deploy-production.yml` gates to build on and can add the `deploy-staging.yml` `data-06` job the plan's `<verification>` block anticipates.
- Plan 03-07 (deployment) needs to: fill the three Hyperdrive config placeholder ids in `apps/isolation-probe/wrangler.jsonc`, `wrangler secret put PROBE_SECRET`, set `VAMOS_OWNER_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ANON_KEY`/`SUPABASE_STAGING_REF` for the fixture, and answer U29/D-41 (does `@example.test` survive `email_confirm: true`) and the staff pair's `aal2` gap on the first real run.
- No blockers. `packages/db/supabase/migrations/` untouched (D-31 honored) — confirmed via `git status` before every commit in this plan.

---
*Phase: 03-hyperdrive-data-access-wiring*
*Completed: 2026-08-25*

## Self-Check: PASSED

All 7 files listed under "Files Created/Modified" (plus `pnpm-lock.yaml`) verified present on
disk. All 3 task commit hashes (`c25e6cb`, `a5b2a9b`, `286e146`) verified present in
`git log --oneline --all`.

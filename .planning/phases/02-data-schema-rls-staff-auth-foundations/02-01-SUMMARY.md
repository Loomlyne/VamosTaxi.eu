---
phase: 02-data-schema-rls-staff-auth-foundations
plan: 01
subsystem: database
tags: [supabase, postgres, cli, pnpm, monorepo, migrations]

# Dependency graph
requires:
  - phase: 01-scaffold-design-system-i18n-runtime
    provides: "packages/db workspace package (empty scaffold, D-01) that this plan fills in"
provides:
  - "packages/db/supabase/ as the one Supabase project directory in the repo, resettable from zero"
  - "supabase@2.115.0 pinned exact at the workspace root, its postinstall allow-listed"
  - "packages/db/package.json + root db:* scripts as the single entry point for every CLI call"
  - "the 24-file pre-assigned migration numbering table every later Plan 02-02..02-10 writes into"
  - "docs/build/SUPABASE-RESOURCES.md as the hosted-project register (ref, region, secrets, probes)"
affects: [02-02, 02-03, 02-04, 02-05, 02-06, 02-07, 02-08, 02-09, 02-10, phase-03-hyperdrive]

# Tech tracking
tech-stack:
  added: ["supabase@2.115.0 (exact, workspace-root devDependency)"]
  patterns:
    - "Every Supabase CLI invocation runs through a packages/db/package.json script (cwd packages/db), never a bare `supabase` call from the repo root"
    - "Migration filenames are pre-assigned (20260823000NN_<name>) for this phase only; supabase migration new is the rule from Phase 3 onward"

key-files:
  created:
    - packages/db/supabase/config.toml
    - packages/db/supabase/.gitignore
    - packages/db/supabase/seed.sql
    - packages/db/supabase/tests/.gitkeep
    - docs/build/SUPABASE-RESOURCES.md
  modified:
    - packages/db/package.json
    - packages/db/README.md
    - package.json
    - pnpm-workspace.yaml
    - pnpm-lock.yaml
    - docs/build/GSD-LAUNCH.md
    - docs/build/CLOUDFLARE-RESOURCES.md
    - .planning/PROJECT.md
    - .planning/ADR-007-edge-data-residency.md

key-decisions:
  - "supabase@2.115.0 approved via T-02-SC human legitimacy checkpoint (publisher is the supabase org, repo github.com/supabase/cli, latest dist-tag, 3.5M weekly downloads, tarball sha1 6fea23938507208428fe14a37fdab3ee8c617256) before the first pnpm add of this phase"
  - "24-file migration numbering table fixed in packages/db/README.md, with content_and_reviews moved to 07 (ahead of audit_log's 17, since tg_audit_row attaches to both) and coupon_redemptions moved to 15 (after payments_refunds, since D-29 FKs booking_payments)"
  - "vamos_edge/vamos_public roles ship with no password in migrations; ALTER ROLE ... PASSWORD is run out-of-band per environment, documented but never committed"
  - "D-37 recorded: hosted project yaumjzvylngfjhtuffqs is in Central Europe (Zurich), not the Frankfurt eu-central assumption baked into 02-RESEARCH.md/PROJECT.md/ADR-007 — corrected with one-line amendments rather than rewritten prose"

requirements-completed: [DATA-01, DATA-07]

# Metrics
duration: ~20min (this session; Task 1's checkpoint approval happened in a prior session)
completed: 2026-08-23
---

# Phase 2 Plan 1: Supabase project relocation, CLI pin, hosted project docs Summary

**Moved the root-level `supabase init` leftovers into `packages/db/supabase/`, pinned `supabase@2.115.0` exact behind a human legitimacy checkpoint, wired every CLI call through package scripts, and corrected the Frankfurt→Zurich region assumption across four build documents.**

## Performance

- **Duration:** ~20 min (this session, resuming after Task 1's checkpoint was approved in a prior session)
- **Completed:** 2026-08-23T22:36:00Z
- **Tasks:** 3 (1 checkpoint, approved; 2 auto)
- **Files modified:** 14 (9 in Task 2, 5 in Task 3)

## Accomplishments

- `packages/db/supabase/` is now the only Supabase project directory in the repo: moved from
  the repo root, both zero-byte baseline migrations deleted, `project_id` changed to the
  non-dotted `vamos-taxi`, and `studio`/`analytics`/`edge_runtime` disabled locally for CI speed.
- `supabase@2.115.0` pinned exact as a workspace-root devDependency after the T-02-SC human
  legitimacy checkpoint, with `supabase: true` added to `pnpm-workspace.yaml`'s `allowBuilds` so
  its binary-download postinstall runs under pnpm 11's default-deny policy.
- `packages/db/package.json` and root `package.json` now expose ten matching CLI-wrapping
  scripts (`start`/`stop`/`reset`/`test:db`/`types`/`types:check`/`seed:gen`/`seed:check`/
  `push`/`link`, and `db:*` aliases at the root) — every future executor and CI job runs the CLI
  from the same working directory.
- `packages/db/README.md` rewritten with the 24-file pre-assigned migration numbering table
  (D-21), the role-password out-of-band procedure, and the "before the first hosted push" probe
  checklist (D-25/D-27/D-33).
- `docs/build/SUPABASE-RESOURCES.md` created as the hosted-project register (ref, region,
  Postgres version, CI secrets, local stack facts, probe table) mirroring
  `CLOUDFLARE-RESOURCES.md`'s style; `GSD-LAUNCH.md`, `PROJECT.md`, `ADR-007` amended in place
  with the D-37 Zurich correction; `CLOUDFLARE-RESOURCES.md` gained the D-24 jurisdiction note.
- Proved end to end: `pnpm db:stop && pnpm db:start && pnpm db:reset` all exit 0 against the
  moved project with zero migrations and the placeholder seed.

## Task Commits

1. **Task 1: Package legitimacy gate for `supabase@2.115.0` (T-02-SC)** — checkpoint, human-approved in a prior session, no commit (no file changes; approval evidence carried into Task 2's commit message)
2. **Task 2: Move the Supabase project into `packages/db`, pin the CLI, bind every CLI call to a package script (D-38, D-21)** — `bafde81` (feat)
3. **Task 3: Record the hosted project and correct the Frankfurt assumption in the build docs (D-37, D-24, D-28)** — `3eeefc5` (docs)

_No TDD tasks in this plan; no plan-metadata commit issued separately — Task 3's commit already carries all doc updates. STATE.md/ROADMAP.md/REQUIREMENTS.md updates land in the final metadata commit below._

## Files Created/Modified

- `packages/db/supabase/config.toml` — moved from repo root; `project_id = "vamos-taxi"`; studio/analytics/edge_runtime disabled locally
- `packages/db/supabase/.gitignore`, `seed.sql`, `tests/.gitkeep` — moved/created so `db reset` never fails before any migration exists
- `packages/db/package.json` — ten CLI-wrapping scripts, `"type": "module"`, dead `main` field removed
- `packages/db/README.md` — command table, 24-file migration numbering table, role-password procedure, pre-push probe checklist
- `package.json` — ten `db:*` aliases delegating to `@vamos/db`; `supabase@2.115.0` exact devDependency
- `pnpm-workspace.yaml` — `supabase: true` added to `allowBuilds`
- `pnpm-lock.yaml` — regenerated by `pnpm add`
- `docs/build/SUPABASE-RESOURCES.md` — new hosted-project register
- `docs/build/GSD-LAUNCH.md` — Frankfurt region line amended; Supabase CI secrets added to the Secrets/env matrix
- `docs/build/CLOUDFLARE-RESOURCES.md` — D-24 jurisdiction note added
- `.planning/PROJECT.md`, `.planning/ADR-007-edge-data-residency.md` — one-line D-37 amendments

## Decisions Made

- Kept the single exact pin at the workspace root only (`package.json`) rather than duplicating
  it into `packages/db/package.json` — `pnpm --filter @vamos/db exec supabase --version` already
  resolved `2.115.0` without a second pin, so the plan's fallback branch (step 5) wasn't needed.
- `supabase link --project-ref yaumjzvylngfjhtuffqs` run non-interactively from `packages/db`
  succeeded without a password prompt (the moved `.temp/linked-project.json` metadata already
  satisfied the link), so no fallback to the pre-existing `.temp/project-ref` file was needed —
  though it would have read the same ref either way.
- Set local (repo-scoped, not global) `git config user.name`/`user.email` to match this repo's
  existing commit-author identity (`koussay zayani <koss@KossMac.local>`, unchanged from every
  prior commit in `git log`) — the environment's global `~/.gitconfig` was absent, blocking any
  commit. This is an environment fix, not a new identity choice.

## Deviations from Plan

None — plan executed exactly as written. Task 2's step 5 fallback ("if the pin doesn't resolve,
add it to `packages/db/package.json` too") was checked and not triggered. All acceptance
criteria for both Task 2 and Task 3 passed on the first run.

## Issues Encountered

- `git commit` initially failed with "Author identity unknown" — the sandboxed environment has
  no `~/.gitconfig`. Resolved by setting `user.name`/`user.email` locally (repo-scoped) to match
  the identity already used in every prior commit on this branch (verified via `git log`), not a
  new or invented identity.

## User Setup Required

None — no external service configuration required. The three Supabase CI secrets
(`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`) remain owner-held and
unconfigured, as documented in `docs/build/SUPABASE-RESOURCES.md`; they are not needed until
Plan 02-10's CI wiring.

## Next Phase Readiness

Wave 0 is complete: `packages/db/supabase/` is the only Supabase project directory, the CLI is
pinned exact, every CLI call has a package script, and the stack resets from zero with the
placeholder seed. Plans 02-02 through 02-10 can now write real migrations into the pre-assigned
numbering slots this plan reserved. No blockers for Plan 02-02.

---
*Phase: 02-data-schema-rls-staff-auth-foundations*
*Completed: 2026-08-23*

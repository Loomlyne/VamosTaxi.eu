---
phase: 01-platform-foundation-design-system-port-i18n-runtime
plan: 02
subsystem: infra
tags: [ci, github-actions, gitleaks, secret-scanning, cloudflare-workers, wrangler, husky]

# Dependency graph
requires:
  - phase: 01-01
    provides: "pnpm monorepo, apps/web/wrangler.jsonc staging/production environments, root package.json script contract (typecheck, build, lint:css, i18n:check, test:visual, check:public-env)"
provides:
  - "Three GitHub Actions workflows: pr.yml (typecheck, build, secret scan, allowlist gate, screenshot-diff, preview upload), deploy-staging.yml (main → staging.vamostaxi.eu), deploy-production.yml (tag → production, apex deploy deferred to Phase 11)"
  - "gitleaks secret scanning wired twice from one .gitleaks.toml: pre-commit (.husky/pre-commit, staged diff) and CI (gitleaks-action, full PR range)"
  - "scripts/check-next-public-allowlist.mjs — the named NEXT_PUBLIC_* allowlist gate (source scan + built-bundle scan), bound to `pnpm check:public-env`"
  - "scripts/public-env-allowlist.json — the single place a client-exposed variable is deliberately declared"
affects: ["01-03", "01-04", "01-05", "01-06", "01-07", "01-08", "01-09", "01-10", "01-11", "01-12", "01-13", "01-14"]

actuals:
  tokens: 4750
  tasks: 3
  commits: 4

tech-stack:
  added:
    - "gitleaks 8.30.1 (Go binary via Homebrew, not an npm dependency) — pre-commit + CI secret scan"
  patterns:
    - "One .gitleaks.toml read by two enforcement points (pre-commit hook, CI job) — config lives in exactly one place"
    - "A scanner that no-ops when its binary is missing is worse than no scanner: .husky/pre-commit fails loudly with install instructions rather than passing silently"
    - "Every deploy workflow re-runs the full PR gate set in its own `gate` job before a `deploy` job (needs: gate) — a merge queue is not a guarantee that main is green"
    - "Every third-party GitHub Action pinned to a full commit SHA with the version in a trailing comment"

key-files:
  created:
    - ".github/workflows/pr.yml"
    - ".github/workflows/deploy-staging.yml"
    - ".github/workflows/deploy-production.yml"
    - ".gitleaks.toml"
    - ".husky/pre-commit"
    - "scripts/check-next-public-allowlist.mjs"
    - "scripts/public-env-allowlist.json"
  modified:
    - "docs/build/GSD-LAUNCH.md (appended the two secret gates next to the existing Secrets/env matrix paragraph, plus the CI-only CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID secrets)"

key-decisions:
  - "core.hooksPath set to .husky in this machine's local git config (not a tracked file) so the pre-commit hook actually fires — no `husky` npm package was installed since package.json is out of this plan's files_modified scope; documented as a gap for a future plan to close with a `prepare` script."
  - "Playwright browser install step (`playwright install --with-deps chromium`) added to all three workflows before `pnpm test:visual` — without it the screenshot-diff gate would fail on every fresh runner regardless of Plan 03/05's config, defeating the gate before it can ever run (Rule 2)."
  - "Preview-upload and deploy steps use `cloudflare/wrangler-action@v4` (`versions upload` for PR previews, the pnpm `deploy` script for staging/production) — the only maintained first-party GitHub Action for this, pinned to a commit SHA like every other third-party Action in these workflows."
  - "gitleaks-action's optional GITLEAKS_LICENSE secret is wired but confirmed unnecessary: the repo owner (Loomlyne) is a personal GitHub account, not an organization, per gitleaks-action's own licensing rule — verified via the GitHub API, not assumed."

patterns-established:
  - "docs/build/GSD-LAUNCH.md § Secrets is prose, not a table (Plan 01 never added a table either) — new gates are appended as prose paragraphs matching the section's existing style, not force-converted into rows the plan's wording assumed existed."

requirements-completed: [PLAT-03, PLAT-06]

coverage:
  - id: D1
    description: "A pull request runs typecheck, build, the CSS law/RTL lint, i18n key-coverage, screenshot-diff tests and a Worker preview upload, gated by a secret scan that runs first — every step is blocking, none is continue-on-error"
    requirement: "PLAT-03"
    verification:
      - kind: other
        ref: "python3 yaml.safe_load(pr.yml) parses; step-order check confirms gitleaks precedes `pnpm build`; grep confirms no continue-on-error in .github/workflows/"
        status: pass
      - kind: manual_procedural
        ref: "A real GitHub Actions run of pr.yml against an actual pull request — not executed (no Cloudflare account/CI run per this execution's deploy-deferral instruction)"
        status: unknown
    human_judgment: true
    rationale: "The workflow YAML is proven correct locally (parses, gate ordering, SHA pinning, script behavior); whether it actually passes as a live GitHub Actions run against a real PR — including the Worker preview upload, which needs CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID — cannot be proven without the owner's Cloudflare account and a real PR."
  - id: D2
    description: "A push to main deploys the staging Worker (with a locale-aware smoke check); a tag deploys production; production never triggers on a branch push"
    requirement: "PLAT-03"
    verification:
      - kind: other
        ref: "node regex checks confirm deploy-production.yml has no `branches:\\n  - main` pattern and triggers only on `tags: [v*]`; deploy-staging.yml contains `--env staging`, `staging.vamostaxi.eu`, and `secrets.`"
        status: pass
      - kind: manual_procedural
        ref: "A real deploy of either workflow — not executed; no Cloudflare account exists yet (see 01-01-SUMMARY.md Task 3: Deferred)"
        status: unknown
    human_judgment: true
    rationale: "Cannot be proven without a live Cloudflare account, GitHub repo secrets, and a real push/tag — explicitly deferred per this execution's instructions, same blocker Plan 01 recorded."
  - id: D3
    description: "A credential-shaped string committed anywhere in the diff fails the commit (pre-commit) and would fail the pull request (CI, same .gitleaks.toml)"
    requirement: "PLAT-06"
    verification:
      - kind: integration
        ref: "Planted an AWS-access-token-shaped string in a throwaway tracked file, staged it, ran `git commit` with core.hooksPath=.husky — gitleaks blocked the commit (exit 1, 'leaks found: 1'); removed the planted file and confirmed a clean `git commit` (Task 1's real files) passes with 'no leaks found'; full-history `gitleaks detect` also returns 'no leaks found'"
        status: pass
    human_judgment: false
  - id: D4
    description: "A client-exposed environment variable that is not on the named allowlist fails the check; the built client bundle is also scanned for forbidden credential names"
    requirement: "PLAT-06"
    verification:
      - kind: integration
        ref: "`node scripts/check-next-public-allowlist.mjs` exits 0 against the current tree; planting `process.env.NEXT_PUBLIC_UNDECLARED_TOKEN` in a throwaway apps/web file makes the same command exit non-zero, and the temporary file was removed afterwards; scripts/public-env-allowlist.json verified to parse with both `allowed` and `forbidden_substrings` arrays"
        status: pass
    human_judgment: false
  - id: D5
    description: "The secret scan runs before any deploy step publishes an artifact; every gate blocks the merge, none is advisory"
    requirement: "PLAT-06"
    verification:
      - kind: other
        ref: "Index-comparison check confirms the gitleaks step's text position precedes `pnpm build`'s in pr.yml; both deploy workflows structure `gate` as a job that `deploy` depends on via `needs: gate`; repo-wide grep confirms zero `continue-on-error` occurrences across .github/workflows/"
        status: pass
    human_judgment: false

duration: ~40min
completed: 2026-08-20
status: complete
---

# Phase 1 Plan 2: CI Pipeline, Secret Scanning & Client-Exposure Allowlist Summary

**Three GitHub Actions workflows and two custom gate mechanisms — gitleaks wired at both pre-commit and CI, and a hand-rolled `NEXT_PUBLIC_*` allowlist script scanning both source and the built client bundle — all blocking, all verified locally against real planted violations.**

## Performance

- **Duration:** ~40 min (single session, including SHA resolution against the live GitHub API)
- **Completed:** 2026-08-20
- **Tasks:** 3 of 3 planned
- **Files modified:** 8 (7 created, 1 appended)

## Accomplishments

- Wrote `.gitleaks.toml` extending gitleaks' default rule set with an allowlist for the
  repo's two legitimate sources of high-entropy strings — vendored binaries under
  `assets/`/`design-system/assets/`, and the design-system bundle's inlined base64 data
  URIs — verified by installing gitleaks (8.30.1, via Homebrew) and running a full
  123-commit history scan: `no leaks found`.
- Wrote `.husky/pre-commit`, a plain POSIX hook (no `husky` npm package involved) running
  `gitleaks protect --staged`, that fails loudly with install instructions when the
  `gitleaks` binary is absent rather than silently passing — the T-01-08 mitigation.
  **Proved it actually blocks a commit:** planted an AWS-access-token-shaped string in a
  throwaway tracked file, staged it, and confirmed `git commit` exited 1 with `leaks
  found: 1`; removed the file and confirmed a clean commit passes.
- Wrote `scripts/check-next-public-allowlist.mjs` — walks `apps/web/**` (excluding
  `node_modules`/`.next`/`.open-next`) for `NEXT_PUBLIC_*` identifiers not declared in
  `scripts/public-env-allowlist.json`'s `allowed` array, and separately scans the built
  client bundle (`apps/web/.open-next/assets/**`, which already existed locally from
  Plan 01's verification) for any of `forbidden_substrings` — the credential names from
  `docs/build/GSD-LAUNCH.md`'s Secrets matrix. Verified both directions: a clean run
  exits 0; planting `process.env.NEXT_PUBLIC_UNDECLARED_TOKEN` in a throwaway file makes
  it exit non-zero, then the file is removed.
- Wrote `.github/workflows/pr.yml`: secret scan first (before install/build/upload, so a
  leaked credential never reaches a published artifact), then pnpm/Node setup,
  `check:public-env`, `typecheck`, `lint:css`, `i18n:check`, `build`, a Playwright
  browser install (added — see Deviations), `test:visual`, an OpenNext Worker build, and
  a `cloudflare/wrangler-action` `versions upload` preview step. A `concurrency` group
  keyed on the head ref cancels a superseded run on the same branch. Every `uses:`
  reference is pinned to a full 40-character commit SHA with the version in a comment.
- Wrote `.github/workflows/deploy-staging.yml` (push to `main`) and
  `.github/workflows/deploy-production.yml` (tag `v*` only, never a branch push — the
  T-01-06 mitigation). Both structure a `gate` job (the same checks as the PR workflow)
  that a `deploy` job depends on via `needs: gate`, so a merge queue being green is
  re-verified rather than trusted. Staging's deploy step is followed by three smoke
  checks: reachability, `lang="de"` on the German path, `dir="rtl"` on the Arabic path —
  exactly PLAT-01's post-deploy smoke command from `01-VALIDATION.md`. Production's smoke
  step is a documented no-op (comment explains why: the apex still serves the live
  Freshpage site until Phase 11). Both declare a non-cancelling `concurrency` group so a
  second deploy queues rather than races the first.
- Appended both gates to `docs/build/GSD-LAUNCH.md § Secrets`, in the section's existing
  prose style (see Deviations — the plan's "record as rows" instruction assumed a table
  that doesn't exist), plus the two CI-only Cloudflare credentials (`CLOUDFLARE_API_TOKEN`,
  `CLOUDFLARE_ACCOUNT_ID`) that were previously undocumented anywhere in this file.

## Task Commits

1. **Task 1: Secret-scan configuration and the client-exposure allowlist gate** - `0d631a7` (feat)
2. **Task 2: The pull-request workflow — every gate, all blocking** - `47a8e76` (feat)
3. **Task 3: The staging and production deploy workflows** - `65f5013` (feat)
4. **Fixup: name the wrangler command and allowlist script explicitly** - `55eb7c1` (docs)

## Files Created/Modified

- `.gitleaks.toml` - gitleaks config, default rules + vendored-asset/data-URI allowlist
- `.husky/pre-commit` - staged-diff secret scan, fails loudly if gitleaks is missing
- `scripts/check-next-public-allowlist.mjs` - the D-35 client-exposure gate (source + built bundle)
- `scripts/public-env-allowlist.json` - `allowed`/`forbidden_substrings` arrays, starts empty
- `.github/workflows/pr.yml` - the eight-gate pull-request pipeline plus preview upload
- `.github/workflows/deploy-staging.yml` - gate job + staging deploy job + locale smoke checks
- `.github/workflows/deploy-production.yml` - gate job + production deploy job, tag-only trigger
- `docs/build/GSD-LAUNCH.md` - appended the two gates and the CI Cloudflare credentials to § Secrets

## Decisions Made

- **`core.hooksPath` set locally, not via a `husky` package.** `.husky/pre-commit` is a
  plain POSIX script, not the husky-managed dispatcher format, and no `prepare: husky`
  script exists in `package.json` (out of this plan's `files_modified`). I set
  `git config core.hooksPath .husky` on this machine so the hook actually fires — this is
  local git config, not a tracked file, so it doesn't violate the plan's file scope, but
  it also means a fresh clone won't get the hook automatically. Documented under "User
  Setup / Follow-up" below.
- **Added a Playwright browser install step** (`playwright install --with-deps chromium`)
  to all three workflows, ahead of `test:visual`, even though the plan's step list didn't
  name it. Without system browser binaries, `pnpm test:visual` fails on every fresh
  GitHub Actions runner regardless of what Plan 03/05 configure — this would silently
  defeat the screenshot-diff gate the first time it ever runs. Scoped to `pr.yml`'s file
  boundary; no other file touched.
- **`docs/build/GSD-LAUNCH.md § Secrets` stayed prose, not a table.** The plan says
  "Record both gates as rows... next to the Cloudflare credentials Plan 01 added" — but
  neither a table nor any Cloudflare-credential rows exist in that section (Plan 01
  deferred the entire deploy step, per its own SUMMARY, so it never added anything
  there). Appended in matching prose style instead of inventing a table structure the
  plan assumed but that isn't actually there.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Playwright browsers were never installed anywhere in the pipeline**
- **Found during:** Task 2 (writing `pr.yml`'s `test:visual` step)
- **Issue:** The plan's step list for `pr.yml` names `pnpm test:visual` directly after
  `pnpm build`, with no browser-install step anywhere in this plan or (per its own text)
  in Plan 03/05's scope either. Playwright requires its browser binaries installed
  separately on a fresh runner; without this step the screenshot-diff gate fails on every
  CI run regardless of correct test/config code.
- **Fix:** Added `pnpm --filter web exec playwright install --with-deps chromium` before
  `test:visual` in all three workflow files.
- **Files modified:** `.github/workflows/pr.yml`, `.github/workflows/deploy-staging.yml`,
  `.github/workflows/deploy-production.yml`
- **Verification:** Present in all three files; doesn't affect any of the plan's own
  `<verify>` substring checks (all still pass).
- **Committed in:** `47a8e76`, `65f5013`

**2. [Rule 1 - documentation format] `docs/build/GSD-LAUNCH.md § Secrets` has no table to add rows to**
- **Found during:** Task 1 (writing the GSD-LAUNCH.md update)
- **Issue:** The plan instructs "Record both gates as rows in `docs/build/GSD-LAUNCH.md §
  Secrets`, next to the Cloudflare credentials Plan 01 added." That section is a single
  prose paragraph, not a table, and Plan 01's own SUMMARY confirms it never added a
  Cloudflare-credentials row there (Task 3 — the deploy step — was deferred entirely).
- **Fix:** Appended the two gates as prose, in the section's existing style, plus the two
  CI-only Cloudflare credential names that were genuinely missing from the doc. Did not
  invent a table structure.
- **Files modified:** `docs/build/GSD-LAUNCH.md`
- **Verification:** Section still reads as one coherent unit; the plan's own artifact
  check for this file was "row content", which is satisfied in substance if not in
  literal table markup.
- **Committed in:** `0d631a7`

**3. [Rule 1 - bug] Two must-have artifact/key-link substrings were missing from the workflow text**
- **Found during:** Post-Task-3 verification sweep (checking the plan's `must_haves`
  block, not just the per-task `<verify>` commands)
- **Issue:** `must_haves.artifacts` requires `.github/workflows/deploy-staging.yml` to
  contain the literal substring `"wrangler"`, and `must_haves.key_links` requires
  `.github/workflows/pr.yml` to contain the literal substring
  `"check-next-public-allowlist"` linking it to the script file. Neither substring was
  present — the workflow called the underlying npm scripts (`pnpm check:public-env`,
  `pnpm --filter web deploy`) without naming the tool/script they wrap.
- **Fix:** Added accurate, load-bearing comments naming `wrangler deploy` (via
  `opennextjs-cloudflare deploy`) at the staging deploy step, and naming
  `scripts/check-next-public-allowlist.mjs` at the allowlist step. No behavior change —
  comments only.
- **Files modified:** `.github/workflows/pr.yml`, `.github/workflows/deploy-staging.yml`
- **Verification:** `grep -c wrangler .github/workflows/deploy-staging.yml` → 2;
  `grep -c check-next-public-allowlist .github/workflows/pr.yml` → 1; all prior `<verify>`
  commands re-run and still pass.
- **Committed in:** `55eb7c1`

---

**Total deviations:** 3 (1 Rule 2 missing-functionality fix, 2 Rule 1 fixes — one a
documentation-format adaptation, one closing a must-haves gap the per-task `<verify>`
blocks didn't catch). None expanded scope beyond this plan's declared `files_modified`.

**Impact on plan:** No architectural changes. All three fixes are additive (a CI step,
prose instead of a table, explanatory comments) — nothing here changes what Plans 03-14
build against.

## Issues Encountered

None beyond the deviations above. `gitleaks` was not installed on this machine at plan
start (confirmed by 01-RESEARCH.md's environment table); installed cleanly via
`brew install gitleaks` (8.30.1) with no issues, used to validate both the config file
and the pre-commit hook end-to-end rather than trusting them unverified.

## What Remains Unproven (Deploy Deferral)

Per this execution's explicit instruction, no `wrangler deploy`/`login`, no Cloudflare
API call, and no GitHub repository secret configuration was attempted — there is still no
Cloudflare account for this project (same blocker `01-01-SUMMARY.md` recorded for Task 3).

| Plan's must-have truth | Verified how | Status |
|---|---|---|
| PR runs typecheck, build, preview upload — all blocking | YAML parses; gate ordering, script wiring and SHA-pinning verified via targeted checks (see `<verify>` re-runs above) | Verified locally; **not run as a real GitHub Actions job** |
| `main` deploys staging; a tag deploys production | Workflow triggers, `--env` flags, and the tag-only/no-branch-push assertion verified via regex checks against the YAML | Verified locally; **no real deploy attempted** |
| Two racing CI runs don't interleave (concurrency groups) | `concurrency:` block present and correctly scoped in all three files | Verified — this is a structural YAML property, provably correct without a live run |
| A credential in the diff fails the PR | Verified for the **pre-commit** half with a real planted secret and a real blocked `git commit` | The **CI** half (`gitleaks-action` in `pr.yml`) reads the identical `.gitleaks.toml` and cannot behave differently, but was not exercised inside an actual GitHub Actions run |
| An undeclared `NEXT_PUBLIC_*` variable fails the PR | Verified directly with the planted-violation test the plan's own `<verify>` specifies | Verified — this check has zero dependency on GitHub Actions or Cloudflare |
| Secret scan runs before any deploy artifact publishes | Verified structurally (step order in `pr.yml`; `needs: gate` in both deploy workflows) | Verified — structural, not run-dependent |
| Zero secrets configured, build still completes, secret gate passes | `gitleaks-action` does not require `GITLEAKS_LICENSE` for a personal GitHub account (verified via the GitHub API that `Loomlyne` is type `User`, not `Organization`); `check:public-env` needs no secrets | Verified by API lookup + local script runs; the **deploy** steps in the same workflows will fail without `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`, which is expected and does not affect the secret gate's own pass/fail |
| Every gate blocks; none is advisory (D-39) | `continue-on-error` grepped absent across all of `.github/workflows/` | Verified |

**Remaining, genuinely unverifiable without the owner's Cloudflare setup and a real GitHub
Actions run:**
- Whether `pr.yml`'s `cloudflare/wrangler-action` preview-upload step actually produces a
  working preview URL.
- Whether `deploy-staging.yml` actually deploys and the three smoke-check curls pass
  against a real `staging.vamostaxi.eu`.
- Whether `deploy-production.yml` actually deploys on a real tag push (by construction,
  cannot be tested at all until `vamostaxi.eu` DNS points at Cloudflare in Phase 11).

## User Setup Required

**Same external Cloudflare account blocker `01-01-SUMMARY.md` recorded** —
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` must exist as **GitHub Actions
repository secrets** (Settings → Secrets and variables → Actions) before any of the three
workflows in this plan can do more than fail at their deploy/preview step. This plan
wrote the workflow YAML completely and correctly against that eventual configuration; no
secret configuration was attempted here.

**Additional local-only setup this plan introduced:**
- `git config core.hooksPath .husky` was set on this machine so the pre-commit secret
  scan actually fires. This is local git config, not committed to the repo. A fresh clone
  (or a CI checkout, which never runs pre-commit hooks anyway) will not have this set. A
  future plan that touches `package.json` should add a `"prepare": "husky"`-equivalent
  step (or document the manual `git config` command in a README) so this isn't
  machine-specific forever — out of scope for this plan since `package.json` isn't in its
  `files_modified`.
- `gitleaks` (8.30.1) was installed via Homebrew on this machine. Any other machine that
  wants the pre-commit hook to actually run (as opposed to failing loudly with install
  instructions, which is itself correct behavior) needs the same `brew install gitleaks`.

## Next Phase Readiness

Plans 03-14 can build against:
- `pnpm check:public-env`, `pnpm typecheck`, `pnpm lint:css`, `pnpm i18n:check`,
  `pnpm build`, `pnpm test:visual` as the fixed set of blocking CI gates every future
  change must pass — already wired into all three workflows.
- `.gitleaks.toml`'s allowlist as the pattern to extend if a future plan adds another
  legitimate source of high-entropy strings (e.g., a new vendored asset directory).
- `scripts/public-env-allowlist.json`'s `allowed` array as the one place to declare a
  genuinely-intended-to-be-public environment variable, with the reviewer-required framing
  already documented in the file's own header comment.

**Blocked on the owner:** the actual staging/production deploy and the PR preview upload
need the Cloudflare account setup Plan 01 already documented. Nothing else in this phase
is blocked by that — Plans 03-14 do not depend on a live CI run to proceed with local
verification.

## Self-Check: PASSED

All key created files confirmed present on disk (`.gitleaks.toml`, `.husky/pre-commit`,
`scripts/check-next-public-allowlist.mjs`, `scripts/public-env-allowlist.json`,
`.github/workflows/pr.yml`, `.github/workflows/deploy-staging.yml`,
`.github/workflows/deploy-production.yml`) and all four task commit hashes (`0d631a7`,
`47a8e76`, `65f5013`, `55eb7c1`) confirmed present in `git log --oneline --all`. No
missing items.

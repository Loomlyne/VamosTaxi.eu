---
quick_id: 261001-wwx
slug: 26-0-main-green-3-tests-and-ci
date: 2026-10-01
branch: fix/main-green-3
scope: tests and CI files only (app code fixes become findings for the controller)
---

# 26.0 main green 3: tests and CI only

Job session for lane B of the control board (2026-10-01 23:50). Controller: `local_633b433a-13a1-4f99-bfe8-3d595717a4a1`.
Own worktree `.claude/worktrees/main-green-3`, own stack `vamos-taxi-mg3` (585xx), spec ports offset 4000 (8100-8499).

## Setup
- Branch `fix/main-green-3` from `origin/main` `d9074011`.
- `fix/e2e-linux-2`: already on main byte for byte (squashed as `f8a2f635`); nothing to bring.
- `ci/e2e-linux-3`: three commits cherry-picked (reusable `e2e-linux.yml`, dev-server logs, totals summary, no remote
  Cloudflare session and one miniflare state per dev server on the runner, 90 s test timeout in the Linux job).
  `apps/web/next.config.ts` changes there are dev-only and env-gated (both variables unset = as before).

## Tasks, in order
1. `confirmation.spec.ts:130` on Linux: find why `[data-confirmation-state=received]` never appears; fix the spec.
2. Mutation gate red since `6ec73c52`: re-mark the stack after every reset, give Vitest its port; prove on an own stack
   (scratch copy with the port rewritten, never 54322) and with a control run of main's gate.
3. Schema CI job: same cause as 2; move it to a reusable `schema.yml` so a `ci/**` push proves it on GitHub.
4. Home reds of `home-red-36.txt`: re-run each on the merged tree; stale spec (fix the spec) or real bug (finding).
5. 48 SiteHeader picture diffs: no rebaseline; before/after picture per state, cause, list for the owner.
6. Gates once at the end (typecheck, lint, lint:css, i18n:check, check:legal-claims, check:numbers, check:public-env,
   check:db-fences, db:seed:check, test:unit, build), own stack stopped. Push without force; a GitHub run where every
   e2e job ends inside its limit. Hand-over `.planning/phases/26.0-main-green/26.0-HANDOVER-3.md`.

Not touched: `.planning/ROADMAP.md`, `.planning/STATE.md`, `.planning/CONTROL-BOARD.md` (job-session rule).

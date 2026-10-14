# Hand-over · quick 261015-isk → Vamos Taxi control session

Branch `quick/i18n-skip-docs`, worktree `.claude/worktrees/i18n-skip-docs`, cut from `origin/main` 0402375e. Not pushed.

**What it is:** docs only. One stale row (`docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` C26) said `CLAUDE.md` still names `data-i18n-skip`; it now names `data-vt-no-i18n` / `translate="no"`. No markup used `data-i18n-skip` (fixed in 26.2), and `.claude/CLAUDE.md` + `CONVENTIONS.md` were already right. Evidence in `261015-isk-SUMMARY.md`.

**To land:** planning-note class (no code, no deploy). Squash onto `main` as `docs(quick-261015-isk): opt-out attribute is data-vt-no-i18n (planning note, no code, no deploy)`, then remove the worktree and branch.

**Note for the controller:** the worktree was first made in `/Users/koss/Developer/vamos-wt/` and moved to `.claude/worktrees/i18n-skip-docs` on 2026-10-15 to follow `CLAUDE.local.md` ("One job, one branch" item 1). Remove it and the branch after landing. `main` also has an untracked `.planning/phases/30-vehicle-class-lifecycle/.gitkeep` that is not from this job.

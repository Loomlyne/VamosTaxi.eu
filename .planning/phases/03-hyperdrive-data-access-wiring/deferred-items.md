# Deferred Items — Phase 3

Out-of-scope discoveries logged during plan execution, per the executor's scope-boundary rule
(only auto-fix issues directly caused by the current task's changes).

## From 03-01 execution (2026-08-24)

- **STATE.md frontmatter `progress.completed_phases` stayed `1` after Phase 2 closed.**
  Phase 2's close commit (`b436f96`, "docs(02): close phase 2 — passed") only touched
  `ROADMAP.md` and `02-VERIFICATION.md` — it never incremented STATE.md's frontmatter
  `progress.completed_phases` (still `1`, i.e. only Phase 1) or `progress.percent` (still `9`,
  i.e. `1/11`), even though Phase 1 (14/14 plans) and Phase 2 (9 SUMMARYs + one owner-attested
  plan) are both fully closed. The body's plan-based progress bar (`73%`, `24/33` plans) was
  correctly recalculated by `state.update-progress` during 03-01's close-out, but the
  frontmatter's phase-based `percent`/`completed_phases` pair is a separate metric that
  `state.update-progress` does not touch, and 03-01's own scope (Plan 1 of Phase 3) is not the
  place to retroactively correct Phase 2's close-out bookkeeping. Pre-existing at the start of
  03-01, not caused by this plan's changes — noted here rather than silently fixed or left
  unexplained.

# Hand-over: GSD bookkeeping (board lane D, B10)

**To:** the control session "VamosTaxi - session control". **From:** the bookkeeping job session, Opus,
2026-10-01 (until about 23:58 +04, by the clock).
**Branch:** `docs/gsd-bookkeeping`, cut from origin/main `d9074011`, in app worktree
`.claude/worktrees/gsd-bookkeeping`, then merged with origin/main `ea1141e7` (no conflict; the merge brought the board notes, the Phase 20
leftovers `3e2bba66` and B7 `ea1141e7`, none of them in a file this job edits). Pushed as a branch only. No PR, no push of main, no deploy,
no database access, no live read. The final commit is the one that adds this file.
**Scope:** planning files only. The controller allowed this job to edit `.planning/STATE.md` and
`.planning/ROADMAP.md`. `.planning/CONTROL-BOARD.md` was not touched.
**Ship as:** a planning note, no code, no deploy.

## What changed

1. **19 new SUMMARY files**, each written from git history, hand-overs and the board, each naming its sources.
   None is a run of the plan; the frontmatter says so.

   | Plan | Written as |
   |---|---|
   | 05-19 | dropped (closure file) |
   | 05-24 | folded into 27.1 and /contact; owner checks left |
   | 05-28, 05-28-B8 | shipped 2026-10-01, `c5157913`, Worker `fae3e473` |
   | 11-12 | owner's step, not executed; the file exists so GSD stops routing to it |
   | 20-04, 20-05 | superseded 2026-09-29 |
   | 20-06, 20-07, 20-08, 20-10 | done or shipped, with commits, Workers and migrations; owner steps listed |
   | 26.0-12 | hand-over landed with `6ec73c52` |
   | 26.1-26 | ship gate done, `cff97a0e` |
   | 26.1-28 | superseded (test bookings deleted by the owner, D-37) |
   | 26.2-03, 26.2-09, 26.2-10 | finished audit units; deferred rows listed |
   | 26.3-23 | shipped `af93fc8e`; `26.3-UAT.md` never written |
   | 27.1-01 | shipped `96a17ab7`, Worker `6eb1d700` |

2. **Plans left without a SUMMARY on purpose** (a SUMMARY would make GSD count them as done):
   - 19-01 to 19-05: status question, below.
   - 20-09: the live proof is not done (no 4242 since the batches, refund by hand never run on live, leftovers not re-probed).
   - 26.2-01, 02, 04, 05, 06, 07, 08, 11, 12: units partly reviewed or never started; close-out not written.

3. **`ROADMAP.md`:**
   - A legend for the checkboxes: `[x]` = no agent work open (shipped, closed, replaced, deferred or owner-held; the line says which).
   - Checklist lines and detail sections for 5.1, 5.2, 6.1, 26.0, 26.2, 26.4.2, 26.5, 27.1 (new) and real states for 4.3, 5, 11, 16, 17, 19, 20, 21 to 25, 26.1, 26.3, 26.4, 26.4.1, 27, 28, 29.
   - 17 and 21 to 25 and 4.3: collapsed to their closed or replaced state with the closure source and the commit (`37e55d26`) that still has the old folders; the full former text is in git history.
   - 11-12 marked as the owner's step; 28 and 29 waiting on the owner's Meta check; 20 open.
   - The progress table and the order line brought to the board of 2026-10-01 23:38 plus `3e2bba66` and `ea1141e7`.
   - A GSD parsing detail: GSD reads a checklist line by its last "Phase N", so the new lines never say "Phase" a second time.
4. **`STATE.md`:** current position = the board's "What is left" lanes plus the two ships after it, last updated 2026-10-01 23:56 (+04);
   GSD routing after this job; the two open questions; blockers. Old history sections kept; stale Phase 21 and
   26.3 resume notes removed.

## GSD output, before and after

Commands: `gsd-sdk query roadmap.analyze`, `gsd-sdk query init.progress`, `gsd-sdk query progress.bar --raw`
(gsd-sdk 1.42.3), in this worktree.

**Before** (origin/main `d9074011`):

```text
roadmap.analyze: phases 34, completed 22, plans 299, summaries 279, 93 %
  current_phase 11, next_phase 17, missing_phase_details ['26.2']
  not complete: 11 partial 11/12 · 17 no_directory · 19 planned 0/5 · 20 partial 3/10 ·
                21-25 no_directory · 26.3 partial 31/32 · 28, 29 no_directory
init.progress: phases 41, completed 25, in_progress 7
  current_phase 11 (in_progress 11/12), next_phase 05.1 (pending 1/0)
  not complete: 05.1 · 11 · 17 · 19 · 20 · 21-25 · 26.0 11/12 · 26.2 0/12 · 26.3 31/32 · 27.1 0/1 · 28 · 29
progress.bar: [██████████████████░░] 304/337 plans (90%)
```

**After** (this branch):

```text
roadmap.analyze: phases 42, completed 38, plans 337, summaries 323, 96 %
  current_phase 20, next_phase 28, missing_phase_details None
  not complete: 20 partial 9/10 · 26.2 partial 3/12 · 28 no_directory · 29 no_directory
init.progress: phases 42, completed 38, in_progress 2
  current_phase 20 (in_progress 9/10), next_phase None
  not complete: 20 9/10 · 26.2 3/12 · 28 not_started · 29 not_started
progress.bar: [███████████████████░] 323/337 plans (96%)
```

GSD no longer points at 11-12 or at a closed phase. Its current phase, 20, is open (plan 20-09); 28 is next and
waits for the owner.

## Open questions for the controller

1. **Phase 19, closed or a launch item?** Not decided here. Sources found, all dated, none in `.planning/decisions/`
   or the phase folder:
   - Closed: board commit `571bf701` (2026-09-30 03:05 +04): "Closed by the owner, 2026-09-30 ('no need for test
     close it'). Nothing committed, nothing created at Cloudflare or Supabase, no paid step." Same commit put
     "CLOSED BY THE OWNER ON 2026-09-30" on top of `.planning/prompts/06-phase-19-surge.md`. The board's
     "Decisions that stand" says the surge test is closed (source: memory, PHASE-CLOSURE).
   - Still wanted: `.planning/HANDOVER-2026-10-01.md` section 9, "Also before launch: the Phase 19 surge test"
     (written by the claude.ai coordinator about 14:10Z on 2026-10-01).
   - `PHASE-CLOSURE-2026-09-29.md` has 19 parked, rewritten and signed (19-01 to 19-05), before the 09-30 closure.
   In the ROADMAP, 19 is `[x]` "DEFERRED, status question open", so no agent starts it. If the owner confirms
   "closed", the controller writes a decision file and marks the five plans superseded; if he wants it, the box
   goes back to `[ ]`.
2. **26.2 audit units on no lane.** 26.2-01 (no re-baseline after 26.0), 02 (10 lib folders unreviewed), 04
   (prices), 05 (API routes), 06 (components), 07 (public pages, middleware, i18n), 08 (`app/home`, `app/pages`,
   `vamos-*.js`), 11 (checkout, Stripe, quote routes, `worker.ts`) and the close-out 12 are not on the board's
   lanes. Also unassigned: 26.2-10 findings A9 to A11 (indexes), deferred rows of 03 and 09. Keep for later, or
   close the audit with what is live?
3. **Small inconsistencies found, not fixed (board and other files are yours):**
   - Board "Shipped" row 09-30 16:39 names `a81e194e` as main for 26.2 hand-over 2; hand-over 2's own commit is
     `99df74b3` (`a81e194e` is the Phase 20 erased-pay-link fix in the same ship).
   - `26.2-HANDOVER-2.md` says the airport fee lead L3 is closed ("Leave as one fare"); the board and
     `HANDOVER-2026-10-01.md` still list "airport fee inside the fare line" as open.
   - `20-10-PLAN.md` on main says "DRAFT — not signed"; the copy on `gsd/phase-20-security-check` and board row
     10f say signed 2026-09-30.
   - `20-09-LIVE.md`, `20-11-TRIAGE-26.2.md` and `20-12-PLAN.md` exist only on `gsd/phase-20-security-check`.
   - `26.3-UAT.md`, the output of 26.3-23, was never written; the owner checks are on the board.
   - Board "What is left" still shows lane R as "fresh review" and B7 as held, though `3e2bba66` (23:49) and
     `ea1141e7` (23:55) are on main; their Worker deploys were not on the board when read (23:56). STATE.md and
     ROADMAP.md say "on main" for both and "deploy not yet on the board".
   - `05.1` has only `05.1-02-SUMMARY.md`; no plan file was ever committed.

## Checks

| Check | Result |
|---|---|
| `git diff --stat origin/main` after the merge | only `.planning/` files: 19 new summaries, `ROADMAP.md`, `STATE.md`, this file |
| GSD queries re-run after the merge | same result as "After" |
| `roadmap.analyze`, `init.progress`, `progress.bar` | as above |
| Every commit hash named in the new files | read with `git log --no-walk` on this branch |
| Code gates (typecheck, lint, tests, build) | not run: no code, test or config file changed; the CI workflows ignore `.planning/**` |

## Not verified

- No live read of any kind: Worker versions and live states are copied from the board, hand-overs and commit
  messages, each named as the source.
- Two research agents (Sonnet, read-only) mapped Phase 20 and 26.2 plans to commits. Every commit they named
  was re-read with git; their reading of the review files was spot-checked (REVIEW-03b, 09, 10), not re-done
  line by line.
- Whether the Phase 20 leftovers migration covers 26.2-10 findings A1, A5, A6 and A7 exactly was not re-checked.

## After the ship

Delete branch `docs/gsd-bookkeeping` and the worktree `.claude/worktrees/gsd-bookkeeping` (archive tag first,
your rule). No database stack was started.

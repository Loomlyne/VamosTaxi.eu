# Hand-over: test lab and Sonnet tester (quick 261003-lxr)

**For:** the controller (session `004ad4f0`). **Written:** 2026-10-03 16:26 +0400.
**Branch:** `feat/test-lab`, cut from origin/main `cd047a59`, worktree `.claude/worktrees/test-lab`.
Owner's request (2026-10-03): testing must cost less; Sonnet runs it from a clean Opus instruction.

**Files:** `scripts/test-lab/{lab.sh,seed-live-like.sql,lab-browser.mjs,example-booking.mjs}`, `.claude/agents/vamos-tester.md`,
`.planning/templates/TEST-BRIEF.md`, `docs/runbook/test-lab.md`, this quick folder. No site code, no migration, no deploy.
Nothing under `apps/` or `packages/` changes. The repo's `scripts/test-lab/` is outside every gate's scan root.

**Proof:** `SUMMARY.md` here (self-test 7/7, Sonnet brief run 6/6 in 68 s / 72k tokens, destroy clean, gates pass).

**After it lands:** a new session can call `Agent(subagent_type: "vamos-tester", prompt: "Run the brief at <path>")`.
Suggested line for `CLAUDE.local.md` → How to work: "Browser and flow checks go through the test lab: the lead writes
`.planning/templates/TEST-BRIEF.md`, `vamos-tester` (Sonnet) runs it (`docs/runbook/test-lab.md`). A lab run is never proof for live;
the 4242 payment after deploy still is."

## Recheck, 2026-10-03 17:3x-18:0x (+04), on main `0111ab67`

- Fresh lab from nothing (`up chk --rebuild`): self-test 7/7.
- **Changed: the lab now runs like live** (no `VAMOS_QS_SECRET`; `LAB_QS_SECRET=1` to add). With the secret the lab hid the live
  "Too many prices" refusal. Like live, the self-test fails S5/S7 on main with `429` on `/api/geo/suggest` and `/api/quote/reprice`;
  with `fix/quote-rate-buckets` merged (temporarily, not committed) it passes 7/7 with zero 429s. That is independent proof for that fix.
- Sonnet tester (reading the agent file itself) on `RECHECK-BRIEF.md`: T4, T6 pass; T1-T3 fail on the same live 429; T5 failed on a
  helper race (sign-in typed before the page was ready), fixed and re-run 3/3. Details in `evidence/recheck/RESULT.md`.
- Order for the controller: land `fix/quote-rate-buckets` before or with this, otherwise every brief that books on home hits the live 429.
- Lab `chk` destroyed; no `vamos-lab` container or state dir left.

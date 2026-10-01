---
phase: 20-security-audit-fixup
plan: 07
status: complete
completed: 2026-09-30
written_by: GSD bookkeeping job B10, 2026-10-01, from git history and the control board
---

# 20-07 summary: fix the serious findings

**Outcome: done.** The serious findings were F1, F2 and F3.

- F1 (pay link no longer opens Manage booking) and F2 (dashboard Support read-only): Phase 20 batch A, main `e8aaad0b` (2026-09-30 12:35 +04), Worker `a0d38f64`, batch A migrations `20261005100000` and `110000`. The per-finding commits are on `origin/gsd/phase-20-security-check` only.
- F3 (pay-button limit: 5 presses per quote, about 8 per minute per visitor): built by 26.5, main `9a5263cd` (2026-09-30 14:55 +04), Worker `2d5906ce`, migration `20261001130000`.
- Re-probed on live from outside: all hold (board, section "Security (Phase 20)").

**Left:** nothing.

**Sources:** `.planning/CONTROL-BOARD.md` "Shipped" rows 09-30 12:38 and 14:57, "Security (Phase 20)" rows A and "with 26.5".

---
phase: 20-security-audit-fixup
plan: 08
status: complete; one fix waits for an owner step
completed: 2026-10-01
written_by: GSD bookkeeping job B10, 2026-10-01, from git history and the control board
---

# 20-08 summary: the owner decides the rest, one finding per question

**Outcome: every decision taken; the fixes he chose are live except F15.** Decisions F1 to F14 are in `20-06-FINDINGS.md`, section "Owner decisions (20-08)", dated 2026-09-30.

| Batch | Main | Worker | Migration |
|---|---|---|---|
| A (F5, F10, F13) | `e8aaad0b` 2026-09-30 | `a0d38f64` | `20261005100000`, `110000` |
| B1 (F6, F8, F14 lock secret, G2, G20, G27) | `88e6b827` 2026-09-30 | `f3f7d929` | `20261005120000` |
| 20-12 erased-booking pay link | `a81e194e` 2026-09-30 | `f3f7d929` | `20261005130000` |
| C1 (F17, G14, G15, G17, G22, F14 edit request) | `1a105d25` 2026-10-01 | `832b884e` | `20261005150000` |
| C2 (F12 sign-in confirm, F16 dashboard files off the public host, /dev headers) | `34c726db` 2026-10-01 | `7fa342a7` + gateway `71a307da` | none |
| E-mail change can finish | `11559467` 2026-10-01 | `38063b7d` | none |

Accepted, no work: F4, F7, F9. Refunds by hand (F11) is its own plan, 20-10.

**Left:**
- F15, Cloudflare Web Analytics: the owner switches off the automatic setup in Cloudflare, then B7 (`claude/project-thread-6r5gz9`, PR #66) ships; then G23 (drop `maps.googleapis.com` from CSP `connect-src`).
- The G rows come from the 26.2 triage, not from this plan. G7, G10, G11, G12, G28: on main as `3e2bba66` (2026-10-01 23:49 +04), migration `20261007180000` applied on live and read back (commit message); the Worker deploy for G28 was not yet on the board when read at 23:53. G8 and G9 (drop the price-band tables): after P6.

**Sources:** `20-06-FINDINGS.md`; `.planning/CONTROL-BOARD.md` "Shipped" table, "Security (Phase 20)" and "What is left"; `git log` of the commits above.

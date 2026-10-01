---
phase: 20-security-audit-fixup
plan: 06
status: complete, with deviations
completed: 2026-09-30
written_by: GSD bookkeeping job B10, 2026-10-01, from git history and the planning files
---

# 20-06 summary: security check of the changed app (find, do not fix)

**Outcome: done.** `20-06-FINDINGS.md` is on main (last touched by `e8aaad0b`, 2026-09-30 12:35 +04). Written 2026-09-30 03:00 to 03:45 against Worker `a55b2c19` (code `e27014c1`). Findings F1 to F14; F15 to F17 were added later in `20-09-LIVE.md`. The one TEST SECURITY booking (VT-26-0745) is gone.

**Deviations:**
- The plan said to run after 26.0 and 26.2; it ran before them.
- 26.4.2, 26.5 and 27 were not on main at the time and were not checked. Whether 26.4.2 and 27 got a security read later is not recorded.

**Left:** the ships after 2026-09-30 (extras, P1 class change, chauffeurs by class, /confirmation, 27.1) have no security check recorded. The 26.2 audit rows were triaged separately in `20-11-TRIAGE-26.2.md` (on `origin/gsd/phase-20-security-check` only, not on main): 29 rows, none serious.

**Sources:** `20-06-FINDINGS.md`; `git log e8aaad0b`; `.planning/HANDOVER-2026-10-01.md` 13:02Z row (Phase 20 re-check).

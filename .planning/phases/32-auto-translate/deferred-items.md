# Phase 32 deferred items

## Found during 32-07 (out of scope, not fixed)

- `apps/web/lib/ops/ops-session-lost.test.ts` > "finds the shell's route screens…" fails: `expected 12 to be greater than or equal to 13` (line 349). Cause: plan 32-03 (`739d55d8`) removed the OpsContent Pages/Legal screens, so the dashboard shell now has 12 route screens. The pin needs lowering to 12 with the reason in the label (owner of the fix: plan 32-03 follow-up or the plan-12 gate run). Plan 32-07 touches no `.dc.html` file. **Fixed 2026-10-14 by the orchestrator: pin lowered to 12 and OpsContent asserted absent.**

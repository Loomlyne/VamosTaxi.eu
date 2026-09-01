# Phase 6: Ops Reference Data & Content Console - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-01
**Phase:** 06-ops-reference-data-content-console
**Areas discussed:** Production UI, React ops console, live data, replan

---

## Production UI

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 6 React console | Next `(ops)` routes replace the mock | |
| DC mock as production | `app/ops/*.dc.html` is the only ops UI | ✓ |

**User's choice:** Wire the mock. It is the production-ready one. Connected to real data.
**Notes:** Owner captured `/app/ops/ops-login` vs a second Next login and called it two profiles. D-34 (mock dies) is reversed.

---

## React ops console

| Option | Description | Selected |
|--------|-------------|----------|
| Keep React, hide it | Leave `(ops)` routes in the tree | |
| Fully delete React ops | Remove the Phase 6 React surface | ✓ |

**User's choice:** Fully delete the React that was created. Only the mock.
**Notes:** "I don't need it anymore." Replan every Phase 6 wave.

---

## Claude's Discretion

How mock JS talks to existing staff APIs (`POST /api/auth`, `asStaff` actions). Which React files are deleted vs which API routes stay. Wave split on replan.

## Deferred Ideas

- Live paid board, assign, refund, phone booking, Realtime — Phase 8
- Checkout — Phase 7
- MFA / `aal2` — paused until owner asks

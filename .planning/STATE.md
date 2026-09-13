---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: v1.0 Vamos Taxi V1
status: executing
stopped_at: Phase 18 wave 4 plan 18-04 complete. Next: 18-05 Draft staff APIs.
last_updated: "2026-09-13T22:30:30.000Z"
last_activity: 2026-09-14 -- 18-04 Publish-only flip; public_chf still false
progress:
  total_phases: 18
  completed_phases: 11
  total_plans: 168
  completed_plans: 156
  percent: 93
---

# Project State

**Project:** Vamos Taxi
**Milestone:** v1.0 Vamos Taxi V1
See: .planning/PROJECT.md (updated 2026-09-04)

**Core value:** quote → pay → confirmation. Lifecycle after pay is Phase 9.
**Current focus:** Phase 18 — OPS Pricing source of truth

## Current Position

Phase: 18 (OPS Pricing source of truth) — EXECUTING
Plan: 4 of 10 complete
Status: Wave 4 plan 18-04 complete. Next: 18-05 Draft staff APIs.
Last activity: 2026-09-14 -- 18-04 Publish-only flip; public_chf still false

## Performance Metrics

- **v1.0 Core:** Phases 1–11 complete (11-12 owner Publish still open; does not block 18).
- **v1.1:** Phase 12 complete. 13–17 parked.

| Phase | Plan | Duration | Notes |
|-------|------|----------|-------|
| Phase 18 P03 | 5min | 3 tasks | 9 files |
| Phase 18 P04 | 5min | 3 tasks | 5 files |

## Blockers

Owner Publish on `https://dashboard.vamostaxi.site/pricing` still turns public CHF on. Stripe live keys and Search Console submit stay owner-gated. Restore drill deferred (Free plan). Never restore onto yaumjzvylngfjhtuffqs. No `vamostaxi.eu`.

## Session Continuity

Last session: 2026-09-14
Stopped at: 18-04 complete (Publish-only flip). Next: 18-05 Draft staff APIs.
Resume: `/gsd:execute-phase 18`

## Decisions

- [Phase 18]: D-11 live distance fare is start + all-km per-km + classBandExtrasRappen; no 20 km / min_fare floor — Owner recipe D-11/D-12; Wave 0 fixtures from 18-01 are now green
- [Phase 18]: Publish is the only public flip — one asStaff tx sets live, public_chf true, and vat_rate_bps, then forkLiveRateVersion clones a draft. Dispatcher cannot publish; last successful admin wins with not-draft.

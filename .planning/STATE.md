---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: v1.0 Vamos Taxi V1
status: executing
stopped_at: Phase 18 wave 8 plan 18-10 complete. Owner authorized Worker vamos deploy.
last_updated: "2026-09-14T06:48:16.000Z"
last_activity: 2026-09-14 -- 18-10 D-40 gates; deploy authorized; public_chf still false
progress:
  total_phases: 18
  completed_phases: 11
  total_plans: 168
  completed_plans: 162
  percent: 96
---

# Project State

**Project:** Vamos Taxi
**Milestone:** v1.0 Vamos Taxi V1
See: .planning/PROJECT.md (updated 2026-09-04)

**Core value:** quote → pay → confirmation. Lifecycle after pay is Phase 9.
**Current focus:** Phase 18 — OPS Pricing source of truth

## Current Position

Phase: 18 (OPS Pricing source of truth) — COMPLETE (plans 10/10)
Plan: 10 of 10 complete
Status: Wave 8 plan 18-10 complete. Owner authorized Worker vamos staging deploy; agent did not Publish.
Last activity: 2026-09-14 -- 18-10 D-40 gates; deploy authorized; public_chf still false

## Performance Metrics

- **v1.0 Core:** Phases 1–11 complete (11-12 owner Publish still open; does not block 18).
- **v1.1:** Phase 12 complete. 13–17 parked.

| Phase | Plan | Duration | Notes |
|-------|------|----------|-------|
| Phase 18 P03 | 5min | 3 tasks | 9 files |
| Phase 18 P04 | 5min | 3 tasks | 5 files |
| Phase 18 P05 | 22min | 3 tasks | 24 files |
| Phase 18 P06 | 29min | 3 tasks | 6 files |
| Phase 18 P07 | 10min | 3 tasks | 11 files |
| Phase 18 P08 | 14min | 3 tasks | 28 files |
| Phase 18 P09 | 17min | 3 tasks | 19 files |
| Phase 18 P10 | 12min | 3 tasks | 1 file |

## Blockers

Owner Publish on `https://dashboard.vamostaxi.site/pricing` still turns public CHF on. Stripe live keys and Search Console submit stay owner-gated. Restore drill deferred (Free plan). Never restore onto yaumjzvylngfjhtuffqs. No `vamostaxi.eu`.

## Session Continuity

Last session: 2026-09-14
Stopped at: 18-10 complete (D-40 grep + owner authorized deploy). Next: hard-refresh /pricing; do not click Publish.
Resume: none for Phase 18 plans.

## Decisions

- [Phase 18]: D-11 live distance fare is start + all-km per-km + classBandExtrasRappen; no 20 km / min_fare floor — Owner recipe D-11/D-12; Wave 0 fixtures from 18-01 are now green
- [Phase 18]: Publish is the only public flip — one asStaff tx sets live, public_chf true, and vat_rate_bps, then forkLiveRateVersion clones a draft. Dispatcher cannot publish; last successful admin wins with not-draft.
- [Phase 18]: Overlay Save / VAT / coupons / classes stay on the draft. Preview loads the draft id via asStaff (quote_rate_book(true) still returns live after Publish). Test unpaid cites live rate_version_id for the charge gate, writes draft amounts, sets is_test; account Pay is off.
- [Phase 18]: dashboard.vamostaxi.site/pricing is the five-tab fare book; /coupons is gone; dispatcher /pricing is not found. Preview recap is the only draft CHF — never Stripe, never public preferDraft.
- [Phase 18]: Checkout extras are published extra-chip rows (automatic night/weekend/holiday/waiting never chips). Extra stop is D-11 on Mapbox places capped at max_extra_stops, not amount × qty. Both pins inside the published polygon; coupon still floors payable at 0 before VAT.
- [Phase 18]: Unpaid quotes keep locked snapshot CHF until quote_lock_expires_at then auto-cancel; webhook after expiry/cancel/is_test does not capture; price-changed and expired mails skip-send until owner English exists
- [Phase 18]: Extra wait after free wait is CHF 0 at pay; meet & greet and free airport wait are two default-on cards; ops mark-arrival writes booking_legs.arrived_at; no off_session / waiting PaymentIntent capture
- [Phase 18]: D-40 — Worker vamos, no .eu bind, no sk_live_, 18-02 SQL does not set public_chf. First public CHF remains owner Publish. Deploy does not flip public_chf.

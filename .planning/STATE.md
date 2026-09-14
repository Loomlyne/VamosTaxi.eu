---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Phase 18 In Progress (restart D-01…D-35). 18-01…18-06 done. 18-07 SQL applied; owner Publish UAT next.
stopped_at: Hosted SQL applied — owner Publish UAT on .site
last_updated: "2026-09-14T17:25:00.000Z"
last_activity: 2026-09-14 -- owner apply of 20260914190000 and 20260914191000 on Zurich
progress:
  total_phases: 19
  completed_phases: 9
  total_plans: 165
  completed_plans: 158
  percent: 48
---

# Project State

**Project:** Vamos Taxi
**Milestone:** v1.0 Vamos Taxi V1
See: .planning/PROJECT.md (updated 2026-09-04)

**Core value:** quote → pay → confirmation. Lifecycle after pay is Phase 9.
**Current focus:** Phase 18 — OPS Pricing source of truth

## Current Position

Phase: 18 (OPS Pricing source of truth) — IN PROGRESS (restart 2026-09-14)
Plan: 18-07 owner Publish UAT. 6/7 executed; hosted SQL applied.
Status: 18-01…18-06 done. 20260914190000 and 20260914191000 on Zurich. Agent did not Publish. `archive-2026-09-13/` is history — do not execute.
Last activity: 2026-09-14 -- owner apply of quote_rate_book live-classes + vehicle_class name/photo

## Performance Metrics

- **v1.0 Core:** Phases 1–11 complete (11-12 owner Publish still open; does not block 18).
- **v1.1:** Phase 12 complete. 13–17 parked.
- **Phase 18 restart:** 6/7 plans executed. Ignore archived P03–P10 durations (those were 2026-09-13).

## Blockers

Owner Publish on `https://dashboard.vamostaxi.site/pricing` is the live-book flip. Stripe live keys and Search Console stay owner-gated. Agent does not click Publish. Agent does not `supabase db push`. Never restore onto yaumjzvylngfjhtuffqs. No `vamostaxi.eu`. No `sk_live_`.

## Session Continuity

Last session: 2026-09-14T17:25:00.000Z
Stopped at: Hosted SQL applied via db query --linked (not db push, not restore). Next: owner UAT on dashboard.vamostaxi.site /pricing then vamostaxi.site. Agent does not Publish.
Resume: `.planning/phases/18-ops-pricing-source/18-07-PLAN.md` Task 3 owner UAT bullets

## Decisions

Restart 2026-09-14 **supersedes** 2026-09-13 D-01…D-40. Full text: `.planning/phases/18-ops-pricing-source/18-CONTEXT.md`.

- [Phase 18]: Save writes draft only. Typing without Save is gone. Publish is the only public flip, all-or-nothing, with a change-list confirm and jump-to-gap. Failed Publish keeps the draft.
- [Phase 18]: After Publish, `/pricing` shows the **live book**. Do not `forkLiveRateVersion` in the Publish tx. Next Save starts a new draft. Discard confirm returns live; public unchanged.
- [Phase 18]: Four tabs only — Fixed routes · Distance rules · Surcharges & extras · Coupons. **No History. No Preview. No test unpaid** on this page. VAT % on the sticky rail, Save VAT, still waits for Publish.
- [Phase 18]: `/pricing` is admin only. One staff account. Do not invent a dispatcher role on this page.
- [Phase 18]: Distance money is start + (all km × per-km) + bands on top (example 100 + 14.6×12 = CHF 275.20). No region %. Band overlap blocks Publish. Charge CHF.
- [Phase 18]: Public home/checkout/quote offer **only** live-book classes. No hardcoded Economy / Business / First / Van ladder. Delete + Publish = gone. Hide-from-public still listed, Select off, CHF 000.
- [Phase 18]: Surcharges tab is one list. Checkout extras (including ski) come from that list. No night/weekend/holiday types. Quote lock is hardcoded 24h, not a field.
- [Phase 18]: Extra wait is not in Stripe pay-now. Meet & greet and free airport wait always on. Extra stop max 1, Mapbox unfenced.
- [Phase 18]: Worker `vamos`, no `.eu` bind, no `sk_live_`. New SQL is owner-apply. First public CHF remains owner Publish. Deploy does not flip `public_chf`.
- [Phase 18]: Owner UAT 2026-09-14 failed (homepage still invented Economy after delete+Publish). Phase 18 is not complete until live UAT on `vamostaxi.site` / `dashboard.vamostaxi.site` passes under D-01…D-35.

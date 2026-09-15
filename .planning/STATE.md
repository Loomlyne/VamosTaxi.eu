---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 13-01-PLAN.md
last_updated: "2026-09-15T13:48:55.671Z"
last_activity: 2026-09-15
progress:
  total_phases: 19
  completed_phases: 10
  total_plans: 175
  completed_plans: 160
  percent: 53
---

# Project State

**Project:** Vamos Taxi
**Milestone:** v1.0 Vamos Taxi V1
See: .planning/PROJECT.md (updated 2026-09-15 after Phase 18)

**Core value:** quote → pay → confirmation. Lifecycle after pay is Phase 9.
**Current focus:** Phase 13 — Staff APIs + outbound Resend replies

## Current Position

Phase: 13 (Staff APIs + outbound Resend replies) — EXECUTING
Plan: 2 of 10
Status: Ready to execute
Last activity: 2026-09-15

## Performance Metrics

- **v1.0 Core:** Phases 1–11 complete (11-12 owner Publish still open; does not block 13).
- **v1.1:** Phase 12 complete. Phase 18 complete. Next 13 → 14 → 15 → 16 → 17.
- **Phase 18 restart:** 7/7 plans + 18-UAT (7/7 pass) + 18-VERIFICATION passed.

## Blockers

Stripe live keys and Search Console stay owner-gated. Agent does not click Publish. Agent does not `supabase db push`. Never restore onto yaumjzvylngfjhtuffqs. No `vamostaxi.eu`. No `sk_live_`. `11-12` remains owner-gated and does not block Phase 13.

## Session Continuity

Last session: 2026-09-15T13:48:35.927Z
Stopped at: Completed 13-01-PLAN.md
Resume: `$gsd-execute-phase 13`

## Decisions

- [Phase 13]: Staff reply From target is plus-address on `replies.vamostaxi.site`; until Resend verifies that domain, From stays `noreply@vamostaxi.site` and Reply-To is the plus-address. Subject is always `Re:` the contact-ack. BCC `info@` via Resend. Fail closed — no EMAIL. Empty/Closed refuse. Overlay already PATCHes `{ reply }`; generic send error. Brand pass over all `packages/emails` in this phase. Full text: `.planning/phases/13-staff-apis-outbound-resend-replies/13-CONTEXT.md`.

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
- [Phase 18]: Closed 2026-09-15 — 18-UAT 7/7 pass, 18-VERIFICATION passed. Agent did not Publish.
- [Phase 13]: Wave 0 web tests lock GET RFC identity, BCC info@, fail-closed send, unminted Message-ID, overlay sendError. From stays noreply; Reply-To is plus-address. GREEN is 13-03/13-07/13-09. — CONTEXT D-01 to D-12. Tests-only plan; production send files not edited.

## Performance Metrics

| Phase | Plan | Duration | Notes |
|-------|------|----------|-------|
| Phase 13 P01 | 10min | 3 tasks | 5 files |

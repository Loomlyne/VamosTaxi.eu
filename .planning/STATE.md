---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Phase 16 plans checker-approved. Execute on gsd/phase-16-staging-mx-end-to-end-uat worktree.
last_updated: "2026-09-18T13:20:00.000Z"
last_activity: 2026-09-18
progress:
  total_phases: 19
  completed_phases: 14
  total_plans: 185
  completed_plans: 179
  percent: 97
---

# Project State

**Project:** Vamos Taxi
**Milestone:** v1.0 Vamos Taxi V1
See: .planning/PROJECT.md (updated 2026-09-15 after Phase 18)

**Core value:** quote → pay → confirmation. Lifecycle after pay is Phase 9.
**Current focus:** Phase 17-06 executed on `gsd/phase-17-06-chauffeur-desk`. Live UAT after owner **continue** (Worker `vamos` deploy). Phase 19 parked. Do not `state.begin-phase` onto 19.

## Current Position

Phase: 16 (Staging MX + end-to-end UAT) — PLANNED
Plan: 0
Status: Ready to execute (16-01 → 16-04)
Last activity: 2026-09-18

## Performance Metrics

- **v1.0 Core:** Phases 1–11 complete (11-12 owner Publish still open; does not block 13).
- **v1.1:** Phase 12–15 complete on main (#28, #38, #40, #39). Phase 18 complete. Next 16 → 17.
- **Phase 18 restart:** 7/7 plans + 18-UAT (7/7 pass) + 18-VERIFICATION passed.

## Blockers

Stripe live keys and Search Console stay owner-gated. Agent does not click Publish. Agent does not `supabase db push`. Never restore onto yaumjzvylngfjhtuffqs. No `vamostaxi.eu`. No `sk_live_`. `11-12` remains owner-gated and does not block Phase 13.

## Session Continuity

Last session: 2026-09-18T13:20:00Z
Stopped at: Phase 16 plans checker-approved (UI-SPEC APPROVED, plan-checker APPROVED).
Resume: `$gsd-execute-phase 16` on worktree `.worktrees/phase-16` / `gsd/phase-16-staging-mx-end-to-end-uat`. Do not start Phase 17. Do not switch the dirty `feat/17-ops-chauffeur-desk` checkout.

## Accumulated Context

### Roadmap Evolution

- Phase 19 added: V1 production close-out leftover live gates and 10k booking surge (2026-09-18). Parked. Hard gate in ROADMAP. Current stays 17 leftover live close.

## Decisions

- [Phase 14]: Plans signed 2026-09-18. 7 plans / 6 waves. INB-02. Closed+inbound → Responded (D-04; ROADMAP “stays closed” dead). Unmatched ≠ ticket. Plus-token then RFC, never From. Inbound files on SUPPORT_FILES. No MX. No `#support` chrome. No `state planned-phase` while 13 owns current. Full text: `.planning/phases/14-inbound-webhook/14-CONTEXT.md`.
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
- [Phase 13]: Wave 0 emails tests lock staff-reply name/booking_ref/Re:/no WhatsApp, Confirmation wordmark PNG, auth no-Arial, skip-send missing-copy. GREEN is 13-04/13-05. Tests-only; production chrome/contact/layout/send not edited. — CONTEXT D-02 D-03 D-04. StaffReplyEmailData stays { reply } until 13-05; extra keys via type assertion. claimThenSend skip-send must be ok false missing-copy, not ok true skipped.

## Performance Metrics

| Phase | Plan | Duration | Notes |
|-------|------|----------|-------|
| Phase 13 P01 | 10min | 3 tasks | 5 files |
| Phase 13 P02 | 8min | 3 tasks | 4 files |

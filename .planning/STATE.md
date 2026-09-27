---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Meta measurement
status: Ready to discuss
stopped_at: Phase 26.1 planned (31 plans, 18 waves); waiting for owner plan-gate signature
last_updated: "2026-09-27T21:24:06.468Z"
last_activity: 2026-09-23
progress:
  total_phases: 31
  completed_phases: 17
  total_plans: 246
  completed_plans: 204
  percent: 55
---

# Project State

**Project:** Vamos Taxi
**Milestone:** v1.3 Meta measurement
See: .planning/PROJECT.md (updated 2026-09-23)

**Core value:** quote → pay → confirmation. v1.3 measures ads only. It does not change pay.
**Current focus:** Phase 26 lock is on `gsd/phase-26-legal-gate`, not live. Next is discuss-phase 27. Do not execute 27. Do not load the pixel. v1.2 Phases 21–25 stay planned. No `sk_live_`. No `.eu`.

## Current Position

Phase: 27
Plan: Not started
Status: Ready to discuss
Last activity: 2026-09-23

Phase 21 execution note (not current): planning complete — 8 plans. Execution started 2026-09-22 on `gsd/phase-21-charge-gate`. That position was Phase 21 EXECUTING, plan 1 of 8. Phase 21 is not complete. Do not execute Phase 16/17/19/20. Do not touch the main checkout from that branch note.

## Performance Metrics

- **v1.0 Core:** Phases 1–11 complete (11-12 owner Publish still open; does not block 13).
- **v1.1:** Phase 12–15 complete on main (#28, #38, #40, #39). Phase 18 complete. Next 16 → 17.
- **Phase 18 restart:** 7/7 plans + 18-UAT (7/7 pass) + 18-VERIFICATION passed.

## Blockers

Stripe live keys and Search Console stay owner-gated. Agent does not click Publish. Agent does not `supabase db push`. Never restore onto yaumjzvylngfjhtuffqs. No `vamostaxi.eu`. No `sk_live_`. `11-12` remains owner-gated and does not block Phase 13.

## Session Continuity

Last session: 2026-09-27T21:24:06.431Z
Stopped at: Phase 26.1 planned (31 plans, 18 waves); waiting for owner plan-gate signature
Resume: `/gsd:discuss-phase 27`. Do not execute 27. Do not load the pixel. Do not execute Phase 21 while v1.3 is current. Payment plans stay on disk. Do not execute Phase 16/17/19/20. Do not `phases.clear`.

Phase 21 branch session (2026-09-22T19:57:29.795Z, not the resume): Stopped at Phase 21 planning complete — 8 plans. Resume was: Phase 21 executing on gsd/phase-21-charge-gate. Do not execute Phase 16/17/19/20. Do not touch the main checkout.

## Accumulated Context

### Roadmap Evolution

- Phase 19 added: V1 production close-out leftover live gates and 10k booking surge (2026-09-18). Parked. Hard gate in ROADMAP. Current stays 17 leftover live close.
- Phase 20 added: Security audit fix-up (2026-09-19). Does not begin Phase 19. Owner SQL. No `.eu`. No `sk_live_`.
- Phases 21–25 added: v1.2 Payment (2026-09-22). PAY-08…PAY-18. Leftovers 16/17/19/20 unchanged.
- v1.3 started (2026-09-23): Meta measurement. Phase 21 is not current. Do not `phases.clear`.
- Phases 26–29 approved (2026-09-23): v1.3 Meta measurement. META-01…META-14. Next is discuss-phase 26. Phase 21 is not current.
- Phase 26 lock shipped (2026-09-24) on `gsd/phase-26-legal-gate`. Empty slots. Flag is the literal false. Policy version stays `2026-09-12`. Not merged. Pixel stays off until the owner pastes the four-language lines.
- Phase 21 execution on `gsd/phase-21-charge-gate` (2026-09-22): planning complete — 8 plans; execution started. Plans 21-01…21-08 stay checked. Progress stays 10/10 in progress. Phase 21 is not complete. Do not execute Phase 16/17/19/20.

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

---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Meta measurement
status: planning
stopped_at: Phase 26.3 context signed 2026-09-29; next UI-SPEC (/gsd-ui-phase 26.3)
last_updated: "2026-09-28T20:26:15.303Z"
last_activity: "2026-09-29 - Phase 26.3 discuss signed by the owner (42 decisions, 26.3-CONTEXT.md)"
progress:
  total_phases: 32
  completed_phases: 18
  total_plans: 246
  completed_plans: 234
  percent: 56
---

# Project State

**Project:** Vamos Taxi
**Milestone:** v1.3 Meta measurement
See: .planning/PROJECT.md (updated 2026-09-23)

**Core value:** quote → pay → confirmation. v1.3 measures ads only. It does not change pay.
**Current focus:** Phase 26.1 — Payment and pricing integrity

## Current Position

Phase: 26.3 (Booking flow rebuild) — CONTEXT SIGNED 2026-09-29, next UI-SPEC
Branch/worktree: `gsd/phase-26.3-booking-flow` in `/Users/koss/Developer/vamos-wt/phase-26.3` (cut from 2c8c4592)
Status: 26.1 shipped (cff97a0e + 550ee4f2, e5a6ddc7, 2c8c4592; live Worker 8285cabb). Owner's repeat of 26.1 UAT step 1 FAILED; folded into 26.3 success criterion 1. 26.2 comes after 26.3 (D-03).
Last activity: 2026-09-29 - 26.3 discuss signed

Phase 21 execution note (not current): planning complete — 8 plans. Execution started 2026-09-22 on `gsd/phase-21-charge-gate`. That position was Phase 21 EXECUTING, plan 1 of 8. Phase 21 is not complete. Do not execute Phase 16/17/19/20. Do not touch the main checkout from that branch note.

## Performance Metrics

- **v1.0 Core:** Phases 1–11 complete (11-12 owner Publish still open; does not block 13).
- **v1.1:** Phase 12–15 complete on main (#28, #38, #40, #39). Phase 18 complete. Next 16 → 17.
- **Phase 18 restart:** 7/7 plans + 18-UAT (7/7 pass) + 18-VERIFICATION passed.

## Blockers

Stripe live keys and Search Console stay owner-gated. Agent does not click Publish. Agent does not `supabase db push`. Never restore onto yaumjzvylngfjhtuffqs. No `vamostaxi.eu`. No `sk_live_`. `11-12` remains owner-gated and does not block Phase 13.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260928-lux | Fix phone booking dead end: Show fixed prices goes to checkout trip | 2026-09-28 | 1ef815c3 | [260928-lux-fix-phone-booking-dead-end-show-fixed-pr](./quick/260928-lux-fix-phone-booking-dead-end-show-fixed-pr/) |
| 260928-cpn | Coupon recovery after a failed reprice; ops detail wording ar, fr, de | 2026-09-28 | 22c7fb3a | [260928-cpn-coupon-recovery-failed-reprice](./quick/260928-cpn-coupon-recovery-failed-reprice/) |
| 260928-rld | Reprice invalidates the stored payment session; Pay recovers without a card form | 2026-09-28 | 34e43d9e | [260928-rld-stored-session-and-pay-recovery](./quick/260928-rld-stored-session-and-pay-recovery/) |
| 260928-lat | Late payment-session answer discarded; cardComplete reset with the session | 2026-09-28 | 018afd7a | [260928-lat-late-intent-answer](./quick/260928-lat-late-intent-answer/) |
| fast | Services CTA headline scales with the card (9cqi, 17px floor); no clipping at 4-up in any locale | 2026-09-28 | 59d27311 | — |

## Session Continuity

Last session: 2026-09-28T20:26:15.292Z
Stopped at: Phase 26.3 context signed 2026-09-29; next UI-SPEC (/gsd-ui-phase 26.3)
Resume: `/gsd-ui-phase 26.3` (UI-SPEC, owner gate), then `/gsd-plan-phase 26.3`. 26.1-28 (owner Stripe resend + reconcile) still open. Only the control session commits on main and deploys. Do not execute 27. Do not load the pixel. Do not execute Phase 16/17/19/20/21. Do not `phases.clear`.

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
- Phase 26.3 discuss signed (2026-09-29): renamed Booking flow rebuild; Stripe hosted page, one checkout, URL handover, generic extras, pickup instant, test bookings deleted by owner script. Starts before 26.2.
- Phase 26.3 inserted (2026-09-28): Booking flow simplification. Sketch 001 Variant A approved by the owner (two screens, home price strip on tablet/desktop, one checkout page). Placed before 27 by owner choice so the pixel measures the new funnel. Depends on 26.1 and 26.2 merging first. Next is discuss-phase 26.3.

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
- [Phase 26.1]: PR #60 merged into gsd/phase-26.1-payment-pricing (--no-ff, no conflicts); X13/X14 closed on this branch — Baseline must be green before 26.1 code lands per phase success criteria
- [Phase 26.1]: settle v2: revive-on-cancel is the default (D-03/D-03a); requote-cancelled bookings refund instead since a successor booking already exists (D-03b); a second succeeded charge on the same snapshot is flagged duplicate, never 23505 (D-22)
- [Phase 26.1]: D-06 DLQ consumer alerts info@ once (stuck-payment) and never retries into itself; deliverStuckPaymentAlert bypasses both trips.length gates so it sends even with no matching booking row
- [Phase 26.1]: Plan 04: kernel prices D-08/D-08a/D-08b/D-09/D-09a — start is always base_fare_rappen, no bands; airport fee is additive (flight_no / origin_is_airport / airport zone), null amount stays null; city/canton pairs match both directions with a same-place guard and city wins over canton on the same leg (D-09a); the city_price_rappen dropdown filter is removed so a published pair applies regardless of fare_kind.
- [Phase 26.1]: Plan 07: checkout fails closed on rate-book load failure and reads the real pricing_live (derivePricingLive AND public_chf) instead of the hard-coded true; coupon is re-evaluated with the payer's identity at intent and its coupon_id reaches checkout_create_booking so coupon_redemptions/tg_coupon_redemption_caps enforce the cap (D-11); payableRappen makes a percent coupon discount checkout extras too, not just the class fare (D-08a).
- [Phase 26.1]: 26.1-15: pay-link hold is bookings.hold_until = least(token expiry, first send + 24 h); link lookup, charge gate and unpaid cron read greatest(snapshot clock, hold); resend never restarts it (D-20/D-20a/D-37)
- [Phase 26.1]: 26.1-15: checkout_pay_link_state answers refunded_duplicate before paid; unknown/revoked/expired/cancelled answer expired with no reference (D-21/D-22)
- [Phase 26.1]: 26.1-29: requote with an open pay-link hold answers 409 hold_open (no expire, no cancel); failed hold read fails closed; intent lock payable until max(exp, hold_until), hold read from DB only
- [Phase 26.1]: 26.1-32: payment re-evaluates the verified lock's payload.coupon (trim + upper-case) with the payer identity; a body coupon that differs refuses coupon_no_longer_valid before evaluate, Stripe or booking write (D-11). Client recovers once per lock via couponRefusalAction (reprice with coupon null, or drop stale applied state)

## Performance Metrics

| Phase | Plan | Duration | Notes |
|-------|------|----------|-------|
| Phase 13 P01 | 10min | 3 tasks | 5 files |
| Phase 13 P02 | 8min | 3 tasks | 4 files |
| Phase 26.1 P01 | 20min | 2 tasks | 1 files |
| Phase 26.1 P02 | 35min | 2 tasks | 4 files |
| Phase 26.1 P03 | 45min | 2 tasks | 10 files |
| Phase 26.1 P04 | 55min | 3 tasks | 11 files |
| Phase 26.1 P07 | 40min | 2 tasks | 9 files |
| Phase 26.1 P15 | 80min | 2 tasks | 11 files |
| Phase 26.1 P29 | 10min | 2 tasks | 5 files |
| Phase 26.1 P32 | 30min | 2 tasks | 8 files |

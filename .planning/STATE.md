---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Meta measurement
status: executing
stopped_at: "GSD bookkeeping B10 on docs/gsd-bookkeeping: summaries, ROADMAP rows and this file brought to the control board of 2026-10-01"
last_updated: "2026-10-01T19:53:00.000Z"
last_activity: "2026-10-01 23:53 (+04) - GSD bookkeeping B10: missing summaries written, ROADMAP rows for 26.0/26.2/26.5/27.1, closed and replaced phases marked"
progress:
  total_phases: 42
  completed_phases: 38
  total_plans: 337
  completed_plans: 323
  percent: 96
---

# Project State

**Project:** Vamos Taxi
**Milestone:** v1.3 Meta measurement
See: .planning/PROJECT.md (updated 2026-09-23)

**Core value:** quote → pay → confirmation. A customer books a fixed-price transfer in under a minute and the driver is there.
**Live:** https://vamostaxi.site and https://dashboard.vamostaxi.site, Worker `vamos`. The control board is the live source: `.planning/CONTROL-BOARD.md`.
**Current focus:** the lanes of the control board's "What is left" (below). GSD's current phase is 20 (plan 20-09 open); 26.2 is the other open phase; 28 and 29 wait for the owner.

## Current Position

Last updated: 2026-10-01 23:53 (+04), by the bookkeeping job B10 (branch `docs/gsd-bookkeeping`).
Source: `.planning/CONTROL-BOARD.md`, "What is left, 2026-10-01 23:38 (+04)", and origin/main `3e2bba66` read at 23:53.
main = origin/main `3e2bba66` (Phase 20 leftovers, 23:49). Last deploy on the board: Worker `vamos` `6eb1d700` (27.1, 17:44), gateway `vamos-dashboard` `71a307da`.

**Lanes that run now, in parallel (no shared files; each job in its own app worktree under `.claude/worktrees/`):**

| Lane | Job | Branch | State | After it |
|---|---|---|---|---|
| R | Phase 20 leftovers G7, G10, G11, G12, G28 | was `claude/project-thread-cwny3q` `84cb34cb` | On main `3e2bba66` 23:49; migration `20261007180000` applied and read back (commit message). Worker deploy for G28 not yet on the board | 20-09 live proof |
| A | Finish P6: change place or time of a paid trip (26.2) | `gsd/26.2-p6-build` `6af6b74c` (saved WIP) | Building | Fresh review (money path), then ship; migration `20261007150000` |
| B | Main green, 26.0 finish (B4): Linux `confirmation.spec.ts:130`, mutation-gate patch, schema job, home reds | `ci/e2e-linux-3`, `fix/e2e-linux-2` | In work; tests and CI files only | Ship without deploy; the 48 SiteHeader picture diffs go to the owner one page at a time |
| D | GSD bookkeeping (B10) | `docs/gsd-bookkeeping` | Handed over | Ship as a planning note |
| V | Van luxury up to 12 travellers (owner chose "Raise to 12", 2026-10-01 16:03) | new | Not started | Stops if it needs a file P6 touches; owner test: 4242 for 10 travellers |

**Then, one at a time after P6 (same money and checkout files):** B2 extras part B (CHF 0 shows "included") and
part C (count per extra, with a maximum; migrations `20261007120000`, `130000`) → drop the price-band tables
G8/G9 (deletes rows of old price-book rows 1 to 5; fresh review) → B5 follow-ups (mobile number to the dashboard
customer list; gate `/checkout` and `/booking-detail`) → B3 live-key refusals (one helper for `^(sk|rk)_live_`;
after the owner's refund-by-hand test) → 26.2 rows (airport fee inside the fare line, JSON double encoding in
`stripe_events.payload` and `rate_version_rules.payload`, `data-i18n-skip` leftovers).

**After the owner turns off Cloudflare's automatic Web Analytics:** B7 content and legal (`claude/project-thread-6r5gz9`,
PR #66) → G23 (drop `maps.googleapis.com` from CSP `connect-src`) → Arabic and design-canvas fixes (5 + 19).

**Last:** u13 stricter check scripts (`gsd/phase-26.2-u13`). **After the owner's Meta check:** Phase 28, then 29.

**The owner's own steps** (board): (1) Cloudflare Web Analytics automatic setup off. (2) Waiting time 30 minutes
in dashboard settings, after B7. (3) Real texts of the 5 published reviews. (4) 4242 payment as guest and with
"Create an account". (5) /contact real message. (6) Refund by hand. (7) Pay in de, fr, ar and on a tablet.
(8) UAT of the live jobs. (9) Meta switches on pixel 1595596972063765. (10) The 48 SiteHeader picture diffs.
(11) Repo public or private. (12) The rest of his 18:01 message.

**Launch, his word only, never under the standing order:** prices + Publish of price book row 18 (plan 11-12),
delete test bookings (26.3 D-37), the live Stripe key, the vamostaxi.eu cutover, wiping any data.

### GSD routing after B10

- `roadmap.analyze`: current phase 20, next 28. `init.progress`: current 20; open phases 20, 26.2, 28, 29.
- Phase 20: plan 20-09 (live proof) is the only plan without a SUMMARY. It waits for the owner's 4242 payment and
  refund by hand (owner steps 4 and 6), then re-probes batches A to C2 and the leftovers.
- Phase 26.2: units 01, 02, 04 to 08, 11 and the close-out 12 have no SUMMARY because they are not finished;
  P6 is lane A. Units 04, 05, 06 and the rest of 01, 02, 07, 08, 11 are on no board lane (question for the controller).
- No agent starts 11-12 (owner's Publish), 17 (closed), 19 (deferred, status question), 21 to 25 (replaced),
  4.3 (replaced). The ROADMAP marks each.

### Open questions for the controller

1. Phase 19: closed by the owner on 2026-09-30 (board commit `571bf701`, prompt `06-phase-19-surge.md`), or a
   launch item (HANDOVER-2026-10-01.md section 9)? No source in `.planning/decisions/` or the phase folder.
2. The 26.2 audit units never finished (01 re-baseline after 26.0, 02, 04, 05, 06, 07, 08, 11, close-out 12) are on
   no lane. Keep for later, or close the audit with what is live?

## Blockers

Stripe live key, Search Console and the vamostaxi.eu cutover stay the owner's word. The agent never clicks
Publish on price book row 18 and does not raise it. No `supabase db push`; never restore onto or wipe
`yaumjzvylngfjhtuffqs` (real paid bookings). No `sk_live_`. Meta: no Purchase event until the legal gate is open;
the pixel stays off until the owner's Meta check. Only the control session commits on main, applies live
migrations and deploys.

### Quick Tasks Completed

History up to 2026-09-29. Later quick jobs are listed on the control board ("Shipped") and in `.planning/quick/`.

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260929-pga | Postgres arrays through the Worker client (text[]/int2[]/int4[]/uuid[] registered, purge/notify/settle fixed) and the 24h reminder read as a definer function | 2026-09-29 | HEAD of fix/26.3-pg-arrays | [260929-pga-pg-text-arrays-and-reminder](./quick/260929-pga-pg-text-arrays-and-reminder/) |
| 260929-nts | Dashboard New trip Save: current intent body, live price-book extras, classes from the quote, flight re-sign without moving the total | 2026-09-29 | HEAD of fix/26.3-new-trip-save | [260929-nts-dashboard-new-trip-save](./quick/260929-nts-dashboard-new-trip-save/) |
| 260929-acl | Account bookings list 500 (column grants) and guest link via customers row on demand; list error state with try again | 2026-09-29 | c9a64f9c | [260929-acl-account-bookings-list-and-link](./quick/260929-acl-account-bookings-list-and-link/) |
| 260929-mbp | Manage-booking page shows price lines, payment method, extras and driver (narrow definer reads, method recorded at settle) | 2026-09-29 | HEAD of fix/26.3-manage-booking | [260929-mbp-manage-booking-price-payment-driver](./quick/260929-mbp-manage-booking-price-payment-driver/) |
| 260928-lux | Fix phone booking dead end: Show fixed prices goes to checkout trip | 2026-09-28 | 1ef815c3 | [260928-lux-fix-phone-booking-dead-end-show-fixed-pr](./quick/260928-lux-fix-phone-booking-dead-end-show-fixed-pr/) |
| 260928-cpn | Coupon recovery after a failed reprice; ops detail wording ar, fr, de | 2026-09-28 | 22c7fb3a | [260928-cpn-coupon-recovery-failed-reprice](./quick/260928-cpn-coupon-recovery-failed-reprice/) |
| 260928-rld | Reprice invalidates the stored payment session; Pay recovers without a card form | 2026-09-28 | 34e43d9e | [260928-rld-stored-session-and-pay-recovery](./quick/260928-rld-stored-session-and-pay-recovery/) |
| 260928-lat | Late payment-session answer discarded; cardComplete reset with the session | 2026-09-28 | 018afd7a | [260928-lat-late-intent-answer](./quick/260928-lat-late-intent-answer/) |
| fast | Services CTA headline scales with the card (9cqi, 17px floor); no clipping at 4-up in any locale | 2026-09-28 | 59d27311 | — |

## Session Continuity

Last session: 2026-10-01T19:53:00.000Z (bookkeeping job B10, planning files only)
Stopped at: hand-over `.planning/quick/261001-gsd-bookkeeping/HANDOVER.md` written for the control session.
Resume: a job session takes its job from the control board lanes above, in its own app worktree, and hands over to
the controller "VamosTaxi - session control". Do not `phases.clear`. Do not new-project.

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
- Phase closure (owner, 2026-09-29, `.planning/PHASE-CLOSURE-2026-09-29.md`): 16 complete; 17 closed, feature removed; 21 to 25 and 4.3 replaced by 26.1/26.3; 05-19 dropped; 11-12 owner-held; 19, 20 and 26.2 rewritten and signed.
- Phase 26.0 main green inserted (discuss signed 2026-09-29); shipped 2026-10-01 (`6ec73c52`).
- Phases 26.4.2 (owner booking feedback) and 26.5 (checkout guest / sign in / create account) shipped 2026-09-30.
- Phase 19 closed by the owner 2026-09-30 per the control board (`571bf701`); the 2026-10-01 hand-over still lists it before launch. Deferred, status question open.
- Phase 27 shipped 2026-10-01 (`ce55cd75`); Phase 27.1 finish your account inserted and shipped 2026-10-01 (`96a17ab7`).
- GSD bookkeeping B10 (2026-10-01): summaries for every finished, superseded or owner-held plan; ROADMAP rows for 5.1, 5.2, 6.1, 26.0, 26.2, 26.4.2, 26.5, 27.1; closed and replaced phases marked. Open plans keep no SUMMARY.

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

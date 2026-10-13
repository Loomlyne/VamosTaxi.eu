---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Meta measurement
status: executing
last_updated: "2026-10-13T13:04:42.833Z"
progress:
  total_phases: 37
  completed_phases: 31
  total_plans: 367
  completed_plans: 358
  percent: 84
---

# Project State

**Project:** Vamos Taxi
**Milestone:** v1.3 Meta measurement
See: .planning/PROJECT.md (updated 2026-09-23)

**Core value:** quote → pay → confirmation. A customer books a fixed-price transfer in under a minute and the driver is there.
**Live:** https://vamostaxi.site and https://dashboard.vamostaxi.site, Worker `vamos`. The control board is the live source: `.planning/CONTROL-BOARD.md`.
**Current focus:** Phase 31 — Refunds in Stripe

## Current Position

Phase: 31 (Refunds in Stripe) — EXECUTING
Plan: 6 of 13
Last updated: 2026-10-05 18:09 (+04), by the bookkeeping job `docs/gsd-bookkeeping-1005` (planning files only).
Source: `.planning/CONTROL-BOARD.md` (last update 2026-10-05 17:45), `.planning/audits/2026-10-05-repo-investigation.md` and origin/main `16f1cfa7`.
main = origin/main `16f1cfa7` (planning note) over `001f4d40` (checks and tests, 17:44). Last deploy on the board: Worker `vamos` `13ed22ae` (2026-10-05 17:44; the same site code as `8c8ef984` of 17:40), gateway `vamos-dashboard` `71a307da`.

**Live on 2026-10-05** (jobs of the owner's repo investigation, `.planning/audits/2026-10-05-repo-investigation.md`; all jobs closed 17:45, branches deleted on GitHub with archive tags, GitHub has `main` only):

| Job | main | Live |
|---|---|---|
| Purge of unpaid bookings detaches account records (U1) | `3c66208f` | 14:25 (migration `20261007300000`, no Worker deploy); VT-26-0748, 0749, 0751 swept |
| Security hardening (S4, S5 part, S7, S8, S10 to S15) | `43fba58d` | 16:15 (Worker `1061b530`) |
| Money and database (U4, U15, U26, U27, M18, S6 step 1) | `5aa3ddd0` | 16:29 (Worker `bca6e755`, migration `20261007310000`) |
| Content: flight promise removed, legal dates per page | `1ca1beda` | 17:15 (Worker `09af5fdb`) |
| Dashboard fixes (U8 to U11) | `a2a40794` | 17:33 (Worker `90e401b3`) |
| Review follow-ups | `40a09eb9` | 17:40 (Worker `8c8ef984`) |
| Checks and tests (U20 to U22, S16, D3, D4) | `001f4d40` | 17:44 (Worker `13ed22ae`, same site code) |

Earlier the same day: the Stripe fee record (`f1cc8726`, 00:02, Worker `b15beb82`, migration `20261007290000`). The GitHub repo was made private at 11:58. GitHub Actions are blocked on billing since 2026-10-04 about 20:00 (owner step).

**Held:** migration `20261007320000` (revokes anon and authenticated EXECUTE on eight functions). Apply after the 16:29 Worker has run about a day and the owner's 4242 payment, one voucher quote and one cookie-banner choice pass. Next free migration number: `20261007330000`.

**Open for the owner** (board, "Waiting for the owner"): Cloudflare Always Use HTTPS; add an authenticator (Settings, Security); city waiting 30 minutes and Publish; a chauffeur for Business and one for Van luxury; GitHub Billing; one 4242 payment; the Meta test event code and the Events Manager Test events check; read /terms 08 and the FAQ flight line on a phone; sign in and look at the dashboard board, calendar, one booking and Money in.

**Open jobs (controller):** sign-up safety (S5 Turnstile on sign-up and forgot-password, no name in the mail before the address is confirmed; the owner answered 2026-10-05, S9 stays as it is: `.planning/decisions/2026-10-05-signup-safety.md`); a later dashboard job (not-staff 403 blank screen, "You were signed out" message, keep the page when a write fails on a dead session, dashboard shows CHF 000 while loading or on failure, U7); quote and consent on their own nologin role; the signed quote lock still names two version ids; U15 webhook-first order leaves the return row unprocessed; live-key refusals for `rk_live_` (after the owner's refund-by-hand test); signed P4 parts B and C (U17).

**Launch, his word only, never under the standing order:** price book Publish (row 18 has been live since 2026-09-26; row 19 is a draft from 2026-09-27), delete test bookings (26.3 D-37), the live Stripe key, the vamostaxi.eu cutover, wiping any data.

### GSD routing after the 2026-10-05 bookkeeping

- `roadmap.analyze`: 42 phases, 352 plans, 353 summaries; current phase and next phase none; `roadmap_complete` is false only for 26.2.
- `progress`: 29 and 26.1 read "Needs Review" because their VERIFICATION.md say `human_needed` (29: the Meta test event code, still the owner's). Not a gap in the work.
- No agent starts 11-12 (owner's Publish), 17 (closed), 19 (closed by the owner), 21 to 25 (replaced), 4.3 (replaced). The ROADMAP marks each.

### Open questions for the controller

None. The owner's S5 and S9 answers are recorded (2026-10-05).

## Blockers

Stripe live key, Search Console and the vamostaxi.eu cutover stay the owner's word. The agent never clicks
Publish on the price book and does not raise it. No `supabase db push`; never restore onto or wipe
`yaumjzvylngfjhtuffqs` (real paid bookings). No `sk_live_`. Meta: no Purchase event until the legal gate is open;
the pixel loads only after a marketing Accept, and no Purchase is sent today because the test event code is missing.
Only the control session commits on main, applies live migrations and deploys.

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

Last session: 2026-10-13T13:04:39.343Z
Stopped at: branch `docs/gsd-bookkeeping-1005` pushed for the control session to review and land.
Resume: a job session takes its job from the control board's landing queue, in its own app worktree, and hands over to
the controller (the Claude desktop session "Vamos Taxi controller", named on the board). Do not `phases.clear`. Do not new-project.

## Accumulated Context

### Roadmap Evolution

- Phase 19 added: V1 production close-out leftover live gates and 10k booking surge (2026-09-18). Parked. Hard gate in ROADMAP. Current stays 17 leftover live close.
- Phase 20 added: Security audit fix-up (2026-09-19). Does not begin Phase 19. Owner SQL. No `.eu`. No `sk_live_`.
- Phases 21–25 added: v1.2 Payment (2026-09-22). PAY-08…PAY-18. Leftovers 16/17/19/20 unchanged.
- v1.3 started (2026-09-23): Meta measurement. Do not `phases.clear`.
- Phases 26–29 approved (2026-09-23): v1.3 Meta measurement. META-01…META-14. Next is discuss-phase 26.
- Phase 26 lock shipped (2026-09-24) on `gsd/phase-26-legal-gate`. Empty slots. Flag is the literal false. Policy version stays `2026-09-12`. Not merged. Pixel stays off until the owner pastes the four-language lines.
- Phase 26.3 discuss signed (2026-09-29): renamed Booking flow rebuild; Stripe hosted page, one checkout, URL handover, generic extras, pickup instant, test bookings deleted by owner script. Starts before 26.2.
- Phase 26.3 inserted (2026-09-28): Booking flow simplification. Sketch 001 Variant A approved by the owner (two screens, home price strip on tablet/desktop, one checkout page). Placed before 27 by owner choice so the pixel measures the new funnel. Depends on 26.1 and 26.2 merging first. Next is discuss-phase 26.3.
- Phase closure (owner, 2026-09-29, `.planning/PHASE-CLOSURE-2026-09-29.md`): 16 complete; 17 closed, feature removed; 21 to 25 and 4.3 replaced by 26.1/26.3; 05-19 dropped; 11-12 owner-held; 19, 20 and 26.2 rewritten and signed.
- Phase 26.0 main green inserted (discuss signed 2026-09-29); shipped 2026-10-01 (`6ec73c52`).
- Phases 26.4.2 (owner booking feedback) and 26.5 (checkout guest / sign in / create account) shipped 2026-09-30.
- Phase 30 added (2026-10-11): Vehicle class lifecycle. Discuss signed in `.planning/decisions/2026-10-11-fleet-lifecycle.md`. Next: UI-SPEC pictures, his signature, then plan.
- Phase 31 added (2026-10-12): Refunds in Stripe. Discuss signed in `.planning/decisions/2026-10-12-refunds-in-stripe.md`; nightly refund check added by the owner the same evening. Next: UI-SPEC pictures, his signature, then plan.
- Phase 19 closed by the owner (2026-09-30, confirmed 2026-10-01 23:59): no surge test, not a launch item.
- Phase 27 shipped 2026-10-01 (`ce55cd75`); Phase 27.1 finish your account inserted and shipped 2026-10-01 (`96a17ab7`).
- GSD bookkeeping B10 (2026-10-01): summaries for every finished, superseded or owner-held plan; ROADMAP rows for 5.1, 5.2, 6.1, 26.0, 26.2, 26.4.2, 26.5, 27.1; closed and replaced phases marked. Open plans keep no SUMMARY.
- Phase 20 complete 2026-10-02 (batches A, B1, C1, C2, refunds by hand, e-mail change fix, leftovers; live proof and the owner's 4242 payment passed).
- Phase 28 shipped 2026-10-03 20:00 (`da25c7d5`); Phase 29 shipped 2026-10-04 15:57 (`54599783`), lock-order fix 16:27 (`41ba7b7d`). Owner-held: the Meta test event code and the Events Manager Test events check.
- 2026-10-05: the owner's repo investigation (`.planning/audits/2026-10-05-repo-investigation.md`); repo made private; the six fix jobs are live (table above). They have no phase of their own: their hand-overs are the quick folders `261005-*`.
- GSD bookkeeping 2026-10-05: ROADMAP rows for 28 and 29, this file, quick 260819-279 and 260819-vjz closed as superseded, the control board's waiting table.

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
- [Phase 31]: 31-01: Stripe Dashboard links are built on the server only (fixed origin, mode from the Worker key, malformed STRIPE_ACCOUNT_ID dropped); the stripe-payments list keeps fully refunded payments and the page decides
- [Phase 31]: 31-02: refund.test.ts pins the exact export set of refund-map.ts (absence pin without naming removed symbols)
- [Phase 31]: 31-03: migration 20261012220000_refund_check_reader.sql (owner S-10), md5 a7f3ae95a3130a0ce3943cfa27cf660a: refund_check_read, notification_claim_refund, notification_refund_read, vamos_system only; not applied live

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
| Phase 31 P01 | 11 min | 2 tasks | 8 files |
| Phase 31 P02 | 4 min | 2 tasks | 13 files |
| Phase 31 P03 | 8 min | 3 tasks | 3 files |
| Phase 31 P04 | 8 min | 3 tasks | 9 files |
| Phase 31 P07 | 3 min | 2 tasks | 8 files |

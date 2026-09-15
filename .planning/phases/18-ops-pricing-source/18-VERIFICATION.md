---
phase: 18-ops-pricing-source
verified: 2026-09-15T09:15:00Z
status: passed
score: 5/5 must-haves verified
source: 18-UAT.md
---

# Phase 18: OPS Pricing source of truth — Verification Report

**Phase Goal:** `https://dashboard.vamostaxi.site/pricing` is the only fare book. Every add/edit/delete/Publish on that page drives quote, checkout recap, confirmation, ops amounts, Stripe, and new booking mail.
**Verified:** 2026-09-15T09:15:00Z
**Status:** passed

Owner UAT on `vamostaxi.site` / `dashboard.vamostaxi.site`. Agent did not click Publish. Agent did not `supabase db push`.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Save writes draft only. Publish is the only flip — all-or-nothing. After Publish, `/pricing` shows the live book | ✓ VERIFIED | 18-03 SUMMARY; UAT test 2; no `forkLiveRateVersion` in publish tx |
| 2 | Distance recipe is start + (all km × per-km) + bands. Charge CHF. No region % | ✓ VERIFIED | d15-recipe 27520/12300; UAT test 4; ops-pricing-tabs no region |
| 3 | Checkout extras come from the Surcharges tab after Publish. Four tabs. No History. No Preview | ✓ VERIFIED | 18-06 SUMMARY; ops-pricing-tabs four keys |
| 4 | Public offers only live-book classes. Delete = gone. No hardcoded Economy / Business / First / Van ladder | ✓ VERIFIED | public-live-book-board.test.ts; UAT tests 3 and 5 |
| 5 | Extra wait not in Stripe pay-now. Must-nots: no invented CHF, no sk_live_, no .eu, no agent Publish / db push | ✓ VERIFIED | extra-wait-no-offsession.test.ts; UAT tests 1 and 7 |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `18-01`…`18-07-SUMMARY.md` | Seven live summaries | ✓ EXISTS | Restart 2026-09-14; archive-2026-09-13 is history |
| `20260914190000_quote_rate_book_live_classes.sql` | Git SQL, owner-applied | ✓ EXISTS + SUBSTANTIVE | Applied 2026-09-14 on Zurich |
| `20260914191000_vehicle_class_any_photo.sql` | Git SQL, owner-applied | ✓ EXISTS + SUBSTANTIVE | Applied 2026-09-14 on Zurich |
| `extra-wait-no-offsession.test.ts` | T-18-05 grep | ✓ EXISTS + SUBSTANTIVE | Covers intent + bookings-map |
| Dual-DC `OpsPricing.dc.html` | Canonical = public copy | ✓ EXISTS | Synced 2026-09-15 |

**Artifacts:** 5/5 verified

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `/pricing` Save | draft rate book | staff rate-book APIs | ✓ WIRED | 18-03 |
| Publish | live book + public quote | `POST …/publish` | ✓ WIRED | no post-Publish fork |
| Live book | home / checkout / quote | `quote.classes` eligibility | ✓ WIRED | 18-01 18-02 |
| Distance tab | fare | start + km × per-km + bands | ✓ WIRED | 18-04 |
| Surcharges list | checkout extras | `catalogFromSurcharges` | ✓ WIRED | 18-06 |
| Extra wait | Stripe pay-now | chargedRappen excludes wait | ✓ WIRED | 18-07 |

**Wiring:** 6/6 connections verified

## Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| D-01…D-14 Draft/Publish | ✓ SATISFIED | - |
| D-15…D-28 Money recipe | ✓ SATISFIED | - |
| D-29…D-33 Live-book classes | ✓ SATISFIED | - |
| D-34…D-35 Surcharges list | ✓ SATISFIED | - |
| QUOTE-03 eligible live-book prices | ✓ SATISFIED | Phase 18 |
| QUOTE-04 lock 24h (was 30 min) | ✓ SATISFIED | D-13 hardcoded |
| QUOTE-11 extras / extra stop | ✓ SATISFIED | extras from published list; extra stop max 1 |
| QUOTE-10 public_chf / CHF 000 until owner Publish | ? NEEDS HUMAN | Stays 11-12; does not reopen 18 |
| OPS-06 fare book editor | ✓ SATISFIED | Revalidated Phase 18 |

**Coverage:** 8/8 phase-owned; QUOTE-10 remains 11-12

## Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| Full `lib/pricing\|ops\|checkout\|quote` + `tsc` | Pre-existing red (settings vat, sqlstate 23P01, settle mock, RouteSummary CSS, ops-dc-settings hash nav) | ⚠️ Warning | 18-07 owned gates green (75). Recorded in 18-07-SUMMARY. Does not block phase goal. |

**Anti-patterns:** 1 warning, 0 blockers

## Human Verification Required

Recorded in `18-UAT.md`. Owner closed all seven bullets 2026-09-15. Agent did not Publish.

## Gaps Summary

**No gaps found.** Phase goal achieved. Ready to proceed to Phase 13.

Non-blocking: `11-12` owner Publish / `public_chf` still open. Stripe stays test. No `.eu`.

## Verification Metadata

**Verification approach:** Goal-backward from ROADMAP success criteria + 18-07 must-haves
**Must-haves source:** ROADMAP Phase 18 + 18-07-PLAN.md
**Automated checks:** 75 18-07-owned tests passed; full suite still has pre-existing failures
**Human checks required:** 7 — all passed (owner)
**Total verification time:** close-out sitting 2026-09-15

---
*Verified: 2026-09-15T09:15:00Z*
*Verifier: Claude (orchestrator) — owner UAT recorded; agent did not Publish*

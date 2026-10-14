---
phase: 31-refunds-in-stripe
plan: 02
subsystem: staff-api / refunds
tags: [refunds, removal, staff-api]
requires: []
provides:
  - "No site-side refund sender: lib/ops/refund.ts and POST/GET refund + POST refund-decision gone on both mounts"
  - "apps/web/lib/ops/refund-map.ts trimmed to sqlErrorCode, PAYMENT_CHANGED, isPaymentChanged, mapRefundSqlError, RefundFail, refundFailStatus"
  - "Absence pins in apps/web/lib/ops/refund.test.ts (removed files gone, no POST on a /bookings/[id]/refund path, refund-map exports exactly the kept five)"
affects: [31-09 (OpsDetail.dc.html still POSTs to the removed routes until it lands), 31-13 (booking-change.local.test.ts live run, e2e p6-browser refund steps)]
tech-stack:
  added: []
  patterns: [absence pin by walking app/ route files, export-set pin on a trimmed module]
key-files:
  created: []
  modified:
    - apps/web/lib/ops/refund-map.ts
    - apps/web/lib/ops/refund.test.ts
    - apps/web/lib/ops/payment-changed.test.ts
    - apps/web/lib/ops/refusal-rpc-errors.test.ts
    - apps/web/lib/ops/booking-change.local.test.ts
    - scripts/db-access-fence-allowlist.json
  deleted:
    - apps/web/lib/ops/refund.ts
    - apps/web/lib/ops/refund-by-hand.test.ts
    - apps/web/lib/ops/refund-by-hand.local.test.ts
    - apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/refund/route.ts
    - apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/refund-decision/route.ts
    - apps/web/app/api/staff/bookings/[id]/refund/route.ts
    - apps/web/app/api/staff/bookings/[id]/refund-decision/route.ts
decisions:
  - "refund.test.ts pins the exact export set of refund-map.ts instead of naming the removed symbols, so the plan's absence grep stays at zero"
  - "Kept neighbour proofs in refund.test.ts (ops_refund_record migration shape, staff PATCH, cancelBooking via ops_cancel_booking, withAdmin, J7 W6-05 reversal-net sums for bookings.ts and booking-change.ts); dropped parser, Stripe fee, route, mail and OpsDetail pins"
metrics:
  duration: "about 4 min (2026-10-13 12:33Z to 12:37Z)"
  completed: 2026-10-13
  tasks: 2
  files: 13
---

# Phase 31 Plan 02: Remove the site-side refund sender Summary

The dashboard can no longer send a refund: `lib/ops/refund.ts` (refundBooking, decideRefund, readRefundState, loadRefundPicker) and the refund / refund-decision routes on both mounts are deleted, `refund-map.ts` keeps only the SQL error maps other code imports (byte-identical), and the tests now pin the absence; the webhook recorder and the duplicate-charge refund are untouched and their suites pass unchanged.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Delete the sender, the two routes on both mounts, trim refund-map.ts | 0c811d7a | refund.ts (deleted), 4 route files (deleted), refund-map.ts (-154 lines, 0 added) |
| 2 | Rewrite or delete the tests of the removed sender; prove recorder and duplicate paths unchanged | 90a80aae | refund.test.ts, payment-changed.test.ts, refusal-rpc-errors.test.ts, booking-change.local.test.ts, refund-by-hand*.test.ts (deleted), db-access-fence-allowlist.json |

## Verification

- `vitest run` (apps/web): refund.test.ts 16 passed; payment-changed.test.ts 31; refusal-rpc-errors.test.ts 7; bookings-write.test.ts 18; money-events.test.ts 47; settle.test.ts 124; ops-live-data.test.ts 20; booking-change.local.test.ts 1 skipped (no VAMOS_LOCAL_DB_PORT, skips cleanly). Total 263 passed, 1 skipped, 0 failed.
- `pnpm check:db-fences`: all 8 checks passed (1281 files), exit 0.
- `tsc --noEmit` (apps/web): exit 0.
- Task 1 verify command: exit 0 (five files gone, no production reference to a removed symbol).
- Absence-pin regex checked against the four deleted route files from origin/main: matches all four, so the pin fails if a refund POST returns.
- `git diff --stat origin/main` on money-events.ts, settle.ts, their tests, stripe.ts, paid-cancel.ts, bookings-map.ts and migrations/: empty (D-02, D-03, D-07).

## Deviations from Plan

None in scope. One adjustment inside Task 2: the first draft of the export pin named the removed symbols, which made the acceptance grep count 1; it was rewritten as an exact export-set pin (same protection, grep at 0).

## Notes for later plans

- `stripe.ts findRefundByIntent` and `paid-cancel.ts payoutFactsFromRefund` keep their own tests and have lost their only production caller (refund.ts). Clean-up later with the D-07 SQL drop.
- `ops_refund_plan`, `ops_refund_decide`, `ops_refund_intent_sent/failed`, `ops_refund_record` stay in the database with no caller (D-07).
- `app/ops/OpsDetail.dc.html` still POSTs to `/refund` and `/refund-decision` (now 404) until plan 31-09 lands in this wave; its DC tests (`ops-refund-review-dc.test.ts`, `ops-dc-dash-design.test.ts` §1b, the DC cases in `payment-changed.test.ts`) use a stubbed request and still pass; 31-09 owns them.
- `apps/web/lib/ops/bookings-write.ts:3` header comment still says "Refund is lib/ops/refund.ts"; file not in this plan's list, left for a later touch.
- `packages/emails` `renderRefundEmail` / `sendRefund` / `refundMailRecipients` are kept (Q1 = A reuse from the webhook, plan 31-05+); only the staff route caller is gone.
- `booking-change.local.test.ts` was not run against a lab stack; its live run is plan 31-13's gate.

## Known Stubs

None.

## Threat Flags

None. The change removes surface (two admin write routes on two mounts); no new endpoint, auth path or schema change.

## Self-Check: PASSED

- 0c811d7a and 90a80aae present in `git log`.
- refund-map.ts, refund.test.ts present; the seven deleted files absent.

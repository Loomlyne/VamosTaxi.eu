---
phase: 09-booking-lifecycle-customer-self-service
plan: 11
subsystem: api
tags: [ops-mark-complete, no-show, review-request, opsdash, booking_refunds, pgtap]

requires:
  - phase: 09-02
    provides: recompute_booking_status + manage_booking_cancel hide after completed/no_show
  - phase: 09-03
    provides: reviews.booking_id + submit_review + ReviewRequestEmail
  - phase: 09-06
    provides: notifyReviewRequest / sendReviewRequest
  - phase: 08
    provides: withStaff + asSystem ops RPCs
provides:
  - ops_mark_complete / ops_mark_no_show SECURITY DEFINER (local SQL; hosted apply pending Task 3)
  - Staff PATCH completed|no_show via RPCs + review-request email after paid complete/no-show
  - Account reviewState none|requested|reviewed + Review trip / Reviewed chips
  - OpsDash money from captured charged_rappen and booking_refunds (Europe/Zurich periods)
affects: [09-11-task-3-hosted-apply]

tech-stack:
  added: []
  patterns:
    - Ops complete/no-show is DEFINER RPC + Worker review token, never client status write
    - Dashboard income/refunds are SQL sums, never bookings.status=refunded

key-files:
  created:
    - packages/db/supabase/migrations/20260912033121_booking_lifecycle_ops_complete.sql
    - apps/web/app/[locale]/(ops)/api/staff/dashboard/route.ts
    - apps/web/app/api/staff/dashboard/route.ts
    - .planning/phases/09-booking-lifecycle-customer-self-service/09-11-SUMMARY.md
  modified:
    - packages/db/supabase/tests/booking_status_rollup.test.sql
    - packages/db/README.md
    - apps/web/lib/ops/bookings-write.ts
    - apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/route.ts
    - app/ops/OpsDetail.dc.html
    - apps/web/lib/account/bookings.ts
    - apps/web/lib/account/bookings.test.ts
    - apps/web/app/api/account/bookings/route.ts
    - app/pages/account.dc.html
    - app/pages/bookings.dc.html
    - apps/web/lib/ops/bookings.ts
    - apps/web/lib/ops/ops-live-data.test.ts
    - app/ops/OpsDash.dc.html

key-decisions:
  - "D-31: only ops marks Completed and No-show via ops_mark_*; no no-show cron."
  - "EXECUTE vamos_system only (Worker asSystem after withStaff). Not anon. Not vamos_customer."
  - "Paid no-show does not auto-refund (no booking_refunds insert in the RPC)."
  - "actor_id on booking_events is null unless auth.users has the uuid (FK)."
  - "D-17: after paid completed/no_show, Worker mints manage token, RPC stores hash, notifyReviewRequest."
  - "Account reviewHref is /review?ref= when requested, /review when reviewed (D-21 stays)."
  - "D-16: GET /api/staff/dashboard sums captured charged_rappen and booking_refunds.refund_rappen. Never status=refunded."
  - "Hosted apply of 20260912033121_booking_lifecycle_ops_complete.sql is 09-11 Task 3 — not done in this run."

patterns-established:
  - "Ops terminal status writes go through named markComplete/markNoShow helpers; PATCH never SET status client-side."
  - "OpsDash money is a dedicated staff GET, not a reduce of the bookings board."

requirements-completed: [LIFE-01, LIFE-08]

duration: 90min
completed: 2026-09-12
---

# Phase 09 Plan 11: Ops complete/no-show + OpsDash money

**Ops marks Completed/No-show through DEFINER RPCs; OpsDash income/refunds are live sums. Hosted apply is still pending (Task 3).**

## Performance

- **Tasks:** 2 of 3 (Task 3 hosted apply not run)
- **Files modified:** 16

## Accomplishments

- `ops_mark_complete` / `ops_mark_no_show` set remaining live legs, `recompute_booking_status`, `booking_events`. Paid no-show does not refund.
- Staff PATCH `status=completed|no_show` calls those RPCs; after paid success, `notifyReviewRequest` (D-17).
- GET `/api/account/bookings` adds `reviewState` / `reviewHref`. account.dc.html and bookings.dc.html chips: Review trip / Reviewed.
- OpsDash fetches `/api/staff/dashboard?period=today|week|month|all` (Europe/Zurich). Income = captured `charged_rappen`. Expenses = `booking_refunds.refund_rappen`. Amounts via `fareLabel`.

## Task Commits

1. **Task 1: ops mark complete/no-show + review chips** - `f02d87a` (feat)
2. **Task 2: OpsDash money** - `2f10d47` (feat)
3. **Task 3: hosted apply** — **not done** (orchestrator applies `20260912033121_booking_lifecycle_ops_complete.sql` on `yaumjzvylngfjhtuffqs`)

## Verification

- pgTAP `booking_status_rollup.test.sql`: **24/24 PASS**
- Vitest `lib/account/bookings.test.ts` + `lib/ops/ops-live-data.test.ts`: **35/35 PASS** (2 files)
- No `supabase db push`. No Docker start. No deploy. No no-show cron.

## Hosted apply still pending

Local Postgres has the functions (psql to 54322 only). Remote project `yaumjzvylngfjhtuffqs` does **not** have this migration until Task 3 `apply_migration`.

## Self-Check: Requirement Verification

| Requirement | Source | Status | Evidence |
|---|---|---|---|
| LIFE-01 D-31 ops complete/no-show | PLAN.md | Local met; hosted pending | RPC + staff PATCH + pgTAP 24/24 |
| LIFE-08 D-16 OpsDash money | PLAN.md | Local met | GET dashboard + OpsDash fetch; Vitest 35/35 |

## Deviations from Plan

- Dashboard is GET `/api/staff/dashboard` (not listed in plan files_modified) so OpsDash is not summing board rows for income/refunds.
- `booking_events.actor_id` is null when `p_actor_id` is missing from `auth.users` (FK).
- Customer review visibility policy is `to authenticated` (PG_ROLE.customer). No `vamos_customer` role.

## Issues

- Hosted apply blocked on purpose (Task 3).

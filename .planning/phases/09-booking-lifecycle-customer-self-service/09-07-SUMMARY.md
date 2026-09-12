---
phase: 09-booking-lifecycle-customer-self-service
plan: 07
subsystem: lifecycle
tags: [resend, cron, reminder, cancel, assignment, notifications]

requires:
  - phase: 09-05
    provides: paid-cancel Worker + remaining refund
  - phase: 09-06
    provides: lifecycle templates + notify-lifecycle claim-then-send
provides:
  - Hourly 24h reminder via runReminder24h after expireUnpaidBookings
  - D-28 assignment-customer mail after ops_assign_leg ok
  - D-11/D-14 cancel mails from paid-cancel (URGENT ops when assigned)
  - sendRefundFailed on Stripe refund fail
affects: [09-08, 09-10, 09-11]

tech-stack:
  added: []
  patterns:
    - Hourly cron Instant window (Europe/Zurich via timestamptz, not CF cron TZ)
    - Claim-then-send for reminder / cancel / assignment-customer

key-files:
  created:
    - apps/web/lib/lifecycle/reminder.ts
    - .planning/phases/09-booking-lifecycle-customer-self-service/09-07-SUMMARY.md
  modified:
    - apps/web/worker.ts
    - apps/web/lib/lifecycle/reminder.test.ts
    - apps/web/lib/lifecycle/paid-cancel.ts
    - apps/web/lib/lifecycle/paid-cancel.test.ts
    - apps/web/lib/ops/assign.ts
    - apps/web/lib/ops/assign.test.ts

key-decisions:
  - "D-29 clock is original_scheduled_at in [now+24h, now+25h) Instant; skip cancelled/completed/no_show."
  - "Unassigned reminder: no driver fields + ops copy. Assigned: driver fields; claim RPC blocks a second 24h."
  - "Later assign sends D-28 assignment-customer mail only — no extra reminder."
  - "V1 On shift = assigned_chauffeur_id IS NOT NULL. Assigned cancel → chauffeur + URGENT ops."
  - "No no-show sweep. expireUnpaidBookings unchanged. No wrangler cron added."

patterns-established:
  - "worker hourly: expireUnpaidBookings then runReminder24h; keep 0 3 * * * notification sweep."
  - "Cancel/assignment/reminder mails go through notify-lifecycle (asSystem claim/settle), never the browser."

requirements-completed: [LIFE-05, LIFE-07]

duration: 35min
completed: 2026-09-12
---

# Phase 09 Plan 07: 24h reminder cron + cancel/assignment Resend hooks

**Hourly cron sends 24h reminders against original Zurich pickup; paid-cancel and ops assign fire lifecycle Resend. No no-show sweep.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-09-12T00:55:00Z
- **Completed:** 2026-09-12T01:29:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- `runReminder24h` selects `original_scheduled_at` in `[now+24h, now+25h)` (Instant, same TZ approach as digest). Skips `cancelled` / `completed` / `no_show`.
- Unassigned → reminder without driver + ops copy. Assigned → driver fields; `notification_claim` on `reminder_24h` prevents a second 24h.
- Worker hourly (`0 * * * *`) calls `expireUnpaidBookings` then `runReminder24h`. `0 3 * * *` notification sweep kept. No wrangler cron. No no-show sweep.
- After `ops_assign_leg` ok: `notifyAssignmentCustomer` + existing chauffeur assign mail. Unassign stays chauffeur-only.
- After paid-cancel success: `notifyCancellation` (customer + `BOOKINGS_OPS_EMAIL`; chauffeur + URGENT ops when `assigned_chauffeur_id` is set). Stripe refund fail also `notifyRefundFailed`.
- Ops copies stay `bookings@vamostaxi.site`. No `info@`. No TRIP/LX1234. No invented CHF. No new packages.

## Task Commits

1. **Task 1: Hourly 24h reminder; no no-show sweep** — `3905e52` test(09-07): add failing tests for 24h reminder cron; `d236657` feat(09-07): hourly 24h reminder after unpaid expire
2. **Task 2: Cancel mails + assignment-customer mail** — `bb5a6c7` feat(09-07): cancel and assignment customer Resend hooks
3. **Plan metadata** — this file

## Files Created/Modified

- `apps/web/lib/lifecycle/reminder.ts` — window builder + asSystem select + `notifyReminder24h`
- `apps/web/lib/lifecycle/reminder.test.ts` — Instant window, worker order, skip statuses, original_scheduled_at
- `apps/web/worker.ts` — `runReminder24h` after unpaid expire
- `apps/web/lib/lifecycle/paid-cancel.ts` — cancel + refund-failed Resend after success/fail
- `apps/web/lib/lifecycle/paid-cancel.test.ts` — D-11/D-14 source proofs
- `apps/web/lib/ops/assign.ts` — `notifyAssignmentCustomer` after assign RPC ok
- `apps/web/lib/ops/assign.test.ts` — D-28 source proof

## Decisions Made

- Reminder clock vs **original** pickup, Europe/Zurich via timestamptz Instant — Cloudflare cron has no IANA TZ.
- Assignment after reminder is D-28 mail only (claim already settled `reminder_24h`).
- V1 On shift for cancel urgency = `assigned_chauffeur_id IS NOT NULL`.
- Refund-failed ops mail still sends when customer email is missing.

## Deviations from Plan

None - plan executed exactly as written.

- Source-read + window-builder tests (repo has no `cloudflare:test`), as the plan allowed.
- Assignment customer send is via `notifyAssignmentCustomer` (claim-then-send), not a raw `sendAssignmentCustomer` call from `assign.ts`.

## Issues Encountered

- `assign.test.ts` inherited `/evQuote/` matched OpsDetail `evQuoted` translation. Tightened to `/\bevQuote\b/` so the required file stays green. Did not edit OpsDetail.
- 09-06 leftover: `booking_notifications.kind` CHECK may still omit `refund_failed` / `assignment_customer`. Did not apply SQL. Did not `supabase db push`.

## User Setup Required

None - no external service configuration required. Hourly cron already `0 * * * *`. Did not add wrangler cron. Did not `wrangler secret put`.

## Next Phase Readiness

- 09-07 code is on `gsd/phase-09-booking-lifecycle`. Did not start 09-08.
- Did not Docker, deploy, or push SQL.
- LIFE-07 unpaid expire only — still no no-show sweep.

## Verification

```
pnpm --filter web exec vitest run lib/lifecycle/reminder.test.ts lib/lifecycle/no-show-sweep.test.ts
  Test Files  2 passed (2)
  Tests       9 passed (9)

pnpm --filter web exec vitest run lib/ops/assign.test.ts lib/lifecycle/paid-cancel.test.ts
  Test Files  2 passed (2)
  Tests      25 passed (25)
```

---
*Phase: 09-booking-lifecycle-customer-self-service*
*Completed: 2026-09-12*

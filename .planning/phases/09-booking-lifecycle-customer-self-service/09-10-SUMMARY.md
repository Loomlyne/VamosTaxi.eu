---
phase: 09-booking-lifecycle-customer-self-service
plan: 10
subsystem: api
tags: [time-change, flight-number, booking_edit_requests, ops-confirm, vitest]

requires:
  - phase: 09-06
    provides: notifyTimeChange / notifyFlightNumber + BOOKINGS_OPS_EMAIL
  - phase: 08
    provides: booking_edit_request_upsert / accept / apply_payload
  - phase: 09-08
    provides: guest manage-booking ticket + VamosManageTicket
  - phase: 09-09
    provides: signed-in ConfirmationClient BookingVoucher
provides:
  - Customer time-change request (guest token + signed-in JWT) without mutating live scheduled_at
  - Ops accept/refuse on OpsDetail via POST edit-request action=accept|refuse
  - Confirmed time-change mail to customer + bookings@ + assigned chauffeur
  - Flight number write-through (booking_legs.flight_no + booking.modified) with ops/chauffeur mail
affects: [09-11, 09-12]

tech-stack:
  added: []
  patterns:
    - Time-only edit reuses requestCustomerPaidEdit + booking_edit_request_upsert
    - Only booking_edit_request_accept mutates scheduled_at
    - Flight write-through is asSystem after ownership, never AeroDataBox

key-files:
  created:
    - apps/web/app/api/manage/time-change/route.ts
    - apps/web/app/api/account/bookings/time-change/route.ts
    - apps/web/app/api/manage/flight/route.ts
    - apps/web/app/api/account/bookings/flight/route.ts
    - apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/edit-request/route.ts
    - apps/web/app/api/staff/bookings/[id]/edit-request/route.ts
    - .planning/phases/09-booking-lifecycle-customer-self-service/09-10-SUMMARY.md
  modified:
    - apps/web/lib/ops/edit-request.ts
    - apps/web/lib/ops/edit-request.test.ts
    - apps/web/lib/ops/edit-request-map.ts
    - apps/web/lib/lifecycle/notify-lifecycle.ts
    - apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/edit-accept/route.ts
    - app/pages/manage-booking.dc.html
    - app/ops/OpsDetail.dc.html
    - app/vamos-manage-ticket.js
    - app/vamos-i18n-dict.js
    - apps/web/app/[locale]/confirmation/[ref]/ConfirmationClient.tsx
    - apps/web/i18n/messages/en.json
    - apps/web/i18n/messages/de.json
    - apps/web/i18n/messages/fr.json
    - apps/web/i18n/messages/ar.json
    - packages/db/supabase/migrations/20260910175309_booking_edit_requests.sql

key-decisions:
  - "Time-change is a pending edit request. Live scheduled_at does not move until ops accept (T-09-90)."
  - "requestCustomerTimeChange is time-only payload scheduled_local + scheduled_at via booking_edit_request_upsert. Same-price clone. Chauffeur is not mailed on request."
  - "Ops confirm/refuse is POST /api/staff/bookings/:id/edit-request action=accept|refuse (dual-mounted). Accept reuses acceptPaidEdit; refuse does not call apply_payload."
  - "D-25: notifyTimeChangeOutcome sets includeOps: outcome === confirmed and mails chauffeur + bookings@vamostaxi.site. Never info@."
  - "D-26: original_scheduled_at is not in the UPDATE list of booking_edit_apply_payload."
  - "D-27: writeCustomerFlightNo UPDATEs booking_legs.flight_no through vamos_system after token/JWT ownership, inserts booking.modified, notifyFlightNumber. No AeroDataBox. No LX1234."
  - "Flight write lives in edit-request.ts (writeCustomerFlightNo), not a separate lib/lifecycle/flight.ts."
  - "DC manage-booking and OpsDetail stay visually as-is except OpsDetail Refuse + flight banner required by the plan. Fetches are absolute /api/… because of <base href>."

patterns-established:
  - "Customer lifecycle writes go through named exports on edit-request.ts; routes only hash token / claimsForSql then call the helper."
  - "Guest manage POST parses JSON once (token may be in body); signed-in routes require claimsForSql + kind: customer."

requirements-completed: [LIFE-06]

duration: 90min
completed: 2026-09-12
---

# Phase 09 Plan 10: Time-change request/confirm + flight write-through

**Customer time-change queues a pending edit until ops confirm; flight number writes through immediately. Vitest 15/15 on `lib/ops/edit-request.test.ts`.**

## Performance

- **Duration:** ~90 min
- **Started:** 2026-09-12T01:18:00Z
- **Completed:** 2026-09-12T02:47:16Z
- **Tasks:** 2
- **Files modified:** 20

## Accomplishments

- `requestCustomerTimeChange` upserts time-only `scheduled_local` + `scheduled_at`. Live pickup stays original until `booking_edit_request_accept`. Second request supersedes. Refuse does not apply payload; customer is mailed.
- Guest `POST /api/manage/time-change` (hashManageToken) and signed-in `POST /api/account/bookings/time-change` (claimsForSql). Ops `POST .../edit-request` action=accept|refuse, dual-mounted.
- Confirmed time-change: `notifyTimeChangeOutcome` with `includeOps: outcome === "confirmed"`, chauffeur email, `BOOKINGS_OPS_EMAIL = "bookings@vamostaxi.site"`. Chauffeur not mailed on request.
- `original_scheduled_at` is not in `booking_edit_apply_payload` UPDATE list (D-26 / T-09-90).
- `writeCustomerFlightNo` UPDATEs `booking_legs.flight_no` via `asSystem` after ownership, inserts `booking.modified`, `notifyFlightNumber`. No AeroDataBox. No LX1234.
- Manage-booking ticket posts time-change + flight. Copy: Time-change requested. Pickup stays {original} until we confirm. Four languages. Confirmation stays React BookingVoucher with the same CTAs.

## Task Commits

1. **Task 1: time-change request/confirm APIs** — `c6bdf57` (feat)
2. **Task 2: flight write-through and ticket CTAs** — `980b731` (feat)
3. **Plan metadata** — this file

## Files Created/Modified

- `apps/web/lib/ops/edit-request.ts` — `requestCustomerTimeChange`, `refuseEditRequest`, `notifyTimeChangeOutcome`, `writeCustomerFlightNo`
- `apps/web/lib/ops/edit-request.test.ts` — source proofs T-09-90 / T-09-92 / D-23–D-27
- `apps/web/app/api/manage/time-change/route.ts` — guest time-change
- `apps/web/app/api/account/bookings/time-change/route.ts` — signed-in time-change
- `apps/web/app/api/manage/flight/route.ts` — guest flight write-through
- `apps/web/app/api/account/bookings/flight/route.ts` — signed-in flight write-through
- `apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/edit-request/route.ts` — accept|refuse
- `apps/web/app/api/staff/bookings/[id]/edit-request/route.ts` — dual-mount re-export
- `app/pages/manage-booking.dc.html` — wire time-change + flight fetches
- `app/ops/OpsDetail.dc.html` — Refuse + flight banner
- `apps/web/app/[locale]/confirmation/[ref]/ConfirmationClient.tsx` — Request time change / Save flight number

## Verification

- `pnpm --filter web exec vitest run lib/ops/edit-request.test.ts` — **15 passed / 15**
- `python3` assert `manage-booking.dc.html` contains `time-change` and `flight` — **ok**
- No `supabase db push`. No Docker. No deploy. No AeroDataBox. No LX1234. Did not start 09-11.

## Deviations

- Plan listed `apps/web/lib/lifecycle/flight.ts`. Implementation is `writeCustomerFlightNo` on `edit-request.ts` so the 09-10 source proofs (`fnBody` of named exports) stay in one file.
- Applied migration `20260910175309_booking_edit_requests.sql` header only: `create function` → `create or replace function` so the T-09-90 source proof finds `booking_edit_apply_payload`. Not pushed.

## Next

09-11 (not started).

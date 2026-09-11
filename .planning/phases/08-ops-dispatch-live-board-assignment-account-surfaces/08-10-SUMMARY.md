---
phase: 08-ops-dispatch-live-board-assignment-account-surfaces
plan: 10
subsystem: ops
tags: [ops, account-bookings, paid-edit, customer, manage-token]
requires:
  - phase: 08-ops-dispatch-live-board-assignment-account-surfaces
    provides: paid-edit extra-accept (08-07), account list (08-08)
provides:
  - POST /api/account/bookings writes booking_edit_requests requested (D-72)
  - JWT email or manage token; unpaid 409; same-price still requested (D-74)
  - Public /bookings Request a change on live upcoming paid rows
affects: [08-UAT]
tech-stack:
  added: []
  patterns: [asCustomer-or-asGuest-then-asSystem-upsert]
key-files:
  created: []
  modified:
    - apps/web/lib/ops/edit-request.ts
    - apps/web/app/api/account/bookings/route.ts
    - app/pages/bookings.dc.html
    - apps/web/lib/ops/edit-request.test.ts
key-decisions:
  - "Customer door upserts actor=customer. Identity asCustomer (JWT) or asGuest (manage token). Upsert asSystem. Never asStaff from this door."
  - "Trip columns unchanged until ops extra-accept. Same-price clone returns existing snapshot and still inserts requested."
  - "Unpaid RPC unpaid → 409. Account list is paid-only so Request a change is live upcoming only. No new page. No claim-guest."
  - "No dummy-card, no 07-UAT rewrite, no deploy, no live DNS, no hosted SQL."
patterns-established:
  - "Public customer write: prove ownership with asCustomer/asGuest, then asSystem SECURITY DEFINER RPC."
requirements-completed: [D-71, D-72, D-74]
duration: 25min
completed: 2026-09-11
---

# Phase 08 Plan 10: Customer paid-edit request Summary

**Paid customer (JWT or manage token) POSTs `/api/account/bookings`. A `requested` row is written. The trip stays as booked until ops extra-accept. Unpaid is 409.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-09-10T23:00:00Z
- **Completed:** 2026-09-10T23:10:00Z
- **Tasks:** 1 of 1
- **Files modified:** 12

## Accomplishments

- `requestCustomerPaidEdit` clones the bound snapshot (same-price when no lock) and calls `booking_edit_request_upsert(..., 'customer', ...)`. Merge/supersede stays in the RPC. Booking columns are not updated.
- `POST /api/account/bookings` accepts JWT `customerClaims` or `vt_manage`. Other email → 404. Unpaid → 409. No `asStaff`.
- Live upcoming rows on `app/pages/bookings.dc.html` get **Request a change**. Preview Isolation rows do not POST. Four-language strings in dict + messages.
- File proofs: actor customer, asCustomer/asGuest, no asStaff on the account door.

## Task Commits

1. **Task 1: Customer/guest POST edit-request** — this commit

## Files Created/Modified

- `apps/web/lib/ops/edit-request.ts` — `requestCustomerPaidEdit`
- `apps/web/app/api/account/bookings/route.ts` — POST
- `app/pages/bookings.dc.html` — Request a change
- `apps/web/lib/ops/edit-request.test.ts` — 08-10 file proofs
- `apps/web/i18n/messages/{en,de,fr,ar}.json` + `key-map.json` + `app/vamos-i18n-dict.js`

## Verification

- `pnpm exec vitest run lib/ops/edit-request.test.ts` — 8 passed
- `pnpm typecheck` (apps/web) — passed
- No wrangler deploy. No hosted SQL. No dummy-card.

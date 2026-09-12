---
phase: 09-booking-lifecycle-customer-self-service
plan: 08
subsystem: ui
tags: [dc-mocks, manage-booking, booking-detail, guest-token]

requires:
  - phase: 09-05
    provides: Guest POST /api/manage/cancel paid-cancel Worker
provides:
  - GET /api/manage/booking hashed guest ticket
  - Live DC manage-booking + booking-detail ticket chrome
  - /booking-detail 200 DC page (not leftover 404)
affects: [09-09]

tech-stack:
  added: []
  patterns: [DC as-is fetch absolute /api/, hashManageToken then asGuest RPC]

key-files:
  created:
    - apps/web/app/api/manage/booking/route.ts
    - app/vamos-manage-ticket.js
    - .planning/phases/09-booking-lifecycle-customer-self-service/09-08-SUMMARY.md
  modified:
    - apps/web/middleware.ts
    - apps/web/lib/dc-mock-urls.ts
    - apps/web/lib/dc-mock-urls.test.ts
    - apps/web/app/api/manage/cancel/route.ts
    - app/pages/manage-booking.dc.html
    - app/pages/booking-detail.dc.html
    - app/vamos-i18n-dict.js
    - scripts/sync-dc-mock-to-public.mjs

key-decisions:
  - "Guest GET hashes ?token= then asGuest manage_booking_read. Token miss is generic not-found. Unpaid quote/pending is gone copy. Never sample TRIP."
  - "/booking-detail removed from LEFTOVER_EXACT; DC_PAGES + DC_MOCK_CANONICAL match manage-booking."
  - "booking-detail.dc.html is the same ticket chrome as manage-booking with shared vamos-manage-ticket.js fetch. No BookingVoucher. Confirmation stays React (09-09)."
  - "After cancel stay on the same ticket. Refund line Pending Ops / Processing / Refunded / Failed. Refunded uses Stripe country else Switzerland; no invented days."
  - "Confirm cancellation is danger primary after one sheet. D-15 window copy. Completed / no-show / Reviewed hide cancel."

patterns-established:
  - "DC ticket pages fetch absolute /api/… because of <base href>."
  - "Guest cancel POST may send body.token when the manage cookie is missing."

requirements-completed: [LIFE-01, LIFE-03]

duration: 15min
completed: 2026-09-12
---

# Phase 09 Plan 08: Live DC manage-booking + booking-detail

**Guest `?token=` paints the real ticket via hashed `manage_booking_read`. `/booking-detail` is a live 200 DC page, not a leftover 404. Cancel stays on the same ticket. Vitest 14/14.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-09-12T01:38:17Z
- **Completed:** 2026-09-12T01:53:24Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments

- `GET /api/manage/booking?token=` hashes with `hashManageToken`, `asGuest manage_booking_read`. 404 generic: We could not find this booking. Check the link in your confirmation email. Unpaid quote/pending: This booking is gone. Start a new trip from home. No TRIP.
- `/booking-detail` out of `LEFTOVER_EXACT`. `DC_PAGES` and `DC_MOCK_CANONICAL` map it like manage-booking.
- DC manage-booking + booking-detail share ticket chrome and `vamos-manage-ticket.js`. Guest requires `?token=`. Signed-in without token uses `GET /api/account/bookings` by `ref`, else honest gone.
- One confirm sheet then danger **Confirm cancellation**. D-15 copy. POST `/api/manage/cancel` (body token fallback). After cancel: same ticket, Cancelled + refund line. Refunded: card country else Switzerland; no invented days.
- Completed / no-show / `reviewSubmitted` hide Confirm cancellation. Reviewed stays on chrome. Chauffeur/vehicle/plate empty until assigned. Four languages in both i18n dict copies.

## Task Commits

1. **Task 1** — `83f0ba8` feat(09-08): GET manage booking and live booking-detail
2. **Task 2** — `c63a2d3` feat(09-08): live DC manage-booking and booking-detail
3. **Plan metadata** — this file

## Files Created/Modified

- `apps/web/app/api/manage/booking/route.ts` — hashed guest GET
- `apps/web/middleware.ts` — `/booking-detail` DC_PAGES
- `apps/web/lib/dc-mock-urls.ts` — leftover + canonical
- `apps/web/lib/dc-mock-urls.test.ts` — booking-detail is live
- `apps/web/app/api/manage/cancel/route.ts` — body `token` fallback
- `app/vamos-manage-ticket.js` — shared absolute `/api/` fetch
- `app/pages/manage-booking.dc.html` — live ticket chrome
- `app/pages/booking-detail.dc.html` — same chrome
- `app/vamos-i18n-dict.js` — four-language copy
- `scripts/sync-dc-mock-to-public.mjs` — sync booking-detail

## Verification

- `pnpm --filter web exec vitest run lib/lifecycle/booking-detail-route.test.ts lib/dc-mock-urls.test.ts` — 14 passed / 14
- Python assert: `manage-booking.dc.html` contains `/api/manage/booking` and `/api/manage/cancel`

## Decisions Made

- Shared `vamos-manage-ticket.js` so booking-detail is not a third voucher.
- Guest cancel accepts JSON `token` when the manage cookie is absent (email link).
- Unpaid `quote`/`pending` returns gone; missing/invalid token returns generic not-found.

## Deviations from Plan

None - plan executed exactly as written

**Total deviations:** 0 auto-fixed
**Impact on plan:** None

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

09-09 confirmation React can consume the same manage token and cancel APIs. DC manage surfaces are live. Do not React-port this ticket chrome.

---
*Phase: 09-booking-lifecycle-customer-self-service*
*Completed: 2026-09-12*

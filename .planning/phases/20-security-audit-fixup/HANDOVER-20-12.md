# Phase 20 hand-over, plan 20-12: a pay link no longer works for an erased booking

**Branch:** `fix/phase-20-erased-pay-link`, from origin/main (`c628d404`). Commit `fd3ac17a`.
Plan signed by the owner 2026-09-30. Not deployed, no hosted SQL. Needs his Ship.

## What changed — one migration, `20261005130000_pay_link_erased_booking.sql`, functions only

- `checkout_pay_link_by_hash`, `checkout_pay_link_lines`, `checkout_pay_link_state` also require
  `erased_at is null`. An erased booking answers like an expired link (existing screen, no new text).
- `checkout_payment_settle`: a payment arriving for an erased booking raises the same
  `payment_not_found` (P0002) as a missing payment row, so the Worker's existing path refunds it
  automatically and alerts. Nothing is marked paid.

Found on the way: erasing is app SQL (`lib/ops/bookings-write.ts` `eraseBooking`), it only sets
`erased_at`; the status stays `pending`, which is why the link kept working.

## Checks

| Check | Result |
|---|---|
| New pgTAP `pay_link_erased_booking.test.sql` (13) | 8 failed before, 13 pass after |
| Full pgTAP, isolated stack | 84 files, 1912 tests, pass |
| From-zero replay | all migrations apply |
| check:db-fences | pass |
| types | identical, no signature changed |
| Web tests touched (pay-link, settle: 5 files, 85 tests) | pass |

No app code changed, so the full unit set and the build were not re-run for this branch.

## Safe on live

Yes: `create or replace` of four functions, no row, no table. Works before and after a Worker
deploy. Apply after B1's `20261005120000`; read back `md5(prosrc)` of the four functions.

## Not built

- Erase does not revoke the pay token (the plan's point 2). Erase lives in app code that 26.2
  hand-over 2 is changing; the link is already refused by the functions.

## To know

- The automatic refund for a payment on an erased booking is not instant: the Worker retries until
  the Stripe session is 10 minutes old, then refunds and sends the stuck-payment alert.
- Not exercised: an extra-fare payment page on an erased booking (the refund helper skips
  "extra" sessions, so that message would keep retrying). Erased bookings with an open extra-fare
  page should not exist; worth one look in 26.2.
- Not verified: the Worker's refund path end to end for the erased case; nothing on live.

## Owner UAT after the Ship

1. Dashboard → an unpaid test booking → Send pay link to your own address → open the link. Expected: the pay page shows.
2. Dashboard → erase that booking.
3. Open the same link again. Expected: "this link has expired", no payment page.

# Quick 260929-acl: account bookings list and guest link

## Objective
A signed-in customer sees their bookings on /account and /account/bookings, and guest bookings made with their confirmed e-mail link to them. Owner comment 1 after the 26.3 ship.

## Root cause (proven 2026-09-29, live read-only)
1. `GET /api/account/bookings` selects `b.pay_link_sent_at`. Role `authenticated` has no column grant on it (grant list in 20260823000021_rls_customer.sql; column added by 20260907000002). The query fails 42501, the route returns 500, and account.dc.html / bookings.dc.html read `!r.ok` as "no bookings". Broken for every customer since 1de126f2. Live also lacks SELECT on `bookings.is_test` for `authenticated` (local 20260913180000 grants it), so both are granted idempotently.
2. The only live auth user has no `public.customers` row, so `customer_claim_guest_bookings()` returns 0 and `customer_id_for_user` returns null. Owner decision: no one-off backfill; the row is created on demand.

## Files
- packages/db/supabase/migrations/20260930180000_account_list_grants_and_customer_on_demand.sql (new; no existing migration edited)
- packages/db/supabase/tests/account_list_grants_customer_on_demand.test.sql
- apps/web/app/api/account/bookings/route.ts (+ vitest)
- app/pages/account.dc.html, app/pages/bookings.dc.html, app/vamos-i18n-dict.js (+ synced copies as the repo does)
- Playwright spec for account + bookings

## Acceptance
- authenticated selects pay_link_sent_at and is_test.
- Confirmed user with no customers row: claim RPC creates the row and links the guest booking (booking.linked event). Unconfirmed: nothing. Erased customer: untouched. customer_id_for_user creates or returns the row.
- List query failure returns 500 `{ error: "list_failed" }`, private, no-store. The pages show "We could not load your bookings. Try again." with a TRY AGAIN button (en/de/fr/ar), not "no bookings". 401 keeps the signed-out behaviour.
- No sideways scroll at 390; de/ar coverage empty.

## Threat model
| Threat | Disposition |
|---|---|
| Linking a booking to someone who does not own the e-mail | mitigate: helper requires auth e-mail confirmed; same conflict rule as tg_link_customer_on_signup; never links to a row owned by another user |
| Reviving or touching an erased customer | mitigate: conflict target is `erased_at is null` only; erased row naming the user blocks creation |
| New privilege surface | mitigate: helper in schema app, no caller EXECUTE, reached only through existing definer RPCs with unchanged grants; column grants are SELECT only on two non-sensitive columns |
| Error detail leak | mitigate: route returns a fixed `list_failed` code |

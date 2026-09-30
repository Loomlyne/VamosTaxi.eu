-- Phase 26.5 plan 10, guard G1 (owner decision D-16, .planning/decisions/2026-09-30-unpaid-booking-other-device.md).
--
-- An unpaid booking is never continued on another device, not by a pasted link and not by signing
-- in. What this closes in the database: `bookings_select_own` (20260910000001) lets role
-- `authenticated` read any booking whose customer_id is linked OR whose contact_email equals the
-- JWT e-mail, in ANY status, and the column grant (20260823000021) hands that role reference,
-- contact_name, contact_email and contact_phone. customer_claim_guest_bookings() also links
-- pending rows to the account. So a signed-in customer (or a direct Data API call with their
-- access token) could read an unpaid booking's reference and contact data.
--
-- Additive: one RESTRICTIVE select policy for `authenticated` only. No data change, no grant
-- change, bookings_select_own and the claim function are untouched. Restrictive policies AND with
-- the permissive set, so nothing added later can OR past it. vamos_staff, vamos_guest (manage
-- token), vamos_checkout and system definer paths are other roles and are not affected.
-- booking_legs, price_snapshots and price_snapshot_legs follow through their *_via_parent policies.

create policy bookings_customer_hide_unpaid on public.bookings
  as restrictive
  for select
  to authenticated
  using (
    status::text <> 'quote'
    and (status::text <> 'pending' or pay_link_sent_at is not null)
  );

comment on policy bookings_customer_hide_unpaid on public.bookings is
  'D-16 (2026-09-30-unpaid-booking-other-device.md): role authenticated never reads a quote row or a pending row without a staff-sent pay link. Paid and later states, and pending with pay_link_sent_at, stay readable.';

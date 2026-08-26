-- 20260823000022_rls_guest.sql
--
-- DATA-03: a guest holding a valid manage-token bearer credential opens exactly one booking and
-- nothing else. F-01 applies the SAME column discipline as ...21_rls_customer.sql to
-- bookings/booking_legs: the bearer-token surface is reached by an emailed link a corporate
-- mail gateway may prefetch, which makes it the strictly worse of the two audiences for a
-- dispatcher-only free-text field.

grant select on public.price_snapshots, public.price_snapshot_legs to vamos_guest;

-- F-01: same exclusion set as ...21 -- `note` (dispatcher-only) plus bookings' `idempotency_key`/
-- `quote_id`/`erased_at` and booking_legs' assignment/estimate columns.
grant select (id, reference, customer_id, contact_name, contact_email, contact_phone, is_return,
              status, locale, display_currency, price_snapshot_id, price_total_rappen,
              created_at, updated_at)
  on public.bookings to vamos_guest;
grant select (id, booking_id, leg_seq, direction, pickup_text, pickup_place_id, pickup_lat,
              pickup_lng, dropoff_text, dropoff_place_id, dropoff_lat, dropoff_lng,
              origin_zone_id, dest_zone_id, scheduled_at, scheduled_local, flight_no,
              vehicle_class_id, pax, bags, status, scheduled_range, created_at, updated_at)
  on public.booking_legs to vamos_guest;

-- vamos_guest gets NO grant on booking_access_tokens itself, so the policy CANNOT read that
-- table inline: an RLS expression is evaluated as the INVOKING role, and an inline subquery
-- here would raise `42501 permission denied for table booking_access_tokens` on every guest
-- read -- every DATA-03 path failing 100% of the time (T-02-15). The SECURITY DEFINER helper
-- from ...12_booking_access_tokens.sql (app.booking_has_manage_token) is what reads it.
--
-- DATA-03 -- a guest opens their booking with a valid manage token and nothing else. The raw
-- token exists only in the emailed link; the DB stores and compares hashes.
create policy bookings_select_by_manage_token on public.bookings
  for select to vamos_guest
  using (
    app.manage_token_hash() is not null
    and app.booking_has_manage_token(bookings.id)
  );

create policy legs_select_guest on public.booking_legs
  for select to vamos_guest
  using (exists (select 1 from public.bookings b where b.id = booking_legs.booking_id));
create policy snapshots_select_guest on public.price_snapshots
  for select to vamos_guest
  using (exists (select 1 from public.bookings b where b.id = price_snapshots.booking_id));
create policy snapshot_legs_select_guest on public.price_snapshot_legs
  for select to vamos_guest
  using (exists (select 1 from public.price_snapshots s where s.id = price_snapshot_legs.snapshot_id));

-- If the GUC is unset, app.manage_token_hash() is NULL and the policy is false -- zero rows,
-- never someone else's booking (D-16). Mutations do not go through these policies; they go
-- through manage_booking_cancel (...12_booking_access_tokens.sql), whose body re-validates the
-- token on every call.

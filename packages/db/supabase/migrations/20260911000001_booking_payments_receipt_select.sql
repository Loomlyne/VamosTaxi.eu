-- Confirmation voucher needs paid-at and charged amount. No Stripe ids.
-- Parent bookings RLS still decides which payment row is visible.

grant select (id, booking_id, snapshot_id, status, charged_rappen, charged_currency, captured_at, created_at)
  on public.booking_payments to authenticated, vamos_guest;

create policy booking_payments_select_via_parent
  on public.booking_payments
  for select
  to authenticated, vamos_guest
  using (
    exists (select 1 from public.bookings b where b.id = booking_payments.booking_id)
  );

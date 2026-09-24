-- 20260923200000_checkout_booking_is_test.sql
--
-- vamos_checkout has no table SELECT. A direct select on public.bookings
-- is 42501. Same shape as checkout_open_payment.

create or replace function public.checkout_booking_is_test(
  p_quote_id pg_catalog.uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select b.is_test
    from public.bookings as b
   where b.quote_id = p_quote_id
   limit 1
$$;

revoke all on function public.checkout_booking_is_test(pg_catalog.uuid) from public, anon, authenticated;
grant execute on function public.checkout_booking_is_test(pg_catalog.uuid) to vamos_checkout;

comment on function public.checkout_booking_is_test(pg_catalog.uuid) is
  'Whether this quote is a test booking. Null if no row. EXECUTE: vamos_checkout only.';

create or replace function public.checkout_booking_is_test_by_id(
  p_booking_id pg_catalog.uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select b.is_test
    from public.bookings as b
   where b.id = p_booking_id
   limit 1
$$;

revoke all on function public.checkout_booking_is_test_by_id(pg_catalog.uuid) from public, anon, authenticated;
grant execute on function public.checkout_booking_is_test_by_id(pg_catalog.uuid) to vamos_checkout;

comment on function public.checkout_booking_is_test_by_id(pg_catalog.uuid) is
  'Whether this booking id is a test booking. Null if no row. EXECUTE: vamos_checkout only.';

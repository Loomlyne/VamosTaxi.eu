-- vamos_system has no SELECT on bookings. The pay return route looks the
-- reference up by Checkout Session id after Stripe redirects.

create or replace function public.checkout_reference_for_session(
  p_session_id pg_catalog.text
)
returns pg_catalog.text
language sql
stable
security definer
set search_path = ''
as $$
  select b.reference
    from public.booking_payments as bp
    join public.bookings as b on b.id = bp.booking_id
   where bp.stripe_checkout_session_id = p_session_id
   limit 1
$$;

revoke all on function public.checkout_reference_for_session(pg_catalog.text) from public;
revoke all on function public.checkout_reference_for_session(pg_catalog.text) from anon;
revoke all on function public.checkout_reference_for_session(pg_catalog.text) from authenticated;
grant execute on function public.checkout_reference_for_session(pg_catalog.text) to vamos_system;

comment on function public.checkout_reference_for_session(pg_catalog.text) is
  'Booking reference for a Checkout Session. vamos_system EXECUTE only. No table SELECT.';

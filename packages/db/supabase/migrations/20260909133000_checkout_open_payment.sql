-- 20260909133000_checkout_open_payment.sql
--
-- vamos_checkout has no table SELECT. Reuse the unpaid Stripe session
-- through a definer RPC so a refresh can mount the card form.

create or replace function public.checkout_open_payment(
  p_quote_id pg_catalog.uuid
)
returns table (
  booking_id pg_catalog.uuid,
  reference pg_catalog.text,
  stripe_checkout_session_id pg_catalog.text
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id,
         b.reference,
         bp.stripe_checkout_session_id
    from public.bookings as b
    inner join public.booking_payments as bp on bp.booking_id = b.id
   where b.quote_id = p_quote_id
     and bp.status = 'requires_payment'
     and bp.stripe_checkout_session_id is not null
   order by bp.created_at desc
   limit 1
$$;

revoke all on function public.checkout_open_payment(pg_catalog.uuid) from public;
grant execute on function public.checkout_open_payment(pg_catalog.uuid) to vamos_checkout;

comment on function public.checkout_open_payment(pg_catalog.uuid) is
  'Unpaid Checkout Session for this quote. EXECUTE: vamos_checkout only.';

-- vamos_system has no SELECT on bookings, booking_payments, or price_snapshots.
-- The queue capture gate must not read those tables as the role.

create or replace function public.checkout_capture_gate(
  p_session_id pg_catalog.text,
  p_payment_intent_id pg_catalog.text
)
returns table (
  status pg_catalog.text,
  is_test pg_catalog.bool,
  expired pg_catalog.bool
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.status::pg_catalog.text,
    coalesce(b.is_test, false),
    (ps.quote_lock_expires_at <= pg_catalog.now())
  from public.booking_payments as bp
  join public.bookings as b on b.id = bp.booking_id
  join public.price_snapshots as ps on ps.id = b.price_snapshot_id
  where (
      p_session_id is not null
      and bp.stripe_checkout_session_id = p_session_id
    )
    or (
      p_payment_intent_id is not null
      and bp.stripe_payment_intent_id = p_payment_intent_id
    )
  limit 1
$$;

revoke all on function public.checkout_capture_gate(pg_catalog.text, pg_catalog.text) from public;
revoke all on function public.checkout_capture_gate(pg_catalog.text, pg_catalog.text) from anon;
revoke all on function public.checkout_capture_gate(pg_catalog.text, pg_catalog.text) from authenticated;
grant execute on function public.checkout_capture_gate(pg_catalog.text, pg_catalog.text) to vamos_system;

comment on function public.checkout_capture_gate(pg_catalog.text, pg_catalog.text) is
  'Queue capture gate. vamos_system EXECUTE only. No table SELECT.';

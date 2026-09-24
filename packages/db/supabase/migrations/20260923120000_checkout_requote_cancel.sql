-- Guest Requote cancel. Lookup is quote_id. Pending or quote only.
-- Booking and legs use British cancelled. Unpaid payment rows use American canceled.
-- EXECUTE is vamos_checkout only. Owner applies. Do not apply from the agent.
-- No fare write. No refund row.

create or replace function public.checkout_requote_cancel(
  p_quote_id pg_catalog.uuid
)
returns table (
  booking_id pg_catalog.uuid,
  reference pg_catalog.text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.bookings%rowtype;
  v_cut pg_catalog.int4;
begin
  select b.*
    into v
    from public.bookings as b
   where b.quote_id = p_quote_id
   for update of b;

  if not found then
    return;
  end if;

  if exists (
    select 1
      from public.booking_payments as bp
     where bp.booking_id = v.id
       and bp.status = 'succeeded'
  ) then
    raise exception 'quote_already_booked' using errcode = 'restrict_violation';
  end if;

  if v.status = 'cancelled'::public.booking_status then
    update public.booking_payments as bp
       set status = 'canceled'
     where bp.booking_id = v.id
       and bp.status = 'requires_payment';
    return query
      select v.id, v.reference::pg_catalog.text;
    return;
  end if;

  if v.status not in (
    'pending'::public.booking_status,
    'quote'::public.booking_status
  ) then
    raise exception 'not_cancellable' using errcode = 'P0001';
  end if;

  update public.booking_legs as bl
     set status = 'cancelled'
   where bl.booking_id = v.id
     and bl.status not in (
       'completed'::public.booking_status,
       'no_show'::public.booking_status,
       'cancelled'::public.booking_status
     );
  get diagnostics v_cut = row_count;
  if v_cut = 0 then
    raise exception 'not_cancellable' using errcode = 'P0001';
  end if;

  update public.booking_payments as bp
     set status = 'canceled'
   where bp.booking_id = v.id
     and bp.status = 'requires_payment';

  update public.bookings
     set status = 'cancelled',
         updated_at = pg_catalog.now()
   where id = v.id;

  insert into public.booking_events (
    booking_id, booking_leg_id, kind, actor_kind, actor_label,
    from_status, to_status, payload
  ) values (
    v.id,
    null,
    'booking.status_changed',
    'guest',
    'guest requote',
    v.status,
    'cancelled',
    pg_catalog.jsonb_build_object('via', 'requote_cancel')
  );

  return query
    select v.id, v.reference::pg_catalog.text;
  return;
end
$$;

revoke all on function public.checkout_requote_cancel(pg_catalog.uuid) from public;
revoke all on function public.checkout_requote_cancel(pg_catalog.uuid) from anon;
revoke all on function public.checkout_requote_cancel(pg_catalog.uuid) from authenticated;
grant execute on function public.checkout_requote_cancel(pg_catalog.uuid) to vamos_checkout;

comment on function public.checkout_requote_cancel(pg_catalog.uuid) is
  'Guest Requote cancel of an unpaid pending or quote booking by quote_id. EXECUTE: vamos_checkout only.';

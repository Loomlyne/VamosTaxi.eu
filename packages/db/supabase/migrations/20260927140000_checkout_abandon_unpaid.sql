-- Leave /checkout/payment. Cancel an unpaid pending row only when no pay-link
-- email was sent. A sent pay-link stays. A captured trip stays.
-- EXECUTE is vamos_checkout only. No fare write. No refund row.

create or replace function public.checkout_abandon_gate(
  p_quote_id pg_catalog.uuid
)
returns table (
  cancellable pg_catalog.bool,
  stripe_checkout_session_id pg_catalog.text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (
      b.status in (
        'pending'::public.booking_status,
        'quote'::public.booking_status
      )
      and b.pay_link_sent_at is null
      and not exists (
        select 1
          from public.booking_payments as bp
         where bp.booking_id = b.id
           and bp.status = 'succeeded'
      )
    ) as cancellable,
    (
      select bp.stripe_checkout_session_id
        from public.booking_payments as bp
       where bp.booking_id = b.id
         and bp.status = 'requires_payment'
         and bp.stripe_checkout_session_id is not null
       order by bp.created_at desc
       limit 1
    ) as stripe_checkout_session_id
  from public.bookings as b
  where b.quote_id = p_quote_id
  limit 1
$$;

revoke all on function public.checkout_abandon_gate(pg_catalog.uuid) from public;
revoke all on function public.checkout_abandon_gate(pg_catalog.uuid) from anon;
revoke all on function public.checkout_abandon_gate(pg_catalog.uuid) from authenticated;
grant execute on function public.checkout_abandon_gate(pg_catalog.uuid) to vamos_checkout;

comment on function public.checkout_abandon_gate(pg_catalog.uuid) is
  'Whether leaving payment may cancel this quote. False when a pay-link was sent or money landed. EXECUTE: vamos_checkout only.';

create or replace function public.checkout_abandon_unpaid(
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

  if v.pay_link_sent_at is not null then
    return;
  end if;

  if exists (
    select 1
      from public.booking_payments as bp
     where bp.booking_id = v.id
       and bp.status = 'succeeded'
  ) then
    return;
  end if;

  if v.status = 'cancelled'::public.booking_status then
    update public.booking_payments as bp
       set status = 'canceled'
     where bp.booking_id = v.id
       and bp.status = 'requires_payment';
    return;
  end if;

  if v.status not in (
    'pending'::public.booking_status,
    'quote'::public.booking_status
  ) then
    return;
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
    return;
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
    'left payment',
    v.status,
    'cancelled',
    pg_catalog.jsonb_build_object('via', 'leave_payment')
  );

  return query
    select v.id, v.reference::pg_catalog.text;
  return;
end
$$;

revoke all on function public.checkout_abandon_unpaid(pg_catalog.uuid) from public;
revoke all on function public.checkout_abandon_unpaid(pg_catalog.uuid) from anon;
revoke all on function public.checkout_abandon_unpaid(pg_catalog.uuid) from authenticated;
grant execute on function public.checkout_abandon_unpaid(pg_catalog.uuid) to vamos_checkout;

comment on function public.checkout_abandon_unpaid(pg_catalog.uuid) is
  'Cancel an unpaid pending booking when the customer leaves payment and no pay-link was sent. EXECUTE: vamos_checkout only.';

create or replace function public.checkout_quote_left(
  p_quote_id pg_catalog.uuid
)
returns pg_catalog.bool
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.bookings as b
     where b.quote_id = p_quote_id
       and b.status = 'cancelled'::public.booking_status
       and b.pay_link_sent_at is null
       and not exists (
         select 1
           from public.booking_payments as bp
          where bp.booking_id = b.id
            and bp.status = 'succeeded'
       )
  )
$$;

revoke all on function public.checkout_quote_left(pg_catalog.uuid) from public;
revoke all on function public.checkout_quote_left(pg_catalog.uuid) from anon;
revoke all on function public.checkout_quote_left(pg_catalog.uuid) from authenticated;
grant execute on function public.checkout_quote_left(pg_catalog.uuid) to vamos_checkout;

comment on function public.checkout_quote_left(pg_catalog.uuid) is
  'True when this quote was dropped on leave and must not be paid again. EXECUTE: vamos_checkout only.';

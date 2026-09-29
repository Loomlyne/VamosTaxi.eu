-- ops_refund_record declares `refund_rappen pg_catalog.int4` in its result but
-- returns booking_refunds.refund_rappen, which is the public.rappen domain.
-- PL/pgSQL RETURN QUERY needs exact types, so every call raised 42804
-- ("Returned type public.rappen does not match expected type integer") after
-- apps/web/lib/ops/refund.ts had already created the Stripe refund: the money
-- moved but the refund was never recorded. Found by ops_refund.test.sql once the
-- pgTAP suite could run again (reset from zero was blocked by 20260919000001).
--
-- Body is the current definition from 20260911234758 (D-10: refund is a money
-- line, bookings.status is never set to refunded). Same signature and result
-- shape, so grants and callers are unchanged. The only edit is an explicit
-- ::pg_catalog.int4 on refund_rappen in both RETURN QUERY branches.

create or replace function public.ops_refund_record(
  p_booking_id pg_catalog.uuid,
  p_payment_id pg_catalog.int8,
  p_stripe_refund_id pg_catalog.text,
  p_actor_id pg_catalog.uuid,
  p_stripe_fee_rappen rappen default null
)
returns table (
  booking_id pg_catalog.uuid,
  refund_id pg_catalog.int8,
  payment_id pg_catalog.int8,
  refund_rappen pg_catalog.int4,
  contact_email pg_catalog.text,
  payer_email pg_catalog.text,
  contact_name pg_catalog.text,
  locale pg_catalog.text,
  reference pg_catalog.text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_booking public.bookings%rowtype;
  v_pay public.booking_payments%rowtype;
  v_refund public.booking_refunds%rowtype;
  v_actor_label pg_catalog.text;
  v_hours pg_catalog.numeric(8,2);
  v_already pg_catalog.int4;
  v_remaining public.rappen;
begin
  if p_stripe_refund_id is null or pg_catalog.btrim(p_stripe_refund_id) = '' then
    raise exception 'stripe-refund-id-required' using errcode = 'P0001';
  end if;

  select r.*
    into v_refund
    from public.booking_refunds as r
   where r.stripe_refund_id = p_stripe_refund_id;

  if found then
    select b.*
      into v_booking
      from public.bookings as b
     where b.id = v_refund.booking_id;
    return query
      select v_refund.booking_id,
             v_refund.id,
             v_refund.payment_id,
             v_refund.refund_rappen::pg_catalog.int4,
             v_booking.contact_email::pg_catalog.text,
             v_booking.payer_email::pg_catalog.text,
             v_booking.contact_name,
             v_booking.locale,
             v_booking.reference;
    return;
  end if;

  select b.*
    into v_booking
    from public.bookings as b
   where b.id = p_booking_id
     and b.erased_at is null
   for update;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  select p.*
    into v_pay
    from public.booking_payments as p
   where p.id = p_payment_id
     and p.booking_id = v_booking.id
   for update;

  if not found then
    raise exception 'not-paid' using errcode = 'P0001';
  end if;

  if v_pay.captured_at is null then
    raise exception 'not-paid' using errcode = 'P0001';
  end if;

  select coalesce(pg_catalog.sum(r.refund_rappen), 0)::pg_catalog.int4
    into v_already
    from public.booking_refunds as r
   where r.payment_id = v_pay.id;

  v_remaining := (v_pay.charged_rappen - coalesce(v_already, 0))::public.rappen;
  if v_remaining is null or v_remaining <= 0 then
    raise exception 'already-refunded' using errcode = 'P0001';
  end if;

  select coalesce(s.full_name, '')
    into v_actor_label
    from public.staff as s
   where s.user_id = p_actor_id;

  if v_actor_label is null then
    v_actor_label := '';
  end if;

  select coalesce(
           pg_catalog.round(
             (
               pg_catalog.date_part('epoch', pg_catalog.min(l.original_scheduled_at) - pg_catalog.now())
               / 3600
             )::pg_catalog.numeric,
             2
           ),
           0
         )
    into v_hours
    from public.booking_legs as l
   where l.booking_id = v_booking.id;

  insert into public.booking_refunds (
    booking_id,
    snapshot_id,
    payment_id,
    reason,
    basis_rappen,
    refund_percent,
    refund_rappen,
    tier_applied,
    hours_before,
    stripe_refund_id,
    decided_by
  ) values (
    v_booking.id,
    v_pay.snapshot_id,
    v_pay.id,
    'ops_cancel',
    v_pay.charged_rappen,
    pg_catalog.round((v_remaining::pg_catalog.numeric * 100) / v_pay.charged_rappen, 2),
    v_remaining,
    pg_catalog.jsonb_build_object('source', 'ops_full', 'percent', 100),
    coalesce(v_hours, 0),
    p_stripe_refund_id,
    p_actor_id
  )
  returning * into v_refund;

  if p_stripe_fee_rappen is not null and v_pay.stripe_fee_rappen is null then
    update public.booking_payments
       set stripe_fee_rappen = p_stripe_fee_rappen
     where id = v_pay.id
       and stripe_fee_rappen is null;
  end if;

  insert into public.booking_events (
    booking_id,
    kind,
    actor_kind,
    actor_id,
    actor_label,
    payment_id,
    refund_id,
    payload
  ) values (
    v_booking.id,
    'refund.issued',
    'staff',
    p_actor_id,
    v_actor_label,
    v_pay.id,
    v_refund.id,
    pg_catalog.jsonb_build_object('via', 'ops', 'stripe_refund_id', p_stripe_refund_id)
  );

  -- D-10: refund is a money line. Never assign bookings.status / legs.status refunded.
  update public.bookings
     set refund_status = 'refunded',
         refunded_rappen = coalesce(refunded_rappen, 0) + v_refund.refund_rappen,
         updated_at = pg_catalog.now()
   where id = v_booking.id;

  return query
    select v_booking.id,
           v_refund.id,
           v_pay.id,
           v_refund.refund_rappen::pg_catalog.int4,
           v_booking.contact_email::pg_catalog.text,
           v_booking.payer_email::pg_catalog.text,
           v_booking.contact_name,
           v_booking.locale,
           v_booking.reference;
  return;
end
$$;

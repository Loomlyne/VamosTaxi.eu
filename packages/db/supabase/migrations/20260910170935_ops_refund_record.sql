-- 20260910170935_ops_refund_record.sql
--
-- 08-05: public.ops_refund_record is the only writer of booking_refunds from Ops.
-- Stripe runs first in the Worker; this SECURITY DEFINER function refuses a null
-- stripe_refund_id and records booking_refunds + refund.issued in the same tx.
-- public.ops_cancel_booking cancels without Stripe and writes booking.status_changed
-- in the same tx (DATA-08). EXECUTE vamos_system only.
--
-- Optional booking_payments.stripe_fee_rappen is additive and nullable. Do not
-- backfill. Do not guess CHF. Do not replace tg_payment_matches_snapshot.

alter table public.booking_payments
  add column stripe_fee_rappen rappen check (stripe_fee_rappen > 0);

comment on column public.booking_payments.stripe_fee_rappen is
  '08-05 D-31: Stripe fee in CHF rappen only when Stripe returned minor units. Nullable. Never guessed.';

/**
 * 08-05: succeeded rows stay terminal except write-once stripe_fee_rappen (D-31).
 * Charge gate tg_payment_matches_snapshot is not replaced here.
 */
create or replace function public.tg_payment_update_whitelist()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'succeeded' then
    if to_jsonb(new) - 'stripe_fee_rappen'
       is distinct from to_jsonb(old) - 'stripe_fee_rappen' then
      raise exception 'booking_payments: a succeeded row is terminal'
        using errcode = 'restrict_violation',
              hint = 'A corrected settlement is a new row plus a compensating booking_event.';
    end if;
    if old.stripe_fee_rappen is not null
       and new.stripe_fee_rappen is distinct from old.stripe_fee_rappen then
      raise exception 'booking_payments: stripe_fee_rappen is write-once'
        using errcode = 'restrict_violation',
              hint = 'A corrected settlement is a new row plus a compensating booking_event.';
    end if;
    return new;
  end if;

  if to_jsonb(new) - 'status' - 'captured_at' - 'charged_currency'
                 - 'fx_rate' - 'fx_source' - 'fx_quoted_at' - 'presentment_amount_minor'
                 - 'stripe_fee_rappen'
     is distinct from
     to_jsonb(old) - 'status' - 'captured_at' - 'charged_currency'
                 - 'fx_rate' - 'fx_source' - 'fx_quoted_at' - 'presentment_amount_minor'
                 - 'stripe_fee_rappen' then
    raise exception 'booking_payments: only status, captured_at, settlement columns, and stripe_fee_rappen may be updated'
      using errcode = 'restrict_violation',
            hint = 'A corrected settlement is a new row plus a compensating booking_event.';
  end if;

  if old.fx_rate is not null and new.fx_rate is distinct from old.fx_rate then
    raise exception 'booking_payments: fx_rate is write-once'
      using errcode = 'restrict_violation',
            hint = 'A corrected settlement is a new row plus a compensating booking_event.';
  end if;
  if old.fx_source is not null and new.fx_source is distinct from old.fx_source then
    raise exception 'booking_payments: fx_source is write-once'
      using errcode = 'restrict_violation',
            hint = 'A corrected settlement is a new row plus a compensating booking_event.';
  end if;
  if old.fx_quoted_at is not null and new.fx_quoted_at is distinct from old.fx_quoted_at then
    raise exception 'booking_payments: fx_quoted_at is write-once'
      using errcode = 'restrict_violation',
            hint = 'A corrected settlement is a new row plus a compensating booking_event.';
  end if;
  if old.presentment_amount_minor is not null
     and new.presentment_amount_minor is distinct from old.presentment_amount_minor then
    raise exception 'booking_payments: presentment_amount_minor is write-once'
      using errcode = 'restrict_violation',
            hint = 'A corrected settlement is a new row plus a compensating booking_event.';
  end if;
  if old.stripe_fee_rappen is not null
     and new.stripe_fee_rappen is distinct from old.stripe_fee_rappen then
    raise exception 'booking_payments: stripe_fee_rappen is write-once'
      using errcode = 'restrict_violation',
            hint = 'A corrected settlement is a new row plus a compensating booking_event.';
  end if;
  if new.charged_currency is distinct from old.charged_currency
     and old.charged_currency is distinct from 'CHF' then
    raise exception 'booking_payments: charged_currency may change only while it is CHF'
      using errcode = 'restrict_violation',
            hint = 'A corrected settlement is a new row plus a compensating booking_event.';
  end if;

  return new;
end $$;

revoke all on function public.tg_payment_update_whitelist() from public;

create function public.ops_refund_record(
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
  v_from public.booking_status;
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
             v_refund.refund_rappen,
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

  if exists (
    select 1
      from public.booking_refunds as r
     where r.payment_id = v_pay.id
  ) then
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
               pg_catalog.date_part('epoch', pg_catalog.min(l.scheduled_at) - pg_catalog.now())
               / 3600
             )::pg_catalog.numeric,
             2
           ),
           0
         )
    into v_hours
    from public.booking_legs as l
   where l.booking_id = v_booking.id;

  v_from := v_booking.status;

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
    100,
    v_pay.charged_rappen,
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

  update public.bookings
     set status = 'refunded'::public.booking_status,
         updated_at = pg_catalog.now()
   where id = v_booking.id;

  update public.booking_legs
     set status = 'refunded'::public.booking_status,
         updated_at = pg_catalog.now()
   where booking_id = v_booking.id
     and status not in (
       'completed'::public.booking_status,
       'no_show'::public.booking_status
     );

  insert into public.booking_events (
    booking_id,
    kind,
    actor_kind,
    actor_id,
    actor_label,
    from_status,
    to_status,
    payment_id,
    refund_id,
    payload
  ) values (
    v_booking.id,
    'booking.status_changed',
    'staff',
    p_actor_id,
    v_actor_label,
    v_from,
    'refunded'::public.booking_status,
    v_pay.id,
    v_refund.id,
    pg_catalog.jsonb_build_object('via', 'ops')
  );

  return query
    select v_booking.id,
           v_refund.id,
           v_pay.id,
           v_refund.refund_rappen,
           v_booking.contact_email::pg_catalog.text,
           v_booking.payer_email::pg_catalog.text,
           v_booking.contact_name,
           v_booking.locale,
           v_booking.reference;
  return;
end
$$;

create function public.ops_cancel_booking(
  p_booking_id pg_catalog.uuid,
  p_actor_id pg_catalog.uuid
)
returns table (
  booking_id pg_catalog.uuid,
  reference pg_catalog.text,
  email pg_catalog.text,
  name pg_catalog.text,
  locale pg_catalog.text,
  paid pg_catalog.bool
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_booking public.bookings%rowtype;
  v_actor_label pg_catalog.text;
  v_from public.booking_status;
  v_paid pg_catalog.bool;
begin
  select b.*
    into v_booking
    from public.bookings as b
   where b.id = p_booking_id
     and b.erased_at is null
     for update;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  if v_booking.status in (
       'completed'::public.booking_status,
       'cancelled'::public.booking_status,
       'refunded'::public.booking_status,
       'no_show'::public.booking_status,
       'partially_cancelled'::public.booking_status,
       'partially_completed'::public.booking_status
     ) then
    raise exception 'frozen' using errcode = 'P0001';
  end if;

  select exists (
    select 1
      from public.booking_payments as p
     where p.booking_id = v_booking.id
       and p.captured_at is not null
  ) into v_paid;

  select coalesce(s.full_name, '')
    into v_actor_label
    from public.staff as s
   where s.user_id = p_actor_id;

  if v_actor_label is null then
    v_actor_label := '';
  end if;

  v_from := v_booking.status;

  update public.booking_legs
     set status = 'cancelled'::public.booking_status,
         updated_at = pg_catalog.now()
   where booking_id = v_booking.id
     and status not in (
       'completed'::public.booking_status,
       'no_show'::public.booking_status,
       'cancelled'::public.booking_status
     );

  update public.bookings
     set status = 'cancelled'::public.booking_status,
         updated_at = pg_catalog.now()
   where id = v_booking.id;

  insert into public.booking_events (
    booking_id,
    kind,
    actor_kind,
    actor_id,
    actor_label,
    from_status,
    to_status,
    payload
  ) values (
    v_booking.id,
    'booking.status_changed',
    'staff',
    p_actor_id,
    v_actor_label,
    v_from,
    'cancelled'::public.booking_status,
    pg_catalog.jsonb_build_object('via', 'ops', 'paid', v_paid)
  );

  return query
    select v_booking.id,
           v_booking.reference,
           v_booking.contact_email::pg_catalog.text,
           v_booking.contact_name,
           coalesce(v_booking.locale, 'en'),
           v_paid;
  return;
end
$$;

revoke all on function public.ops_refund_record(
  pg_catalog.uuid,
  pg_catalog.int8,
  pg_catalog.text,
  pg_catalog.uuid,
  rappen
) from public;

revoke all on function public.ops_cancel_booking(
  pg_catalog.uuid,
  pg_catalog.uuid
) from public;

grant execute on function public.ops_refund_record(
  pg_catalog.uuid,
  pg_catalog.int8,
  pg_catalog.text,
  pg_catalog.uuid,
  rappen
) to vamos_system;

grant execute on function public.ops_cancel_booking(
  pg_catalog.uuid,
  pg_catalog.uuid
) to vamos_system;

comment on function public.ops_refund_record(
  pg_catalog.uuid,
  pg_catalog.int8,
  pg_catalog.text,
  pg_catalog.uuid,
  rappen
) is
  '08-05 D-56: record a Stripe refund. Requires non-null stripe_refund_id. Writes booking_refunds + refund.issued. EXECUTE: vamos_system only.';

comment on function public.ops_cancel_booking(
  pg_catalog.uuid,
  pg_catalog.uuid
) is
  '08-05 D-57/D-59/DATA-08: ops cancel without Stripe. Writes booking.status_changed in the same tx. EXECUTE: vamos_system only.';

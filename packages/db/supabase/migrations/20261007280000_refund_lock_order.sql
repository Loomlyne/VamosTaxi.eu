-- 20261007280000_refund_lock_order.sql
--
-- One lock order for a booking and its payments: the payment row first, then the booking row, then
-- anything after the booking (a change request, a refund intent). checkout_payment_settle has always
-- locked in this order, and 20261007270000 moved meta_purchase_claim and meta_purchase_sweep to it.
-- The functions below locked the booking first and then took FOR UPDATE on a payment of it. A repeated
-- settle of that payment (a second Stripe event, the return route) holds the payment and waits for the
-- booking, so the two could deadlock (40P01).
--
-- Changed. Each body is the one of the migration named, word for word, plus the lock statements:
--   ops_refund_plan               20261007140000  captured payments (or the chosen one), by id -> booking
--   ops_refund_intent_sent        20261005140000  the intent's payment -> booking -> intent
--   ops_refund_record             20260928150000  the given payment -> booking
--   record_booking_refund         20260911234758  first captured payment -> booking
--   booking_edit_request_accept   20261007200000  first captured payment -> booking -> request
--   booking_edit_refund_record    20260910175309  first captured payment -> booking -> request (the request
--                                                 was locked before the booking; now after it, as in accept)
--   booking_staff_change          20261007140000  first captured payment -> booking (it calls accept)
--   booking_staff_trip_change     20261007150000  first captured payment -> booking (it calls accept)
--   checkout_extra_payment_settle 20261007200000  the request's recorded payment -> booking -> request
--
-- Pattern. The payment id is read without a lock, that payment is locked FOR UPDATE (the strength each
-- function used before; ops_refund_plan locks its set in one statement, by id), then the booking.
-- Under the booking lock the payment is read again (ops_refund_plan: counted again). If it
-- changed (a payment settled in between), no second payment lock is taken while the booking is held:
-- the function raises 'payment-changed' with SQLSTATE 40001 and nothing is written. The Stripe-event
-- settle retries 40001 after a short delay (apps/web/lib/checkout/settle-errors.ts). The dashboard calls
-- refuse it like any other database error and the owner presses again. A refund Stripe already accepted
-- stays open and Retry records it. A booking with no captured payment locks nothing before the booking,
-- as before.
--
-- Not changed: checkout_abandon_unpaid, checkout_requote_cancel and purge_unpaid_booking also lock the
-- booking first, then write that booking's unpaid payments (see the hand-over of this job).
--
-- Same signatures, SECURITY DEFINER, search_path, owner and comments. Revoke and grant are restated as
-- each function's latest migration has them. No table, column, row or other function changes.
-- One transaction: apply it verbatim as a whole (connector apply_migration).
begin;

-- ---------------------------------------------------------------------------
-- (1) ops_refund_plan: body of 20261007140000, lock order changed as listed above.
-- ---------------------------------------------------------------------------
create or replace function public.ops_refund_plan(
  p_booking_id pg_catalog.uuid,
  p_actor_id pg_catalog.uuid,
  p_payment_id pg_catalog.int8 default null,
  p_percent pg_catalog.numeric default null,
  p_reason pg_catalog.text default null,
  p_resume_only pg_catalog.bool default false,
  p_amount_rappen pg_catalog.int4 default null
)
returns table (
  intent_id pg_catalog.int8,
  payment_id pg_catalog.int8,
  stripe_payment_intent_id pg_catalog.text,
  amount_rappen pg_catalog.int4,
  idempotency_key pg_catalog.text,
  state pg_catalog.text,
  attempts pg_catalog.int4,
  resumed pg_catalog.bool
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_booking public.bookings%rowtype;
  v_reason pg_catalog.text;
  v_open pg_catalog.int4;
  v_captured pg_catalog.int4;
  v_full pg_catalog.bool;
  v_credit pg_catalog.bool;
  v_due_left pg_catalog.int4;
  v_tier pg_catalog.text;
  v_batch pg_catalog.uuid := pg_catalog.gen_random_uuid();
  v_pay public.booking_payments%rowtype;
  v_refunded pg_catalog.int4;
  v_left pg_catalog.int4;
  v_amt pg_catalog.int4;
  v_pct pg_catalog.numeric(5,2);
  v_planned pg_catalog.int4 := 0;
  v_rows pg_catalog.int4 := 0;
  v_any_left pg_catalog.bool := false;
  v_locked pg_catalog.int4;
begin
  if p_reason is not null
     and p_reason not in ('ops_cancel', 'customer_cancel', 'no_driver', 'no_show', 'post_trip', 'modification_credit') then
    raise exception 'invalid-reason' using errcode = '22023';
  end if;

  if p_percent is not null and p_amount_rappen is not null then
    raise exception 'invalid-amount' using errcode = '22023',
      detail = 'percent and exact amount are never sent together';
  end if;
  if p_percent is not null and (p_percent <= 0 or p_percent > 100) then
    raise exception 'invalid-amount' using errcode = '22023';
  end if;
  if p_amount_rappen is not null and p_amount_rappen <= 0 then
    raise exception 'invalid-amount' using errcode = '22023';
  end if;

  -- Lock order (20261007280000): the captured payments this plan may refund, then the booking, as settle does.
  select pg_catalog.count(*)::pg_catalog.int4
    into v_locked
    from (select p.id
            from public.booking_payments as p
           where p.booking_id = p_booking_id
             and p.captured_at is not null
             and (p_payment_id is null or p.id = p_payment_id)
           order by p.id
             for update) as l;

  select b.*
    into v_booking
    from public.bookings as b
   where b.id = p_booking_id
     and b.erased_at is null
   for update;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  select pg_catalog.count(*)::pg_catalog.int4
    into v_open
    from public.booking_refund_intents as i
   where i.booking_id = v_booking.id
     and i.state in ('intended', 'failed');

  if v_open > 0 then
    if v_booking.refund_status = 'failed' then
      update public.bookings
         set refund_status = 'processing',
             updated_at = pg_catalog.now()
       where id = v_booking.id;
    end if;
    return query
      select i.id,
             i.payment_id,
             p.stripe_payment_intent_id,
             i.amount_rappen::pg_catalog.int4,
             'refund-intent:' || i.id::pg_catalog.text,
             i.state,
             i.attempts,
             true
        from public.booking_refund_intents as i
        join public.booking_payments as p on p.id = i.payment_id
       where i.booking_id = v_booking.id
         and i.state in ('intended', 'failed')
       order by i.payment_id;
    return;
  end if;

  if p_resume_only then
    raise exception 'nothing-to-retry' using errcode = 'P0001';
  end if;

  select pg_catalog.count(*)::pg_catalog.int4
    into v_captured
    from public.booking_payments as p
   where p.booking_id = v_booking.id
     and p.captured_at is not null;

  if v_captured = 0 then
    raise exception 'not-paid' using errcode = 'P0001';
  end if;

  if p_payment_id is not null and not exists (
    select 1
      from public.booking_payments as p
     where p.id = p_payment_id
       and p.booking_id = v_booking.id
       and p.captured_at is not null
  ) then
    raise exception 'not-paid' using errcode = 'P0001';
  end if;

  if p_amount_rappen is not null and p_payment_id is null and v_captured <> 1 then
    raise exception 'invalid-amount' using errcode = '22023',
      detail = 'an exact amount needs one chosen payment';
  end if;

  -- 26.2 P1 credit: a change on a live booking left an amount due (pending_ops, owed > refunded).
  v_credit := v_booking.refund_status = 'pending_ops'
              and coalesce(v_booking.refund_owed_rappen, 0) > coalesce(v_booking.refunded_rappen, 0)
              and v_booking.status not in ('cancelled'::public.booking_status,
                                           'partially_cancelled'::public.booking_status,
                                           'refunded'::public.booking_status);
  v_due_left := case
                  when v_credit then coalesce(v_booking.refund_owed_rappen, 0) - coalesce(v_booking.refunded_rappen, 0)
                  else 0
                end;

  if v_credit and p_percent is not null then
    raise exception 'invalid-amount' using errcode = '22023',
      detail = 'a refund due from a change is an exact amount';
  end if;

  v_reason := coalesce(p_reason, case when v_credit then 'modification_credit' else 'ops_cancel' end);

  -- Full tier: cancelled more than 24 h ahead, the whole refund is due, 100 % only.
  v_full := not v_credit
            and v_booking.refund_status = 'pending_ops' and coalesce(v_booking.refund_owed_rappen, 0) > 0;
  v_tier := case
              when v_credit then 'credit'
              when v_full or (p_percent is null and p_amount_rappen is null) then 'full'
              else 'decided'
            end;

  if (select pg_catalog.count(*)::pg_catalog.int4
        from public.booking_payments as p
       where p.booking_id = v_booking.id
         and p.captured_at is not null
         and (p_payment_id is null or p.id = p_payment_id)) <> v_locked then
    raise exception 'payment-changed' using errcode = '40001';
  end if;

  for v_pay in
    select p.*
      from public.booking_payments as p
     where p.booking_id = v_booking.id
       and p.captured_at is not null
       and (p_payment_id is null or p.id = p_payment_id)
     order by p.id
  loop
    select coalesce(pg_catalog.sum(r.refund_rappen), 0)::pg_catalog.int4
      into v_refunded
      from public.booking_refunds as r
     where r.payment_id = v_pay.id;

    v_left := v_pay.charged_rappen - v_refunded;
    if v_left <= 0 then
      continue;
    end if;
    v_any_left := true;

    if v_credit then
      if v_due_left <= 0 then
        continue;
      end if;
      if p_amount_rappen is not null then
        if p_amount_rappen > v_left or p_amount_rappen > v_due_left then
          raise exception 'refund-exceeds-remaining' using errcode = 'P0001';
        end if;
        v_amt := p_amount_rappen;
      else
        v_amt := least(v_left, v_due_left);
      end if;
      v_due_left := v_due_left - v_amt;
    elsif p_amount_rappen is not null then
      if p_amount_rappen > v_left then
        raise exception 'refund-exceeds-remaining' using errcode = 'P0001';
      end if;
      v_amt := p_amount_rappen;
    elsif p_percent is not null then
      v_amt := least(
        v_left,
        pg_catalog.round(v_pay.charged_rappen::pg_catalog.numeric * p_percent / 100)::pg_catalog.int4
      );
    else
      v_amt := v_left;
    end if;

    if v_amt <= 0 then
      continue;
    end if;

    if v_full and v_amt < v_left then
      raise exception 'full-refund-only' using errcode = 'P0001',
        detail = 'cancelled more than 24 h ahead: each payment is refunded in full';
    end if;

    v_pct := case
               when v_credit then
                 pg_catalog.round(v_amt::pg_catalog.numeric * 100 / v_pay.charged_rappen, 2)
               when v_full then null
               when p_percent is not null then p_percent
               when p_amount_rappen is not null then
                 pg_catalog.round(v_amt::pg_catalog.numeric * 100 / v_pay.charged_rappen, 2)
               else null
             end;

    insert into public.booking_refund_intents (
      booking_id, payment_id, batch_id, amount_rappen, reason,
      decided_percent, tier, actor_id
    ) values (
      v_booking.id, v_pay.id, v_batch, v_amt, v_reason,
      v_pct, v_tier, p_actor_id
    );
    v_planned := v_planned + v_amt;
    v_rows := v_rows + 1;
  end loop;

  if v_rows = 0 then
    if v_any_left then
      raise exception 'invalid-amount' using errcode = '22023';
    end if;
    raise exception 'already-refunded' using errcode = 'P0001';
  end if;

  -- Owed never shrinks by planning: a full-tier booking keeps owing 100 % while one payment
  -- is sent first; a decided amount becomes what is owed on top of what already went.
  update public.bookings
     set refund_status = 'processing',
         refund_owed_rappen = greatest(
           coalesce(refund_owed_rappen, 0),
           coalesce(refunded_rappen, 0) + v_planned
         )::public.rappen,
         updated_at = pg_catalog.now()
   where id = v_booking.id;

  return query
    select i.id,
           i.payment_id,
           p.stripe_payment_intent_id,
           i.amount_rappen::pg_catalog.int4,
           'refund-intent:' || i.id::pg_catalog.text,
           i.state,
           i.attempts,
           false
      from public.booking_refund_intents as i
      join public.booking_payments as p on p.id = i.payment_id
     where i.batch_id = v_batch
     order by i.payment_id;
  return;
end;
$$;

revoke all on function public.ops_refund_plan(
  pg_catalog.uuid, pg_catalog.uuid, pg_catalog.int8, pg_catalog.numeric, pg_catalog.text,
  pg_catalog.bool, pg_catalog.int4
) from public;

grant execute on function public.ops_refund_plan(
  pg_catalog.uuid, pg_catalog.uuid, pg_catalog.int8, pg_catalog.numeric, pg_catalog.text,
  pg_catalog.bool, pg_catalog.int4
) to vamos_system;

-- ---------------------------------------------------------------------------
-- (2) ops_refund_intent_sent: body of 20261005140000, lock order changed as listed above.
-- ---------------------------------------------------------------------------
create or replace function public.ops_refund_intent_sent(
  p_intent_id pg_catalog.int8,
  p_stripe_refund_id pg_catalog.text,
  p_stripe_fee_rappen public.rappen default null,
  p_payout_country pg_catalog.text default null,
  p_available_on pg_catalog.timestamptz default null
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
  reference pg_catalog.text,
  open_intents pg_catalog.int4,
  refunded_rappen pg_catalog.int4,
  due_rappen pg_catalog.int4,
  refund_status pg_catalog.text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_int public.booking_refund_intents%rowtype;
  v_booking public.bookings%rowtype;
  v_pay public.booking_payments%rowtype;
  v_refund public.booking_refunds%rowtype;
  v_actor_label pg_catalog.text;
  v_hours pg_catalog.numeric(8,2);
  v_percent pg_catalog.numeric(5,2);
  v_status pg_catalog.text;
  v_open pg_catalog.int4;
  v_locked pg_catalog.int8;
begin
  if p_stripe_refund_id is null or pg_catalog.btrim(p_stripe_refund_id) = '' then
    raise exception 'stripe-refund-id-required' using errcode = 'P0001';
  end if;

  select i.* into v_int from public.booking_refund_intents as i where i.id = p_intent_id;
  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  -- Lock order (20261007280000): the intent's payment, then the booking, then the intent, as settle does.
  v_locked := v_int.payment_id;
  perform 1 from public.booking_payments as p where p.id = v_locked for update;

  select b.*
    into v_booking
    from public.bookings as b
   where b.id = v_int.booking_id
   for update;

  -- Re-read under the booking lock.
  select i.* into v_int from public.booking_refund_intents as i where i.id = p_intent_id for update;

  if v_int.payment_id is distinct from v_locked then
    raise exception 'payment-changed' using errcode = '40001';
  end if;

  select p.* into v_pay from public.booking_payments as p where p.id = v_int.payment_id;

  select r.*
    into v_refund
    from public.booking_refunds as r
   where r.stripe_refund_id = p_stripe_refund_id;

  if not found and v_int.state = 'sent' and v_int.refund_id is not null then
    select r.* into v_refund from public.booking_refunds as r where r.id = v_int.refund_id;
  end if;

  if v_refund.id is null then
    v_percent := pg_catalog.round((v_int.amount_rappen::pg_catalog.numeric * 100) / v_pay.charged_rappen, 2);

    select coalesce(s.full_name, '')
      into v_actor_label
      from public.staff as s
     where s.user_id = v_int.actor_id;
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
      booking_id, snapshot_id, payment_id, reason, basis_rappen, refund_percent,
      refund_rappen, tier_applied, hours_before, stripe_refund_id, decided_by,
      payout_country, available_on
    ) values (
      v_booking.id,
      v_pay.snapshot_id,
      v_pay.id,
      v_int.reason,
      v_pay.charged_rappen,
      v_percent,
      v_int.amount_rappen,
      case
        when v_int.decided_percent is null then
          pg_catalog.jsonb_build_object('source', 'ops_full', 'percent', 100, 'reason', v_int.reason)
        else
          pg_catalog.jsonb_build_object('source', 'ops_decided', 'percent', v_int.decided_percent, 'reason', v_int.reason)
      end,
      coalesce(v_hours, 0),
      p_stripe_refund_id,
      v_int.actor_id,
      p_payout_country,
      p_available_on
    )
    returning * into v_refund;

    if p_stripe_fee_rappen is not null and v_pay.stripe_fee_rappen is null then
      update public.booking_payments
         set stripe_fee_rappen = p_stripe_fee_rappen
       where id = v_pay.id
         and stripe_fee_rappen is null;
    end if;

    insert into public.booking_events (
      booking_id, kind, actor_kind, actor_id, actor_label, payment_id, refund_id, payload
    ) values (
      v_booking.id,
      'refund.issued',
      'staff',
      v_int.actor_id,
      v_actor_label,
      v_pay.id,
      v_refund.id,
      pg_catalog.jsonb_build_object(
        'via', 'ops',
        'stripe_refund_id', p_stripe_refund_id,
        'reason', v_int.reason,
        'refund_percent', v_percent,
        'intent_id', v_int.id
      )
    );

    update public.bookings
       set refunded_rappen = coalesce(refunded_rappen, 0) + v_refund.refund_rappen,
           updated_at = pg_catalog.now()
     where id = v_booking.id;
  end if;

  if v_int.state <> 'sent' or v_int.refund_id is distinct from v_refund.id then
    update public.booking_refund_intents
       set state = 'sent',
           stripe_refund_id = coalesce(stripe_refund_id, p_stripe_refund_id),
           refund_id = v_refund.id,
           updated_at = pg_catalog.now()
     where id = v_int.id;
    v_status := app.refund_intents_settle(v_booking.id);
  else
    select b.refund_status into v_status from public.bookings as b where b.id = v_booking.id;
  end if;

  select b.* into v_booking from public.bookings as b where b.id = v_booking.id;
  select pg_catalog.count(*)::pg_catalog.int4
    into v_open
    from public.booking_refund_intents as i
   where i.booking_id = v_booking.id
     and i.state in ('intended', 'failed');

  return query
    select v_booking.id,
           v_refund.id,
           v_refund.payment_id,
           v_refund.refund_rappen::pg_catalog.int4,
           v_booking.contact_email::pg_catalog.text,
           v_booking.payer_email::pg_catalog.text,
           v_booking.contact_name,
           v_booking.locale,
           v_booking.reference,
           v_open,
           coalesce(v_booking.refunded_rappen, 0)::pg_catalog.int4,
           greatest(
             coalesce(v_booking.refund_owed_rappen, 0) - coalesce(v_booking.refunded_rappen, 0), 0
           )::pg_catalog.int4,
           v_booking.refund_status;
  return;
end;
$$;

revoke all on function public.ops_refund_intent_sent(
  pg_catalog.int8, pg_catalog.text, public.rappen, pg_catalog.text, pg_catalog.timestamptz
) from public;

grant execute on function public.ops_refund_intent_sent(
  pg_catalog.int8, pg_catalog.text, public.rappen, pg_catalog.text, pg_catalog.timestamptz
) to vamos_system;

-- ---------------------------------------------------------------------------
-- (3) ops_refund_record: body of 20260928150000, lock order changed as listed above.
-- ---------------------------------------------------------------------------
create or replace function public.ops_refund_record(
  p_booking_id pg_catalog.uuid,
  p_payment_id pg_catalog.int8,
  p_stripe_refund_id pg_catalog.text,
  p_actor_id pg_catalog.uuid,
  p_stripe_fee_rappen public.rappen default null,
  p_reason pg_catalog.text default null,
  p_refund_rappen public.rappen default null
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
  v_amount public.rappen;
  v_reason pg_catalog.text;
  v_percent pg_catalog.numeric(5,2);
  v_locked pg_catalog.bool;
begin
  if p_stripe_refund_id is null or pg_catalog.btrim(p_stripe_refund_id) = '' then
    raise exception 'stripe-refund-id-required' using errcode = 'P0001';
  end if;

  -- Reasons an admin can record. System reasons (duplicate_charge, paid_after_cancel,
  -- test_booking, requote_superseded, stripe_dashboard, modification_credit) belong to
  -- their own recorders and are refused here.
  v_reason := coalesce(p_reason, 'ops_cancel');
  if v_reason not in ('ops_cancel', 'customer_cancel', 'no_driver', 'no_show', 'post_trip') then
    raise exception 'invalid-reason' using errcode = '22023';
  end if;

  if p_refund_rappen is not null and p_refund_rappen <= 0 then
    raise exception 'invalid-amount' using errcode = '22023';
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

  -- Lock order (20261007280000): the payment, then the booking, as settle does.
  perform 1
    from public.booking_payments as p
   where p.id = p_payment_id
     and p.booking_id = p_booking_id
   for update;
  v_locked := found;

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
     and p.booking_id = v_booking.id;

  if not found then
    raise exception 'not-paid' using errcode = 'P0001';
  end if;

  if not v_locked then
    raise exception 'payment-changed' using errcode = '40001';
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

  v_amount := coalesce(p_refund_rappen, v_remaining);
  if v_amount > v_remaining then
    raise exception 'refund-exceeds-remaining' using errcode = 'P0001';
  end if;

  v_percent := pg_catalog.round((v_amount::pg_catalog.numeric * 100) / v_pay.charged_rappen, 2);

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
    v_reason,
    v_pay.charged_rappen,
    v_percent,
    v_amount,
    case
      when p_refund_rappen is null then
        pg_catalog.jsonb_build_object('source', 'ops_full', 'percent', 100, 'reason', v_reason)
      else
        pg_catalog.jsonb_build_object('source', 'ops_decided', 'percent', v_percent, 'reason', v_reason)
    end,
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
    pg_catalog.jsonb_build_object(
      'via', 'ops',
      'stripe_refund_id', p_stripe_refund_id,
      'reason', v_reason,
      'refund_percent', v_percent
    )
  );

  -- D-10: refund is a money line. Never assign bookings.status / legs.status refunded.
  -- D-24: a decided percentage settles the pending_ops line -- owed becomes what was refunded.
  update public.bookings
     set refund_status = 'refunded',
         refund_owed_rappen = case
           when refund_status = 'pending_ops'
             then (coalesce(refunded_rappen, 0) + v_refund.refund_rappen)::public.rappen
           else refund_owed_rappen
         end,
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

revoke all on function public.ops_refund_record(
  pg_catalog.uuid, pg_catalog.int8, pg_catalog.text, pg_catalog.uuid, public.rappen,
  pg_catalog.text, public.rappen
) from public;

grant execute on function public.ops_refund_record(
  pg_catalog.uuid, pg_catalog.int8, pg_catalog.text, pg_catalog.uuid, public.rappen,
  pg_catalog.text, public.rappen
) to vamos_system;

-- ---------------------------------------------------------------------------
-- (4) record_booking_refund: body of 20260911234758, lock order changed as listed above.
-- ---------------------------------------------------------------------------
create or replace function public.record_booking_refund(
  p_booking_id pg_catalog.uuid,
  p_stripe_refund_id pg_catalog.text,
  p_payout_country pg_catalog.text default null,
  p_available_on pg_catalog.timestamptz default null,
  p_refund_rappen public.rappen default null
)
returns table (
  booking_id pg_catalog.uuid,
  refund_id pg_catalog.int8
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
  v_comp record;
  v_already pg_catalog.int4;
  v_remaining pg_catalog.int4;
  v_amount public.rappen;
  v_country pg_catalog.text;
  v_locked pg_catalog.int8;
begin
  if p_stripe_refund_id is null or pg_catalog.btrim(p_stripe_refund_id) = '' then
    raise exception 'stripe-refund-id-required' using errcode = 'P0001';
  end if;

  select r.*
    into v_refund
    from public.booking_refunds as r
   where r.stripe_refund_id = p_stripe_refund_id;

  if found then
    return query select v_refund.booking_id, v_refund.id;
    return;
  end if;

  -- Lock order (20261007280000): the first captured payment, then the booking, as settle does.
  select p.id
    into v_locked
    from public.booking_payments as p
   where p.booking_id = p_booking_id
     and p.captured_at is not null
   order by p.captured_at
   limit 1;
  if v_locked is not null then
    perform 1 from public.booking_payments as p where p.id = v_locked for update;
  end if;

  select b.*
    into v_booking
    from public.bookings as b
   where b.id = p_booking_id
     and b.erased_at is null
   for update;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select p.*
    into v_pay
    from public.booking_payments as p
   where p.booking_id = v_booking.id
     and p.captured_at is not null
   order by p.captured_at
   limit 1;

  if not found then
    raise exception 'not-paid' using errcode = 'P0001';
  end if;

  if v_pay.id is distinct from v_locked then
    raise exception 'payment-changed' using errcode = '40001';
  end if;

  select coalesce(pg_catalog.sum(r.refund_rappen), 0)::pg_catalog.int4
    into v_already
    from public.booking_refunds as r
   where r.booking_id = v_booking.id;

  v_remaining := v_pay.charged_rappen - coalesce(v_already, 0);
  if v_remaining < 0 then
    v_remaining := 0;
  end if;

  v_amount := coalesce(p_refund_rappen, v_remaining);
  if v_amount is null or v_amount <= 0 or v_amount > v_remaining then
    raise exception 'already-refunded' using errcode = 'P0001';
  end if;

  v_country := nullif(pg_catalog.btrim(coalesce(p_payout_country, '')), '');

  select c.*
    into v_comp
    from public.compute_cancellation_refund(v_booking.id) as c;

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
    payout_country,
    available_on
  ) values (
    v_booking.id,
    v_pay.snapshot_id,
    v_pay.id,
    'customer_cancel',
    v_pay.charged_rappen,
    pg_catalog.round((v_amount::pg_catalog.numeric * 100) / v_pay.charged_rappen, 2),
    v_amount,
    pg_catalog.jsonb_build_object(
      'source', 'customer_cancel',
      'refund_mode', v_comp.refund_mode
    ),
    coalesce(v_comp.hours_before, 0),
    p_stripe_refund_id,
    v_country,
    p_available_on
  )
  returning * into v_refund;

  update public.bookings
     set refund_status = 'refunded',
         refunded_rappen = coalesce(refunded_rappen, 0) + v_amount,
         updated_at = pg_catalog.now()
   where id = v_booking.id;

  insert into public.booking_events (
    booking_id, kind, actor_kind, actor_label, payment_id, refund_id, payload
  ) values (
    v_booking.id,
    'refund.issued',
    'system',
    'record_booking_refund',
    v_pay.id,
    v_refund.id,
    pg_catalog.jsonb_build_object(
      'via', 'record_booking_refund',
      'stripe_refund_id', p_stripe_refund_id
    )
  );

  return query select v_booking.id, v_refund.id;
end;
$$;

revoke all on function public.record_booking_refund(
  pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.timestamptz, public.rappen
) from public;
grant execute on function public.record_booking_refund(
  pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.timestamptz, public.rappen
) to vamos_system;

-- ---------------------------------------------------------------------------
-- (5) booking_edit_request_accept: body of 20261007200000, lock order changed as listed above.
-- ---------------------------------------------------------------------------
create or replace function public.booking_edit_request_accept(
  p_request_id pg_catalog.uuid,
  p_actor_id pg_catalog.uuid
)
returns table (
  request_id pg_catalog.uuid,
  booking_id pg_catalog.uuid,
  outcome pg_catalog.text,
  difference_rappen pg_catalog.int4,
  extra_snapshot_id pg_catalog.int8,
  extra_session_id pg_catalog.text,
  hours_before pg_catalog.numeric,
  original_payment_id pg_catalog.int8,
  original_intent_id pg_catalog.text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_req public.booking_edit_requests%rowtype;
  v_booking public.bookings%rowtype;
  v_quote public.price_snapshots%rowtype;
  v_pay public.booking_payments%rowtype;
  v_actor_label pg_catalog.text;
  v_hours pg_catalog.numeric(8,2);
  v_diff pg_catalog.int4;
  v_extra pg_catalog.int8;
  v_outcome pg_catalog.text;
  -- 261002 settle safety
  v_booking_id pg_catalog.uuid;
  v_extra_total pg_catalog.int4;
  v_locked pg_catalog.int8;
begin
  -- 261002 settle safety (P-1): one lock order, the booking and then its request, like every other writer
  -- of a booking's change requests. The request is first read without a lock only to learn its booking.
  select r.booking_id
    into v_booking_id
    from public.booking_edit_requests as r
   where r.id = p_request_id;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  -- Lock order (20261007280000): the first captured payment, then the booking, then the request, as settle does.
  select p.id
    into v_locked
    from public.booking_payments as p
   where p.booking_id = v_booking_id
     and p.captured_at is not null
   order by p.captured_at
   limit 1;
  if v_locked is not null then
    perform 1 from public.booking_payments as p where p.id = v_locked for update;
  end if;

  select b.*
    into v_booking
    from public.bookings as b
   where b.id = v_booking_id
     for update;

  select r.*
    into v_req
    from public.booking_edit_requests as r
   where r.id = p_request_id
     and r.booking_id = v_booking_id
     for update;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  if v_req.status is distinct from 'requested' then
    raise exception 'not-requested' using errcode = 'P0001';
  end if;

  -- The refusal order is as before: not-found, not-requested, then an erased booking is not-found.
  if v_booking.id is null or v_booking.erased_at is not null then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  if v_booking.refund_status in ('processing', 'failed') then
    raise exception 'refund-open' using errcode = 'P0001';
  end if;

  if v_req.extra_snapshot_id is not null and exists (
    select 1 from public.price_snapshots as x
     where x.id = v_req.extra_snapshot_id and x.expires_at <= pg_catalog.now()
  ) then
    raise exception 'expired' using errcode = 'P0001';
  end if;

  select p.*
    into v_pay
    from public.booking_payments as p
   where p.booking_id = v_booking.id
     and p.captured_at is not null
   order by p.captured_at
   limit 1;

  if not found then
    raise exception 'unpaid' using errcode = 'P0001';
  end if;

  if v_pay.id is distinct from v_locked then
    raise exception 'payment-changed' using errcode = '40001';
  end if;

  select s.*
    into v_quote
    from public.price_snapshots as s
   where s.id = v_req.quote_snapshot_id;

  if not found or v_quote.total_rappen is null then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  -- W2: everything paid so far minus refunds, not the first payment.
  v_diff := v_quote.total_rappen - app.booking_paid_net(v_booking.id);

  -- 261002 settle safety (P6 follow-ups review R4, warning 2): a difference that is already priced (the
  -- request has its difference record, and maybe a Stripe page) is accepted again only at that same
  -- amount. If what is paid moved since (a refund, a payment), a new link would charge the new amount
  -- while the booking recorded the old one: refused, nothing is written, the first link stays valid
  -- (its amount matches the booking's record).
  if v_req.extra_snapshot_id is not null then
    select s.total_rappen
      into v_extra_total
      from public.price_snapshots as s
     where s.id = v_req.extra_snapshot_id;

    if v_extra_total is distinct from v_diff then
      raise exception 'price-changed' using errcode = 'P0001';
    end if;
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

  if v_diff > 0 then
    if v_req.extra_snapshot_id is null then
      v_extra := public.booking_edit_mint_extra_snapshot(
        v_booking.id,
        v_req.quote_snapshot_id,
        v_pay.snapshot_id,
        v_diff::public.rappen
      );
      update public.booking_edit_requests
         set extra_snapshot_id = v_extra
       where id = v_req.id;
    else
      v_extra := v_req.extra_snapshot_id;
    end if;
    v_outcome := 'extra_required';
  else
    -- Same price or cheaper: applied now. Cheaper leaves "Refund due"; the admin presses Refund
    -- (refunds by hand, decision 1). Nothing goes to Stripe here.
    perform public.booking_edit_apply_payload(
      v_booking.id,
      v_req.quote_snapshot_id,
      v_req.payload,
      p_actor_id,
      'staff',
      v_actor_label
    );
    update public.booking_edit_requests
       set status = 'accepted',
           accepted_at = pg_catalog.now()
     where id = v_req.id;
    perform app.booking_change_settle_credit(v_booking.id, p_actor_id, 'staff', v_actor_label);
    v_outcome := case when v_diff = 0 then 'applied' else 'refund_due' end;
  end if;

  return query
    select v_req.id,
           v_booking.id,
           v_outcome,
           v_diff,
           coalesce(v_extra, v_req.extra_snapshot_id),
           v_req.extra_session_id,
           v_hours,
           v_pay.id,
           v_pay.stripe_payment_intent_id;
end;
$$;

revoke all on function public.booking_edit_request_accept(
  pg_catalog.uuid, pg_catalog.uuid
) from public;

grant execute on function public.booking_edit_request_accept(
  pg_catalog.uuid, pg_catalog.uuid
) to vamos_system;

-- ---------------------------------------------------------------------------
-- (6) booking_edit_refund_record: body of 20260910175309, lock order changed as listed above.
-- ---------------------------------------------------------------------------
create or replace function public.booking_edit_refund_record(
  p_request_id pg_catalog.uuid,
  p_stripe_refund_id pg_catalog.text,
  p_actor_id pg_catalog.uuid,
  p_refund_rappen public.rappen
)
returns table (
  request_id pg_catalog.uuid,
  booking_id pg_catalog.uuid,
  refund_id pg_catalog.int8
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_req public.booking_edit_requests%rowtype;
  v_booking public.bookings%rowtype;
  v_pay public.booking_payments%rowtype;
  v_refund public.booking_refunds%rowtype;
  v_actor_label pg_catalog.text;
  v_hours pg_catalog.numeric(8,2);
  v_locked pg_catalog.int8;
begin
  if p_stripe_refund_id is null or pg_catalog.btrim(p_stripe_refund_id) = '' then
    raise exception 'stripe-refund-id-required' using errcode = 'P0001';
  end if;

  if p_refund_rappen is null or p_refund_rappen <= 0 then
    raise exception 'invalid_difference' using errcode = 'check_violation';
  end if;

  select r.*
    into v_refund
    from public.booking_refunds as r
   where r.stripe_refund_id = p_stripe_refund_id;

  if found then
    select er.*
      into v_req
      from public.booking_edit_requests as er
     where er.id = p_request_id;
    return query select p_request_id, v_refund.booking_id, v_refund.id;
    return;
  end if;

  -- Lock order (20261007280000): the first captured payment, then the booking, then the request, as settle and accept do.
  select r.*
    into v_req
    from public.booking_edit_requests as r
   where r.id = p_request_id;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  select p.id
    into v_locked
    from public.booking_payments as p
   where p.booking_id = v_req.booking_id
     and p.captured_at is not null
   order by p.captured_at
   limit 1;
  if v_locked is not null then
    perform 1 from public.booking_payments as p where p.id = v_locked for update;
  end if;

  select b.*
    into v_booking
    from public.bookings as b
   where b.id = v_req.booking_id
     and b.erased_at is null
     for update;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  select r.*
    into v_req
    from public.booking_edit_requests as r
   where r.id = p_request_id
     and r.booking_id = v_booking.id
     for update;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  select p.*
    into v_pay
    from public.booking_payments as p
   where p.booking_id = v_booking.id
     and p.captured_at is not null
   order by p.captured_at
   limit 1;

  if not found then
    raise exception 'unpaid' using errcode = 'P0001';
  end if;

  if v_pay.id is distinct from v_locked then
    raise exception 'payment-changed' using errcode = '40001';
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
    'modification_credit',
    v_pay.charged_rappen,
    pg_catalog.round((p_refund_rappen::pg_catalog.numeric * 100) / v_pay.charged_rappen, 2),
    p_refund_rappen,
    pg_catalog.jsonb_build_object('source', 'edit_difference', 'percent', null),
    coalesce(v_hours, 0),
    p_stripe_refund_id,
    p_actor_id
  )
  returning * into v_refund;

  insert into public.booking_events (
    booking_id, kind, actor_kind, actor_id, actor_label, payment_id, refund_id, payload
  ) values (
    v_booking.id,
    'refund.issued',
    'staff',
    p_actor_id,
    v_actor_label,
    v_pay.id,
    v_refund.id,
    pg_catalog.jsonb_build_object('via', 'edit_difference', 'stripe_refund_id', p_stripe_refund_id)
  );

  perform public.booking_edit_apply_payload(
    v_booking.id,
    v_req.quote_snapshot_id,
    v_req.payload,
    p_actor_id,
    'staff',
    v_actor_label
  );

  update public.booking_edit_requests
     set status = 'accepted',
         accepted_at = pg_catalog.now()
   where id = v_req.id;

  return query select v_req.id, v_booking.id, v_refund.id;
end;
$$;

revoke all on function public.booking_edit_refund_record(
  pg_catalog.uuid, pg_catalog.text, pg_catalog.uuid, public.rappen
) from public;

grant execute on function public.booking_edit_refund_record(
  pg_catalog.uuid, pg_catalog.text, pg_catalog.uuid, public.rappen
) to vamos_system;

-- ---------------------------------------------------------------------------
-- (7) booking_staff_change: body of 20261007140000, lock order changed as listed above.
-- ---------------------------------------------------------------------------
create or replace function public.booking_staff_change(
  p_booking_id pg_catalog.uuid,
  p_actor_id pg_catalog.uuid,
  p_vehicle_class_slug pg_catalog.text,
  p_rate_version_id pg_catalog.int8,
  p_total_rappen pg_catalog.int4,
  p_lines pg_catalog.jsonb,
  p_engine_version pg_catalog.text,
  p_expected_paid_rappen pg_catalog.int4
)
returns table (
  request_id pg_catalog.uuid,
  booking_id pg_catalog.uuid,
  outcome pg_catalog.text,
  difference_rappen pg_catalog.int4,
  new_total_rappen pg_catalog.int4,
  paid_rappen pg_catalog.int4,
  quote_snapshot_id pg_catalog.int8,
  extra_snapshot_id pg_catalog.int8,
  old_extra_session_id pg_catalog.text,
  old_extra_snapshot_id pg_catalog.int8,
  unassigned_chauffeur_id pg_catalog.uuid
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_booking public.bookings%rowtype;
  v_leg public.booking_legs%rowtype;
  v_after public.booking_legs%rowtype;
  v_class public.vehicle_classes%rowtype;
  v_rv_status pg_catalog.text;
  v_paid pg_catalog.int4;
  v_snap pg_catalog.int8;
  v_request pg_catalog.uuid;
  v_old_session pg_catalog.text;
  v_old_extra pg_catalog.int8;
  v_outcome pg_catalog.text;
  v_diff pg_catalog.int4;
  v_extra pg_catalog.int8;
  v_unassigned pg_catalog.uuid;
  v_locked pg_catalog.int8;
begin
  -- Lock order (20261007280000): the first captured payment, then the booking, as settle does; the accept below takes no other payment.
  select p.id
    into v_locked
    from public.booking_payments as p
   where p.booking_id = p_booking_id
     and p.captured_at is not null
   order by p.captured_at
   limit 1;
  if v_locked is not null then
    perform 1 from public.booking_payments as p where p.id = v_locked for update;
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

  -- Unpaid: no class change; cancel it and make a new trip (plan rule, 08 D-70).
  if not exists (
    select 1 from public.booking_payments as p
     where p.booking_id = v_booking.id and p.captured_at is not null
  ) then
    raise exception 'unpaid' using errcode = 'P0001';
  end if;

  if v_booking.status not in ('paid'::public.booking_status, 'confirmed'::public.booking_status,
                              'assigned'::public.booking_status) then
    raise exception 'not-editable' using errcode = 'P0001';
  end if;

  select l.* into v_leg
    from public.booking_legs as l
   where l.booking_id = v_booking.id
   order by l.leg_seq
   limit 1
     for update;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  -- D8: until the pickup time.
  if (select pg_catalog.min(l.scheduled_at) from public.booking_legs as l where l.booking_id = v_booking.id)
     <= pg_catalog.now() then
    raise exception 'too-late' using errcode = 'P0001';
  end if;

  if v_booking.refund_status in ('processing', 'failed') then
    raise exception 'refund-open' using errcode = 'P0001';
  end if;

  -- Plan rule: a customer's own change request waits -> answer it first (no silent replace).
  if exists (
    select 1 from public.booking_edit_requests as r
     where r.booking_id = v_booking.id and r.status = 'requested' and r.actor = 'customer'
  ) then
    raise exception 'customer-request-waiting' using errcode = 'P0001';
  end if;

  select vc.* into v_class
    from public.vehicle_classes as vc
   where vc.slug = p_vehicle_class_slug
     and vc.active
     and vc.hidden_at is null;

  if not found then
    raise exception 'unknown-class' using errcode = 'P0001';
  end if;

  if v_class.id = v_leg.vehicle_class_id then
    raise exception 'same-class' using errcode = 'P0001';
  end if;

  if v_leg.pax > v_class.passenger_capacity or v_leg.bags > v_class.luggage_capacity then
    raise exception 'class-too-small' using errcode = 'P0001';
  end if;

  -- D3: priced with the price book that is live today; a book replaced between preview and
  -- confirm is refused (the admin looks again).
  select rv.status::pg_catalog.text into v_rv_status
    from public.rate_versions as rv
   where rv.id = p_rate_version_id;

  if v_rv_status is distinct from 'live' then
    raise exception 'price-book-changed' using errcode = 'P0001';
  end if;

  v_paid := app.booking_paid_net(v_booking.id);
  if p_expected_paid_rappen is not null and p_expected_paid_rappen is distinct from v_paid then
    raise exception 'paid-changed' using errcode = 'P0001';
  end if;

  v_snap := app.booking_change_mint_snapshot(
    v_booking.id, v_class.id, p_rate_version_id, p_total_rappen, p_lines, p_engine_version, p_actor_id
  );

  select u.request_id, u.old_extra_session_id, u.old_extra_snapshot_id
    into v_request, v_old_session, v_old_extra
    from public.booking_edit_request_upsert(
      v_booking.id, 'staff', p_actor_id,
      pg_catalog.jsonb_build_object('vehicle_class_slug', v_class.slug),
      v_snap
    ) as u;

  if (select p.id
        from public.booking_payments as p
       where p.booking_id = v_booking.id
         and p.captured_at is not null
       order by p.captured_at
       limit 1) is distinct from v_locked then
    raise exception 'payment-changed' using errcode = '40001';
  end if;

  select a.outcome, a.difference_rappen, a.extra_snapshot_id
    into v_outcome, v_diff, v_extra
    from public.booking_edit_request_accept(v_request, p_actor_id) as a;

  select l.* into v_after from public.booking_legs as l where l.id = v_leg.id;
  if v_leg.assigned_chauffeur_id is not null and v_after.assigned_chauffeur_id is null then
    v_unassigned := v_leg.assigned_chauffeur_id;
  end if;

  return query
    select v_request,
           v_booking.id,
           v_outcome,
           v_diff,
           p_total_rappen,
           v_paid,
           v_snap,
           v_extra,
           v_old_session,
           v_old_extra,
           v_unassigned;
end;
$$;

revoke all on function public.booking_staff_change(
  pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.int8, pg_catalog.int4,
  pg_catalog.jsonb, pg_catalog.text, pg_catalog.int4
) from public;

grant execute on function public.booking_staff_change(
  pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.int8, pg_catalog.int4,
  pg_catalog.jsonb, pg_catalog.text, pg_catalog.int4
) to vamos_system;

-- ---------------------------------------------------------------------------
-- (8) booking_staff_trip_change: body of 20261007150000, lock order changed as listed above.
-- ---------------------------------------------------------------------------
create or replace function public.booking_staff_trip_change(
  p_booking_id pg_catalog.uuid,
  p_actor_id pg_catalog.uuid,
  p_vehicle_class_slug pg_catalog.text,
  p_trip pg_catalog.jsonb,
  p_rate_version_id pg_catalog.int8,
  p_total_rappen pg_catalog.int4,
  p_lines pg_catalog.jsonb,
  p_engine_version pg_catalog.text,
  p_distance_km pg_catalog.numeric,
  p_duration_min pg_catalog.int4,
  p_shown_alternatives pg_catalog.jsonb,
  p_expected_paid_rappen pg_catalog.int4,
  p_driver pg_catalog.text
)
returns table (
  request_id pg_catalog.uuid,
  booking_id pg_catalog.uuid,
  outcome pg_catalog.text,
  difference_rappen pg_catalog.int4,
  new_total_rappen pg_catalog.int4,
  paid_rappen pg_catalog.int4,
  quote_snapshot_id pg_catalog.int8,
  extra_snapshot_id pg_catalog.int8,
  old_extra_session_id pg_catalog.text,
  old_extra_snapshot_id pg_catalog.int8,
  unassigned_chauffeur_id pg_catalog.uuid,
  kept_chauffeur_id pg_catalog.uuid
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_booking public.bookings%rowtype;
  v_leg public.booking_legs%rowtype;
  v_after public.booking_legs%rowtype;
  v_class public.vehicle_classes%rowtype;
  v_trip pg_catalog.jsonb;
  v_key pg_catalog.text;
  v_payload pg_catalog.jsonb;
  v_class_change pg_catalog.bool := false;
  v_places pg_catalog.bool;
  v_time pg_catalog.bool := false;
  v_party pg_catalog.bool := false;
  v_local pg_catalog.text;
  v_new_at pg_catalog.timestamptz;
  v_new_minutes pg_catalog.int4;
  v_pax pg_catalog.int2;
  v_bags pg_catalog.int2;
  v_range pg_catalog.tstzrange;
  v_has_driver pg_catalog.bool;
  v_clash pg_catalog.bool := false;
  v_clash_car pg_catalog.bool := false;
  v_keep_overlap pg_catalog.bool := false;
  v_seen pg_catalog.jsonb := '[]'::pg_catalog.jsonb;
  v_priced pg_catalog.bool;
  v_rv_status pg_catalog.text;
  v_paid pg_catalog.int4;
  v_snap pg_catalog.int8;
  v_request pg_catalog.uuid;
  v_old_session pg_catalog.text;
  v_old_extra pg_catalog.int8;
  v_outcome pg_catalog.text;
  v_diff pg_catalog.int4;
  v_extra pg_catalog.int8;
  v_total pg_catalog.int4;
  v_actor_label pg_catalog.text;
  v_unassigned pg_catalog.uuid;
  v_kept pg_catalog.uuid;
  v_locked pg_catalog.int8;
begin
  -- Lock order (20261007280000): the first captured payment, then the booking, as settle does; the accept below takes no other payment.
  select p.id
    into v_locked
    from public.booking_payments as p
   where p.booking_id = p_booking_id
     and p.captured_at is not null
   order by p.captured_at
   limit 1;
  if v_locked is not null then
    perform 1 from public.booking_payments as p where p.id = v_locked for update;
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

  -- Unpaid: no change; cancel it and make a new trip (plan rule, 08 D-70).
  if not exists (
    select 1 from public.booking_payments as p
     where p.booking_id = v_booking.id and p.captured_at is not null
  ) then
    raise exception 'unpaid' using errcode = 'P0001';
  end if;

  if v_booking.status not in ('paid'::public.booking_status, 'confirmed'::public.booking_status,
                              'assigned'::public.booking_status) then
    raise exception 'not-editable' using errcode = 'P0001';
  end if;

  select l.* into v_leg
    from public.booking_legs as l
   where l.booking_id = v_booking.id
   order by l.leg_seq
   limit 1
     for update;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  -- D8: until the pickup time.
  if (select pg_catalog.min(l.scheduled_at) from public.booking_legs as l where l.booking_id = v_booking.id)
     <= pg_catalog.now() then
    raise exception 'too-late' using errcode = 'P0001';
  end if;

  if v_booking.refund_status in ('processing', 'failed') then
    raise exception 'refund-open' using errcode = 'P0001';
  end if;

  -- Plan rule: a customer's own change request waits -> answer it first (no silent replace).
  if exists (
    select 1 from public.booking_edit_requests as r
     where r.booking_id = v_booking.id and r.status = 'requested' and r.actor = 'customer'
  ) then
    raise exception 'customer-request-waiting' using errcode = 'P0001';
  end if;

  -- The trip fields the Worker built from what the owner changed (new places only from the
  -- signed trip facts of the preview, never from the browser).
  v_trip := coalesce(p_trip, '{}'::pg_catalog.jsonb);
  if pg_catalog.jsonb_typeof(v_trip) is distinct from 'object' then
    raise exception 'invalid-change' using errcode = 'P0001';
  end if;
  for v_key in select pg_catalog.jsonb_object_keys(v_trip) loop
    if v_key not in ('pickup_text', 'pickup_place_id', 'pickup_lat', 'pickup_lng',
                     'dropoff_text', 'dropoff_place_id', 'dropoff_lat', 'dropoff_lng',
                     'estimated_duration_minutes', 'scheduled_local', 'pax', 'bags') then
      raise exception 'invalid-change' using errcode = 'P0001';
    end if;
  end loop;

  if p_driver is not null and p_driver not in ('keep', 'unassign') then
    raise exception 'invalid-change' using errcode = 'P0001';
  end if;

  -- A new place is a whole place with its route: text, coordinates, duration, distance.
  v_places := v_trip ?| array['pickup_text', 'pickup_place_id', 'pickup_lat', 'pickup_lng',
                              'dropoff_text', 'dropoff_place_id', 'dropoff_lat', 'dropoff_lng'];
  if (v_trip ?| array['pickup_text', 'pickup_place_id', 'pickup_lat', 'pickup_lng']
      and (nullif(pg_catalog.btrim(v_trip ->> 'pickup_text'), '') is null
           or pg_catalog.jsonb_typeof(v_trip -> 'pickup_lat') is distinct from 'number'
           or pg_catalog.jsonb_typeof(v_trip -> 'pickup_lng') is distinct from 'number'))
     or (v_trip ?| array['dropoff_text', 'dropoff_place_id', 'dropoff_lat', 'dropoff_lng']
      and (nullif(pg_catalog.btrim(v_trip ->> 'dropoff_text'), '') is null
           or pg_catalog.jsonb_typeof(v_trip -> 'dropoff_lat') is distinct from 'number'
           or pg_catalog.jsonb_typeof(v_trip -> 'dropoff_lng') is distinct from 'number'))
     or (v_places and (pg_catalog.jsonb_typeof(v_trip -> 'estimated_duration_minutes') is distinct from 'number'
                       or (v_trip ->> 'estimated_duration_minutes')::pg_catalog.numeric <= 0
                       or p_distance_km is null or p_distance_km <= 0 or p_duration_min is null))
     or (not v_places and (v_trip ? 'estimated_duration_minutes' or p_distance_km is not null
                           or p_duration_min is not null)) then
    raise exception 'invalid-change' using errcode = 'P0001';
  end if;

  -- Date and time: the Zurich wall clock, in the future.
  v_local := nullif(v_trip ->> 'scheduled_local', '');
  if v_trip ? 'scheduled_local' then
    if v_local is null or v_local !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' then
      raise exception 'invalid-change' using errcode = 'P0001';
    end if;
    begin
      v_new_at := v_local::pg_catalog.timestamp at time zone 'Europe/Zurich';
    exception when others then
      raise exception 'invalid-change' using errcode = 'P0001';
    end;
    if v_new_at <= pg_catalog.now() then
      raise exception 'past-time' using errcode = 'P0001';
    end if;
    v_time := v_local is distinct from pg_catalog.left(v_leg.scheduled_local, 16);
  end if;
  if not v_time then
    v_new_at := v_leg.scheduled_at;
    v_trip := v_trip - 'scheduled_local';
  end if;

  -- Passengers 1-16 and bags 0-16 (the table's own limits).
  if v_trip ? 'pax' then
    if pg_catalog.jsonb_typeof(v_trip -> 'pax') is distinct from 'number'
       or (v_trip ->> 'pax') !~ '^\d{1,2}$' or (v_trip ->> 'pax')::pg_catalog.int4 not between 1 and 16 then
      raise exception 'invalid-change' using errcode = 'P0001';
    end if;
  end if;
  if v_trip ? 'bags' then
    if pg_catalog.jsonb_typeof(v_trip -> 'bags') is distinct from 'number'
       or (v_trip ->> 'bags') !~ '^\d{1,2}$' or (v_trip ->> 'bags')::pg_catalog.int4 not between 0 and 16 then
      raise exception 'invalid-change' using errcode = 'P0001';
    end if;
  end if;
  v_pax := coalesce((v_trip ->> 'pax')::pg_catalog.int2, v_leg.pax);
  v_bags := coalesce((v_trip ->> 'bags')::pg_catalog.int2, v_leg.bags);
  if v_pax = v_leg.pax then v_trip := v_trip - 'pax'; end if;
  if v_bags = v_leg.bags then v_trip := v_trip - 'bags'; end if;
  v_party := v_trip ? 'pax' or v_trip ? 'bags';

  -- The class: the one named (a larger class for a larger party, D4) or the trip's own.
  if nullif(p_vehicle_class_slug, '') is not null then
    select vc.* into v_class
      from public.vehicle_classes as vc
     where vc.slug = p_vehicle_class_slug
       and vc.active
       and vc.hidden_at is null;
    if not found then
      raise exception 'unknown-class' using errcode = 'P0001';
    end if;
    v_class_change := v_class.id is distinct from v_leg.vehicle_class_id;
  end if;
  if not v_class_change then
    select vc.* into v_class from public.vehicle_classes as vc where vc.id = v_leg.vehicle_class_id;
  end if;

  if not (v_places or v_time or v_party or v_class_change) then
    raise exception 'no-change' using errcode = 'P0001';
  end if;

  if v_pax > v_class.passenger_capacity or v_bags > v_class.luggage_capacity then
    raise exception 'class-too-small' using errcode = 'P0001';
  end if;

  -- A new price for new places or a new class (D3, today's live book); none for a date, time or
  -- party inside the class (D1, D5).
  v_priced := v_places or v_class_change;
  if v_priced and (p_rate_version_id is null or p_total_rappen is null or p_lines is null) then
    raise exception 'invalid-change' using errcode = 'P0001';
  end if;
  if not v_priced and (p_rate_version_id is not null or p_total_rappen is not null or p_lines is not null) then
    raise exception 'invalid-change' using errcode = 'P0001';
  end if;

  if v_priced then
    select rv.status::pg_catalog.text into v_rv_status
      from public.rate_versions as rv
     where rv.id = p_rate_version_id;
    if v_rv_status is distinct from 'live' then
      raise exception 'price-book-changed' using errcode = 'P0001';
    end if;
  end if;

  v_paid := app.booking_paid_net(v_booking.id);
  if p_expected_paid_rappen is not null and p_expected_paid_rappen is distinct from v_paid then
    raise exception 'paid-changed' using errcode = 'P0001';
  end if;

  -- D7: an assigned driver stays unless the class changes (P1 D6) or the owner takes him off. A
  -- new time or a longer route that overlaps another of his trips needs the owner's choice; a
  -- window that does not move asks nothing (an overlap already there was allowed before).
  v_has_driver := v_leg.assigned_chauffeur_id is not null or v_leg.assigned_vehicle_id is not null;
  v_new_minutes := coalesce((v_trip ->> 'estimated_duration_minutes')::pg_catalog.int4, v_leg.estimated_duration_minutes);
  if v_has_driver and not v_class_change
     and (v_new_at is distinct from v_leg.scheduled_at
          or v_new_minutes is distinct from v_leg.estimated_duration_minutes) then
    v_range := pg_catalog.tstzrange(
      v_new_at,
      v_new_at + (greatest(coalesce(v_new_minutes, 0), 30)
                  + coalesce(v_leg.turnaround_buffer_minutes, 0)) * interval '1 minute',
      '[)'
    );
    v_clash := exists (
      select 1
        from public.booking_legs as o
       where o.id <> v_leg.id
         and o.status not in ('cancelled'::public.booking_status, 'no_show'::public.booking_status)
         and v_leg.assigned_chauffeur_id is not null and o.assigned_chauffeur_id = v_leg.assigned_chauffeur_id
         and o.scheduled_range && v_range
    );
    -- A car from before 2026-10-01 still on a leg: a car cannot be kept on two trips.
    v_clash_car := exists (
      select 1
        from public.booking_legs as o
       where o.id <> v_leg.id
         and o.status not in ('cancelled'::public.booking_status, 'no_show'::public.booking_status)
         and v_leg.assigned_vehicle_id is not null and o.assigned_vehicle_id = v_leg.assigned_vehicle_id
         and o.scheduled_range && v_range
    );
    if (v_clash or v_clash_car) and p_driver is null then
      raise exception 'driver-choice-needed' using errcode = 'P0001';
    end if;
    if v_clash_car and p_driver = 'keep' then
      raise exception 'driver-overlap' using errcode = 'P0001';
    end if;
    -- D11 + D17: Keep on a clash keeps him on both trips; this one leaves the overlap rule.
    v_keep_overlap := v_clash and p_driver = 'keep';
    if v_keep_overlap then
      v_seen := coalesce((
        select pg_catalog.jsonb_agg(o.id::pg_catalog.text order by o.id)
          from public.booking_legs as o
         where o.id <> v_leg.id
           and o.status not in ('cancelled'::public.booking_status, 'no_show'::public.booking_status)
           and o.assigned_chauffeur_id = v_leg.assigned_chauffeur_id
           and o.scheduled_range && v_range
      ), '[]'::pg_catalog.jsonb);
    end if;
  end if;

  v_payload := v_trip;
  if v_class_change then
    v_payload := v_payload || pg_catalog.jsonb_build_object('vehicle_class_slug', v_class.slug);
  else
    -- Review 2 (2026-10-02): every other change carries the driver choice, also with no driver now. A driver
    -- given the trip before the customer pays the difference then comes off on a clash (reason overlap)
    -- instead of the payment failing with 23P01 and the webhook retrying.
    v_payload := v_payload || pg_catalog.jsonb_build_object('driver', coalesce(p_driver, 'keep'));
    if v_keep_overlap then
      -- Review 3: the Keep covers the trips the owner saw at this moment, and only those.
      v_payload := v_payload || pg_catalog.jsonb_build_object('overlap_kept', true, 'overlap_seen', v_seen);
    end if;
  end if;

  v_snap := app.booking_change_mint_trip_snapshot(
    v_booking.id, v_class.id, p_rate_version_id, p_total_rappen, p_lines, p_engine_version, p_actor_id,
    p_distance_km, p_duration_min, p_shown_alternatives, v_pax, v_bags
  );

  select u.request_id, u.old_extra_session_id, u.old_extra_snapshot_id
    into v_request, v_old_session, v_old_extra
    from public.booking_edit_request_upsert(v_booking.id, 'staff', p_actor_id, v_payload, v_snap) as u;

  if v_priced then
    if (select p.id
          from public.booking_payments as p
         where p.booking_id = v_booking.id
           and p.captured_at is not null
         order by p.captured_at
         limit 1) is distinct from v_locked then
      raise exception 'payment-changed' using errcode = '40001';
    end if;
    select a.outcome, a.difference_rappen, a.extra_snapshot_id
      into v_outcome, v_diff, v_extra
      from public.booking_edit_request_accept(v_request, p_actor_id) as a;
    v_total := p_total_rappen;
  else
    -- No new price (D1, D5): applied now, whatever was paid stays as it is.
    select coalesce(s.full_name, '') into v_actor_label from public.staff as s where s.user_id = p_actor_id;
    perform public.booking_edit_apply_payload(
      v_booking.id, v_snap, v_payload, p_actor_id, 'staff', coalesce(v_actor_label, '')
    );
    update public.booking_edit_requests
       set status = 'accepted',
           accepted_at = pg_catalog.now()
     where id = v_request;
    perform app.booking_change_settle_credit(v_booking.id, p_actor_id, 'staff', coalesce(v_actor_label, ''));
    v_outcome := 'applied';
    v_diff := 0;
    select s.total_rappen into v_total from public.price_snapshots as s where s.id = v_snap;
  end if;

  select l.* into v_after from public.booking_legs as l where l.id = v_leg.id;
  if v_leg.assigned_chauffeur_id is not null and v_after.assigned_chauffeur_id is null then
    v_unassigned := v_leg.assigned_chauffeur_id;
  end if;
  if v_outcome in ('applied', 'refund_due') and v_after.assigned_chauffeur_id is not null
     and v_after.assigned_chauffeur_id = v_leg.assigned_chauffeur_id then
    v_kept := v_after.assigned_chauffeur_id;
  end if;

  return query
    select v_request,
           v_booking.id,
           v_outcome,
           v_diff,
           v_total,
           v_paid,
           v_snap,
           v_extra,
           v_old_session,
           v_old_extra,
           v_unassigned,
           v_kept;
end;
$$;

revoke all on function public.booking_staff_trip_change(
  pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.jsonb, pg_catalog.int8, pg_catalog.int4,
  pg_catalog.jsonb, pg_catalog.text, pg_catalog.numeric, pg_catalog.int4, pg_catalog.jsonb, pg_catalog.int4,
  pg_catalog.text
) from public;
revoke all on function public.booking_staff_trip_change(
  pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.jsonb, pg_catalog.int8, pg_catalog.int4,
  pg_catalog.jsonb, pg_catalog.text, pg_catalog.numeric, pg_catalog.int4, pg_catalog.jsonb, pg_catalog.int4,
  pg_catalog.text
) from anon;
revoke all on function public.booking_staff_trip_change(
  pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.jsonb, pg_catalog.int8, pg_catalog.int4,
  pg_catalog.jsonb, pg_catalog.text, pg_catalog.numeric, pg_catalog.int4, pg_catalog.jsonb, pg_catalog.int4,
  pg_catalog.text
) from authenticated;

grant execute on function public.booking_staff_trip_change(
  pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.jsonb, pg_catalog.int8, pg_catalog.int4,
  pg_catalog.jsonb, pg_catalog.text, pg_catalog.numeric, pg_catalog.int4, pg_catalog.jsonb, pg_catalog.int4,
  pg_catalog.text
) to vamos_system;

-- ---------------------------------------------------------------------------
-- (9) checkout_extra_payment_settle: body of 20261007200000, lock order changed as listed above.
-- ---------------------------------------------------------------------------
create or replace function public.checkout_extra_payment_settle(
  p_event_id pg_catalog.text,
  p_session_id pg_catalog.text,
  p_payment_intent_id pg_catalog.text,
  p_outcome pg_catalog.text,
  p_charged_currency pg_catalog.text,
  p_fx_rate pg_catalog.numeric,
  p_fx_source pg_catalog.text,
  p_fx_quoted_at pg_catalog.timestamptz,
  p_presentment_amount_minor pg_catalog.int8
)
returns table (
  booking_id pg_catalog.uuid,
  reference pg_catalog.text,
  locale pg_catalog.text,
  contact_email pg_catalog.text,
  already_settled pg_catalog.bool,
  request_id pg_catalog.uuid,
  applied pg_catalog.bool,
  class_changed pg_catalog.bool,
  unassigned_chauffeur_id pg_catalog.uuid
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_req public.booking_edit_requests%rowtype;
  v_booking public.bookings%rowtype;
  v_extra public.price_snapshots%rowtype;
  v_pay public.booking_payments%rowtype;
  v_orig pg_catalog.int8;
  v_actor_label pg_catalog.text;
  v_before public.booking_legs%rowtype;
  v_after public.booking_legs%rowtype;
  v_applied pg_catalog.bool := false;
  v_class_changed pg_catalog.bool := false;
  v_unassigned pg_catalog.uuid;
  -- 261002 settle safety
  v_booking_id pg_catalog.uuid;
  v_ended pg_catalog.bool := false;
  v_err_state pg_catalog.text;
  v_err_text pg_catalog.text;
  v_locked pg_catalog.int8;
begin
  if p_outcome is distinct from 'succeeded'
     and p_outcome is distinct from 'failed'
     and p_outcome is distinct from 'canceled' then
    raise exception 'invalid_outcome' using errcode = 'check_violation';
  end if;

  if p_session_id is null or pg_catalog.btrim(p_session_id) = '' then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;

  -- 261002 settle safety (P-1): one lock order, the booking and then its request, like every other writer
  -- of a booking's change requests (upsert, withdraw, staff changes, cancels). The request is first read
  -- without a lock only to learn which booking it belongs to.
  -- The pick is deterministic: a Stripe page shared by two requests of one booking settles the one that
  -- waits (a request that still waits is the one the customer paid for), else the newest.
  select r.booking_id, r.extra_payment_id
    into v_booking_id, v_locked
    from public.booking_edit_requests as r
   where r.extra_session_id = p_session_id
   order by (r.status = 'requested') desc, r.created_at desc
   limit 1;

  if not found then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;

  -- Lock order (20261007280000): the payment the request already recorded (read above), then the booking, then the request, as settle does.
  if v_locked is not null then
    perform 1 from public.booking_payments as p where p.id = v_locked for update;
  end if;

  select b.*
    into v_booking
    from public.bookings as b
   where b.id = v_booking_id
     for update;

  select r.*
    into v_req
    from public.booking_edit_requests as r
   where r.extra_session_id = p_session_id
     and r.booking_id = v_booking_id
   order by (r.status = 'requested') desc, r.created_at desc
   limit 1
     for update;

  if not found then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;

  if v_req.extra_payment_id is distinct from v_locked then
    raise exception 'payment-changed' using errcode = '40001';
  end if;

  if v_req.extra_payment_id is not null then
    select p.*
      into v_pay
      from public.booking_payments as p
     where p.id = v_req.extra_payment_id;
    if v_pay.status = 'succeeded' and p_outcome = 'succeeded' then
      update public.stripe_events
         set processed_at = pg_catalog.now()
       where id = p_event_id;
      return query
        select v_booking.id,
               v_booking.reference,
               v_booking.locale,
               v_booking.contact_email::pg_catalog.text,
               true,
               v_req.id,
               false,
               false,
               null::pg_catalog.uuid;
      return;
    end if;
  end if;

  if p_outcome is distinct from 'succeeded' then
    insert into public.booking_events (
      booking_id, kind, actor_kind, actor_label, payload
    ) values (
      v_booking.id,
      'payment.failed',
      'stripe',
      'Stripe webhook',
      pg_catalog.jsonb_build_object('kind', 'extra', 'extra_id', v_req.id)
    );
    -- D4: the difference was not paid (the page expired or the payment failed): the request
    -- ends; the booking is untouched; the admin can start again.
    if v_req.status = 'requested' then
      update public.booking_edit_requests
         set status = 'superseded'
       where id = v_req.id;
    end if;
    update public.stripe_events
       set processed_at = pg_catalog.now()
     where id = p_event_id;
    return query
      select v_booking.id,
             v_booking.reference,
             v_booking.locale,
             v_booking.contact_email::pg_catalog.text,
             false,
             v_req.id,
             false,
             false,
             null::pg_catalog.uuid;
    return;
  end if;

  select s.*
    into v_extra
    from public.price_snapshots as s
   where s.id = v_req.extra_snapshot_id;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  v_orig := v_booking.price_snapshot_id;

  -- Charge gate requires bookings.price_snapshot_id = extra snapshot. Restored below: by
  -- apply_payload (the new full price record) or to the original when nothing is applied.
  update public.bookings
     set price_snapshot_id = v_extra.id
   where id = v_booking.id;

  if v_pay.id is null then
    insert into public.booking_payments (
      booking_id,
      snapshot_id,
      stripe_payment_intent_id,
      stripe_checkout_session_id,
      charged_rappen,
      charged_currency,
      status,
      captured_at,
      fx_rate,
      fx_source,
      fx_quoted_at,
      presentment_amount_minor
    ) values (
      v_booking.id,
      v_extra.id,
      coalesce(p_payment_intent_id, p_session_id),
      p_session_id,
      v_extra.total_rappen,
      coalesce(p_charged_currency, 'CHF'),
      'succeeded',
      pg_catalog.now(),
      p_fx_rate,
      p_fx_source,
      p_fx_quoted_at,
      p_presentment_amount_minor
    )
    returning * into v_pay;
  else
    update public.booking_payments
       set status = 'succeeded',
           captured_at = pg_catalog.now(),
           charged_currency = coalesce(p_charged_currency, charged_currency),
           fx_rate = coalesce(p_fx_rate, fx_rate),
           fx_source = coalesce(p_fx_source, fx_source),
           fx_quoted_at = coalesce(p_fx_quoted_at, fx_quoted_at),
           presentment_amount_minor = coalesce(p_presentment_amount_minor, presentment_amount_minor)
     where id = v_pay.id
    returning * into v_pay;
  end if;

  select coalesce(s.full_name, v_req.actor)
    into v_actor_label
    from public.staff as s
   where s.user_id = v_req.actor_id;

  if v_actor_label is null then
    v_actor_label := coalesce(v_req.actor, '');
  end if;

  -- 261002 settle safety (P-2): a booking that was cancelled (all of it or a leg), or refunded, since the
  -- change was asked never gets the change applied, whatever the request says. The money is recorded
  -- below and shows as Refund due.
  v_ended := v_booking.status in ('cancelled'::public.booking_status,
                                  'partially_cancelled'::public.booking_status,
                                  'refunded'::public.booking_status);

  -- A request that still waits is applied. So is one the admin withdrew when the customer paid
  -- in the same second (owner sign-off 2026-10-01: she gets what she paid for), as long as no
  -- newer change was asked since and the trip still runs.
  if not v_ended
     and (v_req.status = 'requested'
          or (v_req.status = 'withdrawn'
              and v_booking.status not in ('cancelled'::public.booking_status,
                                           'partially_cancelled'::public.booking_status,
                                           'refunded'::public.booking_status)
              -- nothing newer: no other change waits, and the booking is still bound to the price
              -- record this change was built on (no other change was applied since)
              and not exists (
                select 1 from public.booking_edit_requests as x
                 where x.booking_id = v_req.booking_id
                   and x.id <> v_req.id
                   and x.status = 'requested'
              )
              and v_orig is not distinct from (
                select q.supersedes_id from public.price_snapshots as q where q.id = v_req.quote_snapshot_id
              ))) then
    -- 261002 settle safety (P-1): the apply runs in its own block (a sub-transaction). A database hiccup
    -- (deadlock, serialization, lock, connection, resource, shutdown, timeout) is raised again: the whole
    -- settle rolls back and the Worker retries the event. Any other error (the class is gone, too many
    -- travellers for the class, a refused place) rolls back the apply only: the payment below is still
    -- recorded and the paid difference shows as Refund due. Never acknowledge a captured payment unrecorded.
    begin
      select l.* into v_before
        from public.booking_legs as l
       where l.booking_id = v_booking.id
       order by l.leg_seq
       limit 1;

      perform public.booking_edit_apply_payload(
        v_booking.id,
        v_req.quote_snapshot_id,
        v_req.payload,
        v_req.actor_id,
        case when v_req.actor = 'staff' then 'staff' else 'customer' end,
        v_actor_label
      );

      select l.* into v_after from public.booking_legs as l where l.id = v_before.id;
      v_applied := true;
      v_class_changed := v_after.vehicle_class_id is distinct from v_before.vehicle_class_id;
      if v_before.assigned_chauffeur_id is not null and v_after.assigned_chauffeur_id is null then
        v_unassigned := v_before.assigned_chauffeur_id;
      end if;

      update public.booking_edit_requests
         set status = 'accepted',
             accepted_at = pg_catalog.now(),
             extra_payment_id = v_pay.id
       where id = v_req.id;
    exception when others then
      get stacked diagnostics v_err_state = returned_sqlstate, v_err_text = message_text;
      -- A database hiccup is not final: the Worker retries the event.
      if v_err_state in ('40001', '40P01', '55P03', '57014', '57P01', '57P02', '57P03')
         or pg_catalog.left(v_err_state, 2) in ('08', '53', '58') then
        raise;
      end if;
      v_applied := false;
      v_class_changed := false;
      v_unassigned := null;
    end;
  end if;

  if not v_applied then
    -- The request had ended (replaced by a newer change, its time ran out, or withdrawn and overtaken
    -- by a newer change), the trip was cancelled, or the change could not be applied (see above) before
    -- this payment arrived. The money is recorded; the trip is not changed; what was paid above the price
    -- shows as Refund due for the admin.
    update public.bookings
       set price_snapshot_id = v_orig
     where id = v_booking.id;
    -- A change that still waited ends here, naming its payment (nothing will apply it later).
    update public.booking_edit_requests
       set extra_payment_id = v_pay.id,
           status = case when status = 'requested' then 'superseded' else status end
     where id = v_req.id;

    if v_err_state is not null then
      -- 261002 settle safety (P-1): the apply failed for a reason of its own; the owner can see why.
      insert into public.booking_events (
        booking_id, kind, actor_kind, actor_label, payload
      ) values (
        v_booking.id,
        'refund.requested',
        'stripe',
        'Stripe webhook',
        pg_catalog.jsonb_build_object(
          'via', 'difference_not_applied',
          'request_id', v_req.id,
          'sqlstate', v_err_state,
          'reason', v_err_text,
          'due_rappen', v_pay.charged_rappen::pg_catalog.int4
        )
      );
    end if;

    if v_ended then
      -- 261002 settle safety (P-2): paid after the cancel. Refund due on the cancelled booking.
      if coalesce(v_booking.refund_owed_rappen, 0) > 0
         and v_booking.refund_status in ('pending_ops', 'processing', 'failed') then
        -- The cancel already owed a full refund (or one is being sent): the difference is added to it.
        update public.bookings
           set refund_owed_rappen = (v_booking.refund_owed_rappen + v_pay.charged_rappen)::public.rappen,
               updated_at = pg_catalog.now()
         where id = v_booking.id;
      elsif v_booking.refund_status is distinct from 'processing'
            and v_booking.refund_status is distinct from 'failed' then
        -- Otherwise Refund due for the owner to decide, as for any cancelled paid booking.
        update public.bookings
           set refund_status = 'pending_ops',
               refund_owed_rappen = null,
               updated_at = pg_catalog.now()
         where id = v_booking.id;
      end if;
      insert into public.booking_events (
        booking_id, kind, actor_kind, actor_label, payload
      ) values (
        v_booking.id,
        'refund.requested',
        'stripe',
        'Stripe webhook',
        pg_catalog.jsonb_build_object(
          'via', 'difference_after_cancel',
          'request_id', v_req.id,
          'due_rappen', v_pay.charged_rappen::pg_catalog.int4
        )
      );
    end if;
  end if;

  perform app.booking_change_settle_credit(v_booking.id, null, 'stripe', 'Stripe webhook');

  -- Booking status is intentionally untouched (no pending->paid->confirmed).

  update public.stripe_events
     set processed_at = pg_catalog.now()
   where id = p_event_id;

  return query
    select v_booking.id,
           v_booking.reference,
           v_booking.locale,
           v_booking.contact_email::pg_catalog.text,
           false,
           v_req.id,
           v_applied,
           v_class_changed,
           v_unassigned;
end;
$$;

revoke all on function public.checkout_extra_payment_settle(
  pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text,
  pg_catalog.numeric, pg_catalog.text, pg_catalog.timestamptz, pg_catalog.int8
) from public;

grant execute on function public.checkout_extra_payment_settle(
  pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text,
  pg_catalog.numeric, pg_catalog.text, pg_catalog.timestamptz, pg_catalog.int8
) to vamos_system;

commit;

-- 20260928100000_settle_revive_pi_duplicate.sql
--
-- Plan 26.1-02. D-03/D-03a/D-03b/D-05/D-18/D-22: a successful payment always
-- ends as a confirmed booking -- whoever cancelled it (account, cron expire,
-- abandon, or staff), unless the cancel was a requote (a successor booking
-- already exists, so the old payment is refunded instead). The real
-- PaymentIntent id is written back over a stored cs_ session id at
-- settlement, and a second successful charge on an already-succeeded
-- snapshot is flagged duplicate rather than raising a unique-index 23505.
--
-- Owner applies this file in the SQL editor. Backward compatible with the
-- Worker live today: checkout_payment_settle keeps its exact 9-argument
-- signature; every new fact is an extra return column the current Worker
-- code simply does not read yet (26.1-05 reads them).
--
-- No CHF amount, no `_rappen: <number>` literal -- every value here is
-- schema/logic, not money.

-- ---------------------------------------------------------------------------
-- (1) booking_payments.status: add 'duplicate'.
-- ---------------------------------------------------------------------------
alter table public.booking_payments
  drop constraint booking_payments_status_check;

alter table public.booking_payments
  add constraint booking_payments_status_check
  check (status in ('requires_payment', 'succeeded', 'failed', 'canceled', 'duplicate'));

comment on constraint booking_payments_status_check on public.booking_payments is
  '26.1-02 D-22: duplicate is additive -- a second succeeded charge on an already-succeeded snapshot lands here, never 23505.';

-- ---------------------------------------------------------------------------
-- (2) booking_refunds.reason: add the four reasons checkout_duplicate_refund_record uses.
-- ---------------------------------------------------------------------------
alter table public.booking_refunds
  drop constraint booking_refunds_reason_check;

alter table public.booking_refunds
  add constraint booking_refunds_reason_check
  check (reason in (
    'customer_cancel', 'ops_cancel', 'no_driver', 'modification_credit', 'no_show',
    'duplicate_charge', 'paid_after_cancel', 'test_booking', 'requote_superseded'
  ));

comment on constraint booking_refunds_reason_check on public.booking_refunds is
  '26.1-02 D-22/D-03: four reasons added for checkout_duplicate_refund_record -- a settle branch that captured money but must not confirm the trip.';

-- ---------------------------------------------------------------------------
-- (3) booking_events.kind: add booking.revived, payment.duplicate (closed CHECK).
-- ---------------------------------------------------------------------------
alter table public.booking_events
  drop constraint booking_events_kind_check;

alter table public.booking_events
  add constraint booking_events_kind_check
  check (kind in (
    'booking.created',
    'booking.status_changed',
    'booking.modified',
    'booking.claimed',
    'booking.revived',
    'price.quoted',
    'price.repriced',
    'price.superseded',
    'payment.intent_created',
    'payment.succeeded',
    'payment.failed',
    'payment.duplicate',
    'refund.requested',
    'refund.issued',
    'assignment.chauffeur_set',
    'assignment.vehicle_set',
    'assignment.cleared',
    'flight.delayed',
    'note.added',
    'flight.autofilled',
    'review.submitted'
  ));

comment on constraint booking_events_kind_check on public.booking_events is
  '26.1-02: twenty-one kinds. booking.revived (D-03) and payment.duplicate (D-22) are additive.';

-- ---------------------------------------------------------------------------
-- (4) tg_payment_update_whitelist: allow stripe_payment_intent_id to move
--     cs_... -> pi_... on a non-succeeded row. Every other rule unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.tg_payment_update_whitelist()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_new jsonb;
  v_old jsonb;
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

  v_new := to_jsonb(new) - 'status' - 'captured_at' - 'charged_currency'
               - 'fx_rate' - 'fx_source' - 'fx_quoted_at' - 'presentment_amount_minor'
               - 'stripe_fee_rappen';
  v_old := to_jsonb(old) - 'status' - 'captured_at' - 'charged_currency'
               - 'fx_rate' - 'fx_source' - 'fx_quoted_at' - 'presentment_amount_minor'
               - 'stripe_fee_rappen';

  -- 26.1-02 D-05: the one legal correction to stripe_payment_intent_id on a
  -- non-succeeded row is the settlement write-back, cs_... -> pi_.... Any
  -- other change to this column (including pi_... -> anything) stays refused.
  if old.stripe_payment_intent_id like 'cs\_%' escape '\'
     and new.stripe_payment_intent_id like 'pi\_%' escape '\' then
    v_new := v_new - 'stripe_payment_intent_id';
    v_old := v_old - 'stripe_payment_intent_id';
  end if;

  if v_new is distinct from v_old then
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

-- ---------------------------------------------------------------------------
-- (5) checkout_payment_settle v2. Same 9 arguments; extra return columns.
-- ---------------------------------------------------------------------------
drop function public.checkout_payment_settle(
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.numeric,
  pg_catalog.text,
  pg_catalog.timestamptz,
  pg_catalog.int8
);

create function public.checkout_payment_settle(
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
  revived pg_catalog.bool,
  duplicate pg_catalog.bool,
  refund_required pg_catalog.bool,
  refund_reason pg_catalog.text,
  payment_id pg_catalog.int8,
  charged_rappen pg_catalog.int4,
  snapshot_id pg_catalog.int8,
  other_open_session_ids pg_catalog.text[]
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_pay public.booking_payments%rowtype;
  v_booking public.bookings%rowtype;
  v_pi_writeback pg_catalog.text;
  v_other_sessions pg_catalog.text[];
  v_dup_exists pg_catalog.bool;
  v_last_cancel_via pg_catalog.text;
  v_min_scheduled pg_catalog.timestamptz;
  v_pickup_ahead pg_catalog.bool;
  v_from_status public.booking_status;
begin
  if p_outcome is distinct from 'succeeded'
     and p_outcome is distinct from 'failed'
     and p_outcome is distinct from 'canceled' then
    raise exception 'invalid_outcome'
      using errcode = 'check_violation';
  end if;

  if p_session_id is not null then
    select bp.*
      into v_pay
      from public.booking_payments as bp
     where bp.stripe_checkout_session_id = p_session_id
       for update;
  end if;

  if v_pay.id is null and p_payment_intent_id is not null then
    select bp.*
      into v_pay
      from public.booking_payments as bp
     where bp.stripe_payment_intent_id = p_payment_intent_id
       for update;
  end if;

  if v_pay.id is null then
    raise exception 'payment_not_found'
      using errcode = 'P0002';
  end if;

  select b.*
    into v_booking
    from public.bookings as b
   where b.id = v_pay.booking_id
     for update;

  -- Already-settled: this exact row already reached succeeded. Unchanged.
  if v_pay.status = 'succeeded' and p_outcome = 'succeeded' then
    return query
      select v_booking.id, v_booking.reference, v_booking.locale,
             v_booking.contact_email::pg_catalog.text,
             true, false, false, false, null::pg_catalog.text,
             v_pay.id, v_pay.charged_rappen::pg_catalog.int4, v_pay.snapshot_id,
             array[]::pg_catalog.text[];
    return;
  end if;

  -- Non-succeeded outcome: unchanged failure path, extended return shape only.
  if p_outcome is distinct from 'succeeded' then
    update public.booking_payments
       set status = p_outcome,
           charged_currency = coalesce(p_charged_currency, charged_currency),
           fx_rate = case when p_charged_currency is not null then p_fx_rate else fx_rate end,
           fx_source = case when p_charged_currency is not null then p_fx_source else fx_source end,
           fx_quoted_at = case when p_charged_currency is not null then p_fx_quoted_at else fx_quoted_at end,
           presentment_amount_minor = case
                                        when p_charged_currency is not null
                                        then p_presentment_amount_minor
                                        else presentment_amount_minor
                                      end
     where id = v_pay.id;

    insert into public.booking_events (
      booking_id, kind, actor_kind, actor_label, payment_id
    ) values (
      v_booking.id, 'payment.failed', 'stripe', 'Stripe webhook', v_pay.id
    );

    update public.stripe_events
       set processed_at = pg_catalog.now()
     where id = p_event_id;

    return query
      select v_booking.id, v_booking.reference, v_booking.locale,
             v_booking.contact_email::pg_catalog.text,
             false, false, false, false, null::pg_catalog.text,
             v_pay.id, v_pay.charged_rappen::pg_catalog.int4, v_pay.snapshot_id,
             array[]::pg_catalog.text[];
    return;
  end if;

  -- p_outcome = 'succeeded' from here on.

  -- The pi_ write-back value for this UPDATE, only when it is the one legal
  -- correction the whitelist trigger allows (D-05).
  v_pi_writeback := case
    when p_payment_intent_id like 'pi\_%' escape '\'
     and v_pay.stripe_payment_intent_id like 'cs\_%' escape '\'
    then p_payment_intent_id
    else null
  end;

  -- D-21/D-22: every succeeded branch reports the booking's other open
  -- Checkout Session ids so the consumer can expire them. Computed once,
  -- before any UPDATE below changes v_pay's own status.
  select coalesce(pg_catalog.array_agg(bp3.stripe_checkout_session_id), array[]::pg_catalog.text[])
    into v_other_sessions
    from public.booking_payments as bp3
   where bp3.booking_id = v_booking.id
     and bp3.status = 'requires_payment'
     and bp3.id is distinct from v_pay.id
     and bp3.stripe_checkout_session_id is not null;

  -- Duplicate detection (D-22): another row on the same snapshot already
  -- succeeded. Flag duplicate; never attempt a second confirm or a second
  -- revive.
  select exists (
    select 1
      from public.booking_payments as bp2
     where bp2.snapshot_id = v_pay.snapshot_id
       and bp2.status = 'succeeded'
       and bp2.id is distinct from v_pay.id
  ) into v_dup_exists;

  if v_dup_exists then
    update public.booking_payments
       set status = 'duplicate',
           captured_at = pg_catalog.now(),
           stripe_payment_intent_id = coalesce(v_pi_writeback, stripe_payment_intent_id),
           charged_currency = coalesce(p_charged_currency, charged_currency),
           fx_rate = case when p_charged_currency is not null then p_fx_rate else fx_rate end,
           fx_source = case when p_charged_currency is not null then p_fx_source else fx_source end,
           fx_quoted_at = case when p_charged_currency is not null then p_fx_quoted_at else fx_quoted_at end,
           presentment_amount_minor = case
                                        when p_charged_currency is not null
                                        then p_presentment_amount_minor
                                        else presentment_amount_minor
                                      end
     where id = v_pay.id;

    insert into public.booking_events (
      booking_id, kind, actor_kind, actor_label, payment_id
    ) values (
      v_booking.id, 'payment.duplicate', 'stripe', 'Stripe webhook', v_pay.id
    );

    update public.stripe_events
       set processed_at = pg_catalog.now()
     where id = p_event_id;

    -- already_settled = true so the Worker live today (which only reads that
    -- column) never sends a second confirmation email.
    return query
      select v_booking.id, v_booking.reference, v_booking.locale,
             v_booking.contact_email::pg_catalog.text,
             true, false, true, true, 'duplicate_charge'::pg_catalog.text,
             v_pay.id, v_pay.charged_rappen::pg_catalog.int4, v_pay.snapshot_id,
             v_other_sessions;
    return;
  end if;

  -- is_test booking: capture the money, never touch booking status.
  if v_booking.is_test then
    update public.booking_payments
       set status = 'succeeded',
           captured_at = pg_catalog.now(),
           stripe_payment_intent_id = coalesce(v_pi_writeback, stripe_payment_intent_id),
           charged_currency = coalesce(p_charged_currency, charged_currency),
           fx_rate = case when p_charged_currency is not null then p_fx_rate else fx_rate end,
           fx_source = case when p_charged_currency is not null then p_fx_source else fx_source end,
           fx_quoted_at = case when p_charged_currency is not null then p_fx_quoted_at else fx_quoted_at end,
           presentment_amount_minor = case
                                        when p_charged_currency is not null
                                        then p_presentment_amount_minor
                                        else presentment_amount_minor
                                      end
     where id = v_pay.id;

    insert into public.booking_events (
      booking_id, kind, actor_kind, actor_label, payment_id
    ) values (
      v_booking.id, 'payment.succeeded', 'stripe', 'Stripe webhook', v_pay.id
    );

    update public.stripe_events
       set processed_at = pg_catalog.now()
     where id = p_event_id;

    return query
      select v_booking.id, v_booking.reference, v_booking.locale,
             v_booking.contact_email::pg_catalog.text,
             false, false, false, true, 'test_booking'::pg_catalog.text,
             v_pay.id, v_pay.charged_rappen::pg_catalog.int4, v_pay.snapshot_id,
             v_other_sessions;
    return;
  end if;

  -- Cancelled (or pending whose quote lock has already expired): decide
  -- revive (D-03/D-03a) vs refund-only (D-03b requote, or pickup already
  -- passed).
  if v_booking.status = 'cancelled'::public.booking_status
     or (
       v_booking.status = 'pending'::public.booking_status
       and exists (
         select 1
           from public.price_snapshots as ps
          where ps.id = v_booking.price_snapshot_id
            and ps.quote_lock_expires_at <= pg_catalog.now()
       )
     ) then

    select pg_catalog.min(bl.original_scheduled_at)
      into v_min_scheduled
      from public.booking_legs as bl
     where bl.booking_id = v_booking.id;

    select e.payload ->> 'via'
      into v_last_cancel_via
      from public.booking_events as e
     where e.booking_id = v_booking.id
       and e.kind = 'booking.status_changed'
       and e.to_status = 'cancelled'::public.booking_status
     order by e.at desc
     limit 1;

    v_pickup_ahead := v_min_scheduled is not null and v_min_scheduled > pg_catalog.now();
    v_from_status := v_booking.status;

    if v_booking.status = 'cancelled'::public.booking_status
       and v_last_cancel_via = 'requote_cancel' then
      -- D-03b: the requote created a successor booking. Reviving this one
      -- would double-book -- refund instead.
      update public.booking_payments
         set status = 'succeeded',
             captured_at = pg_catalog.now(),
             stripe_payment_intent_id = coalesce(v_pi_writeback, stripe_payment_intent_id),
             charged_currency = coalesce(p_charged_currency, charged_currency),
             fx_rate = case when p_charged_currency is not null then p_fx_rate else fx_rate end,
             fx_source = case when p_charged_currency is not null then p_fx_source else fx_source end,
             fx_quoted_at = case when p_charged_currency is not null then p_fx_quoted_at else fx_quoted_at end,
             presentment_amount_minor = case
                                          when p_charged_currency is not null
                                          then p_presentment_amount_minor
                                          else presentment_amount_minor
                                        end
       where id = v_pay.id;

      insert into public.booking_events (
        booking_id, kind, actor_kind, actor_label, payment_id
      ) values (
        v_booking.id, 'payment.succeeded', 'stripe', 'Stripe webhook', v_pay.id
      );

      update public.stripe_events
         set processed_at = pg_catalog.now()
       where id = p_event_id;

      return query
        select v_booking.id, v_booking.reference, v_booking.locale,
               v_booking.contact_email::pg_catalog.text,
               false, false, false, true, 'requote_superseded'::pg_catalog.text,
               v_pay.id, v_pay.charged_rappen::pg_catalog.int4, v_pay.snapshot_id,
               v_other_sessions;
      return;

    elsif v_pickup_ahead then
      -- D-03/D-03a: revive, whoever cancelled it (account, cron, abandon, staff).
      update public.booking_payments
         set status = 'succeeded',
             captured_at = pg_catalog.now(),
             stripe_payment_intent_id = coalesce(v_pi_writeback, stripe_payment_intent_id),
             charged_currency = coalesce(p_charged_currency, charged_currency),
             fx_rate = case when p_charged_currency is not null then p_fx_rate else fx_rate end,
             fx_source = case when p_charged_currency is not null then p_fx_source else fx_source end,
             fx_quoted_at = case when p_charged_currency is not null then p_fx_quoted_at else fx_quoted_at end,
             presentment_amount_minor = case
                                          when p_charged_currency is not null
                                          then p_presentment_amount_minor
                                          else presentment_amount_minor
                                        end
       where id = v_pay.id;

      update public.bookings
         set status = 'confirmed'::public.booking_status,
             refund_status = 'none',
             refund_owed_rappen = null,
             updated_at = pg_catalog.now()
       where id = v_booking.id;

      update public.booking_legs
         set status = 'confirmed'::public.booking_status,
             updated_at = pg_catalog.now()
       where booking_id = v_booking.id
         and status = 'cancelled'::public.booking_status;

      update public.coupon_redemptions
         set released_at = null,
             released_reason = null
       where booking_id = v_booking.id;

      insert into public.booking_events (
        booking_id, kind, actor_kind, actor_label, from_status, to_status, payment_id, payload
      ) values (
        v_booking.id, 'booking.revived', 'stripe', 'Stripe webhook',
        v_from_status, 'confirmed'::public.booking_status, v_pay.id,
        pg_catalog.jsonb_build_object('revived', true)
      );

      insert into public.booking_events (
        booking_id, kind, actor_kind, actor_label, payment_id
      ) values (
        v_booking.id, 'payment.succeeded', 'stripe', 'Stripe webhook', v_pay.id
      );

      update public.stripe_events
         set processed_at = pg_catalog.now()
       where id = p_event_id;

      return query
        select v_booking.id, v_booking.reference, v_booking.locale,
               v_booking.contact_email::pg_catalog.text,
               false, true, false, false, null::pg_catalog.text,
               v_pay.id, v_pay.charged_rappen::pg_catalog.int4, v_pay.snapshot_id,
               v_other_sessions;
      return;

    else
      -- Pickup already passed: the trip cannot run. Capture, do not revive.
      update public.booking_payments
         set status = 'succeeded',
             captured_at = pg_catalog.now(),
             stripe_payment_intent_id = coalesce(v_pi_writeback, stripe_payment_intent_id),
             charged_currency = coalesce(p_charged_currency, charged_currency),
             fx_rate = case when p_charged_currency is not null then p_fx_rate else fx_rate end,
             fx_source = case when p_charged_currency is not null then p_fx_source else fx_source end,
             fx_quoted_at = case when p_charged_currency is not null then p_fx_quoted_at else fx_quoted_at end,
             presentment_amount_minor = case
                                          when p_charged_currency is not null
                                          then p_presentment_amount_minor
                                          else presentment_amount_minor
                                        end
       where id = v_pay.id;

      insert into public.booking_events (
        booking_id, kind, actor_kind, actor_label, payment_id
      ) values (
        v_booking.id, 'payment.succeeded', 'stripe', 'Stripe webhook', v_pay.id
      );

      update public.stripe_events
         set processed_at = pg_catalog.now()
       where id = p_event_id;

      return query
        select v_booking.id, v_booking.reference, v_booking.locale,
               v_booking.contact_email::pg_catalog.text,
               false, false, false, true, 'paid_after_cancel'::pg_catalog.text,
               v_pay.id, v_pay.charged_rappen::pg_catalog.int4, v_pay.snapshot_id,
               v_other_sessions;
      return;
    end if;
  end if;

  -- Otherwise: the existing pending -> paid -> confirmed path, extended with
  -- the pi_ write-back and the new return columns.
  update public.booking_payments
     set status = 'succeeded',
         captured_at = pg_catalog.now(),
         stripe_payment_intent_id = coalesce(v_pi_writeback, stripe_payment_intent_id),
         charged_currency = coalesce(p_charged_currency, charged_currency),
         fx_rate = case when p_charged_currency is not null then p_fx_rate else fx_rate end,
         fx_source = case when p_charged_currency is not null then p_fx_source else fx_source end,
         fx_quoted_at = case when p_charged_currency is not null then p_fx_quoted_at else fx_quoted_at end,
         presentment_amount_minor = case
                                      when p_charged_currency is not null
                                      then p_presentment_amount_minor
                                      else presentment_amount_minor
                                    end
   where id = v_pay.id;

  if v_booking.status = 'pending'::public.booking_status then
    update public.bookings
       set status = 'paid'::public.booking_status,
           updated_at = pg_catalog.now()
     where id = v_booking.id;

    update public.booking_legs
       set status = 'paid'::public.booking_status
     where booking_id = v_booking.id
       and status = 'pending'::public.booking_status;

    insert into public.booking_events (
      booking_id, kind, actor_kind, actor_label, from_status, to_status, payment_id
    ) values (
      v_booking.id, 'booking.status_changed', 'stripe', 'Stripe webhook',
      'pending'::public.booking_status, 'paid'::public.booking_status, v_pay.id
    );

    v_booking.status := 'paid';
  end if;

  if v_booking.status = 'paid'::public.booking_status then
    update public.bookings
       set status = 'confirmed'::public.booking_status,
           updated_at = pg_catalog.now()
     where id = v_booking.id;

    update public.booking_legs
       set status = 'confirmed'::public.booking_status
     where booking_id = v_booking.id
       and status = 'paid'::public.booking_status;

    insert into public.booking_events (
      booking_id, kind, actor_kind, actor_label, from_status, to_status, payment_id
    ) values (
      v_booking.id, 'booking.status_changed', 'stripe', 'Stripe webhook',
      'paid'::public.booking_status, 'confirmed'::public.booking_status, v_pay.id
    );

    v_booking.status := 'confirmed';
  end if;

  insert into public.booking_events (
    booking_id, kind, actor_kind, actor_label, payment_id
  ) values (
    v_booking.id, 'payment.succeeded', 'stripe', 'Stripe webhook', v_pay.id
  );

  update public.stripe_events
     set processed_at = pg_catalog.now()
   where id = p_event_id;

  return query
    select v_booking.id, v_booking.reference, v_booking.locale,
           v_booking.contact_email::pg_catalog.text,
           false, false, false, false, null::pg_catalog.text,
           v_pay.id, v_pay.charged_rappen::pg_catalog.int4, v_pay.snapshot_id,
           v_other_sessions;
  return;
end;
$$;

revoke all on function public.checkout_payment_settle(
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.numeric,
  pg_catalog.text,
  pg_catalog.timestamptz,
  pg_catalog.int8
) from public;

grant execute on function public.checkout_payment_settle(
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.numeric,
  pg_catalog.text,
  pg_catalog.timestamptz,
  pg_catalog.int8
) to vamos_system;

comment on function public.checkout_payment_settle(
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.numeric,
  pg_catalog.text,
  pg_catalog.timestamptz,
  pg_catalog.int8
) is
  '26.1-02 D-03/D-03a/D-03b/D-05/D-22: settle v2. Revives a cancelled/expired booking on success (except requote-superseded, refunded instead); writes the real pi_ id back over a stored cs_ id; a second succeeded charge on the same snapshot is flagged duplicate, never 23505. Same 9-arg signature as 20260827000004; extra return columns only. EXECUTE: vamos_system only.';

-- ---------------------------------------------------------------------------
-- (6) checkout_duplicate_refund_record: records the refund decision for a
--     settle branch that captured money but must not confirm the trip.
-- ---------------------------------------------------------------------------
create function public.checkout_duplicate_refund_record(
  p_payment_id pg_catalog.int8,
  p_stripe_refund_id pg_catalog.text,
  p_refund_rappen public.rappen,
  p_reason pg_catalog.text
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
  v_pay public.booking_payments%rowtype;
  v_booking public.bookings%rowtype;
  v_refund public.booking_refunds%rowtype;
begin
  if p_reason is distinct from 'duplicate_charge'
     and p_reason is distinct from 'paid_after_cancel'
     and p_reason is distinct from 'test_booking'
     and p_reason is distinct from 'requote_superseded' then
    raise exception 'invalid_reason'
      using errcode = 'check_violation';
  end if;

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

  select p.*
    into v_pay
    from public.booking_payments as p
   where p.id = p_payment_id
     for update;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  select b.*
    into v_booking
    from public.bookings as b
   where b.id = v_pay.booking_id
     for update;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

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
    stripe_refund_id
  ) values (
    v_booking.id,
    v_pay.snapshot_id,
    v_pay.id,
    p_reason,
    v_pay.charged_rappen,
    100,
    p_refund_rappen,
    pg_catalog.jsonb_build_object('rule', p_reason),
    0,
    p_stripe_refund_id
  )
  returning * into v_refund;

  -- A duplicate charge is not the booking's refund story -- the booking was
  -- never charged twice from its own point of view. Every other reason here
  -- captured money against a booking that will not travel; that IS the
  -- booking's refund story.
  if p_reason is distinct from 'duplicate_charge' then
    update public.bookings
       set refund_status = 'refunded',
           refunded_rappen = coalesce(refunded_rappen, 0) + p_refund_rappen,
           updated_at = pg_catalog.now()
     where id = v_booking.id;
  end if;

  insert into public.booking_events (
    booking_id, kind, actor_kind, actor_label, payment_id, refund_id, payload
  ) values (
    v_booking.id,
    'refund.issued',
    'system',
    'checkout_duplicate_refund_record',
    v_pay.id,
    v_refund.id,
    pg_catalog.jsonb_build_object(
      'via', 'checkout_duplicate_refund_record',
      'stripe_refund_id', p_stripe_refund_id,
      'reason', p_reason
    )
  );

  return query select v_booking.id, v_refund.id;
end;
$$;

revoke all on function public.checkout_duplicate_refund_record(
  pg_catalog.int8, pg_catalog.text, public.rappen, pg_catalog.text
) from public;

grant execute on function public.checkout_duplicate_refund_record(
  pg_catalog.int8, pg_catalog.text, public.rappen, pg_catalog.text
) to vamos_system;

comment on function public.checkout_duplicate_refund_record(
  pg_catalog.int8, pg_catalog.text, public.rappen, pg_catalog.text
) is
  '26.1-02 D-22: idempotent on stripe_refund_id. duplicate_charge leaves bookings.refund_status/refunded_rappen untouched; paid_after_cancel/test_booking/requote_superseded set them. EXECUTE: vamos_system only.';

-- checkout_capture_gate (20260924004000) is left in place. The live Worker
-- still calls it today; 26.1-05 stops calling it. Dropping it here would
-- break the Worker before the owner deploys the consumer that replaces it.

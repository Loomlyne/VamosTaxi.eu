-- 20260930100000_confirmation_mail_definer.sql
--
-- Plan 26.3-01 (D-21, D-29, D-32, D-39). Root cause 2 of the failed 26.1 UAT
-- step 1: the confirmation mail ran `select policy from public.price_snapshots`
-- as vamos_system, which has EXECUTE on RPCs only (42501). The throw came
-- before notification_claim, so no claim row existed and nothing retried.
--
-- Additive only:
--   (a) booking_payments.presentment_currency (D-21) + whitelist trigger
--   (b) checkout_payment_settle v3: trailing p_presentment_currency default null
--   (c) checkout_booking_for_email v2: every e-mail field through one definer read
--   (d) notification_confirmation_missing: paid bookings with no confirmation claim
--   (e) customer_id_for_user: auth user -> customers.id for vamos_checkout (D-32)
--
-- No CHF amount literal anywhere in this file.

-- ---------------------------------------------------------------------------
-- (a) presentment currency next to presentment_amount_minor.
-- ---------------------------------------------------------------------------
alter table public.booking_payments
  add column if not exists presentment_currency char(3);

alter table public.booking_payments
  add constraint booking_payments_presentment_currency_format
  check (presentment_currency is null or presentment_currency ~ '^[A-Z]{3}$');

comment on column public.booking_payments.presentment_currency is
  '26.3-01 D-21: ISO currency the customer paid in (Stripe presentment_details.presentment_currency, upper-cased). Written by checkout_payment_settle. charged_rappen stays the CHF figure.';

-- The UPDATE whitelist must let settlement write the new column once.
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
               - 'fx_rate' - 'fx_source' - 'fx_quoted_at' - 'presentment_amount_minor' - 'presentment_currency'
               - 'stripe_fee_rappen';
  v_old := to_jsonb(old) - 'status' - 'captured_at' - 'charged_currency'
               - 'fx_rate' - 'fx_source' - 'fx_quoted_at' - 'presentment_amount_minor' - 'presentment_currency'
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
  if old.presentment_currency is not null
     and new.presentment_currency is distinct from old.presentment_currency then
    raise exception 'booking_payments: presentment_currency is write-once'
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

-- ---------------------------------------------------------------------------
-- (b) checkout_payment_settle v3. Signature grows by one defaulted argument;
--     an overload would make every 9-argument call ambiguous, so drop and
--     recreate. Body copied verbatim from v2 plus the presentment_currency write.
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
  p_presentment_amount_minor pg_catalog.int8,
  p_presentment_currency pg_catalog.text default null
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
                                      end,
         presentment_currency = coalesce(pg_catalog.upper(p_presentment_currency), presentment_currency)
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
                                      end,
         presentment_currency = coalesce(pg_catalog.upper(p_presentment_currency), presentment_currency)
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
                                      end,
         presentment_currency = coalesce(pg_catalog.upper(p_presentment_currency), presentment_currency)
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
                                        end,
           presentment_currency = coalesce(pg_catalog.upper(p_presentment_currency), presentment_currency)
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
                                        end,
           presentment_currency = coalesce(pg_catalog.upper(p_presentment_currency), presentment_currency)
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
                                        end,
           presentment_currency = coalesce(pg_catalog.upper(p_presentment_currency), presentment_currency)
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
                                    end,
       presentment_currency = coalesce(pg_catalog.upper(p_presentment_currency), presentment_currency)
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
  pg_catalog.int8,
  pg_catalog.text
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
  pg_catalog.int8,
  pg_catalog.text
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
  pg_catalog.int8,
  pg_catalog.text
) is
  '26.3-01 D-21: settle v3. Same behaviour as settle v2 (20260928100000); adds trailing p_presentment_currency (default null, upper-cased) written to booking_payments.presentment_currency on every update branch. 9-argument callers keep working through the default. EXECUTE: vamos_system only.';

-- ---------------------------------------------------------------------------
-- (c) checkout_booking_for_email v2: the confirmation mail reads everything
--     here. No raw table read remains under vamos_system.
-- ---------------------------------------------------------------------------
drop function if exists public.checkout_booking_for_email(pg_catalog.uuid);

create function public.checkout_booking_for_email(p_booking_id pg_catalog.uuid)
returns table (
  reference pg_catalog.text,
  locale pg_catalog.text,
  contact_name pg_catalog.text,
  contact_email pg_catalog.text,
  payer_email pg_catalog.text,
  price_total_rappen pg_catalog.int8,
  pickup_text pg_catalog.text,
  dropoff_text pg_catalog.text,
  scheduled_local pg_catalog.text,
  flight_no pg_catalog.text,
  pax pg_catalog.int4,
  bags pg_catalog.int4,
  vehicle_class_slug pg_catalog.text,
  lines pg_catalog.jsonb,
  policy_extras pg_catalog.jsonb,
  vehicle_class_name pg_catalog.text,
  vat_rate_bps pg_catalog.int4,
  coupon_code pg_catalog.text,
  coupon_rappen pg_catalog.int8,
  charged_rappen pg_catalog.int8,
  presentment_amount_minor pg_catalog.int8,
  presentment_currency pg_catalog.text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.reference,
    b.locale,
    b.contact_name,
    b.contact_email::pg_catalog.text,
    b.payer_email::pg_catalog.text,
    b.price_total_rappen,
    l.pickup_text,
    l.dropoff_text,
    l.scheduled_local,
    l.flight_no,
    l.pax,
    l.bags,
    vc.slug,
    ps.lines,
    ps.policy -> 'extras',
    vc.name,
    coalesce(
      case
        when (ps.policy ->> 'vat_rate_bps') ~ '^[0-9]+$'
        then (ps.policy ->> 'vat_rate_bps')::pg_catalog.int4
      end,
      st.vat_rate_bps
    ),
    ps.coupon_code,
    case
      when cl.coupon_sum is not null and cl.coupon_sum <> 0 then cl.coupon_sum
      when ps.discount_rappen > 0 then -ps.discount_rappen::pg_catalog.int8
      else null
    end,
    pay.charged_rappen::pg_catalog.int8,
    pay.presentment_amount_minor,
    pay.presentment_currency::pg_catalog.text
  from public.bookings as b
  join public.booking_legs as l
    on l.booking_id = b.id
   and l.leg_seq = 1
  left join public.vehicle_classes as vc
    on vc.id = l.vehicle_class_id
  left join public.price_snapshots as ps
    on ps.id = b.price_snapshot_id
  left join public.settings as st
    on st.id = 1
  left join lateral (
    select pg_catalog.sum((line ->> 'amount_rappen')::pg_catalog.int8) as coupon_sum
      from pg_catalog.jsonb_array_elements(
             case when pg_catalog.jsonb_typeof(ps.lines) = 'array' then ps.lines else '[]'::pg_catalog.jsonb end
           ) as line
     where (line ->> 'kind') in ('coupon', 'discount')
        or (line ->> 'code') = 'coupon'
        or ((line ->> 'amount_rappen') ~ '^-[0-9]+$')
  ) as cl on true
  left join lateral (
    select bp.charged_rappen, bp.presentment_amount_minor, bp.presentment_currency
      from public.booking_payments as bp
     where bp.booking_id = b.id
       and bp.status = 'succeeded'
     order by bp.captured_at desc nulls last, bp.id desc
     limit 1
  ) as pay on true
  where b.id = p_booking_id
$$;

revoke all on function public.checkout_booking_for_email(pg_catalog.uuid) from public;
grant execute on function public.checkout_booking_for_email(pg_catalog.uuid) to vamos_system;

comment on function public.checkout_booking_for_email(pg_catalog.uuid) is
  '26.3-01 D-29/D-39: every confirmation-mail field in one definer read (booking, first leg, snapshot lines and extras, class name, VAT bps, coupon, charged CHF, presentment). Replaces the raw price_snapshots read vamos_system could not run. EXECUTE: vamos_system only.';

-- ---------------------------------------------------------------------------
-- (d) Paid bookings that never got a confirmation claim (the VT-26-0737
--     shape). The hourly sweep delivers each one.
-- ---------------------------------------------------------------------------
create function public.notification_confirmation_missing(p_older_than pg_catalog.interval)
returns table (
  booking_id pg_catalog.uuid,
  locale pg_catalog.text
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.locale
    from public.bookings as b
   where b.status in ('confirmed'::public.booking_status, 'assigned'::public.booking_status)
     and exists (
       select 1
         from public.booking_payments as bp
        where bp.booking_id = b.id
          and bp.captured_at is not null
          and bp.captured_at < pg_catalog.now() - p_older_than
     )
     and not exists (
       select 1
         from public.booking_notifications as n
        where n.booking_id = b.id
          and n.kind = 'confirmation'
     )
   order by b.created_at
   limit 200
$$;

revoke all on function public.notification_confirmation_missing(pg_catalog.interval) from public;
grant execute on function public.notification_confirmation_missing(pg_catalog.interval) to vamos_system;

comment on function public.notification_confirmation_missing(pg_catalog.interval) is
  '26.3-01 D-39: confirmed/assigned bookings with a captured payment older than p_older_than and no confirmation claim row. Max 200 per call. EXECUTE: vamos_system only.';

-- ---------------------------------------------------------------------------
-- (e) Signed-in half of account linking (D-32): the route passes the verified
--     JWT sub, never a body field.
-- ---------------------------------------------------------------------------
create function public.customer_id_for_user(p_user_id pg_catalog.uuid)
returns pg_catalog.uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
    from public.customers as c
   where c.user_id = p_user_id
     and c.erased_at is null
   limit 1
$$;

revoke all on function public.customer_id_for_user(pg_catalog.uuid) from public;
grant execute on function public.customer_id_for_user(pg_catalog.uuid) to vamos_checkout;

comment on function public.customer_id_for_user(pg_catalog.uuid) is
  '26.3-01 D-32: customers.id for a verified auth user id (null when none or erased). EXECUTE: vamos_checkout only.';

-- ---------------------------------------------------------------------------
-- (f) notification_sweep v2: a send that failed (failed_at set, never sent)
--     is retryable too. Same signature and grants. Failed rows are retried
--     for three days after the claim, then left for ops, so a permanently
--     bad address does not resend forever.
-- ---------------------------------------------------------------------------
create or replace function public.notification_sweep(
  p_older_than pg_catalog.interval,
  p_kinds pg_catalog.text[] default null
)
returns table (
  id pg_catalog.int8,
  booking_id pg_catalog.uuid,
  booking_leg_id pg_catalog.uuid,
  kind pg_catalog.text,
  channel pg_catalog.text,
  locale pg_catalog.text,
  template_version pg_catalog.text,
  created_at pg_catalog.timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
    select n.id,
           n.booking_id,
           n.booking_leg_id,
           n.kind,
           n.channel,
           n.locale,
           n.template_version,
           n.created_at
      from public.booking_notifications as n
     where n.sent_at is null
       and n.created_at < pg_catalog.now() - p_older_than
       and (p_kinds is null or n.kind = any (p_kinds))
       and (
         n.failed_at is null
         or (
           n.failed_at < pg_catalog.now() - p_older_than
           and n.created_at > pg_catalog.now() - '3 days'::pg_catalog.interval
         )
       );
  return;
end;
$$;

revoke all on function public.notification_sweep(pg_catalog.interval, pg_catalog.text[]) from public;
grant execute on function public.notification_sweep(pg_catalog.interval, pg_catalog.text[]) to vamos_system;

comment on function public.notification_sweep(pg_catalog.interval, pg_catalog.text[]) is
  '26.3-01 D-39: claimed-but-unsent rows, plus failed rows whose last failure is older than p_older_than and whose claim is under three days old. The caller resends on the returned claim id. EXECUTE: vamos_system only.';

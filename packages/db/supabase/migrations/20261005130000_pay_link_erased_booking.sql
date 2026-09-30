-- 20261005130000_pay_link_erased_booking.sql
--
-- Plan 20-12. A booking that staff erased (bookings.erased_at) must not be payable.
-- Until now a pay link e-mailed before the erase kept opening a payment page until
-- its 24 h hold ended, and a payment would have been recorded on the erased booking.
--
--   (1) checkout_pay_link_by_hash / _state / _lines also require erased_at is null.
--       An erased booking answers like an unknown or expired link: no row, no row,
--       and state = 'expired' with no reference. No new state.
--   (2) checkout_payment_settle: a succeeded payment for an erased booking raises
--       payment_not_found (P0002), the same outcome as a missing booking, which the
--       Worker refunds in full. Placed after the already-settled and duplicate
--       branches, so replays and duplicate-charge handling are unchanged.
--   Erase itself is application SQL (apps/web/lib/ops/bookings-write.ts), not a
--   database function; it is not changed here.
--
-- Every body is copied byte for byte from its newest definition
-- (20260928140000, 20260930170000, 20260930100000) plus the lines above.
-- Signatures, SECURITY DEFINER, search_path and grants are unchanged. No CHF amount.

begin;

create or replace function public.checkout_pay_link_by_hash(
  p_token_hash pg_catalog.bytea
)
returns table (
  booking_id pg_catalog.uuid,
  quote_id pg_catalog.uuid,
  reference pg_catalog.text,
  status public.booking_status,
  locale pg_catalog.text,
  contact_email extensions.citext,
  payer_email extensions.citext,
  snapshot_expires_at pg_catalog.timestamptz,
  charged_rappen public.rappen,
  pickup_text pg_catalog.text,
  dropoff_text pg_catalog.text,
  token_expires_at pg_catalog.timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
    select b.id,
           b.quote_id,
           b.reference,
           b.status,
           b.locale,
           b.contact_email,
           b.payer_email,
           greatest(s.expires_at, coalesce(b.hold_until, s.expires_at)),
           s.total_rappen,
           l.pickup_text,
           l.dropoff_text,
           t.expires_at
      from public.booking_access_tokens as t
      join public.bookings as b on b.id = t.booking_id
      join public.price_snapshots as s on s.id = b.price_snapshot_id
      join public.booking_legs as l
        on l.booking_id = b.id and l.leg_seq = 1
     where t.token_hash = p_token_hash
       and t.purpose = 'pay'
       and t.revoked_at is null
       and t.expires_at > now()
       and greatest(s.expires_at, coalesce(b.hold_until, s.expires_at)) > now()
       and b.status in ('pending', 'quote')
       and b.erased_at is null;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.checkout_pay_link_by_hash(pg_catalog.bytea) from public;
revoke all on function public.checkout_pay_link_by_hash(pg_catalog.bytea) from anon;
revoke all on function public.checkout_pay_link_by_hash(pg_catalog.bytea) from authenticated;

grant execute on function public.checkout_pay_link_by_hash(pg_catalog.bytea) to vamos_checkout;

create or replace function public.checkout_pay_link_state(
  p_token_hash pg_catalog.bytea,
  p_session_id pg_catalog.text default null
)
returns table (state pg_catalog.text, reference pg_catalog.text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_booking_id pg_catalog.uuid;
  v_reference pg_catalog.text;
  v_status public.booking_status;
  v_token_expires pg_catalog.timestamptz;
  v_revoked pg_catalog.timestamptz;
  v_hold pg_catalog.timestamptz;
  v_snapshot_expires pg_catalog.timestamptz;
  v_erased pg_catalog.timestamptz;
begin
  select b.id, b.reference, b.status, t.expires_at, t.revoked_at, b.hold_until, s.expires_at, b.erased_at
    into v_booking_id, v_reference, v_status, v_token_expires, v_revoked, v_hold, v_snapshot_expires, v_erased
    from public.booking_access_tokens as t
    join public.bookings as b on b.id = t.booking_id
    left join public.price_snapshots as s on s.id = b.price_snapshot_id
   where t.token_hash = p_token_hash
     and t.purpose = 'pay';

  if not found or v_revoked is not null or v_erased is not null then
    state := 'expired';
    reference := null;
    return next;
    return;
  end if;

  if p_session_id is not null and exists (
    select 1
      from public.booking_payments as bp
      join public.booking_refunds as r
        on r.payment_id = bp.id and r.reason = 'duplicate_charge'
     where bp.booking_id = v_booking_id
       and bp.stripe_checkout_session_id = p_session_id
       and bp.status = 'duplicate'
  ) then
    state := 'refunded_duplicate';
    reference := v_reference;
    return next;
    return;
  end if;

  if v_status in ('paid', 'confirmed', 'assigned', 'completed', 'partially_completed') then
    state := 'paid';
    reference := v_reference;
    return next;
    return;
  end if;

  if v_status in ('pending', 'quote')
     and v_token_expires > now()
     and greatest(v_snapshot_expires, coalesce(v_hold, v_snapshot_expires)) > now() then
    state := 'payable';
    reference := v_reference;
    return next;
    return;
  end if;

  state := 'expired';
  reference := null;
  return next;
end;
$$;

revoke all on function public.checkout_pay_link_state(pg_catalog.bytea, pg_catalog.text)
  from public, anon, authenticated;
grant execute on function public.checkout_pay_link_state(pg_catalog.bytea, pg_catalog.text)
  to vamos_checkout;

create or replace function public.checkout_pay_link_lines(
  p_token_hash pg_catalog.bytea
)
returns table (
  seq pg_catalog.int4,
  kind pg_catalog.text,
  code pg_catalog.text,
  names pg_catalog.jsonb,
  vat_rate_bps pg_catalog.int4,
  amount_rappen pg_catalog.int8
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.ord::pg_catalog.int4,
         e.line ->> 'kind',
         e.line ->> 'code',
         case
           when pg_catalog.jsonb_typeof(e.line -> 'params' -> 'names') = 'object'
           then pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
                  'en', e.line -> 'params' -> 'names' ->> 'en',
                  'de', e.line -> 'params' -> 'names' ->> 'de',
                  'fr', e.line -> 'params' -> 'names' ->> 'fr',
                  'ar', e.line -> 'params' -> 'names' ->> 'ar'))
           else null
         end,
         case
           when (e.line -> 'params' ->> 'vatRateBps') ~ '^[0-9]{1,5}$'
           then (e.line -> 'params' ->> 'vatRateBps')::pg_catalog.int4
           else null
         end,
         (e.line ->> 'amount_rappen')::pg_catalog.int8
    from public.booking_access_tokens as t
    join public.bookings as b on b.id = t.booking_id
    join public.price_snapshots as s on s.id = b.price_snapshot_id
    cross join lateral pg_catalog.jsonb_array_elements(s.lines)
      with ordinality as e(line, ord)
   where t.token_hash = p_token_hash
     and t.purpose = 'pay'
     and t.revoked_at is null
     and t.expires_at > now()
     and greatest(s.expires_at, coalesce(b.hold_until, s.expires_at)) > now()
     and b.status in ('pending', 'quote')
     and b.erased_at is null
     and pg_catalog.jsonb_typeof(s.lines) = 'array'
   order by e.ord
$$;

revoke all on function public.checkout_pay_link_lines(pg_catalog.bytea) from public;
revoke all on function public.checkout_pay_link_lines(pg_catalog.bytea) from anon;
revoke all on function public.checkout_pay_link_lines(pg_catalog.bytea) from authenticated;

grant execute on function public.checkout_pay_link_lines(pg_catalog.bytea) to vamos_checkout;

create or replace function public.checkout_payment_settle(
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

  -- An erased booking never takes a payment. Same outcome as a missing booking: the
  -- P0002 the Worker turns into an automatic full refund. Nothing is written (the
  -- raise rolls the transaction back), so no payment is recorded as succeeded.
  if v_booking.erased_at is not null then
    raise exception 'payment_not_found'
      using errcode = 'P0002';
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

commit;

-- 20261012120000_late_paylink_settle.sql
--
-- Stripe payments review 2026-10-09, job J4 "late payment and pay-link settle" (W5-01, W5-11, W4-05, W5-13;
-- .planning/audits/2026-10-09-stripe-W4.md and -W5.md). Builds on J2 (20261012100000) and J3 (20261012110000).
--
-- (1) stripe_event_begin (W4-05): body of 20261012100000 plus a type-aware out-of-order rule. Only an event
--     that would REGRESS a payment (checkout.session.expired, checkout.session.async_payment_failed,
--     payment_intent.canceled) is superseded, and only by a processed later event that proves the payment
--     went through (checkout.session.completed, async_payment_succeeded, payment_intent.succeeded) on the same
--     cs_/pi_ ids. Every other event (a paid completed that waits in a retry, charge.refunded, dispute events,
--     ignored types, the return route's own event) is never superseded.
-- (2) app.coupon_reactivate (W5-13, new): gives a revived booking's released coupon redemptions back only while
--     the coupon's global and per-user caps allow it (the cap trigger is insert-only and never saw the old
--     UPDATE). A redemption that no longer fits stays released; the revive event records how many.
-- (3) checkout_payment_settle (W5-01, W5-13): body of 20261012110000 plus the lines marked 20261012120000. A
--     pending booking is "late" only when its price lock AND its pay-link hold (bookings.hold_until) are past:
--     a pay-link payment inside its hold takes the normal pending -> paid -> confirmed path with its status
--     events and legs. The revive branch (cancelled, or pending with lock and hold both past) now confirms
--     every leg that was not running (cancelled, pending or paid), writes the booking.status_changed event
--     next to booking.revived, and uses app.coupon_reactivate.
-- (4) checkout_payments_mark_dead (W5-11, new): marks the requires_payment rows of one booking whose session ids
--     the caller has verified expired and unpaid as canceled. Only requires_payment rows, only the named ids.
-- (5) purge_unpaid_booking (W5-11): body of 20261007300000 plus two refusals (it answers false): a booking with
--     a requires_payment payment row that names a Stripe session, and, for reason unpaid_expired, a booking
--     whose price lock or pay-link hold is still live.
--
-- Lock order: payment rows of the booking first (ordered by id), then the booking, then the event row.
-- purge_unpaid_booking follows that order too (it used to take the booking first). The coupon row is last,
-- as the cap trigger takes it. No data is changed. One transaction.
-- Apply order: after 20261012110000. Worker order: deploy the Worker of this branch FIRST, then apply this file:
-- the new Worker marks the verified sessions dead and then purges (the old rules purge them as before); the
-- reverse order leaves purge refusing (answering false) for bookings the old Worker has not marked, until the
-- Worker is deployed (a customer who goes back and changes a selection would see quote_already_booked).
begin;

-- (1)
create or replace function public.stripe_event_begin(
  p_event_id pg_catalog.text,
  p_object_ids pg_catalog.text[],
  p_stripe_created pg_catalog.timestamptz
)
returns table (
  should_process pg_catalog.bool,
  reason pg_catalog.text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_processed_at pg_catalog.timestamptz;
  v_type pg_catalog.text;
begin
  update public.stripe_events
     set attempts = attempts + 1,
         last_attempt_at = pg_catalog.now()   -- 20261012100000
   where id = p_event_id
  returning processed_at into v_processed_at;

  if not found then
    raise exception 'event_not_found'
      using errcode = 'P0002';
  end if;

  if v_processed_at is not null then
    return query select false, 'already_processed'::pg_catalog.text;
    return;
  end if;

  -- Out-of-order rule as SQL: a canceled delivered after a succeeded for the same
  -- payment family is refused here, not in the Worker. p_object_ids spans cs_ and
  -- pi_ ids. The stripe_events_object (object_id, stripe_created) partial index
  -- serves this predicate.
  -- 20261012120000 (W4-05): the rule is by event TYPE, not by object family. Only an event that would
  -- REGRESS a payment (the page expired, an asynchronous payment failed, the PaymentIntent was canceled) is
  -- superseded, and only by a processed event that proves the payment went through: a later paid
  -- checkout.session.completed, checkout.session.async_payment_succeeded or payment_intent.succeeded on the
  -- same payment family (the cs_ and pi_ ids in p_object_ids). Every other event is never superseded: a
  -- paid checkout.session.completed that waits in a retry, a charge.refunded (idempotent by refund id), a
  -- dispute event (its upsert already guards by stripe_created) or an ignored type is not dropped because an
  -- unrelated later event on the same object was processed. The out-of-order guarantee (a canceled or
  -- expired event delivered after the success it came before is refused) is unchanged.
  select e0.type
    into v_type
    from public.stripe_events as e0
   where e0.id = p_event_id;

  if v_type in ('checkout.session.expired', 'checkout.session.async_payment_failed', 'payment_intent.canceled')
     and exists (
       select 1
         from public.stripe_events as e
        where e.object_id = any (p_object_ids)
          and e.processed_at is not null
          and e.stripe_created > p_stripe_created
          and e.type in ('checkout.session.completed', 'checkout.session.async_payment_succeeded', 'payment_intent.succeeded')
     ) then
    return query select false, 'superseded'::pg_catalog.text;
    return;
  end if;

  return query select true, 'ok'::pg_catalog.text;
  return;
end;
$$;

revoke all on function public.stripe_event_begin(
  pg_catalog.text, pg_catalog.text[], pg_catalog.timestamptz
) from public;
grant execute on function public.stripe_event_begin(
  pg_catalog.text, pg_catalog.text[], pg_catalog.timestamptz
) to vamos_system;

comment on function public.stripe_event_begin(
  pg_catalog.text, pg_catalog.text[], pg_catalog.timestamptz
) is
  'D-14 (plan 07-03), 20261012100000 (last_attempt_at), 20261012120000 (W4-05): increment attempts, then already_processed / superseded / ok. Superseded only for an event that would regress a payment (expired, async_payment_failed, payment_intent.canceled) when a later paid event is already processed on the same cs_/pi_ ids. Ordering is stripe_created, never received_at.';

-- (2)
create or replace function app.coupon_reactivate(p_booking_id pg_catalog.uuid)
returns pg_catalog.int4
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.coupon_redemptions%rowtype;
  c public.coupons%rowtype;
  v_ok pg_catalog.bool;
  v_kept pg_catalog.int4 := 0;
begin
  for r in
    select x.*
      from public.coupon_redemptions as x
     where x.booking_id = p_booking_id
       and x.released_at is not null
     order by x.id
  loop
    -- Same lock the insert trigger takes (FOR NO KEY UPDATE since 20261011100000), so two concurrent
    -- revives, or a revive and a checkout, cannot both pass the cap. FOR UPDATE would conflict with the
    -- FOR KEY SHARE a checkout's price snapshot holds on this row and bring back the 40P01 #72 removed.
    select cp.* into c from public.coupons as cp where cp.id = r.coupon_id for no key update;
    v_ok := c.id is not null;
    if v_ok and c.global_limit is not null then
      v_ok := (select pg_catalog.count(*)
                 from public.coupon_redemptions as g
                where g.coupon_id = c.id and g.released_at is null) < c.global_limit;
    end if;
    if v_ok and c.per_user_limit is not null and r.customer_id is not null then
      v_ok := (select pg_catalog.count(*)
                 from public.coupon_redemptions as u
                where u.coupon_id = c.id and u.customer_id = r.customer_id and u.released_at is null)
              < c.per_user_limit;
    end if;
    if v_ok then
      update public.coupon_redemptions
         set released_at = null,
             released_reason = null
       where id = r.id;
    else
      v_kept := v_kept + 1;
    end if;
  end loop;
  return v_kept;
end;
$$;

revoke all on function app.coupon_reactivate(pg_catalog.uuid) from public;

comment on function app.coupon_reactivate(pg_catalog.uuid) is
  '20261012120000 (W5-13): re-activates a revived booking''s released coupon redemptions only while the coupon''s global and per-user caps allow it. Returns how many stayed released. Called by checkout_payment_settle only. No grant.';

-- (3)
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
  p_presentment_currency pg_catalog.text default null,
  -- 20261012110000 (W4-07, W5-02): what Stripe says it collected. All four are optional: null skips that check.
  p_amount_total_minor pg_catalog.int8 default null,
  p_amount_currency pg_catalog.text default null,
  p_amount_received_minor pg_catalog.int8 default null,
  p_metadata_booking_id pg_catalog.text default null
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
  other_open_session_ids pg_catalog.text[],
  amount_mismatch pg_catalog.bool
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
  -- 20261012100000
  v_marker pg_catalog.text;
  v_marker_reason pg_catalog.text;
  v_fx_note pg_catalog.jsonb;
  -- 20261012110000
  v_mm_reasons pg_catalog.text[];
  -- 20261012120000
  v_lock_live pg_catalog.bool;
  v_coupons_kept pg_catalog.int4;
begin
  if p_outcome is distinct from 'succeeded'
     and p_outcome is distinct from 'failed'
     and p_outcome is distinct from 'canceled' then
    raise exception 'invalid_outcome'
      using errcode = 'check_violation';
  end if;

  -- 20261012100000 (W5-12): the currency and FX values come from the Worker and meet three CHECK
  -- constraints (currency allowed, CHF exactly when there is no rate, FX columns all or none) and
  -- write-once rules. A value the row cannot hold must never make the settle raise after Stripe has
  -- captured the money. Unusable values are dropped: the capture is recorded without the FX detail
  -- (the charge is CHF; charged_rappen is the CHF figure) and the raw facts go on the payment event.
  if p_charged_currency is not null then
    p_charged_currency := pg_catalog.upper(pg_catalog.btrim(p_charged_currency));
  end if;
  if p_charged_currency is not null
     and not (
       (p_charged_currency = 'CHF'
         and p_fx_rate is null and p_fx_source is null and p_fx_quoted_at is null
         and p_presentment_amount_minor is null)
       or (p_charged_currency in ('EUR', 'USD', 'AED')
         and p_fx_rate > 0 and p_fx_source is not null and p_fx_quoted_at is not null
         and p_presentment_amount_minor > 0)
     ) then
    v_fx_note := pg_catalog.jsonb_build_object(
      'fx_not_recorded', true,
      'charged_currency', p_charged_currency,
      'presentment_currency', p_presentment_currency,
      'presentment_amount_minor', p_presentment_amount_minor
    );
    p_charged_currency := null;
    p_fx_rate := null;
    p_fx_source := null;
    p_fx_quoted_at := null;
    p_presentment_amount_minor := null;
    p_presentment_currency := null;
  end if;
  if p_presentment_currency is not null and p_presentment_currency !~ '^[A-Za-z]{3}$' then
    p_presentment_currency := null;
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
    -- 20261012100000 (W4-03): the first delivery of THIS event settled the payment but left it open
    -- because the Stripe refund was still to be made (duplicate_charge, test_booking, paid_after_cancel,
    -- requote_superseded: the marker `refund_required:<reason>` on the event row). A retry of that
    -- event gets the refund order again, so a refund that failed is made on the next delivery. The
    -- Worker closes the event only after the refund and its record succeeded.
    select e.last_error
      into v_marker
      from public.stripe_events as e
     where e.id = p_event_id
       and e.processed_at is null;

    if v_marker = 'amount_mismatch' then
      -- 20261012110000 (W4-07): the first delivery held this payment for review; the Worker has not yet
      -- mailed ops and closed the event. A retry gets the same answer and nothing else is written.
      select coalesce(pg_catalog.array_agg(bp3.stripe_checkout_session_id), array[]::pg_catalog.text[])
        into v_other_sessions
        from public.booking_payments as bp3
       where bp3.booking_id = v_booking.id
         and bp3.status = 'requires_payment'
         and bp3.id is distinct from v_pay.id
         and bp3.stripe_checkout_session_id is not null;

      return query
        select v_booking.id, v_booking.reference, v_booking.locale,
               v_booking.contact_email::pg_catalog.text,
               true, false, false, false, null::pg_catalog.text,
               v_pay.id, v_pay.charged_rappen::pg_catalog.int4, v_pay.snapshot_id,
               v_other_sessions, true;
      return;
    end if;

    if v_marker like 'refund\_required:%' escape '\' then
      v_marker_reason := pg_catalog.substr(v_marker, 17);

      select coalesce(pg_catalog.array_agg(bp3.stripe_checkout_session_id), array[]::pg_catalog.text[])
        into v_other_sessions
        from public.booking_payments as bp3
       where bp3.booking_id = v_booking.id
         and bp3.status = 'requires_payment'
         and bp3.id is distinct from v_pay.id
         and bp3.stripe_checkout_session_id is not null;

      return query
        select v_booking.id, v_booking.reference, v_booking.locale,
               v_booking.contact_email::pg_catalog.text,
               true, false, false, true, v_marker_reason,
               v_pay.id, v_pay.charged_rappen::pg_catalog.int4, v_pay.snapshot_id,
               v_other_sessions, false;
      return;
    end if;

    -- 20261007310000 (U15): the second delivery of this payment (the Stripe webhook after the return
    -- route, or the other way round) marks its own stripe_events row processed too, as every other
    -- branch does. Nothing else is written: no payment, booking or booking_events row.
    -- 20261012100000 (W5-17): the first processing time is kept.
    update public.stripe_events
       set processed_at = pg_catalog.now()
     where id = p_event_id
       and processed_at is null;

    return query
      select v_booking.id, v_booking.reference, v_booking.locale,
             v_booking.contact_email::pg_catalog.text,
             true, false, false, false, null::pg_catalog.text,
             v_pay.id, v_pay.charged_rappen::pg_catalog.int4, v_pay.snapshot_id,
             array[]::pg_catalog.text[], false;
    return;
  end if;

  -- Non-succeeded outcome: unchanged failure path, extended return shape only.
  if p_outcome is distinct from 'succeeded' then
    -- 20261012100000 (W4-17, W5-04): a late or same-second failed / canceled event for a payment that
    -- already succeeded (or was recorded as a duplicate) changes nothing and raises nothing. The
    -- column whitelist makes a succeeded row terminal, so the update below would raise and the event
    -- would retry into the dead-letter queue for good. The event is closed here.
    if v_pay.status in ('succeeded', 'duplicate') then
      update public.stripe_events
         set processed_at = pg_catalog.now()
       where id = p_event_id
         and processed_at is null;

      return query
        select v_booking.id, v_booking.reference, v_booking.locale,
               v_booking.contact_email::pg_catalog.text,
               true, false, false, false, null::pg_catalog.text,
               v_pay.id, v_pay.charged_rappen::pg_catalog.int4, v_pay.snapshot_id,
               array[]::pg_catalog.text[], false;
      return;
    end if;

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
             array[]::pg_catalog.text[], false;
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
  -- 20261012110000 (W4-08): beyond the snapshot, two main-session payments on one booking are a duplicate
  -- even when they cite different price records (a staff change rebound the booking while an older page
  -- was still open and was then paid). A difference payment (extra) is another payment of the booking,
  -- never the first one: it is named by a change request's extra_payment_id and is not counted.
  select exists (
    select 1
      from public.booking_payments as bp2
     where bp2.status = 'succeeded'
       and bp2.id is distinct from v_pay.id
       and (
         bp2.snapshot_id = v_pay.snapshot_id
         or (
           bp2.booking_id = v_pay.booking_id
           and not exists (
             select 1
               from public.booking_edit_requests as er
              where er.extra_payment_id = bp2.id
           )
         )
       )
  ) into v_dup_exists;

  if v_dup_exists then
    update public.booking_payments
       set status = 'duplicate',
           captured_at = coalesce(captured_at, pg_catalog.now()),
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
       set last_error = 'refund_required:duplicate_charge'
     where id = p_event_id
       and processed_at is null;

    -- already_settled = true so the Worker live today (which only reads that
    -- column) never sends a second confirmation email.
    return query
      select v_booking.id, v_booking.reference, v_booking.locale,
             v_booking.contact_email::pg_catalog.text,
             true, false, true, true, 'duplicate_charge'::pg_catalog.text,
             v_pay.id, v_pay.charged_rappen::pg_catalog.int4, v_pay.snapshot_id,
             v_other_sessions, false;
    return;
  end if;

  -- An erased booking never takes a payment. Same outcome as a missing booking: the
  -- P0002 the Worker turns into an automatic full refund. Nothing is written (the
  -- raise rolls the transaction back), so no payment is recorded as succeeded.
  if v_booking.erased_at is not null then
    raise exception 'payment_not_found'
      using errcode = 'P0002';
  end if;

  -- 20261012110000 (W4-07, W5-02): what Stripe collected must be what this payment row expected: CHF,
  -- the row's charged_rappen (session amount_total and, when the Worker read it, the PaymentIntent's
  -- amount_received), and the booking named in the session metadata (the booking id or its quote id).
  -- A legitimate adaptive-pricing presentment in EUR/USD/AED is not a mismatch: Stripe keeps the session
  -- and the PaymentIntent in the integration currency (CHF); the presentment amount only rides in
  -- presentment_details, which the Worker maps to the FX columns above, not to these parameters.
  -- On a mismatch the capture is recorded (the money is real) but nothing else happens: the booking is
  -- not confirmed, not revived, not refunded; the event stays open with last_error = 'amount_mismatch'
  -- until the Worker has mailed ops; the other open pages are returned so the Worker can expire them.
  v_mm_reasons := array[]::pg_catalog.text[];
  if p_amount_currency is not null
     and pg_catalog.upper(pg_catalog.btrim(p_amount_currency)) is distinct from 'CHF' then
    v_mm_reasons := v_mm_reasons || array['currency']::pg_catalog.text[];
  end if;
  if p_amount_total_minor is not null
     and p_amount_total_minor is distinct from v_pay.charged_rappen::pg_catalog.int8 then
    v_mm_reasons := v_mm_reasons || array['amount_total']::pg_catalog.text[];
  end if;
  if p_amount_received_minor is not null
     and p_amount_received_minor is distinct from v_pay.charged_rappen::pg_catalog.int8 then
    v_mm_reasons := v_mm_reasons || array['amount_received']::pg_catalog.text[];
  end if;
  if p_metadata_booking_id is not null
     and pg_catalog.lower(pg_catalog.btrim(p_metadata_booking_id)) not in (
           v_booking.id::pg_catalog.text,
           coalesce(v_booking.quote_id::pg_catalog.text, '')
         ) then
    v_mm_reasons := v_mm_reasons || array['booking_id']::pg_catalog.text[];
  end if;

  if pg_catalog.cardinality(v_mm_reasons) > 0 then
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
      booking_id, kind, actor_kind, actor_label, payment_id, payload
    ) values (
      v_booking.id, 'payment.succeeded', 'stripe', 'Stripe webhook', v_pay.id,
      coalesce(v_fx_note, '{}'::pg_catalog.jsonb)
        || pg_catalog.jsonb_build_object(
             'amount_mismatch', true,
             'reasons', pg_catalog.to_jsonb(v_mm_reasons),
             'expected_rappen', v_pay.charged_rappen,
             'amount_total_minor', p_amount_total_minor,
             'amount_received_minor', p_amount_received_minor,
             'currency', p_amount_currency
           )
    );

    update public.stripe_events
       set last_error = 'amount_mismatch'
     where id = p_event_id
       and processed_at is null;

    return query
      select v_booking.id, v_booking.reference, v_booking.locale,
             v_booking.contact_email::pg_catalog.text,
             true, false, false, false, null::pg_catalog.text,
             v_pay.id, v_pay.charged_rappen::pg_catalog.int4, v_pay.snapshot_id,
             v_other_sessions, true;
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
      booking_id, kind, actor_kind, actor_label, payment_id, payload
    ) values (
      v_booking.id, 'payment.succeeded', 'stripe', 'Stripe webhook', v_pay.id, coalesce(v_fx_note, '{}'::pg_catalog.jsonb)
    );

    update public.stripe_events
       set last_error = 'refund_required:test_booking'
     where id = p_event_id
       and processed_at is null;

    return query
      select v_booking.id, v_booking.reference, v_booking.locale,
             v_booking.contact_email::pg_catalog.text,
             false, false, false, true, 'test_booking'::pg_catalog.text,
             v_pay.id, v_pay.charged_rappen::pg_catalog.int4, v_pay.snapshot_id,
             v_other_sessions, false;
    return;
  end if;

  -- Cancelled (or pending whose quote lock has already expired): decide
  -- revive (D-03/D-03a) vs refund-only (D-03b requote, or pickup already
  -- passed).
  -- 20261012120000 (W5-01): a pending booking is "late" only when its price lock AND its pay-link hold
  -- (bookings.hold_until, the 24 h of a sent pay link) are both past. A pay-link payment inside its hold
  -- takes the normal pending -> paid -> confirmed path below, with its status events and its legs. Before,
  -- the quote lock alone (30 minutes) decided: every pay-link payment after the first half hour jumped
  -- pending -> confirmed with no paid step, a booking.revived event for a booking nobody cancelled, and
  -- legs left pending.
  if v_booking.status = 'pending'::public.booking_status then
    select greatest(ps.quote_lock_expires_at, coalesce(v_booking.hold_until, ps.quote_lock_expires_at))
             > pg_catalog.now()
      into v_lock_live
      from public.price_snapshots as ps
     where ps.id = v_booking.price_snapshot_id;
    v_lock_live := coalesce(v_lock_live, true);
  else
    v_lock_live := true;
  end if;

  if v_booking.status = 'cancelled'::public.booking_status
     or (v_booking.status = 'pending'::public.booking_status and not v_lock_live) then

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
        booking_id, kind, actor_kind, actor_label, payment_id, payload
      ) values (
        v_booking.id, 'payment.succeeded', 'stripe', 'Stripe webhook', v_pay.id, coalesce(v_fx_note, '{}'::pg_catalog.jsonb)
      );

      update public.stripe_events
         set last_error = 'refund_required:requote_superseded'
       where id = p_event_id
         and processed_at is null;

      return query
        select v_booking.id, v_booking.reference, v_booking.locale,
               v_booking.contact_email::pg_catalog.text,
               false, false, false, true, 'requote_superseded'::pg_catalog.text,
               v_pay.id, v_pay.charged_rappen::pg_catalog.int4, v_pay.snapshot_id,
               v_other_sessions, false;
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

      -- 20261012120000 (W5-01): every leg that was not running becomes confirmed with the booking (a
      -- cancelled booking's legs are cancelled, a truly expired pending booking's legs are pending).
      update public.booking_legs
         set status = 'confirmed'::public.booking_status,
             updated_at = pg_catalog.now()
       where booking_id = v_booking.id
         and status in ('cancelled'::public.booking_status,
                        'pending'::public.booking_status,
                        'paid'::public.booking_status);

      -- 20261012120000 (W5-13): the coupon use comes back only while the coupon's caps allow it.
      v_coupons_kept := app.coupon_reactivate(v_booking.id);

      insert into public.booking_events (
        booking_id, kind, actor_kind, actor_label, from_status, to_status, payment_id, payload
      ) values (
        v_booking.id, 'booking.revived', 'stripe', 'Stripe webhook',
        v_from_status, 'confirmed'::public.booking_status, v_pay.id,
        pg_catalog.jsonb_build_object('revived', true)
          || case
               when v_coupons_kept > 0
               then pg_catalog.jsonb_build_object('coupon_kept_released', v_coupons_kept)
               else '{}'::pg_catalog.jsonb
             end
      );

      -- 20261012120000 (W5-01): the same status event every confirmation carries, so the timeline and
      -- every reader of booking.status_changed see this booking confirmed.
      insert into public.booking_events (
        booking_id, kind, actor_kind, actor_label, from_status, to_status, payment_id, payload
      ) values (
        v_booking.id, 'booking.status_changed', 'stripe', 'Stripe webhook',
        v_from_status, 'confirmed'::public.booking_status, v_pay.id,
        pg_catalog.jsonb_build_object('via', 'revive')
      );

      insert into public.booking_events (
        booking_id, kind, actor_kind, actor_label, payment_id, payload
      ) values (
        v_booking.id, 'payment.succeeded', 'stripe', 'Stripe webhook', v_pay.id, coalesce(v_fx_note, '{}'::pg_catalog.jsonb)
      );

      update public.stripe_events
         set processed_at = pg_catalog.now()
       where id = p_event_id;

      return query
        select v_booking.id, v_booking.reference, v_booking.locale,
               v_booking.contact_email::pg_catalog.text,
               false, true, false, false, null::pg_catalog.text,
               v_pay.id, v_pay.charged_rappen::pg_catalog.int4, v_pay.snapshot_id,
               v_other_sessions, false;
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
        booking_id, kind, actor_kind, actor_label, payment_id, payload
      ) values (
        v_booking.id, 'payment.succeeded', 'stripe', 'Stripe webhook', v_pay.id, coalesce(v_fx_note, '{}'::pg_catalog.jsonb)
      );

      update public.stripe_events
         set last_error = 'refund_required:paid_after_cancel'
       where id = p_event_id
         and processed_at is null;

      return query
        select v_booking.id, v_booking.reference, v_booking.locale,
               v_booking.contact_email::pg_catalog.text,
               false, false, false, true, 'paid_after_cancel'::pg_catalog.text,
               v_pay.id, v_pay.charged_rappen::pg_catalog.int4, v_pay.snapshot_id,
               v_other_sessions, false;
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
    booking_id, kind, actor_kind, actor_label, payment_id, payload
  ) values (
    v_booking.id, 'payment.succeeded', 'stripe', 'Stripe webhook', v_pay.id, coalesce(v_fx_note, '{}'::pg_catalog.jsonb)
  );

  update public.stripe_events
     set processed_at = pg_catalog.now()
   where id = p_event_id;

  return query
    select v_booking.id, v_booking.reference, v_booking.locale,
           v_booking.contact_email::pg_catalog.text,
           false, false, false, false, null::pg_catalog.text,
           v_pay.id, v_pay.charged_rappen::pg_catalog.int4, v_pay.snapshot_id,
           v_other_sessions, false;
  return;
end;
$$;

revoke all on function public.checkout_payment_settle(
  pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text,
  pg_catalog.numeric, pg_catalog.text, pg_catalog.timestamptz, pg_catalog.int8, pg_catalog.text,
  pg_catalog.int8, pg_catalog.text, pg_catalog.int8, pg_catalog.text
) from public;

grant execute on function public.checkout_payment_settle(
  pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text,
  pg_catalog.numeric, pg_catalog.text, pg_catalog.timestamptz, pg_catalog.int8, pg_catalog.text,
  pg_catalog.int8, pg_catalog.text, pg_catalog.int8, pg_catalog.text
) to vamos_system;

comment on function public.checkout_payment_settle(
  pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text,
  pg_catalog.numeric, pg_catalog.text, pg_catalog.timestamptz, pg_catalog.int8, pg_catalog.text,
  pg_catalog.int8, pg_catalog.text, pg_catalog.int8, pg_catalog.text
) is
  '26.1 settle (pending -> paid -> confirmed, revive, duplicate, refund-required), J2 20261012100000 (event kept open until the refund is made, late failure guard, FX fallback), J3 20261012110000 (amount, currency and booking check held for review, duplicate across the booking), J4 20261012120000 (W5-01 a pay-link payment inside its hold takes the normal path; the revive branch confirms the legs and logs booking.status_changed; W5-13 coupon caps on re-activation). Optional trailing p_amount_* / p_metadata_booking_id: null skips that check. EXECUTE vamos_system only.';

-- (4)
create or replace function public.checkout_payments_mark_dead(
  p_booking_id pg_catalog.uuid,
  p_session_ids pg_catalog.text[]
)
returns pg_catalog.int4
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count pg_catalog.int4;
begin
  if p_session_ids is null or pg_catalog.cardinality(p_session_ids) = 0 then
    return 0;
  end if;

  -- Lock the rows first (payment before anything else, in id order), then re-test the status: a payment
  -- that a concurrent settle has just moved to succeeded is skipped, never overwritten.
  perform 1
    from public.booking_payments as p
   where p.booking_id = p_booking_id
     and p.status = 'requires_payment'
     and p.stripe_checkout_session_id = any (p_session_ids)
   order by p.id
     for update;

  update public.booking_payments
     set status = 'canceled'
   where booking_id = p_booking_id
     and status = 'requires_payment'
     and stripe_checkout_session_id = any (p_session_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.checkout_payments_mark_dead(pg_catalog.uuid, pg_catalog.text[]) from public;
grant execute on function public.checkout_payments_mark_dead(pg_catalog.uuid, pg_catalog.text[])
  to vamos_system, vamos_checkout;

comment on function public.checkout_payments_mark_dead(pg_catalog.uuid, pg_catalog.text[]) is
  '20261012120000 (W5-11): marks the requires_payment payment rows of one booking, whose Stripe Checkout Session ids the caller has read back as expired and unpaid, as canceled. Only requires_payment rows and only the named ids; a row that already moved is skipped. The caller then purges: purge_unpaid_booking refuses while a requires_payment row names a session. EXECUTE vamos_system and vamos_checkout, as purge_unpaid_booking.';

-- (5)
create or replace function public.purge_unpaid_booking(p_booking_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.bookings%rowtype;
begin
  if p_reason is null or p_reason not in ('unpaid_expired', 'superseded') then
    raise exception 'purge_unpaid_booking: reason must be unpaid_expired or superseded'
      using errcode = '22023';
  end if;

  -- Payment rows first, then the booking, the same order settle uses. A settle that already holds the
  -- payment waits nowhere; this function waits on the payment and never holds the booking while it does.
  perform 1 from public.bookings as b0 where b0.id = p_booking_id;
  if not found then
    return false;
  end if;

  perform 1
     from public.booking_payments as bp
    where bp.booking_id = p_booking_id
    order by bp.id
      for update;

  select * into v from public.bookings b where b.id = p_booking_id for update;
  if not found or not app.purge_eligible(p_booking_id) then
    return false;
  end if;

  -- 20261012120000 (W5-11): the booking may only go when no Stripe Checkout Session of it can still be
  -- paid. A payment row that is still requires_payment names a session nobody has proved dead: refuse.
  -- The caller (the Worker) first retrieves every session of the booking, finds it expired and unpaid, and
  -- marks exactly those rows with checkout_payments_mark_dead; only then is a purge allowed. Without this a
  -- public checkout call (reason superseded) could delete a booking, and its payment rows, while the
  -- customer was paying in another tab, and the captured payment then had no booking to settle against.
  if exists (
    select 1
      from public.booking_payments as bp0
     where bp0.booking_id = p_booking_id
       and bp0.status = 'requires_payment'
       and bp0.stripe_checkout_session_id is not null
  ) then
    return false;
  end if;

  -- 20261012120000 (W5-11): reason unpaid_expired means the price lock has expired; a booking whose lock
  -- is still live is not "unpaid expired". (superseded replaces a booking the customer just changed.)
  if p_reason = 'unpaid_expired' and exists (
    select 1
      from public.price_snapshots as ps
     where ps.id = v.price_snapshot_id
       and greatest(ps.quote_lock_expires_at, coalesce(v.hold_until, ps.quote_lock_expires_at)) > pg_catalog.now()
  ) then
    return false;
  end if;

  perform set_config('vamos.purge_unpaid', 'on', true);

  update public.bookings set price_snapshot_id = null where id = p_booking_id;
  update public.consent_log set booking_id = null where booking_id = p_booking_id;
  update public.account_agreement_records set booking_id = null where booking_id = p_booking_id;

  delete from public.coupon_redemptions where booking_id = p_booking_id;
  delete from public.booking_events where booking_id = p_booking_id;
  delete from public.booking_payments where booking_id = p_booking_id;
  delete from public.price_snapshot_legs
   where snapshot_id in (select s.id from public.price_snapshots s where s.booking_id = p_booking_id);
  delete from public.price_snapshots where booking_id = p_booking_id;
  delete from public.booking_access_tokens where booking_id = p_booking_id;
  delete from public.booking_legs where booking_id = p_booking_id;
  delete from public.bookings where id = p_booking_id;

  insert into public.audit_log (table_name, record_id, action, actor_kind, actor_id, before_value)
  values ('bookings', p_booking_id::text, 'delete', 'system', null,
          jsonb_build_object(
            'reference', v.reference,
            'created_at', v.created_at,
            'deleted_at', now(),
            'reason', p_reason));

  perform set_config('vamos.purge_unpaid', 'off', true);
  return true;
end
$$;

revoke all on function public.purge_unpaid_booking(uuid, text) from public;
grant execute on function public.purge_unpaid_booking(uuid, text) to vamos_system, vamos_checkout;

comment on function public.purge_unpaid_booking(uuid, text) is
  'D-25/D-45: hard-deletes one eligible unpaid booking (pending, no pay link, no paid/captured payment, no refund/dispute/notification/edit request/review) and writes one non-PII audit_log line. Its consent_log rows and account_agreement_records rows are detached (booking_id -> NULL), never deleted (20261007300000). 20261012120000 (W5-11): answers false while a payment row still names an unverified Stripe session (requires_payment; the caller marks verified-dead sessions first with checkout_payments_mark_dead) and, for reason unpaid_expired, while the price lock or pay-link hold is live. Returns false when not eligible. EXECUTE: vamos_system, vamos_checkout.';

commit;

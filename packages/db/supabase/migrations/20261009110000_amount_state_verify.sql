-- 20261009110000_amount_state_verify.sql
--
-- Stripe payments review 2026-10-09, job J3 "amount and state verification" (W4-07, W4-08, W5-02, W5-03,
-- W5-09, W5-10; .planning/audits/2026-10-09-stripe-W4.md and -W5.md). Builds on J2 (20261009100000).
--
-- (1) tg_payment_update_whitelist (W5-03): body of 20260930190000 plus status transition rules. Only forward
--     moves: requires_payment -> succeeded / failed / canceled / duplicate; failed or canceled -> succeeded /
--     failed / canceled / duplicate (a late payment; Stripe sends checkout.session.expired and
--     payment_intent.canceled for one page in either order); duplicate and succeeded are terminal. A row
--     reaching succeeded or duplicate must carry captured_at; failed or canceled must not. No CHECK on
--     captured_at is added: existing live rows were not read, so a constraint could refuse the migration.
-- (2) tg_payment_matches_snapshot (W5-10): body of 20260928140000. The two clock checks (payment window,
--     quote lock) are skipped for one succeeded insert that carries captured_at, when
--     checkout_extra_payment_settle has set the transaction-local flag vamos.settle_capture. Amount, booking
--     and snapshot-binding checks still run. A difference paid after its price record expired is recorded.
-- (3) checkout_payment_settle (W4-07, W5-02, W4-08): body of 20261009100000 plus the lines marked
--     20261009110000. New trailing optional parameters p_amount_total_minor, p_amount_currency,
--     p_amount_received_minor, p_metadata_booking_id (a call without them behaves as before) and a new last
--     return column amount_mismatch. A mismatch (currency not CHF, amount_total or amount_received not the
--     row's charged_rappen, the session metadata naming another booking) records the capture, writes a
--     payment.succeeded event with payload amount_mismatch, leaves the booking untouched (no confirm, no
--     revive, no refund) and keeps the Stripe event open with last_error = 'amount_mismatch' until the Worker
--     has mailed ops. Duplicate detection also looks across the booking: a second main-session payment on
--     the same booking is a duplicate even with another snapshot (difference payments are not counted).
--     The old 10-argument function is dropped: with defaults on the new one both would match a call.
-- (4) checkout_extra_payment_settle (W4-07, W5-02, W5-10): body of 20261009100000 plus marked lines. Same
--     trailing parameters (old 9-argument function dropped). A mismatch records the capture and takes the
--     existing not-applied path (nothing applied, Refund due, the info@ mail) with the reason on the event.
--     The payment insert sets vamos.settle_capture for the gate (2).
-- (5) compute_cancellation_refund (W5-09): body of 20260928150000; duplicate payments are excluded from the
--     basis. app.booking_paid_net: captured minus refunds, both without duplicate payments. ops_cancel_booking
--     and app.apply_customer_cancel take their owed amount from compute_cancellation_refund and keep their
--     "is anything captured" flag; they are unchanged.
-- (6) checkout_expire_unpaid: body of 20260930110000 (pay-link bookings only) plus: a pending booking that holds a captured payment
--     (a held mismatch) is not cancelled by the clock (test bookings unchanged).
--
-- Lock order unchanged (payment row, booking row, event row). No data is changed. One transaction.
-- Apply order: after 20261009100000, before the Worker of this branch. An older Worker (J2) calls the settle
-- functions with their old argument lists: they resolve to the new functions through the defaults and skip
-- the amount checks until the new Worker is live.
begin;

-- (1)
create or replace function public.tg_payment_update_whitelist()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_new jsonb;
  v_old jsonb;
begin
  if old.status = 'succeeded' then
    if to_jsonb(new) - 'stripe_fee_rappen' - 'payment_method_type'
       is distinct from to_jsonb(old) - 'stripe_fee_rappen' - 'payment_method_type' then
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
    if old.payment_method_type is not null
       and new.payment_method_type is distinct from old.payment_method_type then
      raise exception 'booking_payments: payment_method_type is write-once'
        using errcode = 'restrict_violation',
              hint = 'A corrected settlement is a new row plus a compensating booking_event.';
    end if;
    return new;
  end if;

  -- 20261009110000 (W5-03): status only moves forward. Out of requires_payment a payment may succeed,
  -- fail, be canceled or be recorded as a duplicate; a failed or canceled row may still succeed (a late
  -- payment) or be recorded as a duplicate, or swap between failed and canceled (Stripe sends
  -- checkout.session.expired and payment_intent.canceled for one page, in either order); a duplicate is
  -- terminal, as a succeeded row already is (above). Nothing returns to requires_payment. A row that
  -- reaches succeeded or duplicate carries captured_at; a row that is not captured carries none.
  if new.status is distinct from old.status then
    if old.status = 'duplicate' then
      raise exception 'booking_payments: a duplicate row is terminal'
        using errcode = 'restrict_violation',
              hint = 'A corrected settlement is a new row plus a compensating booking_event.';
    end if;
    if not (
         (old.status = 'requires_payment' and new.status in ('succeeded', 'failed', 'canceled', 'duplicate'))
      or (old.status in ('failed', 'canceled') and new.status in ('succeeded', 'failed', 'canceled', 'duplicate'))
    ) then
      raise exception 'booking_payments: status may not move from % to %', old.status, new.status
        using errcode = 'restrict_violation',
              hint = 'Only forward transitions are allowed.';
    end if;
    if new.status in ('succeeded', 'duplicate') and new.captured_at is null then
      raise exception 'booking_payments: a % row needs captured_at', new.status
        using errcode = 'restrict_violation';
    end if;
    if new.status in ('failed', 'canceled') and new.captured_at is not null then
      raise exception 'booking_payments: a % row has no captured_at', new.status
        using errcode = 'restrict_violation';
    end if;
  end if;

  v_new := to_jsonb(new) - 'status' - 'captured_at' - 'charged_currency'
               - 'fx_rate' - 'fx_source' - 'fx_quoted_at' - 'presentment_amount_minor' - 'presentment_currency'
               - 'stripe_fee_rappen' - 'payment_method_type';
  v_old := to_jsonb(old) - 'status' - 'captured_at' - 'charged_currency'
               - 'fx_rate' - 'fx_source' - 'fx_quoted_at' - 'presentment_amount_minor' - 'presentment_currency'
               - 'stripe_fee_rappen' - 'payment_method_type';

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
  if old.payment_method_type is not null
     and new.payment_method_type is distinct from old.payment_method_type then
    raise exception 'booking_payments: payment_method_type is write-once'
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

-- (2)
create or replace function public.tg_payment_matches_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.price_snapshots%rowtype;
  v_status public.rate_version_status;
  v_hold timestamptz;
  -- 20261009110000 (W5-10)
  v_capture pg_catalog.bool;
begin
  select * into s from public.price_snapshots where id = new.snapshot_id;

  if not found then
    raise exception 'snapshot % does not exist', new.snapshot_id
      using errcode = 'restrict_violation';
  end if;

  if not s.is_chargeable then
    raise exception 'snapshot % is not chargeable (total=%, rate_version_is_live=%)',
      s.id, s.total_rappen, s.rate_version_is_live
      using errcode = 'restrict_violation',
            hint = 'QUOTE-10: no rate_version is live, or this class has no priced matrix row.';
  end if;
  -- Re-read the version at charge time, not only the flag copied at quote time. A quote priced
  -- under a version that has since been RETIRED is still honoured (the customer was shown that
  -- price minutes ago and the version's rows are frozen); a version that never left DRAFT can
  -- never be charged against, whatever any copied flag says.
  select status into v_status from public.rate_versions where id = s.rate_version_id;
  if v_status = 'draft' then
    raise exception 'snapshot % cites rate_version % which is still draft', s.id, s.rate_version_id
      using errcode = 'restrict_violation';
  end if;
  -- 26.1-15 (D-20): a sent pay link holds the booking and its price until hold_until.
  -- Null (no pay link) leaves both clocks exactly as before.
  select b.hold_until into v_hold from public.bookings b where b.id = new.booking_id;
  -- 20261009110000 (W5-10): the two clocks guard the moment a customer COMMITS to pay. They must never
  -- refuse to RECORD money Stripe has already taken. checkout_extra_payment_settle (a difference page
  -- paid after its price record expired) sets the transaction-local flag vamos.settle_capture before its
  -- one succeeded insert; only then, and only for a succeeded row that carries captured_at, the clocks are
  -- skipped. The amount, booking and snapshot-binding checks below still run.
  v_capture := new.status = 'succeeded'
               and new.captured_at is not null
               and coalesce(pg_catalog.current_setting('vamos.settle_capture', true), '') = 'on';
  if not v_capture then
    -- QUOTE-04: an expired quote is refused when the customer commits to pay, by the server, not
    -- merely hidden in the UI. Payment window (expires_at) first.
    if greatest(s.expires_at, coalesce(v_hold, s.expires_at)) <= now() then
      raise exception 'quote % expired at %', s.id, s.expires_at using errcode = 'restrict_violation';
    end if;
    -- D-25: second clock. A handler that forgets the if still dies; a direct
    -- INSERT INTO booking_payments against a snapshot minted from an expired token still dies --
    -- even when the payment window (expires_at) is still open.
    if greatest(s.quote_lock_expires_at, coalesce(v_hold, s.quote_lock_expires_at)) <= now() then
      raise exception
        'quote lock on snapshot % expired at % (payment window open until %)',
        s.id, s.quote_lock_expires_at, s.expires_at
        using errcode = 'restrict_violation';
    end if;
  end if;
  if new.charged_rappen is distinct from s.total_rappen then
    raise exception 'charge % does not match snapshot % total %',
      new.charged_rappen, s.id, s.total_rappen using errcode = 'restrict_violation';
  end if;
  if s.booking_id is null or new.booking_id is distinct from s.booking_id then
    raise exception 'snapshot % belongs to booking %, not %', s.id, s.booking_id, new.booking_id
      using errcode = 'restrict_violation';
  end if;
  -- F-06 / T-02-46: a payment must cite exactly the snapshot bookings.price_snapshot_id names,
  -- not merely a sibling row that shares its booking_id (see 20260825000004 for the full note).
  if new.snapshot_id is distinct from (select b.price_snapshot_id from public.bookings b where b.id = new.booking_id) then
    raise exception 'payment cites snapshot %, but booking % is bound to %',
      new.snapshot_id, new.booking_id, (select b.price_snapshot_id from public.bookings b where b.id = new.booking_id)
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.tg_payment_matches_snapshot() from public;

-- (3)
drop function public.checkout_payment_settle(
  pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text,
  pg_catalog.numeric, pg_catalog.text, pg_catalog.timestamptz, pg_catalog.int8, pg_catalog.text
);

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
  -- 20261009110000 (W4-07, W5-02): what Stripe says it collected. All four are optional: null skips that check.
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
  -- 20261009100000
  v_marker pg_catalog.text;
  v_marker_reason pg_catalog.text;
  v_fx_note pg_catalog.jsonb;
  -- 20261009110000
  v_mm_reasons pg_catalog.text[];
begin
  if p_outcome is distinct from 'succeeded'
     and p_outcome is distinct from 'failed'
     and p_outcome is distinct from 'canceled' then
    raise exception 'invalid_outcome'
      using errcode = 'check_violation';
  end if;

  -- 20261009100000 (W5-12): the currency and FX values come from the Worker and meet three CHECK
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
    -- 20261009100000 (W4-03): the first delivery of THIS event settled the payment but left it open
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
      -- 20261009110000 (W4-07): the first delivery held this payment for review; the Worker has not yet
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
    -- 20261009100000 (W5-17): the first processing time is kept.
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
    -- 20261009100000 (W4-17, W5-04): a late or same-second failed / canceled event for a payment that
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
  -- 20261009110000 (W4-08): beyond the snapshot, two main-session payments on one booking are a duplicate
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

  -- 20261009110000 (W4-07, W5-02): what Stripe collected must be what this payment row expected: CHF,
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
  '26.1 settle (pending -> paid -> confirmed, revive, duplicate, refund-required), J2 20261009100000 (event kept open until the refund is made, late failure guard, FX fallback), J3 20261009110000 (W4-07/W5-02 amount, currency and booking check held for review, W4-08 duplicate across the booking). Optional trailing p_amount_* / p_metadata_booking_id: null skips that check. EXECUTE vamos_system only.';

-- (4)
drop function public.checkout_extra_payment_settle(
  pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text,
  pg_catalog.numeric, pg_catalog.text, pg_catalog.timestamptz, pg_catalog.int8
);

create or replace function public.checkout_extra_payment_settle(
  p_event_id pg_catalog.text,
  p_session_id pg_catalog.text,
  p_payment_intent_id pg_catalog.text,
  p_outcome pg_catalog.text,
  p_charged_currency pg_catalog.text,
  p_fx_rate pg_catalog.numeric,
  p_fx_source pg_catalog.text,
  p_fx_quoted_at pg_catalog.timestamptz,
  p_presentment_amount_minor pg_catalog.int8,
  -- 20261009110000 (W4-07, W5-02): what Stripe says it collected; null skips that check.
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
  -- 20261009110000
  v_mm_reasons pg_catalog.text[];
  v_mismatch pg_catalog.bool := false;
begin
  if p_outcome is distinct from 'succeeded'
     and p_outcome is distinct from 'failed'
     and p_outcome is distinct from 'canceled' then
    raise exception 'invalid_outcome' using errcode = 'check_violation';
  end if;

  -- 20261009100000 (W5-12): see checkout_payment_settle. A currency or FX tuple the row cannot hold
  -- is dropped; the capture is recorded without the FX detail (the difference is CHF, charged_rappen is
  -- the CHF figure from the extra snapshot).
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
    p_charged_currency := null;
    p_fx_rate := null;
    p_fx_source := null;
    p_fx_quoted_at := null;
    p_presentment_amount_minor := null;
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
       where id = p_event_id
         and processed_at is null;
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
    -- 20261009100000 (W4-17, W5-04): a late failed / canceled event for a difference that was paid
    -- writes no payment.failed event and ends no request. The event is closed.
    if v_pay.status in ('succeeded', 'duplicate') and p_outcome is distinct from 'succeeded' then
      update public.stripe_events
         set processed_at = pg_catalog.now()
       where id = p_event_id
         and processed_at is null;
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

  -- 20261009110000 (W4-07, W5-02): the difference Stripe collected must be the difference this request
  -- asked for: CHF, the extra price record's total, the booking named in the session metadata. A mismatch
  -- records the capture (the money is real) but applies nothing: it takes the not-applied path below
  -- (Refund due for ops to decide, the info@ mail) with the reason on the event.
  v_mm_reasons := array[]::pg_catalog.text[];
  if p_amount_currency is not null
     and pg_catalog.upper(pg_catalog.btrim(p_amount_currency)) is distinct from 'CHF' then
    v_mm_reasons := v_mm_reasons || array['currency']::pg_catalog.text[];
  end if;
  if p_amount_total_minor is not null
     and p_amount_total_minor is distinct from v_extra.total_rappen::pg_catalog.int8 then
    v_mm_reasons := v_mm_reasons || array['amount_total']::pg_catalog.text[];
  end if;
  if p_amount_received_minor is not null
     and p_amount_received_minor is distinct from v_extra.total_rappen::pg_catalog.int8 then
    v_mm_reasons := v_mm_reasons || array['amount_received']::pg_catalog.text[];
  end if;
  if p_metadata_booking_id is not null
     and pg_catalog.lower(pg_catalog.btrim(p_metadata_booking_id)) not in (
           v_booking.id::pg_catalog.text,
           coalesce(v_booking.quote_id::pg_catalog.text, '')
         ) then
    v_mm_reasons := v_mm_reasons || array['booking_id']::pg_catalog.text[];
  end if;
  v_mismatch := pg_catalog.cardinality(v_mm_reasons) > 0;
  if v_mismatch then
    v_err_state := 'amount_mismatch';
    v_err_text := pg_catalog.array_to_string(v_mm_reasons, ',');
  end if;

  -- Charge gate requires bookings.price_snapshot_id = extra snapshot. Restored below: by
  -- apply_payload (the new full price record) or to the original when nothing is applied.
  update public.bookings
     set price_snapshot_id = v_extra.id
   where id = v_booking.id;

  if v_pay.id is null then
    -- 20261009110000 (W5-10): Stripe has already taken this money. The charge gate's two clocks (payment
    -- window, quote lock) must never refuse to RECORD a captured payment: this transaction-local flag
    -- makes tg_payment_matches_snapshot skip those two checks for this one succeeded insert. Amount,
    -- booking and snapshot-binding checks still run.
    perform pg_catalog.set_config('vamos.settle_capture', 'on', true);
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
    perform pg_catalog.set_config('vamos.settle_capture', 'off', true);
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
     and not v_mismatch
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
          'via', case when v_mismatch then 'amount_mismatch' else 'difference_not_applied' end,
          'request_id', v_req.id,
          'sqlstate', v_err_state,
          'reason', v_err_text,
          'amount_total_minor', p_amount_total_minor,
          'amount_received_minor', p_amount_received_minor,
          'currency', p_amount_currency,
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
  pg_catalog.numeric, pg_catalog.text, pg_catalog.timestamptz, pg_catalog.int8,
  pg_catalog.int8, pg_catalog.text, pg_catalog.int8, pg_catalog.text
) from public;

grant execute on function public.checkout_extra_payment_settle(
  pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text,
  pg_catalog.numeric, pg_catalog.text, pg_catalog.timestamptz, pg_catalog.int8,
  pg_catalog.int8, pg_catalog.text, pg_catalog.int8, pg_catalog.text
) to vamos_system;

comment on function public.checkout_extra_payment_settle(
  pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text,
  pg_catalog.numeric, pg_catalog.text, pg_catalog.timestamptz, pg_catalog.int8,
  pg_catalog.int8, pg_catalog.text, pg_catalog.int8, pg_catalog.text
) is
  '08-07 D-67/D-69 + 26.2 P1: insert the extra payment against the difference snapshot. A request that still waits is applied (applied, class_changed, unassigned_chauffeur_id returned; D6), so is one withdrawn in the same second when nothing newer was asked and the trip still runs; a request that has ended otherwise is not applied and the overpayment shows as Refund due. Not paid (failed / canceled / expired): the request ends (D4), the booking is untouched. Never rewinds confirmed to pending. 261002 settle safety: one lock order (the booking, then its request) like every other writer, so a deadlock with a customer request cannot happen; a Stripe page shared by two requests settles the one that waits; a booking that is cancelled, partly cancelled or refunded never gets the change applied: the payment is recorded, a change that waited ends (superseded), and Refund due is the full refund the cancel owed plus the difference, otherwise pending_ops for the owner to decide (event refund.requested via difference_after_cancel); the apply runs in its own block: a deadlock, serialization, lock, connection, resource, shutdown or timeout error is raised again so the Worker retries, any other error rolls back the apply only, the payment is recorded, the request ends (superseded) and the paid difference shows as Refund due (event refund.requested via difference_not_applied with sqlstate and reason). EXECUTE vamos_system only. J2 20261009100000: a late failed event writes nothing; an FX tuple the row cannot hold is dropped. J3 20261009110000: optional trailing p_amount_* / p_metadata_booking_id; an amount, currency or booking mismatch records the capture but applies nothing (event refund.requested via amount_mismatch); the payment insert is never refused by the charge gate''s clocks (W5-10).';

-- (5)
create or replace function public.compute_cancellation_refund(p_booking_id pg_catalog.uuid)
returns table (
  refund_mode pg_catalog.text,
  refund_rappen public.rappen,
  basis_rappen public.rappen,
  hours_before pg_catalog.numeric,
  refund_percent pg_catalog.numeric
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_original pg_catalog.timestamptz;
  v_hours pg_catalog.numeric(8,2);
  v_basis public.rappen;
  v_mode pg_catalog.text;
begin
  select pg_catalog.min(l.original_scheduled_at)
    into v_original
    from public.booking_legs as l
   where l.booking_id = p_booking_id;

  if v_original is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  -- hours from original_scheduled_at AT TIME ZONE Europe/Zurich (D-02 / D-26)
  v_hours := pg_catalog.round(
    (
      pg_catalog.date_part(
        'epoch',
        (v_original at time zone 'Europe/Zurich')
        - (pg_catalog.now() at time zone 'Europe/Zurich')
      ) / 3600
    )::pg_catalog.numeric,
    2
  );

  select coalesce(pg_catalog.sum(p.charged_rappen), 0)::pg_catalog.int4
    into v_basis
    from public.booking_payments as p
   where p.booking_id = p_booking_id
     and p.captured_at is not null
     -- 20261009110000 (W5-09): a duplicate charge is refunded to its payer by checkout_duplicate_refund_record
     -- and is never part of what the booking owes on a cancel (it would owe more than it can send back).
     and p.status is distinct from 'duplicate';

  if v_basis is null then
    v_basis := 0;
  end if;

  v_mode := case
    when v_hours > 24 then 'auto_full'   -- D-23
    when v_basis > 0 then 'pending_ops'  -- D-24: inside 24 h, inside 6 h, after pickup
    else 'none'                          -- nothing captured, nothing to review
  end;

  refund_mode := v_mode;
  basis_rappen := v_basis;
  hours_before := v_hours;
  if v_mode = 'auto_full' then
    refund_rappen := v_basis;
    refund_percent := 100;
  elsif v_mode = 'pending_ops' then
    -- D-24: the admin sets the percentage; nothing is owed until then.
    refund_rappen := null;
    refund_percent := null;
  else
    refund_rappen := 0;
    refund_percent := 0;
  end if;
  return next;
end;
$$;
revoke all on function public.compute_cancellation_refund(pg_catalog.uuid) from public;
grant execute on function public.compute_cancellation_refund(pg_catalog.uuid) to vamos_system, postgres;

comment on function public.compute_cancellation_refund(pg_catalog.uuid) is
  '26.1-17 D-23/D-24 (supersedes 09-02 D-02 windows): hours vs original_scheduled_at AT TIME ZONE Europe/Zurich. auto_full >24h at 100 % of captured charged_rappen; pending_ops inside 24h, inside 6h and after pickup with refund_rappen/refund_percent null (the admin sets the percentage); none only when nothing was captured. 20261009110000: duplicate payments are not part of the basis.';

create or replace function app.booking_paid_net(p_booking_id pg_catalog.uuid)
returns pg_catalog.int4
language sql
stable
security definer
set search_path = ''
as $$
  -- 20261009110000 (W5-09): a duplicate charge is refunded to its payer by checkout_duplicate_refund_record;
  -- neither its capture nor that refund is part of what the booking itself has paid.
  select (
    coalesce((select pg_catalog.sum(p.charged_rappen)
                from public.booking_payments as p
               where p.booking_id = p_booking_id
                 and p.captured_at is not null
                 and p.status is distinct from 'duplicate'), 0)
    - coalesce((select pg_catalog.sum(r.refund_rappen)
                  from public.booking_refunds as r
                 where r.booking_id = p_booking_id
                   and not exists (
                     select 1
                       from public.booking_payments as pd
                      where pd.id = r.payment_id
                        and pd.status = 'duplicate'
                   )), 0)
  )::pg_catalog.int4
$$;

revoke all on function app.booking_paid_net(pg_catalog.uuid) from public;

comment on function app.booking_paid_net(pg_catalog.uuid) is
  '26.2 P1: sum of captured charged_rappen minus sum of booking_refunds.refund_rappen for one booking. 20261009110000: duplicate payments and their refunds are left out. No grant.';

-- (6)
create or replace function public.checkout_expire_unpaid()
returns table (booking_id uuid, reference text, stripe_checkout_session_ids text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.bookings%rowtype;
  v_cut integer;
  v_sessions text[];
begin
  for v in
    select b.*
      from public.bookings as b
      inner join public.price_snapshots as ps on ps.id = b.price_snapshot_id
     where b.status = 'pending'
       and b.pay_link_sent_at is not null
       and greatest(ps.quote_lock_expires_at, coalesce(b.hold_until, ps.quote_lock_expires_at)) <= now()
       -- 20261009110000 (W4-07): a pending booking that holds a captured payment (an amount mismatch was
       -- held for review) is never cancelled by the clock; ops decides. Test bookings are unchanged.
       and (
         b.is_test
         or not exists (
           select 1
             from public.booking_payments as bp0
            where bp0.booking_id = b.id
              and (bp0.status = 'succeeded' or bp0.captured_at is not null)
         )
       )
     order by greatest(ps.quote_lock_expires_at, coalesce(b.hold_until, ps.quote_lock_expires_at)), b.created_at
     for update of b skip locked
  loop
    update public.booking_legs bl
       set status = 'cancelled'
     where bl.booking_id = v.id
       and bl.status not in ('completed', 'no_show', 'cancelled');
    get diagnostics v_cut = row_count;
    if v_cut = 0 then
      continue;
    end if;

    update public.bookings
       set status = 'cancelled'
     where id = v.id;

    select coalesce(array_agg(bp.stripe_checkout_session_id), array[]::text[])
      into v_sessions
      from public.booking_payments bp
     where bp.booking_id = v.id
       and bp.status = 'requires_payment'
       and bp.stripe_checkout_session_id is not null;

    perform app.release_unpaid_coupon(v.id, 'unpaid_cancelled');

    insert into public.booking_events (
      booking_id, booking_leg_id, kind, actor_kind, actor_label,
      from_status, to_status, payload
    ) values (
      v.id, null, 'booking.status_changed', 'cron', 'unpaid lock',
      v.status, 'cancelled',
      jsonb_build_object('via', 'expire_unpaid')
    );

    booking_id := v.id;
    reference := v.reference;
    stripe_checkout_session_ids := v_sessions;
    return next;
  end loop;
end
$$;
revoke all on function public.checkout_expire_unpaid() from public;
grant execute on function public.checkout_expire_unpaid() to vamos_system;

comment on function public.checkout_expire_unpaid() is
  'Hourly cron: cancel every pending booking WITH a pay link whose 24-hour hold is past (26.1-15 D-20). A pending booking with no pay link is left for purge_unpaid_booking (26.3-07 D-25). Returns each cancelled booking''s open Stripe Checkout Session ids and releases its coupon redemption. 20261009110000: a pending booking that holds a captured payment (held for review) is not cancelled. EXECUTE: vamos_system only.';

commit;

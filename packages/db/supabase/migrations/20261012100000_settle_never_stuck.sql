-- 20261012100000_settle_never_stuck.sql
--
-- Stripe payments review 2026-10-09, job J2 "settle never gets stuck"
-- (.planning/audits/2026-10-09-stripe-W4.md, -W5.md). Findings: W4-01, W4-03, W4-09, W4-17, W5-04, W5-12,
-- W5-17 (database side). The Worker side is the same branch (apps/web).
--
-- (1) stripe_events gets three columns: last_attempt_at (stripe_event_begin stamps it), sweep_count,
--     sweep_last_at and abandoned_at (the sweep below). No existing column or row changes.
-- (2) stripe_event_begin: body of 20260827000004 byte for byte, plus last_attempt_at = now(). The out-of-order
--     rule is NOT changed here (that is job J4, W4-05).
-- (3) stripe_event_settle (W5-17): body of 20260827000004 plus: an unknown event id raises P0002, a row that is
--     already processed is left alone (its first processed_at and its last_error stay).
-- (4) stripe_event_close (W4-09, new): closes an event that needs no further work (no_request, no_payment,
--     booking_missing, non_chf_refund, refund_required_no_payment_intent ...): processed_at is set and the reason
--     is kept in last_error, so the sweep never re-enqueues it and it stays findable.
-- (5) stripe_events_sweep_claim / stripe_events_sweep_abandoned (W4-01, new): the unprocessed-event sweep. The
--     hourly cron claims events that are not processed and idle for 10 minutes, bounded batch, and the Worker
--     re-enqueues them. An event swept p_max_sweeps times without success is returned once as 'abandon': the
--     Worker mails info@ and marks it (stripe_events_sweep_abandoned) only after the mail left, so a failed
--     alert is tried again next hour and a permanently failing event never loops.
-- (6) checkout_payment_settle (body of 20261007310000 plus the lines marked 20261012100000):
--     W4-03  the four refund-required branches (duplicate_charge, test_booking, requote_superseded,
--            paid_after_cancel) no longer stamp processed_at. They record the marker
--            `refund_required:<reason>` in stripe_events.last_error and leave the event open; the Worker
--            closes it (stripe_event_settle(id, null)) only after the Stripe refund and its record succeeded.
--            A retry of the open event reaches the already-settled branch, finds the marker and returns the
--            refund order again (the Stripe idempotency key stays refund:<booking>:<payment>:<reason>).
--     W4-17 / W5-04  a failed or canceled outcome for a payment that is succeeded or duplicate changes
--            nothing, raises nothing and closes the event.
--     W5-12  an unusable currency / FX tuple is dropped (capture recorded as CHF without FX detail, raw facts on
--            the payment.succeeded event payload) instead of raising a CHECK violation after capture.
--     W5-17  the already-settled branch keeps the event's first processed_at.
-- (7) checkout_extra_payment_settle (body of 20261007280000 plus the lines marked 20261012100000): W5-12 and
--     W4-17 as above; the already-settled stamp keeps the first processed_at.
--
-- Lock order unchanged: payment row, then booking row, then the stripe_events row (stripe_event_begin,
-- _settle, _close and the sweep touch only the event row, never a booking or payment).
-- Apply order: this file first, then the Worker of this branch. Old Worker with this file: refund-required
-- events stay open (never looped: the old Worker has no sweep). New Worker on the old file: the refund branches
-- are stamped processed in SQL as before (no regression), the Worker's later stripe_event_settle(null) is a no-op.
-- No data is changed. One transaction: apply verbatim as a whole.
begin;

-- ---------------------------------------------------------------------------
-- (1) columns
-- ---------------------------------------------------------------------------
alter table public.stripe_events
  add column last_attempt_at pg_catalog.timestamptz,
  add column sweep_count pg_catalog.int4 not null default 0,
  add column sweep_last_at pg_catalog.timestamptz,
  add column abandoned_at pg_catalog.timestamptz;

comment on column public.stripe_events.last_attempt_at is
  '20261012100000: when stripe_event_begin last ran for this event (the queue consumer''s latest delivery). The sweep skips an event attempted within the last 10 minutes.';
comment on column public.stripe_events.sweep_count is
  '20261012100000: how many times the hourly sweep re-enqueued this unprocessed event (bounded by stripe_events_sweep_claim p_max_sweeps).';
comment on column public.stripe_events.sweep_last_at is
  '20261012100000: when the sweep last re-enqueued this event.';
comment on column public.stripe_events.abandoned_at is
  '20261012100000: set once ops was mailed that this event never settled after every sweep. The sweep ignores it from then on; the row stays unprocessed and findable.';

-- ---------------------------------------------------------------------------
-- (2) stripe_event_begin: 20260827000004 plus last_attempt_at.
-- ---------------------------------------------------------------------------
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
  if exists (
    select 1
      from public.stripe_events as e
     where e.object_id = any (p_object_ids)
       and e.processed_at is not null
       and e.stripe_created > p_stripe_created
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

-- ---------------------------------------------------------------------------
-- (3) stripe_event_settle (W5-17)
-- ---------------------------------------------------------------------------
create or replace function public.stripe_event_settle(
  p_event_id pg_catalog.text,
  p_error pg_catalog.text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_processed_at pg_catalog.timestamptz;
begin
  select e.processed_at
    into v_processed_at
    from public.stripe_events as e
   where e.id = p_event_id
     for update;

  -- An id that names no event is a bug at the caller, never a silent success.
  if not found then
    raise exception 'event_not_found'
      using errcode = 'P0002';
  end if;

  -- An event that is already processed keeps its first processed_at and its last_error.
  if v_processed_at is not null then
    return;
  end if;

  if p_error is null then
    update public.stripe_events
       set processed_at = pg_catalog.now()
     where id = p_event_id;
  else
    update public.stripe_events
       set last_error = p_error
     where id = p_event_id;
  end if;
end;
$$;

revoke all on function public.stripe_event_settle(pg_catalog.text, pg_catalog.text) from public;
grant execute on function public.stripe_event_settle(pg_catalog.text, pg_catalog.text) to vamos_system;

comment on function public.stripe_event_settle(pg_catalog.text, pg_catalog.text) is
  'Plan 07-03, 20261012100000: stamp processed_at on success, or last_error without processed_at on failure. An unknown event id raises P0002; an already processed row is left unchanged.';

-- ---------------------------------------------------------------------------
-- (4) stripe_event_close (W4-09)
-- ---------------------------------------------------------------------------
create or replace function public.stripe_event_close(
  p_event_id pg_catalog.text,
  p_reason pg_catalog.text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_processed_at pg_catalog.timestamptz;
begin
  if p_reason is null or pg_catalog.btrim(p_reason) = '' then
    raise exception 'close_reason_required'
      using errcode = 'invalid_parameter_value';
  end if;

  select e.processed_at
    into v_processed_at
    from public.stripe_events as e
   where e.id = p_event_id
     for update;

  if not found then
    raise exception 'event_not_found'
      using errcode = 'P0002';
  end if;

  if v_processed_at is not null then
    return;
  end if;

  update public.stripe_events
     set processed_at = pg_catalog.now(),
         last_error = p_reason
   where id = p_event_id;
end;
$$;

revoke all on function public.stripe_event_close(pg_catalog.text, pg_catalog.text) from public;
grant execute on function public.stripe_event_close(pg_catalog.text, pg_catalog.text) to vamos_system;

comment on function public.stripe_event_close(pg_catalog.text, pg_catalog.text) is
  '20261012100000 (W4-09): close an event that needs no further work. Sets processed_at and keeps the reason in last_error, so the unprocessed sweep never re-enqueues it and it stays findable. An unknown id raises P0002; an already processed row is unchanged.';

-- ---------------------------------------------------------------------------
-- (5) the unprocessed-event sweep (W4-01)
-- ---------------------------------------------------------------------------
create or replace function public.stripe_events_sweep_claim(
  p_min_age pg_catalog.interval default interval '10 minutes',
  p_max_sweeps pg_catalog.int4 default 6,
  p_limit pg_catalog.int4 default 20,
  p_horizon pg_catalog.interval default interval '30 days'
)
returns table (
  event_id pg_catalog.text,
  event_type pg_catalog.text,
  object_id pg_catalog.text,
  stripe_created pg_catalog.timestamptz,
  attempts pg_catalog.int4,
  last_error pg_catalog.text,
  action pg_catalog.text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'invalid_limit' using errcode = 'invalid_parameter_value';
  end if;
  if p_max_sweeps is null or p_max_sweeps < 1 then
    raise exception 'invalid_max_sweeps' using errcode = 'invalid_parameter_value';
  end if;

  -- Events to re-enqueue: not processed, not yet reported, idle for p_min_age (no delivery and no sweep in
  -- that time), received within the horizon, and not closed with a benign reason by an older Worker (the
  -- old Worker only wrote last_error; the new one closes with processed_at set). Oldest first, bounded.
  return query
    with picked as (
      select e.id
        from public.stripe_events as e
       where e.processed_at is null
         and e.abandoned_at is null
         and e.sweep_count < p_max_sweeps
         and coalesce(e.last_attempt_at, e.received_at) < pg_catalog.now() - p_min_age
         and (e.sweep_last_at is null or e.sweep_last_at < pg_catalog.now() - p_min_age)
         and e.received_at < pg_catalog.now() - p_min_age
         and e.received_at > pg_catalog.now() - p_horizon
         and coalesce(e.last_error, '') not in
             ('no_request', 'no_payment', 'booking_missing', 'non_chf_refund', 'refund_required_no_payment_intent')
       order by e.received_at, e.id
       limit p_limit
         for update skip locked
    ), bumped as (
      update public.stripe_events as u
         set sweep_count = u.sweep_count + 1,
             sweep_last_at = pg_catalog.now()
        from picked
       where u.id = picked.id
      returning u.id, u.type, u.object_id, u.stripe_created, u.attempts, u.last_error
    )
    select b.id, b.type, b.object_id, b.stripe_created, b.attempts, b.last_error, 'requeue'::pg_catalog.text
      from bumped as b;

  -- Events that used every sweep and are still open: reported once.
  return query
    select e.id, e.type, e.object_id, e.stripe_created, e.attempts, e.last_error, 'abandon'::pg_catalog.text
      from public.stripe_events as e
     where e.processed_at is null
       and e.abandoned_at is null
       and e.sweep_count >= p_max_sweeps
       and coalesce(e.sweep_last_at, e.received_at) < pg_catalog.now() - p_min_age
       and e.received_at > pg_catalog.now() - p_horizon
       and coalesce(e.last_error, '') not in
           ('no_request', 'no_payment', 'booking_missing', 'non_chf_refund', 'refund_required_no_payment_intent')
     order by e.received_at, e.id
     limit p_limit;
end;
$$;

revoke all on function public.stripe_events_sweep_claim(
  pg_catalog.interval, pg_catalog.int4, pg_catalog.int4, pg_catalog.interval
) from public;
grant execute on function public.stripe_events_sweep_claim(
  pg_catalog.interval, pg_catalog.int4, pg_catalog.int4, pg_catalog.interval
) to vamos_system;

comment on function public.stripe_events_sweep_claim(
  pg_catalog.interval, pg_catalog.int4, pg_catalog.int4, pg_catalog.interval
) is
  '20261012100000 (W4-01): the unprocessed-event sweep. Returns up to p_limit events to re-enqueue (action requeue; sweep_count and sweep_last_at are bumped) and, separately, events that used all p_max_sweeps sweeps and are still open (action abandon; nothing is changed, the Worker mails ops and then calls stripe_events_sweep_abandoned). Skips processed events, events attempted or swept within p_min_age, events older than p_horizon and events closed with a benign reason. Touches only stripe_events.';

create or replace function public.stripe_events_sweep_abandoned(
  p_event_ids pg_catalog.text[]
)
returns pg_catalog.int4
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count pg_catalog.int4;
begin
  update public.stripe_events
     set abandoned_at = pg_catalog.now()
   where id = any (p_event_ids)
     and processed_at is null
     and abandoned_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.stripe_events_sweep_abandoned(pg_catalog.text[]) from public;
grant execute on function public.stripe_events_sweep_abandoned(pg_catalog.text[]) to vamos_system;

comment on function public.stripe_events_sweep_abandoned(pg_catalog.text[]) is
  '20261012100000 (W4-01): mark events whose abandon report reached ops, so the sweep reports each one once. Returns how many rows were marked.';

-- ---------------------------------------------------------------------------
-- (6) checkout_payment_settle
-- ---------------------------------------------------------------------------
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
  -- 20261012100000
  v_marker pg_catalog.text;
  v_marker_reason pg_catalog.text;
  v_fx_note pg_catalog.jsonb;
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
               v_other_sessions;
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
             array[]::pg_catalog.text[];
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
               array[]::pg_catalog.text[];
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

-- ---------------------------------------------------------------------------
-- (7) checkout_extra_payment_settle
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

  -- 20261012100000 (W5-12): see checkout_payment_settle. A currency or FX tuple the row cannot hold
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
    -- 20261012100000 (W4-17, W5-04): a late failed / canceled event for a difference that was paid
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

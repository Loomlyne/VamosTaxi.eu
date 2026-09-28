-- 20260928150000_refund_review_tiers.sql
--
-- Plan 26.1-17. Refund tiers and admin decisions (26.1-CONTEXT D-23/D-24/D-25/D-25a).
--
--   D-23  A paid booking cancelled more than 24 h before pickup is refunded in full
--         automatically -- compute_cancellation_refund keeps auto_full at 100 % of captured.
--   D-24  Cancelled inside 24 h -- including inside 6 h and after the pickup time -- the
--         admin approves and sets the percentage. There is no silent no-refund zone any
--         more: every such cancel is pending_ops with refund_rappen/refund_percent null
--         until the admin decides (ops_refund_record with p_refund_rappen) or declines
--         (ops_refund_decide 'decline').
--   D-25  After the trip the admin accepts (ops_refund_record p_reason 'post_trip', full
--         remaining) or rejects (ops_refund_decide 'reject').
--   D-25a The customer asks by support ticket only: nothing here is granted to a customer
--         role.
--
-- A booking with nothing captured has nothing to refund: its refund_mode is none in every
-- window, so an unpaid cancel never lands in the admin's review queue.
--
-- Backward compatible with the live Worker: compute_cancellation_refund keeps its
-- signature; ops_refund_record gains two trailing defaulted parameters (p_reason,
-- p_refund_rappen), so the 5-argument call the deployed Worker makes still resolves.
-- Owner applies in the SQL editor before the Worker that passes the new arguments.
-- Same fallback rule as 26.1-02: the file is one transaction; if a partial apply is
-- suspected, rerun the whole file -- every statement is `drop ... if exists` +
-- create, or `create or replace`.
--
-- No CHF amount enters this file (D-13).

begin;

-- ---------------------------------------------------------------------------
-- (1) bookings.refund_status: add declined (D-24 decline, D-25 reject).
-- ---------------------------------------------------------------------------
alter table public.bookings
  drop constraint if exists bookings_refund_status_check;

alter table public.bookings
  add constraint bookings_refund_status_check
  check (refund_status in ('none', 'pending_ops', 'processing', 'refunded', 'failed', 'declined'));

comment on constraint bookings_refund_status_check on public.bookings is
  '26.1-17 D-24/D-25: declined is additive -- the admin declined a pending_ops refund or rejected a post-trip request.';

-- ---------------------------------------------------------------------------
-- (2) booking_refunds.reason: add post_trip (D-25 accept).
-- ---------------------------------------------------------------------------
alter table public.booking_refunds
  drop constraint if exists booking_refunds_reason_check;

alter table public.booking_refunds
  add constraint booking_refunds_reason_check
  check (reason in (
    'customer_cancel', 'ops_cancel', 'no_driver', 'modification_credit', 'no_show',
    'duplicate_charge', 'paid_after_cancel', 'test_booking', 'requote_superseded',
    'stripe_dashboard', 'post_trip'
  ));

comment on constraint booking_refunds_reason_check on public.booking_refunds is
  '26.1-17 D-25: post_trip is additive -- the admin accepted a refund the customer asked for after the trip. 26.1-08 stripe_dashboard and the 26.1-02 reasons kept.';

-- ---------------------------------------------------------------------------
-- (3) booking_events.kind: add refund.declined and refund.rejected (T-26.1-55).
-- ---------------------------------------------------------------------------
alter table public.booking_events
  drop constraint if exists booking_events_kind_check;

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
    'refund.declined',
    'refund.rejected',
    'assignment.chauffeur_set',
    'assignment.vehicle_set',
    'assignment.cleared',
    'flight.delayed',
    'note.added',
    'flight.autofilled',
    'review.submitted'
  ));

comment on constraint booking_events_kind_check on public.booking_events is
  '26.1-17: twenty-three kinds. refund.declined (D-24) and refund.rejected (D-25) are additive.';

-- ---------------------------------------------------------------------------
-- (4) compute_cancellation_refund v2 -- same signature and return type.
--     > 24 h            auto_full, 100 % of captured          (D-23)
--     inside 24 h,
--     inside 6 h,
--     after pickup      pending_ops, amount null: admin sets it (D-24)
--     nothing captured  none                                    (nothing to refund)
-- ---------------------------------------------------------------------------
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
     and p.captured_at is not null;

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
  '26.1-17 D-23/D-24 (supersedes 09-02 D-02 windows): hours vs original_scheduled_at AT TIME ZONE Europe/Zurich. auto_full >24h at 100 % of captured charged_rappen; pending_ops inside 24h, inside 6h and after pickup with refund_rappen/refund_percent null (the admin sets the percentage); none only when nothing was captured.';

-- ---------------------------------------------------------------------------
-- (5) ops_refund_record v3: + p_reason (D-25 post_trip), + p_refund_rappen (D-24 the
--     admin's percentage, computed by the Worker from the captured sum). Both trailing
--     and defaulted: the 5-argument call keeps recording the full remaining as
--     ops_cancel. Body otherwise 20260927180000 verbatim.
-- ---------------------------------------------------------------------------
drop function if exists public.ops_refund_record(
  pg_catalog.uuid, pg_catalog.int8, pg_catalog.text, pg_catalog.uuid, public.rappen
);
drop function if exists public.ops_refund_record(
  pg_catalog.uuid, pg_catalog.int8, pg_catalog.text, pg_catalog.uuid, public.rappen,
  pg_catalog.text, public.rappen
);

create function public.ops_refund_record(
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

comment on function public.ops_refund_record(
  pg_catalog.uuid, pg_catalog.int8, pg_catalog.text, pg_catalog.uuid, public.rappen,
  pg_catalog.text, public.rappen
) is
  '08-05 + 09-02 D-12 + 26.1-17 D-24/D-25: record a Stripe refund the Worker already made. Requires stripe_refund_id (idempotent on it). p_refund_rappen = the admin''s decided amount (default: full remaining; above remaining refused). p_reason = ops_cancel (default) | customer_cancel | no_driver | no_show | post_trip. A pending_ops line settles to refunded with owed = refunded. EXECUTE vamos_system only.';

-- ---------------------------------------------------------------------------
-- (6) ops_refund_decide: the admin declines a pending_ops refund (D-24) or rejects a
--     post-trip request (D-25). No money moves. app.is_admin() inside (T-26.1-53);
--     booking_events carries who decided (T-26.1-55).
-- ---------------------------------------------------------------------------
drop function if exists public.ops_refund_decide(pg_catalog.uuid, pg_catalog.text);

create function public.ops_refund_decide(
  p_booking_id pg_catalog.uuid,
  p_decision pg_catalog.text
)
returns table (
  booking_id pg_catalog.uuid,
  refund_status pg_catalog.text,
  reference pg_catalog.text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_booking public.bookings%rowtype;
  v_actor pg_catalog.uuid;
  v_actor_label pg_catalog.text;
  v_kind pg_catalog.text;
begin
  if not app.is_admin() then
    raise exception 'admin-only' using errcode = '42501';
  end if;

  if p_decision is null or p_decision not in ('decline', 'reject') then
    raise exception 'invalid-decision' using errcode = '22023';
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

  if p_decision = 'decline' then
    if v_booking.refund_status <> 'pending_ops' then
      raise exception 'not-pending' using errcode = 'P0001';
    end if;
    v_kind := 'refund.declined';
  else
    if v_booking.status not in (
         'completed'::public.booking_status,
         'partially_completed'::public.booking_status,
         'no_show'::public.booking_status
       ) then
      raise exception 'not-post-trip' using errcode = 'P0001';
    end if;
    if v_booking.refund_status <> 'none' then
      raise exception 'not-open' using errcode = 'P0001';
    end if;
    if not exists (
      select 1
        from public.booking_payments as p
       where p.booking_id = v_booking.id
         and p.captured_at is not null
    ) then
      raise exception 'not-paid' using errcode = 'P0001';
    end if;
    v_kind := 'refund.rejected';
  end if;

  v_actor := app.uid();
  select coalesce(s.full_name, '')
    into v_actor_label
    from public.staff as s
   where s.user_id = v_actor;
  if v_actor_label is null then
    v_actor_label := '';
  end if;

  update public.bookings
     set refund_status = 'declined',
         refund_owed_rappen = 0,
         updated_at = pg_catalog.now()
   where id = v_booking.id;

  insert into public.booking_events (
    booking_id,
    kind,
    actor_kind,
    actor_id,
    actor_label,
    payload
  ) values (
    v_booking.id,
    v_kind,
    'staff',
    v_actor,
    v_actor_label,
    pg_catalog.jsonb_build_object(
      'via', 'ops',
      'decision', p_decision,
      'previous_refund_status', v_booking.refund_status
    )
  );

  booking_id := v_booking.id;
  refund_status := 'declined';
  reference := v_booking.reference;
  return next;
end;
$$;

revoke all on function public.ops_refund_decide(pg_catalog.uuid, pg_catalog.text) from public;
grant execute on function public.ops_refund_decide(pg_catalog.uuid, pg_catalog.text) to vamos_staff;

comment on function public.ops_refund_decide(pg_catalog.uuid, pg_catalog.text) is
  '26.1-17 D-24/D-25: decline (a pending_ops refund) or reject (a post-trip request on a completed/partially_completed/no_show paid booking with refund_status none). Sets refund_status declined, refund_owed_rappen 0, writes refund.declined / refund.rejected with the admin as actor. No money moves. Requires app.is_admin() (42501 otherwise). EXECUTE: vamos_staff.';

commit;

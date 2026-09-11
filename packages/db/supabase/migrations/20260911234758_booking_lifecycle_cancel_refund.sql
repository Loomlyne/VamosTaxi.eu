-- 20260911234758_booking_lifecycle_cancel_refund.sql
--
-- 09-02 Task 2: D-02 compute, cancel RPCs, record_booking_refund, remaining ops refund.
-- Hosted apply is 09-04, not this plan. Charge gate untouched. No Stripe inside SQL.

alter table public.bookings
  add column refund_status text not null default 'none',
  add column refund_owed_rappen rappen,
  add column refunded_rappen rappen not null default 0,
  add constraint bookings_refund_status_check
    check (refund_status in ('none', 'pending_ops', 'processing', 'refunded', 'failed'));

comment on column public.bookings.refund_status is
  '09-02 D-06/D-10: customer refund line. Status word stays cancelled; this is the money line.';
comment on column public.bookings.refund_owed_rappen is
  '09-02: rappen owed for this cancel window (captured basis). Null/0 when none.';
comment on column public.bookings.refunded_rappen is
  '09-02: sum of recorded booking_refunds.refund_rappen. Default 0.';

alter table public.booking_refunds
  add column payout_country text,
  add column available_on timestamptz;

comment on column public.booking_refunds.payout_country is
  '09-02 D-07: Stripe card country after createRefund retrieve, else what the Worker passed. SQL never invents a country.';
comment on column public.booking_refunds.available_on is
  '09-02 D-07: Stripe balance_transaction.available_on. Nullable. SQL never invents a day count.';

grant select (refund_status, refund_owed_rappen, refunded_rappen)
  on public.bookings to authenticated, vamos_guest;

-- ---------------------------------------------------------------------------
-- D-02 / D-04 / D-26: windows vs original_scheduled_at AT TIME ZONE Europe/Zurich.
-- 100% of captured charged_rappen sum, not snapshot list. No live percent-inside-24h tier.
-- ---------------------------------------------------------------------------

create function public.compute_cancellation_refund(p_booking_id pg_catalog.uuid)
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
  v_pct pg_catalog.numeric(5,2);
  v_refund public.rappen;
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

  if v_hours > 24 then
    v_mode := 'auto_full';
    v_pct := 100;
    v_refund := v_basis;
  elsif v_hours > 6 then
    v_mode := 'pending_ops';
    v_pct := 100;
    v_refund := v_basis;
  else
    v_mode := 'none';
    v_pct := 0;
    v_refund := 0;
  end if;

  refund_mode := v_mode;
  refund_rappen := v_refund;
  basis_rappen := v_basis;
  hours_before := v_hours;
  refund_percent := v_pct;
  return next;
end;
$$;

revoke all on function public.compute_cancellation_refund(pg_catalog.uuid) from public;
grant execute on function public.compute_cancellation_refund(pg_catalog.uuid) to vamos_system, postgres;

comment on function public.compute_cancellation_refund(pg_catalog.uuid) is
  '09-02 D-02/D-04/D-26: windows vs original_scheduled_at AT TIME ZONE Europe/Zurich. auto_full >24h; pending_ops 24h–6h; none ≤6h and after pickup. Captured charged_rappen sum. No live percent-inside-24h tier.';

-- ---------------------------------------------------------------------------
-- Shared cancel body. Caller holds the bookings row lock.
-- ---------------------------------------------------------------------------

create function app.apply_customer_cancel(
  p_booking_id pg_catalog.uuid,
  p_leg_seq pg_catalog.int2,
  p_actor_kind pg_catalog.text,
  p_actor_label pg_catalog.text,
  p_via pg_catalog.text
)
returns table (
  booking_id pg_catalog.uuid,
  refund_mode pg_catalog.text,
  refund_rappen public.rappen,
  basis_rappen public.rappen,
  hours_before pg_catalog.numeric,
  stripe_payment_intent_id pg_catalog.text,
  refund_percent pg_catalog.numeric
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v public.bookings%rowtype;
  v_cut pg_catalog.int4;
  v_leg_id pg_catalog.uuid;
  v_free_cancel_hours pg_catalog.numeric;
  v_tiers pg_catalog.jsonb;
  v_settings_version pg_catalog.int8;
  v_comp record;
  v_pi pg_catalog.text;
  v_to public.booking_status;
  v_owed public.rappen;
  v_rs pg_catalog.text;
begin
  select b.*
    into v
    from public.bookings as b
   where b.id = p_booking_id;

  if v.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v.status in (
       'completed'::public.booking_status,
       'no_show'::public.booking_status,
       'cancelled'::public.booking_status,
       'refunded'::public.booking_status
     ) then
    raise exception 'not_cancellable' using errcode = 'P0001';
  end if;

  if v.status not in (
       'pending'::public.booking_status,
       'paid'::public.booking_status,
       'confirmed'::public.booking_status,
       'assigned'::public.booking_status,
       'partially_completed'::public.booking_status,
       'partially_cancelled'::public.booking_status
     ) then
    raise exception 'not_cancellable' using errcode = 'P0001';
  end if;

  update public.booking_legs as bl
     set status = 'cancelled'::public.booking_status,
         updated_at = pg_catalog.now()
   where bl.booking_id = v.id
     and bl.status not in (
       'completed'::public.booking_status,
       'no_show'::public.booking_status,
       'cancelled'::public.booking_status
     )
     and (p_leg_seq is null or bl.leg_seq = p_leg_seq);
  get diagnostics v_cut = row_count;
  if v_cut = 0 then
    raise exception 'not_cancellable' using errcode = 'P0001';
  end if;

  perform public.recompute_booking_status(v.id);

  select b.status
    into v_to
    from public.bookings as b
   where b.id = v.id;

  select c.*
    into v_comp
    from public.compute_cancellation_refund(v.id) as c;

  v_owed := v_comp.refund_rappen;
  if v_comp.refund_mode = 'pending_ops' then
    v_rs := 'pending_ops';
  else
    -- auto_full stays none until Worker sets processing; none stays none.
    v_rs := 'none';
  end if;

  update public.bookings
     set refund_status = v_rs,
         refund_owed_rappen = v_owed,
         updated_at = pg_catalog.now()
   where id = v.id;

  select (s.policy ->> 'free_cancel_hours')::pg_catalog.numeric,
         s.policy -> 'cancellation_tiers',
         s.settings_version_id
    into v_free_cancel_hours, v_tiers, v_settings_version
    from public.price_snapshots as s
   where s.id = v.price_snapshot_id;

  if p_leg_seq is not null then
    select l.id
      into v_leg_id
      from public.booking_legs as l
     where l.booking_id = v.id
       and l.leg_seq = p_leg_seq;
  end if;

  select p.stripe_payment_intent_id
    into v_pi
    from public.booking_payments as p
   where p.booking_id = v.id
     and p.captured_at is not null
     and p.status = 'succeeded'
   order by p.captured_at
   limit 1;

  insert into public.booking_events (
    booking_id, booking_leg_id, kind, actor_kind, actor_label,
    from_status, to_status, payload
  ) values (
    v.id,
    v_leg_id,
    'booking.status_changed',
    p_actor_kind,
    p_actor_label,
    v.status,
    v_to,
    pg_catalog.jsonb_build_object(
      'via', p_via,
      'leg_seq', p_leg_seq,
      'free_cancel_hours', v_free_cancel_hours,
      'cancellation_tiers', v_tiers,
      'settings_version_id', v_settings_version,
      'hours_before', v_comp.hours_before,
      'refund_mode', v_comp.refund_mode,
      'refund_rappen', v_comp.refund_rappen
    )
  );

  booking_id := v.id;
  refund_mode := v_comp.refund_mode;
  refund_rappen := v_comp.refund_rappen;
  basis_rappen := v_comp.basis_rappen;
  hours_before := v_comp.hours_before;
  stripe_payment_intent_id := v_pi;
  refund_percent := v_comp.refund_percent;
  return next;
end;
$$;

revoke all on function app.apply_customer_cancel(
  pg_catalog.uuid, pg_catalog.int2, pg_catalog.text, pg_catalog.text, pg_catalog.text
) from public;

-- ---------------------------------------------------------------------------
-- Guest token cancel. After pickup allowed (D-02). Never INSERT booking_refunds.
-- ---------------------------------------------------------------------------

drop function if exists public.manage_booking_cancel(bytea, smallint);

create function public.manage_booking_cancel(
  p_token_hash bytea,
  p_leg_seq smallint default null
)
returns table (
  booking_id pg_catalog.uuid,
  refund_mode pg_catalog.text,
  refund_rappen public.rappen,
  basis_rappen public.rappen,
  hours_before pg_catalog.numeric,
  stripe_payment_intent_id pg_catalog.text,
  refund_percent pg_catalog.numeric
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v public.bookings%rowtype;
begin
  select b.*
    into v
    from public.bookings as b
    join public.booking_access_tokens as t on t.booking_id = b.id
   where t.token_hash = p_token_hash
     and t.revoked_at is null
     and t.expires_at > pg_catalog.now()
   for update of b;

  if v.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return query
    select *
      from app.apply_customer_cancel(
        v.id,
        p_leg_seq,
        'guest',
        'manage link',
        'manage_link'
      );

  update public.booking_access_tokens
     set last_used_at = pg_catalog.now(),
         use_count = use_count + 1
   where token_hash = p_token_hash;
end;
$$;

revoke all on function public.manage_booking_cancel(bytea, smallint) from public;
grant execute on function public.manage_booking_cancel(bytea, smallint) to vamos_guest;

comment on function public.manage_booking_cancel(bytea, smallint) is
  '09-02 D-02: guest cancel. After pickup allowed. Completed/no_show not_cancellable. Returns PI; never INSERT booking_refunds. auto_full refund_status stays none until Worker processing.';

-- ---------------------------------------------------------------------------
-- Signed-in paid cancel. Worker checks asCustomer ownership. Unpaid: other RPC.
-- ---------------------------------------------------------------------------

create function public.customer_paid_cancel(p_booking_id pg_catalog.uuid)
returns table (
  booking_id pg_catalog.uuid,
  refund_mode pg_catalog.text,
  refund_rappen public.rappen,
  basis_rappen public.rappen,
  hours_before pg_catalog.numeric,
  stripe_payment_intent_id pg_catalog.text,
  refund_percent pg_catalog.numeric
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v public.bookings%rowtype;
begin
  select b.*
    into v
    from public.bookings as b
   where b.id = p_booking_id
     and b.erased_at is null
   for update;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
      from public.booking_payments as p
     where p.booking_id = v.id
       and p.captured_at is not null
  ) then
    raise exception 'unpaid_use_hard_delete' using errcode = 'P0001';
  end if;

  return query
    select *
      from app.apply_customer_cancel(
        v.id,
        null,
        'customer',
        'account',
        'account'
      );
end;
$$;

revoke all on function public.customer_paid_cancel(pg_catalog.uuid) from public;
grant execute on function public.customer_paid_cancel(pg_catalog.uuid) to vamos_system;

comment on function public.customer_paid_cancel(pg_catalog.uuid) is
  '09-02: signed-in paid cancel. Same D-02 money rules. EXECUTE vamos_system. Worker owns asCustomer check. Unpaid must use checkout_cancel_unpaid.';

-- ---------------------------------------------------------------------------
-- Guest ticket read. Same P0002 not_found for miss/revoked/wrong hash (T-09-10).
-- ---------------------------------------------------------------------------

create function public.manage_booking_read(p_token_hash bytea)
returns table (
  booking_id pg_catalog.uuid,
  reference pg_catalog.text,
  status public.booking_status,
  locale pg_catalog.text,
  contact_name pg_catalog.text,
  contact_email pg_catalog.text,
  contact_phone pg_catalog.text,
  pickup_text pg_catalog.text,
  dropoff_text pg_catalog.text,
  scheduled_at pg_catalog.timestamptz,
  scheduled_local pg_catalog.text,
  original_scheduled_at pg_catalog.timestamptz,
  flight_no pg_catalog.text,
  pax pg_catalog.int2,
  bags pg_catalog.int2,
  refund_status pg_catalog.text,
  refund_owed_rappen public.rappen,
  refunded_rappen public.rappen,
  payout_country pg_catalog.text,
  available_on pg_catalog.timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v public.bookings%rowtype;
  v_leg public.booking_legs%rowtype;
  v_country pg_catalog.text;
  v_available pg_catalog.timestamptz;
begin
  select b.*
    into v
    from public.bookings as b
    join public.booking_access_tokens as t on t.booking_id = b.id
   where t.token_hash = p_token_hash
     and t.revoked_at is null
     and t.expires_at > pg_catalog.now();

  if v.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select l.*
    into v_leg
    from public.booking_legs as l
   where l.booking_id = v.id
   order by l.leg_seq
   limit 1;

  select r.payout_country, r.available_on
    into v_country, v_available
    from public.booking_refunds as r
   where r.booking_id = v.id
   order by r.decided_at desc
   limit 1;

  booking_id := v.id;
  reference := v.reference;
  status := v.status;
  locale := v.locale;
  contact_name := v.contact_name;
  contact_email := v.contact_email::pg_catalog.text;
  contact_phone := v.contact_phone;
  pickup_text := v_leg.pickup_text;
  dropoff_text := v_leg.dropoff_text;
  scheduled_at := v_leg.scheduled_at;
  scheduled_local := v_leg.scheduled_local;
  original_scheduled_at := v_leg.original_scheduled_at;
  flight_no := v_leg.flight_no;
  pax := v_leg.pax;
  bags := v_leg.bags;
  refund_status := v.refund_status;
  refund_owed_rappen := v.refund_owed_rappen;
  refunded_rappen := v.refunded_rappen;
  payout_country := v_country;
  available_on := v_available;
  return next;
end;
$$;

revoke all on function public.manage_booking_read(bytea) from public;
grant execute on function public.manage_booking_read(bytea) to vamos_guest;

comment on function public.manage_booking_read(bytea) is
  '09-02 D-06/D-07: guest ticket + refund line (payout_country, available_on). P0002 not_found. EXECUTE vamos_guest.';

-- ---------------------------------------------------------------------------
-- Record Stripe refund. Never called from manage_booking_cancel (D-08).
-- ---------------------------------------------------------------------------

create function public.record_booking_refund(
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
   limit 1
     for update;

  if not found then
    raise exception 'not-paid' using errcode = 'P0001';
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

comment on function public.record_booking_refund(
  pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.timestamptz, public.rappen
) is
  '09-02 D-07/D-08: INSERT booking_refunds after Stripe. Requires stripe_refund_id. payout_country + available_on are Stripe facts, never invented. EXECUTE vamos_system only.';

create function public.bookings_set_refund_failed(p_booking_id pg_catalog.uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.bookings
     set refund_status = 'failed',
         updated_at = pg_catalog.now()
   where id = p_booking_id;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.bookings_set_refund_failed(pg_catalog.uuid) from public;
grant execute on function public.bookings_set_refund_failed(pg_catalog.uuid) to vamos_system;

comment on function public.bookings_set_refund_failed(pg_catalog.uuid) is
  '09-02 D-08: set refund_status failed only. Cannot change bookings.status (never un-cancel). EXECUTE vamos_system only.';

-- ---------------------------------------------------------------------------
-- D-12: further ops refunds until remaining captured is 0. Unique stripe id.
-- ---------------------------------------------------------------------------

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
  v_from public.booking_status;
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

  update public.bookings
     set status = 'refunded'::public.booking_status,
         refund_status = 'refunded',
         refunded_rappen = coalesce(refunded_rappen, 0) + v_refund.refund_rappen,
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

-- ---------------------------------------------------------------------------
-- D-13: same D-02 windows as customer. No Stripe inside SQL.
-- ---------------------------------------------------------------------------

drop function if exists public.ops_cancel_booking(pg_catalog.uuid, pg_catalog.uuid);

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
  paid pg_catalog.bool,
  refund_mode pg_catalog.text,
  refund_rappen pg_catalog.int4
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
  v_to public.booking_status;
  v_comp record;
  v_rs pg_catalog.text;
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

  perform public.recompute_booking_status(v_booking.id);

  select b.status
    into v_to
    from public.bookings as b
   where b.id = v_booking.id;

  select c.*
    into v_comp
    from public.compute_cancellation_refund(v_booking.id) as c;

  if v_comp.refund_mode = 'pending_ops' then
    v_rs := 'pending_ops';
  else
    v_rs := 'none';
  end if;

  update public.bookings
     set refund_status = v_rs,
         refund_owed_rappen = v_comp.refund_rappen,
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
    v_to,
    pg_catalog.jsonb_build_object(
      'via', 'ops',
      'paid', v_paid,
      'refund_mode', v_comp.refund_mode,
      'refund_rappen', v_comp.refund_rappen
    )
  );

  return query
    select v_booking.id,
           v_booking.reference,
           v_booking.contact_email::pg_catalog.text,
           v_booking.contact_name,
           coalesce(v_booking.locale, 'en'),
           v_paid,
           v_comp.refund_mode,
           v_comp.refund_rappen::pg_catalog.int4;
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
  '08-05 + 09-02 D-12: record a Stripe refund. Requires stripe_refund_id. Further refunds until remaining captured is 0. Unique stripe_refund_id. EXECUTE vamos_system only.';

comment on function public.ops_cancel_booking(
  pg_catalog.uuid,
  pg_catalog.uuid
) is
  '08-05 + 09-02 D-13: ops cancel without Stripe. Calls compute_cancellation_refund (same D-02 windows). Returns refund_mode + refund_rappen. EXECUTE vamos_system only.';

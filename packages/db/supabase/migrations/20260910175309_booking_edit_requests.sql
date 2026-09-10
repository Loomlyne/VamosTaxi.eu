-- 20260910175309_booking_edit_requests.sql
--
-- 08-07: paid-edit requests, difference extra snapshot, extra settle that does
-- not run pending→paid→confirmed. Charge gate tg_payment_matches_snapshot is
-- not replaced. EXECUTE vamos_system only. Hosted apply is 08-09 Task 3.
--
-- Extra capture is a second succeeded payment on a NEW difference snapshot.
-- booking_payments_one_success was one succeeded row per booking; extras need
-- one succeeded row per snapshot. The gate still requires charged_rappen =
-- that snapshot's total_rappen.

drop index if exists public.booking_payments_one_success;

create unique index booking_payments_one_success_per_snapshot
  on public.booking_payments (snapshot_id)
  where status = 'succeeded';

comment on index public.booking_payments_one_success_per_snapshot is
  '08-07: one succeeded payment per snapshot. Extra capture is a second settlement on a difference snapshot, never a second charge against the original.';

create table public.booking_edit_requests (
  id                         uuid primary key default gen_random_uuid(),
  booking_id                 uuid not null references public.bookings(id) on delete restrict,
  actor                      text not null check (actor in ('customer', 'staff')),
  actor_id                   uuid references auth.users(id) on delete set null,
  payload                    jsonb not null default '{}'::jsonb,
  quote_snapshot_id          bigint not null references public.price_snapshots(id) on delete restrict,
  extra_snapshot_id          bigint references public.price_snapshots(id) on delete restrict,
  status                     text not null check (status in ('requested', 'accepted', 'superseded')),
  extra_payment_id           bigint references public.booking_payments(id) on delete restrict,
  extra_session_id           text,
  created_at                 timestamptz not null default now(),
  accepted_at                timestamptz,
  constraint booking_edit_requests_payload_object check (jsonb_typeof(payload) = 'object')
);

comment on table public.booking_edit_requests is
  '08-07: paid-edit requests. Writes are SECURITY DEFINER (vamos_system). No anon/authenticated table grants. Hosted apply is 08-09.';

create index booking_edit_requests_booking
  on public.booking_edit_requests (booking_id, created_at desc);

create unique index booking_edit_requests_one_requested
  on public.booking_edit_requests (booking_id)
  where status = 'requested';

alter table public.booking_edit_requests enable row level security;
alter table public.booking_edit_requests force row level security;

revoke all on table public.booking_edit_requests
  from public, anon, authenticated, vamos_guest, vamos_edge, vamos_public, vamos_staff, vamos_checkout;

grant select on table public.booking_edit_requests to vamos_staff;

create policy booking_edit_requests_staff_gate on public.booking_edit_requests
  as restrictive for all to vamos_staff
  using ((select app.is_staff())) with check (false);

create policy booking_edit_requests_staff_read on public.booking_edit_requests
  for select to vamos_staff using (true);

-- ---------------------------------------------------------------------------
-- Apply accepted payload. Does not change booking.status (no rewind).
-- Overlap (23P01) and capacity raise; the trip is not auto-cancelled (D-75).
-- ---------------------------------------------------------------------------

create function public.booking_edit_apply_payload(
  p_booking_id pg_catalog.uuid,
  p_quote_snapshot_id pg_catalog.int8,
  p_payload pg_catalog.jsonb,
  p_actor_id pg_catalog.uuid,
  p_actor_kind pg_catalog.text,
  p_actor_label pg_catalog.text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_leg public.booking_legs%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_slug pg_catalog.text;
  v_local pg_catalog.text;
  v_quote public.price_snapshots%rowtype;
begin
  select s.*
    into v_quote
    from public.price_snapshots as s
   where s.id = p_quote_snapshot_id;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  if v_quote.booking_id is null then
    update public.price_snapshots
       set booking_id = p_booking_id
     where id = p_quote_snapshot_id
       and booking_id is null;
  elsif v_quote.booking_id is distinct from p_booking_id then
    raise exception 'snapshot-mismatch' using errcode = 'restrict_violation';
  end if;

  update public.bookings
     set contact_name = coalesce(p_payload ->> 'contact_name', contact_name),
         contact_email = coalesce(p_payload ->> 'contact_email', contact_email),
         contact_phone = coalesce(p_payload ->> 'contact_phone', contact_phone),
         note = coalesce(p_payload ->> 'note', note),
         price_snapshot_id = p_quote_snapshot_id,
         updated_at = pg_catalog.now()
   where id = p_booking_id;

  select l.*
    into v_leg
    from public.booking_legs as l
   where l.booking_id = p_booking_id
   order by l.leg_seq
   limit 1
     for update;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  v_slug := nullif(p_payload ->> 'vehicle_class_slug', '');
  v_local := nullif(p_payload ->> 'scheduled_local', '');

  update public.booking_legs
     set pickup_text = coalesce(nullif(p_payload ->> 'pickup_text', ''), pickup_text),
         dropoff_text = coalesce(nullif(p_payload ->> 'dropoff_text', ''), dropoff_text),
         flight_no = coalesce(nullif(p_payload ->> 'flight_no', ''), flight_no),
         scheduled_local = coalesce(v_local, scheduled_local),
         scheduled_at = case
                          when v_local is null then scheduled_at
                          else (v_local::pg_catalog.timestamp at time zone 'Europe/Zurich')
                        end,
         pax = coalesce((p_payload ->> 'pax')::pg_catalog.int2, pax),
         bags = coalesce((p_payload ->> 'bags')::pg_catalog.int2, bags),
         vehicle_class_id = case
                              when v_slug is null then vehicle_class_id
                              else coalesce(
                                (select vc.id from public.vehicle_classes as vc where vc.slug = v_slug limit 1),
                                vehicle_class_id
                              )
                            end,
         updated_at = pg_catalog.now()
   where id = v_leg.id;

  select l.*
    into v_leg
    from public.booking_legs as l
   where l.id = v_leg.id;

  if v_leg.assigned_vehicle_id is not null then
    select v.*
      into v_vehicle
      from public.vehicles as v
     where v.id = v_leg.assigned_vehicle_id;
    if found and (v_vehicle.seats < v_leg.pax or v_vehicle.bags < v_leg.bags) then
      raise exception 'capacity' using errcode = 'P0001';
    end if;
  end if;

  insert into public.booking_events (
    booking_id, kind, actor_kind, actor_id, actor_label, snapshot_id, payload
  ) values (
    p_booking_id,
    'booking.modified',
    p_actor_kind,
    p_actor_id,
    p_actor_label,
    p_quote_snapshot_id,
    p_payload
  );

  insert into public.booking_events (
    booking_id, kind, actor_kind, actor_id, actor_label, snapshot_id, payload
  ) values (
    p_booking_id,
    'price.repriced',
    p_actor_kind,
    p_actor_id,
    p_actor_label,
    p_quote_snapshot_id,
    pg_catalog.jsonb_build_object('quote_snapshot_id', p_quote_snapshot_id)
  );
end;
$$;

revoke all on function public.booking_edit_apply_payload(
  pg_catalog.uuid, pg_catalog.int8, pg_catalog.jsonb, pg_catalog.uuid, pg_catalog.text, pg_catalog.text
) from public;

grant execute on function public.booking_edit_apply_payload(
  pg_catalog.uuid, pg_catalog.int8, pg_catalog.jsonb, pg_catalog.uuid, pg_catalog.text, pg_catalog.text
) to vamos_system;

-- ---------------------------------------------------------------------------
-- Difference snapshot. total_rappen is the extra only. Unique quote_id so
-- price_snapshots_quote_class does not collide with the full-fare quote row.
-- ---------------------------------------------------------------------------

create function public.booking_edit_mint_extra_snapshot(
  p_booking_id pg_catalog.uuid,
  p_quote_snapshot_id pg_catalog.int8,
  p_original_snapshot_id pg_catalog.int8,
  p_difference_rappen public.rappen
)
returns pg_catalog.int8
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_quote public.price_snapshots%rowtype;
  v_id pg_catalog.int8;
  v_until pg_catalog.timestamptz;
begin
  if p_difference_rappen is null or p_difference_rappen <= 0 then
    raise exception 'invalid_difference' using errcode = 'check_violation';
  end if;

  select s.*
    into v_quote
    from public.price_snapshots as s
   where s.id = p_quote_snapshot_id;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  v_until := pg_catalog.now() + interval '24 hours';

  insert into public.price_snapshots (
    booking_id,
    supersedes_id,
    quote_id,
    vehicle_class_id,
    rate_version_id,
    rate_version_is_live,
    settings_version_id,
    engine_version,
    source,
    currency,
    display_currency,
    subtotal_rappen,
    surcharges_rappen,
    discount_rappen,
    total_rappen,
    distance_km,
    duration_min,
    pax,
    bags,
    lines,
    policy,
    shown_alternatives,
    expires_at,
    quote_lock_expires_at
  ) values (
    p_booking_id,
    p_original_snapshot_id,
    pg_catalog.gen_random_uuid(),
    v_quote.vehicle_class_id,
    v_quote.rate_version_id,
    v_quote.rate_version_is_live,
    v_quote.settings_version_id,
    v_quote.engine_version,
    'modification',
    v_quote.currency,
    v_quote.display_currency,
    p_difference_rappen,
    0,
    0,
    p_difference_rappen,
    v_quote.distance_km,
    v_quote.duration_min,
    v_quote.pax,
    v_quote.bags,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'seq', 1,
        'code', 'extra_fare',
        'kind', 'fare',
        'i18n_key', 'price.line.extra',
        'amount_rappen', p_difference_rappen
      )
    ),
    v_quote.policy,
    '[]'::pg_catalog.jsonb,
    v_until,
    v_until
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.booking_edit_mint_extra_snapshot(
  pg_catalog.uuid, pg_catalog.int8, pg_catalog.int8, public.rappen
) from public;

grant execute on function public.booking_edit_mint_extra_snapshot(
  pg_catalog.uuid, pg_catalog.int8, pg_catalog.int8, public.rappen
) to vamos_system;

-- Clone the bound snapshot at a new total (quote-engine amount). Same-price
-- edits pass the original total. Never invents a CHF literal.

create function public.booking_edit_clone_quote_snapshot(
  p_booking_id pg_catalog.uuid,
  p_total_rappen public.rappen,
  p_quote_id pg_catalog.uuid
)
returns pg_catalog.int8
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_src public.price_snapshots%rowtype;
  v_id pg_catalog.int8;
  v_until pg_catalog.timestamptz;
begin
  select s.*
    into v_src
    from public.bookings as b
    join public.price_snapshots as s on s.id = b.price_snapshot_id
   where b.id = p_booking_id;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  if p_total_rappen is null then
    p_total_rappen := v_src.total_rappen;
  end if;

  if p_total_rappen is null or p_total_rappen < 0 then
    raise exception 'invalid_difference' using errcode = 'check_violation';
  end if;

  if v_src.total_rappen is not distinct from p_total_rappen
     and v_src.booking_id is not distinct from p_booking_id then
    return v_src.id;
  end if;

  v_until := pg_catalog.now() + interval '24 hours';

  insert into public.price_snapshots (
    booking_id,
    supersedes_id,
    quote_id,
    vehicle_class_id,
    rate_version_id,
    rate_version_is_live,
    settings_version_id,
    engine_version,
    source,
    currency,
    display_currency,
    subtotal_rappen,
    surcharges_rappen,
    discount_rappen,
    total_rappen,
    distance_km,
    duration_min,
    pax,
    bags,
    lines,
    policy,
    shown_alternatives,
    expires_at,
    quote_lock_expires_at
  ) values (
    p_booking_id,
    v_src.id,
    coalesce(p_quote_id, pg_catalog.gen_random_uuid()),
    v_src.vehicle_class_id,
    v_src.rate_version_id,
    v_src.rate_version_is_live,
    v_src.settings_version_id,
    v_src.engine_version,
    'modification',
    v_src.currency,
    v_src.display_currency,
    p_total_rappen,
    0,
    0,
    p_total_rappen,
    v_src.distance_km,
    v_src.duration_min,
    v_src.pax,
    v_src.bags,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'seq', 1,
        'code', 'distance_fare',
        'kind', 'fare',
        'i18n_key', 'price.line.transfer',
        'amount_rappen', p_total_rappen
      )
    ),
    v_src.policy,
    coalesce(v_src.shown_alternatives, '[]'::pg_catalog.jsonb),
    v_until,
    v_until
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.booking_edit_clone_quote_snapshot(
  pg_catalog.uuid, public.rappen, pg_catalog.uuid
) from public;

grant execute on function public.booking_edit_clone_quote_snapshot(
  pg_catalog.uuid, public.rappen, pg_catalog.uuid
) to vamos_system;

-- ---------------------------------------------------------------------------
-- Upsert requested row. Supersedes the previous requested row (D-73).
-- ---------------------------------------------------------------------------

create function public.booking_edit_request_upsert(
  p_booking_id pg_catalog.uuid,
  p_actor pg_catalog.text,
  p_actor_id pg_catalog.uuid,
  p_payload pg_catalog.jsonb,
  p_quote_snapshot_id pg_catalog.int8
)
returns table (
  request_id pg_catalog.uuid,
  superseded_id pg_catalog.uuid,
  old_extra_session_id pg_catalog.text,
  old_extra_snapshot_id pg_catalog.int8
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_booking public.bookings%rowtype;
  v_prev public.booking_edit_requests%rowtype;
  v_id pg_catalog.uuid;
begin
  if p_actor is distinct from 'customer' and p_actor is distinct from 'staff' then
    raise exception 'invalid_actor' using errcode = 'check_violation';
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

  if not exists (
    select 1
      from public.booking_payments as p
     where p.booking_id = v_booking.id
       and p.captured_at is not null
  ) then
    raise exception 'unpaid' using errcode = 'P0001';
  end if;

  select r.*
    into v_prev
    from public.booking_edit_requests as r
   where r.booking_id = v_booking.id
     and r.status = 'requested'
   for update;

  if found then
    update public.booking_edit_requests
       set status = 'superseded'
     where id = v_prev.id;
  end if;

  insert into public.booking_edit_requests (
    booking_id, actor, actor_id, payload, quote_snapshot_id, status
  ) values (
    v_booking.id, p_actor, p_actor_id, coalesce(p_payload, '{}'::pg_catalog.jsonb), p_quote_snapshot_id, 'requested'
  )
  returning id into v_id;

  return query
    select v_id,
           v_prev.id,
           v_prev.extra_session_id,
           v_prev.extra_snapshot_id;
end;
$$;

revoke all on function public.booking_edit_request_upsert(
  pg_catalog.uuid, pg_catalog.text, pg_catalog.uuid, pg_catalog.jsonb, pg_catalog.int8
) from public;

grant execute on function public.booking_edit_request_upsert(
  pg_catalog.uuid, pg_catalog.text, pg_catalog.uuid, pg_catalog.jsonb, pg_catalog.int8
) to vamos_system;

comment on function public.booking_edit_request_upsert(
  pg_catalog.uuid, pg_catalog.text, pg_catalog.uuid, pg_catalog.jsonb, pg_catalog.int8
) is
  '08-07 D-73: insert requested paid-edit; supersede previous requested row. Unpaid refused. EXECUTE vamos_system only.';

-- ---------------------------------------------------------------------------
-- Ops accept: same-price apply, extra_required, or refund outcome. No Stripe.
-- ---------------------------------------------------------------------------

create function public.booking_edit_request_accept(
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
begin
  select r.*
    into v_req
    from public.booking_edit_requests as r
   where r.id = p_request_id
     for update;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  if v_req.status is distinct from 'requested' then
    raise exception 'not-requested' using errcode = 'P0001';
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

  select p.*
    into v_pay
    from public.booking_payments as p
   where p.booking_id = v_booking.id
     and p.captured_at is not null
   order by p.captured_at
   limit 1
     for update;

  if not found then
    raise exception 'unpaid' using errcode = 'P0001';
  end if;

  select s.*
    into v_quote
    from public.price_snapshots as s
   where s.id = v_req.quote_snapshot_id;

  if not found or v_quote.total_rappen is null then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  v_diff := v_quote.total_rappen - v_pay.charged_rappen;

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

  if v_diff = 0 then
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
    v_outcome := 'applied';
  elsif v_diff > 0 then
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
  elsif v_hours > 24 then
    v_outcome := 'refund_immediate';
  else
    v_outcome := 'refund_click';
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

comment on function public.booking_edit_request_accept(
  pg_catalog.uuid, pg_catalog.uuid
) is
  '08-07: ops accept. Same price applies. Higher returns extra_required (trip unchanged). Lower: refund_immediate (>24h) or refund_click. EXECUTE vamos_system only.';

create function public.booking_edit_request_set_extra_session(
  p_request_id pg_catalog.uuid,
  p_extra_session_id pg_catalog.text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.booking_edit_requests
     set extra_session_id = p_extra_session_id
   where id = p_request_id
     and status = 'requested';
  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.booking_edit_request_set_extra_session(
  pg_catalog.uuid, pg_catalog.text
) from public;

grant execute on function public.booking_edit_request_set_extra_session(
  pg_catalog.uuid, pg_catalog.text
) to vamos_system;

-- ---------------------------------------------------------------------------
-- Difference refund record. Does not mark the booking refunded. Stripe first.
-- ---------------------------------------------------------------------------

create function public.booking_edit_refund_record(
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

  select r.*
    into v_req
    from public.booking_edit_requests as r
   where r.id = p_request_id
     for update;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
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

  select p.*
    into v_pay
    from public.booking_payments as p
   where p.booking_id = v_booking.id
     and p.captured_at is not null
   order by p.captured_at
   limit 1
     for update;

  if not found then
    raise exception 'unpaid' using errcode = 'P0001';
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
-- Extra settle: insert payment against the difference snapshot. Do not run
-- pending→paid→confirmed. Trip columns apply in this same transaction.
-- Temp-rebind bookings.price_snapshot_id so tg_payment_matches_snapshot
-- (unchanged) accepts the extra snapshot, then bind the new full quote.
-- ---------------------------------------------------------------------------

create function public.checkout_extra_payment_settle(
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
  already_settled pg_catalog.bool
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
begin
  if p_outcome is distinct from 'succeeded'
     and p_outcome is distinct from 'failed'
     and p_outcome is distinct from 'canceled' then
    raise exception 'invalid_outcome' using errcode = 'check_violation';
  end if;

  if p_session_id is null or pg_catalog.btrim(p_session_id) = '' then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;

  select r.*
    into v_req
    from public.booking_edit_requests as r
   where r.extra_session_id = p_session_id
   for update;

  if not found then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;

  select b.*
    into v_booking
    from public.bookings as b
   where b.id = v_req.booking_id
     for update;

  if v_req.extra_payment_id is not null then
    select p.*
      into v_pay
      from public.booking_payments as p
     where p.id = v_req.extra_payment_id
       for update;
    if v_pay.status = 'succeeded' and p_outcome = 'succeeded' then
      update public.stripe_events
         set processed_at = pg_catalog.now()
       where id = p_event_id;
      return query
        select v_booking.id,
               v_booking.reference,
               v_booking.locale,
               v_booking.contact_email::pg_catalog.text,
               true;
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
    update public.stripe_events
       set processed_at = pg_catalog.now()
     where id = p_event_id;
    return query
      select v_booking.id,
             v_booking.reference,
             v_booking.locale,
             v_booking.contact_email::pg_catalog.text,
             false;
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

  -- Charge gate requires bookings.price_snapshot_id = extra snapshot. Restore
  -- via apply_payload which binds the new full-fare quote snapshot.
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

  perform public.booking_edit_apply_payload(
    v_booking.id,
    v_req.quote_snapshot_id,
    v_req.payload,
    v_req.actor_id,
    case when v_req.actor = 'staff' then 'staff' else 'customer' end,
    v_actor_label
  );

  update public.booking_edit_requests
     set status = 'accepted',
         accepted_at = pg_catalog.now(),
         extra_payment_id = v_pay.id
   where id = v_req.id;

  -- Booking status is intentionally untouched (no pending→paid→confirmed).

  update public.stripe_events
     set processed_at = pg_catalog.now()
   where id = p_event_id;

  return query
    select v_booking.id,
           v_booking.reference,
           v_booking.locale,
           v_booking.contact_email::pg_catalog.text,
           false;
end;
$$;

revoke all on function public.checkout_extra_payment_settle(
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

grant execute on function public.checkout_extra_payment_settle(
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

comment on function public.checkout_extra_payment_settle(
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
  '08-07 D-67/D-69: insert extra payment against the difference snapshot; apply payload; never rewind confirmed to pending. EXECUTE vamos_system only.';

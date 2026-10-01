-- 20261007150000_trip_change_reprice.sql
--
-- 26.2 P6: a place and time change on a PAID trip is re-priced and works. Plan signed by the owner
-- (.planning/quick/261001-p6-paid-trip-edit/PLAN.md), decisions D1-D16
-- (.planning/decisions/2026-10-01-p6-paid-trip-edit.md). P6 extends P1's machine
-- (20261007140000_class_change_reprice.sql): the same staff request, the same accept (difference
-- against everything paid minus refunds; dearer waits for the payment of the difference; cheaper is
-- "Refund due"), the same extra settle and withdraw. No second set.
--
--   (1)  booking_edit_apply_payload     create or replace, P1's body (20261007140000) changed:
--                                       a new place also writes its Mapbox place id and coordinates;
--                                       a new route writes its duration (estimated_duration_minutes,
--                                       which the overlap guard reads). Who leaves the trip is
--                                       decided BEFORE the leg moves (the GiST overlap guard checks
--                                       every statement): a class change (P1 D6), the owner's
--                                       "take off" (payload driver = unassign, D7), or a kept driver
--                                       (payload driver = keep) whose new time now overlaps another
--                                       of his trips (only possible between confirm and payment; the
--                                       payment must be recorded, so he comes off instead of the
--                                       webhook failing). A payload with no driver choice (a
--                                       customer's time change) keeps the old rule: an overlap is
--                                       refused (23P01 -> must-fix).
--   (2)  app.booking_change_mint_trip_snapshot  the price record of a trip change: with a new price
--                                       (new places or class) the given lines, total, live book,
--                                       the NEW distance and duration and the class totals of the
--                                       new trip; without one (date, time, party inside the class:
--                                       D1, D5) a copy of the bound record with the new party.
--   (3)  booking_staff_trip_change      the dashboard's trip change (places, date, time, party, and
--                                       the class with them): rules, (2), a staff request, then
--                                       P1's accept (priced) or the apply at once (no new price).
--   (4)  booking_change_request_facts   definer read: what a change changed and who drives now (the
--                                       driver's e-mail after the difference is paid).
--   (5)  booking_staff_contact_update   name, e-mail, phone, note and flight saved at once and
--                                       recorded in booking_events (D6, D8). Replaces the in-place
--                                       write of the PATCH route (which never recorded anything and
--                                       wrote trip fields without a price).
--   (6)  manage_money_for               create or replace, body of 20260930190000 + key
--                                       last_change ('class' | 'trip' | null): the customer page
--                                       picks the approved refund line (P1 class line or D15).
--
-- Safe on real paid bookings: no existing row is inserted, updated or deleted by this file; no
-- column, no constraint, no backfill. A booking changes only when the owner confirms a change (or
-- the customer pays a difference he asked for). Every function is SECURITY DEFINER with
-- search_path ''. New public functions: EXECUTE vamos_system only. app.* helper: no grant.
-- Replaced bodies keep their signature, grants and comments' meaning. No CHF amount here.
--
-- Open (D11, owner answered "Keep him on both"): the table constraint
-- booking_legs_chauffeur_no_overlap refuses one driver on two overlapping trips at every
-- statement and at COMMIT. Honouring "Keep" on an overlap needs that constraint changed, which this
-- file does not do (stopped and reported, HANDOVER.md). Until then (3) refuses Keep on a real
-- overlap with 'driver-overlap'; "Take off" works.

-- ---------------------------------------------------------------------------
-- (1) booking_edit_apply_payload -- body of 20261007140000 (P1), changed as listed above.
-- ---------------------------------------------------------------------------
create or replace function public.booking_edit_apply_payload(
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
  v_payload pg_catalog.jsonb;
  v_leg public.booking_legs%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_slug pg_catalog.text;
  v_class_id pg_catalog.uuid;
  v_local pg_catalog.text;
  v_quote public.price_snapshots%rowtype;
  v_prev_class pg_catalog.uuid;
  v_prev_chauffeur pg_catalog.uuid;
  v_prev_vehicle pg_catalog.uuid;
  -- 26.2 P6
  v_pickup_moves pg_catalog.bool;
  v_dropoff_moves pg_catalog.bool;
  v_new_at pg_catalog.timestamptz;
  v_new_minutes pg_catalog.int4;
  v_range pg_catalog.tstzrange;
  v_off_reason pg_catalog.text;
begin
  v_payload := app.edit_payload_object(p_payload);

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
     set contact_name = coalesce(v_payload ->> 'contact_name', contact_name),
         contact_email = coalesce(v_payload ->> 'contact_email', contact_email),
         contact_phone = coalesce(v_payload ->> 'contact_phone', contact_phone),
         note = coalesce(v_payload ->> 'note', note),
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

  v_prev_class := v_leg.vehicle_class_id;
  v_prev_chauffeur := v_leg.assigned_chauffeur_id;
  v_prev_vehicle := v_leg.assigned_vehicle_id;

  v_slug := nullif(v_payload ->> 'vehicle_class_slug', '');
  v_local := nullif(v_payload ->> 'scheduled_local', '');

  if v_slug is not null then
    select vc.id into v_class_id from public.vehicle_classes as vc where vc.slug = v_slug limit 1;
    -- 26.2 P1: a class the database does not know is refused; it used to keep the old class
    -- without a word, so a change that named a display name did nothing.
    if v_class_id is null then
      raise exception 'unknown-class' using errcode = 'P0001';
    end if;
  end if;

  -- 26.2 P6: a new place is a whole place (text, coordinates, Mapbox id), never text alone.
  v_pickup_moves := v_payload ? 'pickup_lat' or v_payload ? 'pickup_lng';
  v_dropoff_moves := v_payload ? 'dropoff_lat' or v_payload ? 'dropoff_lng';
  if (v_pickup_moves and (nullif(v_payload ->> 'pickup_lat', '') is null
                          or nullif(v_payload ->> 'pickup_lng', '') is null))
     or (v_dropoff_moves and (nullif(v_payload ->> 'dropoff_lat', '') is null
                              or nullif(v_payload ->> 'dropoff_lng', '') is null)) then
    raise exception 'invalid-payload' using errcode = '22023';
  end if;

  v_new_at := case
                when v_local is null then v_leg.scheduled_at
                else (v_local::pg_catalog.timestamp at time zone 'Europe/Zurich')
              end;
  v_new_minutes := coalesce((v_payload ->> 'estimated_duration_minutes')::pg_catalog.int4,
                            v_leg.estimated_duration_minutes);

  -- Who leaves the trip, decided before the leg moves (the overlap guard checks every statement).
  if v_prev_chauffeur is not null or v_prev_vehicle is not null then
    if v_class_id is not null and v_class_id is distinct from v_prev_class then
      -- D6 (owner, 2026-09-30): the class changed -> the trip goes back to unassigned.
      v_off_reason := 'class_change';
    elsif v_payload ->> 'driver' = 'unassign' then
      -- P6 D7: the owner chose "take him off this trip".
      v_off_reason := 'trip_change';
    elsif v_payload ->> 'driver' = 'keep' then
      -- P6 D7: kept. The change was checked for a clash when it was confirmed; a trip given to him
      -- since (before the customer paid the difference) can overlap the new time now. The payment
      -- is recorded either way: he comes off this trip and is told.
      v_range := pg_catalog.tstzrange(
        v_new_at,
        v_new_at + (greatest(coalesce(v_new_minutes, 0), 30)
                    + coalesce(v_leg.turnaround_buffer_minutes, 0)) * interval '1 minute',
        '[)'
      );
      if exists (
        select 1
          from public.booking_legs as o
         where o.id <> v_leg.id
           and o.status not in ('cancelled'::public.booking_status, 'no_show'::public.booking_status)
           and ((v_prev_chauffeur is not null and o.assigned_chauffeur_id = v_prev_chauffeur)
                or (v_prev_vehicle is not null and o.assigned_vehicle_id = v_prev_vehicle))
           and o.scheduled_range && v_range
      ) then
        v_off_reason := 'overlap';
      end if;
    end if;
  end if;

  if v_off_reason is not null then
    -- Same writes and event as ops_unassign_leg; the Worker sends the existing "trip taken off" mail.
    update public.booking_legs
       set assigned_chauffeur_id = null,
           assigned_vehicle_id = null,
           status = case
             when status = 'assigned'::public.booking_status then 'confirmed'::public.booking_status
             else status
           end,
           updated_at = pg_catalog.now()
     where id = v_leg.id;

    update public.bookings
       set status = case
             when status = 'assigned'::public.booking_status then 'confirmed'::public.booking_status
             else status
           end,
           updated_at = pg_catalog.now()
     where id = p_booking_id;

    insert into public.booking_events (
      booking_id, booking_leg_id, kind, actor_kind, actor_id, actor_label, payload
    ) values (
      p_booking_id,
      v_leg.id,
      'assignment.cleared',
      p_actor_kind,
      p_actor_id,
      coalesce(p_actor_label, ''),
      pg_catalog.jsonb_build_object(
        'chauffeur_id', v_prev_chauffeur,
        'vehicle_id', v_prev_vehicle,
        'reason', v_off_reason
      )
    );
  end if;

  update public.booking_legs
     set pickup_text = coalesce(nullif(v_payload ->> 'pickup_text', ''), pickup_text),
         pickup_place_id = case when v_pickup_moves then nullif(v_payload ->> 'pickup_place_id', '') else pickup_place_id end,
         pickup_lat = case when v_pickup_moves then (v_payload ->> 'pickup_lat')::pg_catalog.numeric else pickup_lat end,
         pickup_lng = case when v_pickup_moves then (v_payload ->> 'pickup_lng')::pg_catalog.numeric else pickup_lng end,
         dropoff_text = coalesce(nullif(v_payload ->> 'dropoff_text', ''), dropoff_text),
         dropoff_place_id = case when v_dropoff_moves then nullif(v_payload ->> 'dropoff_place_id', '') else dropoff_place_id end,
         dropoff_lat = case when v_dropoff_moves then (v_payload ->> 'dropoff_lat')::pg_catalog.numeric else dropoff_lat end,
         dropoff_lng = case when v_dropoff_moves then (v_payload ->> 'dropoff_lng')::pg_catalog.numeric else dropoff_lng end,
         estimated_duration_minutes = v_new_minutes,
         flight_no = coalesce(nullif(v_payload ->> 'flight_no', ''), flight_no),
         scheduled_local = coalesce(v_local, scheduled_local),
         scheduled_at = v_new_at,
         pax = coalesce((v_payload ->> 'pax')::pg_catalog.int2, pax),
         bags = coalesce((v_payload ->> 'bags')::pg_catalog.int2, bags),
         vehicle_class_id = coalesce(v_class_id, vehicle_class_id),
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
    v_payload
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

comment on function public.booking_edit_apply_payload(
  pg_catalog.uuid, pg_catalog.int8, pg_catalog.jsonb, pg_catalog.uuid, pg_catalog.text, pg_catalog.text
) is
  '08-07 + 26.2 P1 + P6: apply an accepted paid-edit payload (a JSON string payload is read as its object). A new place writes text, Mapbox place id and coordinates; a new route its duration. The driver comes off (event assignment.cleared) on a class change (reason class_change), on the owner''s choice (payload driver = unassign, reason trip_change) or when a kept driver (payload driver = keep) now overlaps another of his trips (reason overlap). A payload with no driver choice keeps the old rule: overlap (23P01) and capacity raise; the trip is not auto-cancelled (D-75). Does not change booking.status except assigned -> confirmed when the driver comes off. Unknown class: unknown-class; a place without coordinates: invalid-payload. EXECUTE vamos_system only.';

-- ---------------------------------------------------------------------------
-- (2) app.booking_change_mint_trip_snapshot
-- ---------------------------------------------------------------------------
create function app.booking_change_mint_trip_snapshot(
  p_booking_id pg_catalog.uuid,
  p_vehicle_class_id pg_catalog.uuid,
  p_rate_version_id pg_catalog.int8,
  p_total_rappen pg_catalog.int4,
  p_lines pg_catalog.jsonb,
  p_engine_version pg_catalog.text,
  p_actor_id pg_catalog.uuid,
  p_distance_km pg_catalog.numeric,
  p_duration_min pg_catalog.int4,
  p_shown_alternatives pg_catalog.jsonb,
  p_pax pg_catalog.int2,
  p_bags pg_catalog.int2
)
returns pg_catalog.int8
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_src public.price_snapshots%rowtype;
  v_id pg_catalog.int8;
  v_until pg_catalog.timestamptz := pg_catalog.now() + interval '24 hours';
  v_priced pg_catalog.bool := p_lines is not null;
  v_shown pg_catalog.jsonb;
begin
  select s.*
    into v_src
    from public.bookings as b
    join public.price_snapshots as s on s.id = b.price_snapshot_id
   where b.id = p_booking_id;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  if v_priced and (p_total_rappen is null or p_total_rappen < 0 or p_rate_version_id is null
                   or pg_catalog.jsonb_typeof(p_lines) is distinct from 'array'
                   or pg_catalog.jsonb_array_length(p_lines) = 0) then
    raise exception 'invalid-price' using errcode = '22023';
  end if;

  if p_shown_alternatives is not null and pg_catalog.jsonb_typeof(p_shown_alternatives) is distinct from 'array' then
    raise exception 'invalid-price' using errcode = '22023';
  end if;

  v_shown := case
               -- A new route: the class totals of the NEW trip pin its distance for the next change.
               when p_distance_km is not null then coalesce(p_shown_alternatives, '[]'::pg_catalog.jsonb)
               -- Same route, same book: the totals the customer was shown still hold.
               when not v_priced or p_rate_version_id = v_src.rate_version_id
                 then coalesce(v_src.shown_alternatives, '[]'::pg_catalog.jsonb)
               else '[]'::pg_catalog.jsonb
             end;

  insert into public.price_snapshots (
    booking_id, supersedes_id, quote_id, vehicle_class_id, rate_version_id, rate_version_is_live,
    settings_version_id, engine_version, computed_by, source, currency, display_currency,
    subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
    distance_km, duration_min, pax, bags, coupon_id, coupon_code,
    lines, policy, shown_alternatives, expires_at, quote_lock_expires_at
  ) values (
    p_booking_id,
    v_src.id,
    pg_catalog.gen_random_uuid(),
    case when v_priced then p_vehicle_class_id else v_src.vehicle_class_id end,
    case when v_priced then p_rate_version_id else v_src.rate_version_id end,
    true,  -- overwritten by tg_snapshot_rate_version_flag with the truth
    v_src.settings_version_id,
    case when v_priced then coalesce(nullif(pg_catalog.btrim(p_engine_version), ''), v_src.engine_version)
         else v_src.engine_version end,
    p_actor_id,
    'modification',
    v_src.currency,
    v_src.display_currency,
    case when v_priced then p_total_rappen else v_src.subtotal_rappen end,
    case when v_priced then 0 else v_src.surcharges_rappen end,
    case when v_priced then 0 else v_src.discount_rappen end,
    case when v_priced then p_total_rappen else v_src.total_rappen end,
    coalesce(p_distance_km, v_src.distance_km),
    coalesce(p_duration_min, v_src.duration_min),
    coalesce(p_pax, v_src.pax),
    coalesce(p_bags, v_src.bags),
    v_src.coupon_id,
    v_src.coupon_code,
    case when v_priced then p_lines else v_src.lines end,
    v_src.policy,
    v_shown,
    v_until,
    v_until
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function app.booking_change_mint_trip_snapshot(
  pg_catalog.uuid, pg_catalog.uuid, pg_catalog.int8, pg_catalog.int4, pg_catalog.jsonb, pg_catalog.text,
  pg_catalog.uuid, pg_catalog.numeric, pg_catalog.int4, pg_catalog.jsonb, pg_catalog.int2, pg_catalog.int2
) from public;

comment on function app.booking_change_mint_trip_snapshot(
  pg_catalog.uuid, pg_catalog.uuid, pg_catalog.int8, pg_catalog.int4, pg_catalog.jsonb, pg_catalog.text,
  pg_catalog.uuid, pg_catalog.numeric, pg_catalog.int4, pg_catalog.jsonb, pg_catalog.int2, pg_catalog.int2
) is
  '26.2 P6: the price record of a trip change (source modification, supersedes the bound record). Priced (lines given): the given class, live rate version, lines and total (reconcile trigger checks the sum), the new distance and duration when the route changed, and the class totals of the new trip. Not priced (date, time or party inside the class: D1, D5): a copy of the bound record with the new party. No grant.';

-- ---------------------------------------------------------------------------
-- (3) booking_staff_trip_change
-- ---------------------------------------------------------------------------
create function public.booking_staff_trip_change(
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
  -- new time or a longer route that overlaps another of his trips needs the owner's choice.
  v_has_driver := v_leg.assigned_chauffeur_id is not null or v_leg.assigned_vehicle_id is not null;
  if v_has_driver and not v_class_change then
    v_new_minutes := coalesce((v_trip ->> 'estimated_duration_minutes')::pg_catalog.int4, v_leg.estimated_duration_minutes);
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
         and ((v_leg.assigned_chauffeur_id is not null and o.assigned_chauffeur_id = v_leg.assigned_chauffeur_id)
              or (v_leg.assigned_vehicle_id is not null and o.assigned_vehicle_id = v_leg.assigned_vehicle_id))
         and o.scheduled_range && v_range
    );
    if v_clash and p_driver is null then
      raise exception 'driver-choice-needed' using errcode = 'P0001';
    end if;
    if v_clash and p_driver = 'keep' then
      -- D11 (owner: keep him on both) needs booking_legs_chauffeur_no_overlap changed; not done here.
      raise exception 'driver-overlap' using errcode = 'P0001';
    end if;
  end if;

  v_payload := v_trip;
  if v_class_change then
    v_payload := v_payload || pg_catalog.jsonb_build_object('vehicle_class_slug', v_class.slug);
  elsif v_has_driver then
    v_payload := v_payload || pg_catalog.jsonb_build_object('driver', coalesce(p_driver, 'keep'));
  end if;

  v_snap := app.booking_change_mint_trip_snapshot(
    v_booking.id, v_class.id, p_rate_version_id, p_total_rappen, p_lines, p_engine_version, p_actor_id,
    p_distance_km, p_duration_min, p_shown_alternatives, v_pax, v_bags
  );

  select u.request_id, u.old_extra_session_id, u.old_extra_snapshot_id
    into v_request, v_old_session, v_old_extra
    from public.booking_edit_request_upsert(v_booking.id, 'staff', p_actor_id, v_payload, v_snap) as u;

  if v_priced then
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

grant execute on function public.booking_staff_trip_change(
  pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.jsonb, pg_catalog.int8, pg_catalog.int4,
  pg_catalog.jsonb, pg_catalog.text, pg_catalog.numeric, pg_catalog.int4, pg_catalog.jsonb, pg_catalog.int4,
  pg_catalog.text
) to vamos_system;

comment on function public.booking_staff_trip_change(
  pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.jsonb, pg_catalog.int8, pg_catalog.int4,
  pg_catalog.jsonb, pg_catalog.text, pg_catalog.numeric, pg_catalog.int4, pg_catalog.jsonb, pg_catalog.int4,
  pg_catalog.text
) is
  '26.2 P6: the admin''s change of places, date, time or party (and the class with them) on a paid trip. Same rules as booking_staff_change (paid, confirmed/assigned, before pickup, no refund in flight, no waiting customer request), plus: trip fields whitelisted, a new place whole (text, coordinates, route duration and distance), a new time in the future, party within the target class, a price for new places or class only (today''s live book), paid-net as previewed, a clash with another trip of the assigned driver needs the owner''s choice (Keep on a real overlap: driver-overlap, D11 open). Writes the price record, a staff request and either accepts it (priced: applied / refund_due / extra_required) or applies it at once (no new price). Refusals: not-found, unpaid, not-editable, too-late, refund-open, customer-request-waiting, invalid-change, past-time, unknown-class, no-change, class-too-small, price-book-changed, paid-changed, driver-choice-needed, driver-overlap. EXECUTE vamos_system only.';

-- ---------------------------------------------------------------------------
-- (4) booking_change_request_facts: what a change changed, and who drives the trip now.
-- ---------------------------------------------------------------------------
create function public.booking_change_request_facts(p_request_id pg_catalog.uuid)
returns table (
  booking_id pg_catalog.uuid,
  places_changed pg_catalog.bool,
  time_changed pg_catalog.bool,
  party_changed pg_catalog.bool,
  class_changed pg_catalog.bool,
  assigned_chauffeur_id pg_catalog.uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.booking_id,
         (x.p ? 'pickup_lat' or x.p ? 'dropoff_lat'),
         (x.p ? 'scheduled_local'),
         (x.p ? 'pax' or x.p ? 'bags'),
         (x.p ? 'vehicle_class_slug'),
         l.assigned_chauffeur_id
    from public.booking_edit_requests as r
    cross join lateral (
      select case when pg_catalog.jsonb_typeof(r.payload) = 'object' then r.payload
                  else '{}'::pg_catalog.jsonb end as p
    ) as x
    join public.booking_legs as l on l.booking_id = r.booking_id and l.leg_seq = 1
   where r.id = p_request_id
   limit 1
$$;

revoke all on function public.booking_change_request_facts(pg_catalog.uuid) from public;
revoke all on function public.booking_change_request_facts(pg_catalog.uuid) from anon;
revoke all on function public.booking_change_request_facts(pg_catalog.uuid) from authenticated;
grant execute on function public.booking_change_request_facts(pg_catalog.uuid) to vamos_system;

comment on function public.booking_change_request_facts(pg_catalog.uuid) is
  '26.2 P6: for one change request, whether it changed a place, the time, the party or the class, and the driver on the first leg now. Read after the difference is paid (webhook), to send a kept driver the right existing e-mail. EXECUTE vamos_system only.';

-- ---------------------------------------------------------------------------
-- (5) booking_staff_contact_update: saved at once, recorded (D6, D8).
-- ---------------------------------------------------------------------------
create function public.booking_staff_contact_update(
  p_booking_id pg_catalog.uuid,
  p_actor_id pg_catalog.uuid,
  p_contact_name pg_catalog.text,
  p_contact_email pg_catalog.text,
  p_contact_phone pg_catalog.text,
  p_note pg_catalog.text,
  p_flight_no pg_catalog.text
)
returns table (
  booking_id pg_catalog.uuid,
  changed_fields pg_catalog.text,
  flight_changed pg_catalog.bool,
  assigned_chauffeur_id pg_catalog.uuid
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_b public.bookings%rowtype;
  v_leg public.booking_legs%rowtype;
  -- An emptied name, e-mail or phone keeps the stored value (26.2-u08); a note may be emptied.
  v_name pg_catalog.text := nullif(pg_catalog.btrim(coalesce(p_contact_name, '')), '');
  v_email pg_catalog.text := nullif(pg_catalog.btrim(coalesce(p_contact_email, '')), '');
  v_phone pg_catalog.text := nullif(pg_catalog.btrim(coalesce(p_contact_phone, '')), '');
  v_note pg_catalog.text := case when p_note is null then null else pg_catalog.btrim(p_note) end;
  v_flight pg_catalog.text := case when p_flight_no is null then null
                                   else nullif(pg_catalog.upper(pg_catalog.btrim(p_flight_no)), '') end;
  v_fields pg_catalog.jsonb := '[]'::pg_catalog.jsonb;
  v_flight_changed pg_catalog.bool := false;
  v_label pg_catalog.text;
  v_event pg_catalog.jsonb;
begin
  select b.* into v_b
    from public.bookings as b
   where b.id = p_booking_id
     and b.erased_at is null
     for update;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.booking_payments as p
     where p.booking_id = v_b.id and p.captured_at is not null
  ) then
    raise exception 'unpaid' using errcode = 'P0001';
  end if;

  select l.* into v_leg
    from public.booking_legs as l
   where l.booking_id = v_b.id
   order by l.leg_seq
   limit 1
     for update;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  if v_name is not null and v_name is distinct from v_b.contact_name then
    v_fields := v_fields || '["contact_name"]'::pg_catalog.jsonb;
  end if;
  if v_email is not null and v_email is distinct from v_b.contact_email::pg_catalog.text then
    v_fields := v_fields || '["contact_email"]'::pg_catalog.jsonb;
  end if;
  if v_phone is not null and v_phone is distinct from v_b.contact_phone then
    v_fields := v_fields || '["contact_phone"]'::pg_catalog.jsonb;
  end if;
  if v_note is not null and v_note is distinct from v_b.note then
    v_fields := v_fields || '["note"]'::pg_catalog.jsonb;
  end if;
  if p_flight_no is not null and v_flight is distinct from v_leg.flight_no then
    v_flight_changed := true;
  end if;

  if pg_catalog.jsonb_array_length(v_fields) > 0 then
    update public.bookings
       set contact_name = case when v_fields ? 'contact_name' then v_name else contact_name end,
           contact_email = case when v_fields ? 'contact_email' then v_email else contact_email end,
           contact_phone = case when v_fields ? 'contact_phone' then v_phone else contact_phone end,
           note = case when v_fields ? 'note' then v_note else note end,
           updated_at = pg_catalog.now()
     where id = v_b.id;
  end if;

  if v_flight_changed then
    update public.booking_legs
       set flight_no = v_flight,
           updated_at = pg_catalog.now()
     where id = v_leg.id;
    v_fields := v_fields || '["flight_no"]'::pg_catalog.jsonb;
  end if;

  if pg_catalog.jsonb_array_length(v_fields) > 0 then
    select coalesce(s.full_name, '') into v_label from public.staff as s where s.user_id = p_actor_id;
    -- The history names what changed; the values themselves stay on the booking (the flight
    -- number is recorded as booking_flight_write records it).
    v_event := pg_catalog.jsonb_build_object('via', 'staff_edit', 'fields', v_fields);
    if v_flight_changed then
      v_event := v_event || pg_catalog.jsonb_build_object('flight_no', v_flight);
    end if;
    insert into public.booking_events (
      booking_id, booking_leg_id, kind, actor_kind, actor_id, actor_label, payload
    ) values (
      v_b.id, v_leg.id, 'booking.modified', 'staff', p_actor_id, coalesce(v_label, ''), v_event
    );
  end if;

  return query
    select v_b.id,
           coalesce((select pg_catalog.string_agg(f, ',' order by o)
                       from pg_catalog.jsonb_array_elements_text(v_fields) with ordinality as e(f, o)), ''),
           v_flight_changed,
           v_leg.assigned_chauffeur_id;
end;
$$;

revoke all on function public.booking_staff_contact_update(
  pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text
) from public;

grant execute on function public.booking_staff_contact_update(
  pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text
) to vamos_system;

comment on function public.booking_staff_contact_update(
  pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text
) is
  '26.2 P6 (D6, D8): the admin saves name, e-mail, phone, note and flight number of a paid booking at once, with no new price. Null or empty name, e-mail, phone keep the stored value; a note may be emptied; an empty flight clears it (stored upper case). One booking.modified event names the fields that changed (and the new flight number). Returns the fields (comma text), whether the flight changed and the driver on the trip (for the existing flight-number e-mail). Never touches places, time, party or class. Refusals: not-found, unpaid. EXECUTE vamos_system only.';

-- ---------------------------------------------------------------------------
-- (6) manage_money_for -- body of 20260930190000, plus last_change.
-- ---------------------------------------------------------------------------
create or replace function public.manage_money_for(p_booking_id pg_catalog.uuid)
returns pg_catalog.jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'charged_rappen', bp.charged_rappen,
    'payment_method_type', bp.payment_method_type,
    'presentment_amount_minor', bp.presentment_amount_minor,
    'presentment_currency', bp.presentment_currency,
    'vehicle_class_name', (
      select vc.name
        from public.booking_legs as l
        join public.vehicle_classes as vc on vc.id = l.vehicle_class_id
       where l.booking_id = b.id
       order by l.leg_seq
       limit 1
    ),
    'lines', coalesce((
      select pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object(
                 'kind', e.line ->> 'kind',
                 'code', e.line ->> 'code',
                 'names', case
                   when pg_catalog.jsonb_typeof(e.line -> 'params' -> 'names') = 'object'
                   then pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
                          'en', e.line -> 'params' -> 'names' ->> 'en',
                          'de', e.line -> 'params' -> 'names' ->> 'de',
                          'fr', e.line -> 'params' -> 'names' ->> 'fr',
                          'ar', e.line -> 'params' -> 'names' ->> 'ar'))
                   else null
                 end,
                 'vat_rate_bps', case
                   when (e.line -> 'params' ->> 'vatRateBps') ~ '^[0-9]{1,5}$'
                   then (e.line -> 'params' ->> 'vatRateBps')::pg_catalog.int4
                   else null
                 end,
                 'amount_rappen', (e.line ->> 'amount_rappen')::pg_catalog.int8
               )
               order by e.ord)
        from public.price_snapshots as s
        cross join lateral pg_catalog.jsonb_array_elements(s.lines)
          with ordinality as e(line, ord)
       where s.id = b.price_snapshot_id
         and pg_catalog.jsonb_typeof(s.lines) = 'array'
    ), '[]'::pg_catalog.jsonb),
    -- 26.2 P6: the change that was applied last. 'class' when it changed the class only (P1's
    -- approved refund line names the class), 'trip' for any other change (D15), null when none.
    'last_change', (
      select case
               when pg_catalog.jsonb_typeof(r.payload) = 'object'
                and r.payload ? 'vehicle_class_slug'
                and not exists (
                  select 1 from pg_catalog.jsonb_object_keys(r.payload) as k(key)
                   where k.key <> 'vehicle_class_slug'
                ) then 'class'
               else 'trip'
             end
        from public.booking_edit_requests as r
       where r.booking_id = b.id
         and r.status = 'accepted'
       order by r.accepted_at desc nulls last, r.created_at desc
       limit 1
    )
  )
    from public.bookings as b
    join lateral (
      select p.*
        from public.booking_payments as p
       where p.booking_id = b.id
         and p.status = 'succeeded'
       order by p.captured_at desc nulls last, p.created_at desc
       limit 1
    ) as bp on true
   where b.id = p_booking_id
$$;

revoke all on function public.manage_money_for(pg_catalog.uuid) from public;
revoke all on function public.manage_money_for(pg_catalog.uuid) from anon;
revoke all on function public.manage_money_for(pg_catalog.uuid) from authenticated;

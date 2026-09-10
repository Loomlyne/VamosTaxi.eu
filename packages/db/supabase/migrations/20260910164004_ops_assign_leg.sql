-- 20260910164004_ops_assign_leg.sql
--
-- 08-04: public.ops_assign_leg / public.ops_unassign_leg are the only writers of
-- booking_legs assignment FKs from Ops. One SECURITY DEFINER transaction sets
-- chauffeur + default_vehicle_id, relies on tg_leg_snapshot_buffer, keeps the
-- existing GiST EXCLUDE constraints, and appends booking_events in the same tx.
--
-- EXECUTE is granted to vamos_system only. Worker calls asSystem after withStaff.
-- Data API roles are not granted. Do not drop booking_legs_chauffeur_no_overlap.

create function public.ops_assign_leg(
  p_booking_id pg_catalog.uuid,
  p_chauffeur_id pg_catalog.uuid,
  p_actor_id pg_catalog.uuid
)
returns table (
  booking_id pg_catalog.uuid,
  leg_id pg_catalog.uuid,
  chauffeur_id pg_catalog.uuid,
  vehicle_id pg_catalog.uuid
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_booking public.bookings%rowtype;
  v_leg public.booking_legs%rowtype;
  v_chauffeur public.chauffeurs%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_actor_label pg_catalog.text;
  v_captured pg_catalog.bool;
begin
  select b.*
    into v_booking
    from public.bookings as b
   where b.id = p_booking_id
     and b.erased_at is null;

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
  ) into v_captured;

  if not v_captured
     or v_booking.status not in (
          'paid'::public.booking_status,
          'confirmed'::public.booking_status,
          'assigned'::public.booking_status
        ) then
    raise exception 'not-paid' using errcode = 'P0001';
  end if;

  select l.*
    into v_leg
    from public.booking_legs as l
   where l.booking_id = v_booking.id
   order by l.leg_seq
   limit 1;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  select c.*
    into v_chauffeur
    from public.chauffeurs as c
   where c.id = p_chauffeur_id;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  if v_chauffeur.email is null or pg_catalog.btrim(v_chauffeur.email) = '' then
    raise exception 'no-email' using errcode = 'P0001';
  end if;

  if v_chauffeur.default_vehicle_id is null then
    raise exception 'no-vehicle' using errcode = 'P0001';
  end if;

  select v.*
    into v_vehicle
    from public.vehicles as v
   where v.id = v_chauffeur.default_vehicle_id;

  if not found then
    raise exception 'no-vehicle' using errcode = 'P0001';
  end if;

  if v_vehicle.seats < v_leg.pax or v_vehicle.bags < v_leg.bags then
    raise exception 'capacity' using errcode = 'P0001';
  end if;

  select coalesce(s.full_name, '')
    into v_actor_label
    from public.staff as s
   where s.user_id = p_actor_id;

  if v_actor_label is null then
    v_actor_label := '';
  end if;

  -- D-48: swap is this same UPDATE; defer GiST so old+new do not trip mid-statement.
  set constraints
    public.booking_legs_chauffeur_no_overlap,
    public.booking_legs_vehicle_no_overlap
    deferred;

  update public.booking_legs
     set assigned_chauffeur_id = v_chauffeur.id,
         assigned_vehicle_id = v_vehicle.id,
         status = 'assigned'::public.booking_status,
         updated_at = pg_catalog.now()
   where id = v_leg.id
   returning * into v_leg;

  update public.bookings
     set status = 'assigned'::public.booking_status,
         updated_at = pg_catalog.now()
   where id = v_booking.id
     and status in (
       'paid'::public.booking_status,
       'confirmed'::public.booking_status,
       'assigned'::public.booking_status
     );

  insert into public.booking_events (
    booking_id, booking_leg_id, kind, actor_kind, actor_id, actor_label, payload
  ) values (
    v_booking.id,
    v_leg.id,
    'assignment.chauffeur_set',
    'staff',
    p_actor_id,
    v_actor_label,
    pg_catalog.jsonb_build_object('chauffeur_id', v_chauffeur.id)
  );

  insert into public.booking_events (
    booking_id, booking_leg_id, kind, actor_kind, actor_id, actor_label, payload
  ) values (
    v_booking.id,
    v_leg.id,
    'assignment.vehicle_set',
    'staff',
    p_actor_id,
    v_actor_label,
    pg_catalog.jsonb_build_object('vehicle_id', v_vehicle.id)
  );

  return query
    select v_booking.id, v_leg.id, v_chauffeur.id, v_vehicle.id;
end
$$;

create function public.ops_unassign_leg(
  p_booking_id pg_catalog.uuid,
  p_actor_id pg_catalog.uuid
)
returns table (
  booking_id pg_catalog.uuid,
  leg_id pg_catalog.uuid
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_booking public.bookings%rowtype;
  v_leg public.booking_legs%rowtype;
  v_actor_label pg_catalog.text;
  v_prev_chauffeur pg_catalog.uuid;
  v_prev_vehicle pg_catalog.uuid;
begin
  select b.*
    into v_booking
    from public.bookings as b
   where b.id = p_booking_id
     and b.erased_at is null;

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

  select l.*
    into v_leg
    from public.booking_legs as l
   where l.booking_id = v_booking.id
   order by l.leg_seq
   limit 1;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  select coalesce(s.full_name, '')
    into v_actor_label
    from public.staff as s
   where s.user_id = p_actor_id;

  if v_actor_label is null then
    v_actor_label := '';
  end if;

  v_prev_chauffeur := v_leg.assigned_chauffeur_id;
  v_prev_vehicle := v_leg.assigned_vehicle_id;

  update public.booking_legs
     set assigned_chauffeur_id = null,
         assigned_vehicle_id = null,
         status = case
           when status = 'assigned'::public.booking_status
           then 'confirmed'::public.booking_status
           else status
         end,
         updated_at = pg_catalog.now()
   where id = v_leg.id
   returning * into v_leg;

  update public.bookings
     set status = case
           when status = 'assigned'::public.booking_status
           then 'confirmed'::public.booking_status
           else status
         end,
         updated_at = pg_catalog.now()
   where id = v_booking.id;

  insert into public.booking_events (
    booking_id, booking_leg_id, kind, actor_kind, actor_id, actor_label, payload
  ) values (
    v_booking.id,
    v_leg.id,
    'assignment.cleared',
    'staff',
    p_actor_id,
    v_actor_label,
    pg_catalog.jsonb_build_object(
      'chauffeur_id', v_prev_chauffeur,
      'vehicle_id', v_prev_vehicle
    )
  );

  return query
    select v_booking.id, v_leg.id;
end
$$;

revoke all on function public.ops_assign_leg(
  pg_catalog.uuid,
  pg_catalog.uuid,
  pg_catalog.uuid
) from public;

revoke all on function public.ops_unassign_leg(
  pg_catalog.uuid,
  pg_catalog.uuid
) from public;

grant execute on function public.ops_assign_leg(
  pg_catalog.uuid,
  pg_catalog.uuid,
  pg_catalog.uuid
) to vamos_system;

grant execute on function public.ops_unassign_leg(
  pg_catalog.uuid,
  pg_catalog.uuid
) to vamos_system;

comment on function public.ops_assign_leg(
  pg_catalog.uuid,
  pg_catalog.uuid,
  pg_catalog.uuid
) is
  '08-04: dispatcher assign. Sets chauffeur + default_vehicle_id under GiST EXCLUDE, writes assignment.chauffeur_set / assignment.vehicle_set. EXECUTE: vamos_system only.';

comment on function public.ops_unassign_leg(
  pg_catalog.uuid,
  pg_catalog.uuid
) is
  '08-04: dispatcher unassign. Nulls both FKs, writes assignment.cleared. EXECUTE: vamos_system only.';

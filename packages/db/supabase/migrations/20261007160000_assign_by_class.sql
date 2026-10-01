-- 20261007160000_assign_by_class.sql
--
-- 26.2 quick 261001-chauffeur-car. Owner decisions 2026-10-01
-- (.planning/decisions/2026-10-01-no-cars-page.md): no cars on the dashboard; each chauffeur is
-- chosen by a class and told apart by a plate number; Assign never needs a car.
--
-- (a) public.chauffeurs.plate — the plate number the owner types on the chauffeur. Trimmed text,
--     case kept as typed; unique (case-insensitive) among active chauffeurs, because the plate is
--     what tells two drivers apart. Live rows start without one (null).
-- (b) public.ops_assign_leg — same signature, return shape, grants (vamos_system only). No vehicle:
--     the 'no-vehicle' refusal is gone, assigned_vehicle_id is set to null, no
--     assignment.vehicle_set event. The driver's class must be the trip's class ('no-class',
--     'class-mismatch'); capacity is the class's passenger/luggage capacity ('capacity').
--     ops_unassign_leg is unchanged.
-- (c) public.reminder_24h_candidates — same signature and columns; `plate` is the chauffeur's
--     plate, `vehicle` (the car model) is always null. The mail omits an empty line already.
-- (d) public.manage_driver_for — same four keys; 'plate' is the chauffeur's plate,
--     'vehicle_model' is always null.
--
-- No vehicle row is created, changed or deleted. Applied migrations are not edited.

-- ---------------------------------------------------------------------------
-- (a) chauffeurs.plate
-- ---------------------------------------------------------------------------
alter table public.chauffeurs
  add column if not exists plate pg_catalog.text;

alter table public.chauffeurs
  drop constraint if exists chauffeurs_plate_shape;
alter table public.chauffeurs
  add constraint chauffeurs_plate_shape
  check (
    plate is null
    or (pg_catalog.btrim(plate) = plate and pg_catalog.char_length(plate) between 1 and 32)
  );

create unique index if not exists chauffeurs_plate_active_key
  on public.chauffeurs (pg_catalog.upper(plate))
  where active and plate is not null;

comment on column public.chauffeurs.plate is
  'Plate number of the car this chauffeur drives, as the owner types it (trimmed). Tells two drivers apart: unique, case-insensitive, among active chauffeurs. Null when none. Shown to the customer where the car plate used to be (2026-10-01).';

-- ---------------------------------------------------------------------------
-- (b) ops_assign_leg: assign by class, no vehicle
-- ---------------------------------------------------------------------------
create or replace function public.ops_assign_leg(
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
  v_class public.vehicle_classes%rowtype;
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

  -- 2026-10-01: the driver is chosen by his class; the trip's class decides who may take it.
  if v_chauffeur.vehicle_class_id is null then
    raise exception 'no-class' using errcode = 'P0001';
  end if;

  if v_chauffeur.vehicle_class_id <> v_leg.vehicle_class_id then
    raise exception 'class-mismatch' using errcode = 'P0001';
  end if;

  select vc.*
    into v_class
    from public.vehicle_classes as vc
   where vc.id = v_leg.vehicle_class_id;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  if v_class.passenger_capacity < v_leg.pax or v_class.luggage_capacity < v_leg.bags then
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
         assigned_vehicle_id = null,
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

  return query
    select v_booking.id, v_leg.id, v_chauffeur.id, null::pg_catalog.uuid;
end
$$;

revoke all on function public.ops_assign_leg(
  pg_catalog.uuid,
  pg_catalog.uuid,
  pg_catalog.uuid
) from public;

grant execute on function public.ops_assign_leg(
  pg_catalog.uuid,
  pg_catalog.uuid,
  pg_catalog.uuid
) to vamos_system;

comment on function public.ops_assign_leg(
  pg_catalog.uuid,
  pg_catalog.uuid,
  pg_catalog.uuid
) is
  '2026-10-01 assign by class: sets the chauffeur only (assigned_vehicle_id null) under GiST EXCLUDE, refuses a chauffeur without a class (no-class) or of another class than the trip (class-mismatch), checks the class capacity (capacity), writes assignment.chauffeur_set. EXECUTE: vamos_system only.';

-- ---------------------------------------------------------------------------
-- (c) reminder_24h_candidates: the chauffeur's plate, no car model
-- ---------------------------------------------------------------------------
create or replace function public.reminder_24h_candidates(
  p_from pg_catalog.timestamptz,
  p_to pg_catalog.timestamptz
)
returns table (
  booking_id pg_catalog.uuid,
  booking_leg_id pg_catalog.uuid,
  reference pg_catalog.text,
  locale pg_catalog.text,
  contact_email pg_catalog.text,
  pickup_text pg_catalog.text,
  dropoff_text pg_catalog.text,
  scheduled_local pg_catalog.text,
  assigned_chauffeur_id pg_catalog.uuid,
  chauffeur_name pg_catalog.text,
  vehicle pg_catalog.text,
  plate pg_catalog.text
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id,
         l.id,
         b.reference,
         b.locale,
         b.contact_email::pg_catalog.text,
         l.pickup_text,
         l.dropoff_text,
         l.scheduled_local,
         l.assigned_chauffeur_id,
         ch.full_name,
         null::pg_catalog.text,
         ch.plate
    from public.booking_legs as l
    join public.bookings as b on b.id = l.booking_id
    left join public.chauffeurs as ch on ch.id = l.assigned_chauffeur_id
   where l.original_scheduled_at >= p_from
     and l.original_scheduled_at < p_to
     and b.erased_at is null
     and b.status::pg_catalog.text in ('confirmed', 'assigned')
   order by l.original_scheduled_at, l.id
$$;

revoke all on function public.reminder_24h_candidates(pg_catalog.timestamptz, pg_catalog.timestamptz) from public;
revoke all on function public.reminder_24h_candidates(pg_catalog.timestamptz, pg_catalog.timestamptz) from anon;
revoke all on function public.reminder_24h_candidates(pg_catalog.timestamptz, pg_catalog.timestamptz) from authenticated;
grant execute on function public.reminder_24h_candidates(pg_catalog.timestamptz, pg_catalog.timestamptz) to vamos_system;

comment on function public.reminder_24h_candidates(pg_catalog.timestamptz, pg_catalog.timestamptz) is
  '24 h reminder read: legs whose original pickup is in [p_from, p_to) on PAID bookings only (status confirmed or assigned; D-18, 2026-09-30) that are not erased, with the contact e-mail, the assigned chauffeur and his plate (2026-10-01: no car; vehicle is always null). EXECUTE: vamos_system only.';

-- ---------------------------------------------------------------------------
-- (d) manage_driver_for: the chauffeur's plate, no car model
-- ---------------------------------------------------------------------------
create or replace function public.manage_driver_for(p_booking_id pg_catalog.uuid)
returns pg_catalog.jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
           'first_name', pg_catalog.split_part(pg_catalog.btrim(ch.full_name), ' ', 1),
           'phone', ch.phone,
           'vehicle_model', null::pg_catalog.text,
           'plate', ch.plate
         )
    from public.booking_legs as l
    join public.chauffeurs as ch on ch.id = l.assigned_chauffeur_id
   where l.booking_id = p_booking_id
   order by l.leg_seq
   limit 1
$$;

revoke all on function public.manage_driver_for(pg_catalog.uuid) from public;
revoke all on function public.manage_driver_for(pg_catalog.uuid) from anon;
revoke all on function public.manage_driver_for(pg_catalog.uuid) from authenticated;

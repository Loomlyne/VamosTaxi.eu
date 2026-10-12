-- 20261012210000_assign_refuses_retired_class.sql
--
-- Phase 30 (vehicle class lifecycle), CLS-09 and decision 3 (count of paid trips with no chauffeur).
-- Applied by the controller verbatim after Ship; never `supabase db push`. No CHF amounts, no data change.
--
--   1. app.booking_assign_refusal(uuid): the one paid/frozen rule. ops_assign_leg and the Retire
--      dialog's count both call it, so a trip is counted exactly when Assign would accept it.
--      Lifted from 20261007160000_assign_by_class.sql (same status lists, same order).
--   2. ops_assign_leg: the paid/frozen blocks now call the helper (messages 'frozen' and
--      'not-paid' and their order unchanged) and a chauffeur whose class is retired is refused
--      with 'class-retired'. Unassign is untouched (retiring never unassigns).
--   3. public.ops_vehicle_class_unassigned_paid_trips(uuid): upcoming first-leg trips of the class
--      with no chauffeur that Assign would accept. EXECUTE: vamos_staff.

-- 1. One paid/frozen rule.
create or replace function app.booking_assign_refusal(p_booking_id pg_catalog.uuid)
returns pg_catalog.text
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_status public.booking_status;
  v_captured pg_catalog.bool;
begin
  select b.status into v_status from public.bookings as b where b.id = p_booking_id;

  if v_status in (
       'completed'::public.booking_status,
       'cancelled'::public.booking_status,
       'refunded'::public.booking_status,
       'no_show'::public.booking_status,
       'partially_cancelled'::public.booking_status,
       'partially_completed'::public.booking_status
     ) then
    return 'frozen';
  end if;

  select exists (
    select 1
      from public.booking_payments as p
     where p.booking_id = p_booking_id
       and p.captured_at is not null
  ) into v_captured;

  if not v_captured
     or v_status is null
     or v_status not in (
          'paid'::public.booking_status,
          'confirmed'::public.booking_status,
          'assigned'::public.booking_status
        ) then
    return 'not-paid';
  end if;

  return null;
end;
$$;

revoke all on function app.booking_assign_refusal(pg_catalog.uuid) from public;

comment on function app.booking_assign_refusal(pg_catalog.uuid) is
  'Phase 30: the one paid/frozen rule of Assign. Null when ops_assign_leg accepts the booking on status and money, else frozen (completed, cancelled, refunded, no_show, partially_cancelled, partially_completed) or not-paid (no captured payment, or status not paid/confirmed/assigned). Called by ops_assign_leg and ops_vehicle_class_unassigned_paid_trips. EXECUTE: owner only.';

-- 2. ops_assign_leg: shared rule plus the retired-class guard.
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
  v_refusal pg_catalog.text;
begin
  select b.*
    into v_booking
    from public.bookings as b
   where b.id = p_booking_id
     and b.erased_at is null;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  v_refusal := app.booking_assign_refusal(v_booking.id);
  if v_refusal is not null then
    raise exception using message = v_refusal, errcode = 'P0001';
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
   where c.id = p_chauffeur_id
     and c.deleted_at is null;

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

  -- Phase 30 CLS-09: a retired class takes no new trips (existing assignments stay).
  if exists (
    select 1 from public.vehicle_classes as rc
     where rc.id = v_chauffeur.vehicle_class_id and rc.hidden_at is not null
  ) then
    raise exception 'class-retired' using errcode = 'P0001';
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
  '2026-10-01 assign by class: sets the chauffeur only (assigned_vehicle_id null) under GiST EXCLUDE, refuses a chauffeur without a class (no-class) or of another class than the trip (class-mismatch), checks the class capacity (capacity), writes assignment.chauffeur_set. Phase 30 CLS-09: refuses a chauffeur whose class is retired (class-retired). The paid/frozen rule (frozen, not-paid) lives in app.booking_assign_refusal. EXECUTE: vamos_system only.';

-- 3. The Retire dialog's count (decision 3): same rule as Assign.
create or replace function public.ops_vehicle_class_unassigned_paid_trips(p_id pg_catalog.uuid)
returns pg_catalog.int4
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.count(*)::pg_catalog.int4
    from public.bookings as b
    join lateral (
      select l.*
        from public.booking_legs as l
       where l.booking_id = b.id
       order by l.leg_seq
       limit 1
    ) as fl on true
   where b.erased_at is null
     and fl.vehicle_class_id = p_id
     and fl.assigned_chauffeur_id is null
     and fl.scheduled_at > pg_catalog.now()
     and app.booking_assign_refusal(b.id) is null;
$$;

revoke all on function public.ops_vehicle_class_unassigned_paid_trips(pg_catalog.uuid) from public;
revoke all on function public.ops_vehicle_class_unassigned_paid_trips(pg_catalog.uuid) from anon, authenticated;
grant execute on function public.ops_vehicle_class_unassigned_paid_trips(pg_catalog.uuid) to vamos_staff;

comment on function public.ops_vehicle_class_unassigned_paid_trips(pg_catalog.uuid) is
  'Phase 30 decision 3: number of upcoming trips (first leg in this class, no chauffeur yet, booking not erased) that Assign would accept: same rule as ops_assign_leg (app.booking_assign_refusal). Shown in the Retire dialog. EXECUTE: the staff role only.';

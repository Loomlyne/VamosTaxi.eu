-- ops_assign_leg.test.sql
--
-- 08-04: unpaid / no-email / no-vehicle / overlap 23P01 / unassign clears FKs /
-- events / frozen cancelled. EXECUTE vamos_system only. Rolled back. Synthetic
-- 1-rappen figures only — never a product CHF.
begin;
select plan(24);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('oal-class', 4, 4);

insert into public.vehicles (vehicle_class_id, model, plate, seats, bags)
select vc.id, 'OAL Car', 'ZH-OAL-01', 4, 4
  from public.vehicle_classes vc where vc.slug = 'oal-class';

insert into public.chauffeurs (full_name, phone, email, licence_number, default_vehicle_id)
select 'OAL Good', '+41 79 804 00 01', 'oal-good@vamostaxi.eu', 'LIC-OAL-G', v.id
  from public.vehicles v where v.plate = 'ZH-OAL-01';

insert into public.chauffeurs (full_name, phone, licence_number, default_vehicle_id)
select 'OAL No Email', '+41 79 804 00 02', 'LIC-OAL-E', v.id
  from public.vehicles v where v.plate = 'ZH-OAL-01';

insert into public.chauffeurs (full_name, phone, email, licence_number)
values ('OAL No Vehicle', '+41 79 804 00 03', 'oal-noveh@vamostaxi.eu', 'LIC-OAL-V');

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values (
  'a0804000-0000-4000-8000-000000000804',
  'oal-dispatcher@vamostaxi.eu',
  'authenticated',
  'authenticated',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.staff (user_id, role, active, full_name)
values ('a0804000-0000-4000-8000-000000000804', 'dispatcher', true, 'OAL Dispatcher');

insert into public.bookings (reference, contact_name, contact_email, status)
values
  (public.next_booking_reference(), 'OAL Unpaid', 'oal-unpaid@vamostaxi.eu', 'quote'),
  (public.next_booking_reference(), 'OAL Paid A', 'oal-paid-a@vamostaxi.eu', 'paid'),
  (public.next_booking_reference(), 'OAL Paid B', 'oal-paid-b@vamostaxi.eu', 'paid'),
  (public.next_booking_reference(), 'OAL Frozen', 'oal-frozen@vamostaxi.eu', 'cancelled');

insert into public.booking_legs (
  booking_id, leg_seq, direction, pickup_text, dropoff_text,
  scheduled_at, scheduled_local, vehicle_class_id, estimated_duration_minutes, pax, bags
)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
       '2027-09-24 10:00:00+02'::timestamptz, '2027-09-24T10:00',
       vc.id, 60, 2, 2
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email = 'oal-unpaid@vamostaxi.eu' and vc.slug = 'oal-class';

insert into public.booking_legs (
  booking_id, leg_seq, direction, pickup_text, dropoff_text,
  scheduled_at, scheduled_local, vehicle_class_id, estimated_duration_minutes, pax, bags
)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
       '2027-09-24 10:00:00+02'::timestamptz, '2027-09-24T10:00',
       vc.id, 60, 2, 2
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email = 'oal-paid-a@vamostaxi.eu' and vc.slug = 'oal-class';

insert into public.booking_legs (
  booking_id, leg_seq, direction, pickup_text, dropoff_text,
  scheduled_at, scheduled_local, vehicle_class_id, estimated_duration_minutes, pax, bags
)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
       '2027-09-24 10:30:00+02'::timestamptz, '2027-09-24T10:30',
       vc.id, 60, 2, 2
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email = 'oal-paid-b@vamostaxi.eu' and vc.slug = 'oal-class';

insert into public.booking_legs (
  booking_id, leg_seq, direction, pickup_text, dropoff_text,
  scheduled_at, scheduled_local, vehicle_class_id, estimated_duration_minutes, pax, bags
)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
       '2027-09-25 10:00:00+02'::timestamptz, '2027-09-25T10:00',
       vc.id, 60, 2, 2
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email = 'oal-frozen@vamostaxi.eu' and vc.slug = 'oal-class';

set local session_replication_role = replica;

insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
  expires_at, quote_lock_expires_at
)
select
  gen_random_uuid(),
  vc.id,
  rv.id,
  false,
  sv.id,
  'quote-engine@08-04',
  2, 2,
  '[]'::jsonb,
  -- eight-key policy: price_snapshots_policy_shape (20260825000003)
  jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                     'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                     'settings_version_id', sv.id, 'modification_deadline_hours', 24,
                     'min_advance_minutes', 180, 'policy_doc', 'test'),
  1, 0, 0, 1,
  now() + interval '1 day',
  now() + interval '1 day'
from public.vehicle_classes vc
cross join lateral (select id from public.rate_versions order by id limit 1) rv
cross join lateral (select id from public.settings_versions order by id limit 1) sv
-- one snapshot per succeeded payment: booking_payments_one_success_per_snapshot (20260910175309)
cross join generate_series(1, 3) as g(n)
where vc.slug = 'oal-class';

insert into public.booking_payments (
  booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at
)
select b.id, ps.id, 'pi_oal_a', 1, 'succeeded', now()
  from public.bookings b
  cross join lateral (select id from public.price_snapshots order by id desc limit 1 offset 0) ps
 where b.contact_email = 'oal-paid-a@vamostaxi.eu';

insert into public.booking_payments (
  booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at
)
select b.id, ps.id, 'pi_oal_b', 1, 'succeeded', now()
  from public.bookings b
  cross join lateral (select id from public.price_snapshots order by id desc limit 1 offset 1) ps
 where b.contact_email = 'oal-paid-b@vamostaxi.eu';

insert into public.booking_payments (
  booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at
)
select b.id, ps.id, 'pi_oal_f', 1, 'succeeded', now()
  from public.bookings b
  cross join lateral (select id from public.price_snapshots order by id desc limit 1 offset 2) ps
 where b.contact_email = 'oal-frozen@vamostaxi.eu';

set local session_replication_role = origin;

create temporary table fx as
select
  (select id from public.bookings where contact_email = 'oal-unpaid@vamostaxi.eu') as unpaid,
  (select id from public.bookings where contact_email = 'oal-paid-a@vamostaxi.eu') as paid_a,
  (select id from public.bookings where contact_email = 'oal-paid-b@vamostaxi.eu') as paid_b,
  (select id from public.bookings where contact_email = 'oal-frozen@vamostaxi.eu') as frozen,
  (select id from public.chauffeurs where licence_number = 'LIC-OAL-G') as good,
  (select id from public.chauffeurs where licence_number = 'LIC-OAL-E') as no_email,
  (select id from public.chauffeurs where licence_number = 'LIC-OAL-V') as no_vehicle,
  'a0804000-0000-4000-8000-000000000804'::uuid as actor;

select function_privs_are('public', 'ops_assign_leg', '{uuid,uuid,uuid}'::text[], 'anon', '{}'::text[], 'ops_assign_leg: anon holds no EXECUTE');
select function_privs_are('public', 'ops_assign_leg', '{uuid,uuid,uuid}'::text[], 'authenticated', '{}'::text[], 'ops_assign_leg: authenticated holds no EXECUTE');
select function_privs_are('public', 'ops_assign_leg', '{uuid,uuid,uuid}'::text[], 'vamos_staff', '{}'::text[], 'ops_assign_leg: vamos_staff holds no EXECUTE');
select function_privs_are('public', 'ops_assign_leg', '{uuid,uuid,uuid}'::text[], 'vamos_guest', '{}'::text[], 'ops_assign_leg: vamos_guest holds no EXECUTE');
select function_privs_are('public', 'ops_assign_leg', '{uuid,uuid,uuid}'::text[], 'vamos_public', '{}'::text[], 'ops_assign_leg: vamos_public holds no EXECUTE');
select function_privs_are('public', 'ops_assign_leg', '{uuid,uuid,uuid}'::text[], 'vamos_system', '{EXECUTE}'::text[], 'ops_assign_leg: vamos_system holds EXECUTE');

select function_privs_are('public', 'ops_unassign_leg', '{uuid,uuid}'::text[], 'anon', '{}'::text[], 'ops_unassign_leg: anon holds no EXECUTE');
select function_privs_are('public', 'ops_unassign_leg', '{uuid,uuid}'::text[], 'authenticated', '{}'::text[], 'ops_unassign_leg: authenticated holds no EXECUTE');
select function_privs_are('public', 'ops_unassign_leg', '{uuid,uuid}'::text[], 'vamos_staff', '{}'::text[], 'ops_unassign_leg: vamos_staff holds no EXECUTE');
select function_privs_are('public', 'ops_unassign_leg', '{uuid,uuid}'::text[], 'vamos_guest', '{}'::text[], 'ops_unassign_leg: vamos_guest holds no EXECUTE');
select function_privs_are('public', 'ops_unassign_leg', '{uuid,uuid}'::text[], 'vamos_public', '{}'::text[], 'ops_unassign_leg: vamos_public holds no EXECUTE');
select function_privs_are('public', 'ops_unassign_leg', '{uuid,uuid}'::text[], 'vamos_system', '{EXECUTE}'::text[], 'ops_unassign_leg: vamos_system holds EXECUTE');

select throws_ok(
  format(
    $f$select * from public.ops_assign_leg(%L::uuid, %L::uuid, %L::uuid)$f$,
    (select unpaid from fx), (select good from fx), (select actor from fx)
  ),
  'P0001',
  'not-paid',
  'unpaid assign refused'
);

select throws_ok(
  format(
    $f$select * from public.ops_assign_leg(%L::uuid, %L::uuid, %L::uuid)$f$,
    (select paid_a from fx), (select no_email from fx), (select actor from fx)
  ),
  'P0001',
  'no-email',
  'no-email assign refused'
);

select throws_ok(
  format(
    $f$select * from public.ops_assign_leg(%L::uuid, %L::uuid, %L::uuid)$f$,
    (select paid_a from fx), (select no_vehicle from fx), (select actor from fx)
  ),
  'P0001',
  'no-vehicle',
  'no-vehicle assign refused'
);

select lives_ok(
  format(
    $f$select * from public.ops_assign_leg(%L::uuid, %L::uuid, %L::uuid)$f$,
    (select paid_a from fx), (select good from fx), (select actor from fx)
  ),
  'paid assign writes both FKs'
);

-- ops_assign_leg defers the GiST EXCLUDE to COMMIT (D-48, 20260910164004), and this
-- file never commits, so force the deferred check the way COMMIT would.
select throws_ok(
  format(
    $f$select * from public.ops_assign_leg(%L::uuid, %L::uuid, %L::uuid);
       set constraints public.booking_legs_chauffeur_no_overlap,
                       public.booking_legs_vehicle_no_overlap immediate$f$,
    (select paid_b from fx), (select good from fx), (select actor from fx)
  ),
  '23P01',
  null,
  'overlapping second assign raises 23P01'
);

select ok(
  exists (
    select 1
      from public.booking_legs l
      join public.chauffeurs c on c.id = l.assigned_chauffeur_id
     where l.booking_id = (select paid_a from fx)
       and l.assigned_vehicle_id is not null
       and c.licence_number = 'LIC-OAL-G'
  ),
  'assign sets chauffeur and default vehicle FKs'
);

select ok(
  exists (
    select 1 from public.booking_events
     where booking_id = (select paid_a from fx)
       and kind = 'assignment.chauffeur_set'
  ),
  'assignment.chauffeur_set event inserted'
);

select ok(
  exists (
    select 1 from public.booking_events
     where booking_id = (select paid_a from fx)
       and kind = 'assignment.vehicle_set'
  ),
  'assignment.vehicle_set event inserted'
);

select lives_ok(
  format(
    $f$select * from public.ops_unassign_leg(%L::uuid, %L::uuid)$f$,
    (select paid_a from fx), (select actor from fx)
  ),
  'unassign clears both FKs'
);

select ok(
  exists (
    select 1 from public.booking_legs
     where booking_id = (select paid_a from fx)
       and assigned_chauffeur_id is null
       and assigned_vehicle_id is null
  ),
  'unassign nulls both assignment FKs'
);

select ok(
  exists (
    select 1 from public.booking_events
     where booking_id = (select paid_a from fx)
       and kind = 'assignment.cleared'
  ),
  'assignment.cleared event inserted'
);

select throws_ok(
  format(
    $f$select * from public.ops_assign_leg(%L::uuid, %L::uuid, %L::uuid)$f$,
    (select frozen from fx), (select good from fx), (select actor from fx)
  ),
  'P0001',
  'frozen',
  'frozen cancelled refuses assign'
);

select * from finish();
rollback;

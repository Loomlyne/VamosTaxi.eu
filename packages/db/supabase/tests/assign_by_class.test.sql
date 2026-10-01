-- assign_by_class.test.sql
--
-- 20261007160000 (quick 261001-chauffeur-car, owner decisions 2026-10-01): no cars. The chauffeur
-- carries a plate (two chauffeurs may share one — owner, decision 7); ops_assign_leg assigns a
-- driver of the trip's class without any vehicle, checks the class capacity and never a deleted
-- chauffeur; the 24 h reminder and the manage-booking driver block show the chauffeur's plate and
-- no car model; ops_delete_chauffeur keeps the row for history (deleted_at), takes him off every
-- trip that is not finished (back to unassigned) and leaves his finished trips as they are.
-- Rolled back. Synthetic 1-rappen figures only — never a product CHF.
begin;
select plan(51);

-- ── fixtures ────────────────────────────────────────────────────────────────────────────────
insert into public.vehicle_classes (slug, name, passenger_capacity, luggage_capacity)
values ('abc-econ', 'ABC Economy', 3, 2),
       ('abc-bus', 'ABC Business', 6, 6);

insert into public.chauffeurs (full_name, phone, email, licence_number, vehicle_class_id, plate)
select 'Marco Business', '+41 79 816 00 01', 'abc-marco@vamostaxi.eu', 'LIC-ABC-M', vc.id, 'ZH 816 001'
  from public.vehicle_classes vc where vc.slug = 'abc-bus';
insert into public.chauffeurs (full_name, phone, email, licence_number, vehicle_class_id, plate)
select 'Luca Economy', '+41 79 816 00 02', 'abc-luca@vamostaxi.eu', 'LIC-ABC-L', vc.id, 'ZH 816 002'
  from public.vehicle_classes vc where vc.slug = 'abc-econ';
insert into public.chauffeurs (full_name, phone, email, licence_number)
values ('Nina No Class', '+41 79 816 00 03', 'abc-nina@vamostaxi.eu', 'LIC-ABC-N');

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('a0816000-0000-4000-8000-000000000816', 'abc-dispatcher@vamostaxi.eu', 'authenticated',
        'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.staff (user_id, role, active, full_name)
values ('a0816000-0000-4000-8000-000000000816', 'dispatcher', true, 'ABC Dispatcher');

insert into public.bookings (reference, contact_name, contact_email, status, locale)
values
  (public.next_booking_reference(), 'ABC Business', 'abc-bus@vamostaxi.eu', 'paid', 'en'),
  (public.next_booking_reference(), 'ABC Crowded', 'abc-crowd@vamostaxi.eu', 'paid', 'en');

insert into public.booking_legs (
  booking_id, leg_seq, direction, pickup_text, dropoff_text,
  scheduled_at, scheduled_local, vehicle_class_id, estimated_duration_minutes, pax, bags
)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
       now() + interval '24 hours 30 minutes', to_char(now() + interval '24 hours 30 minutes', 'YYYY-MM-DD"T"HH24:MI'),
       vc.id, 60, 2, 2
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email = 'abc-bus@vamostaxi.eu' and vc.slug = 'abc-bus';

-- 7 passengers in a 6-seat class: only an edit could have made this, the class capacity refuses it.
insert into public.booking_legs (
  booking_id, leg_seq, direction, pickup_text, dropoff_text,
  scheduled_at, scheduled_local, vehicle_class_id, estimated_duration_minutes, pax, bags
)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
       now() + interval '72 hours', to_char(now() + interval '72 hours', 'YYYY-MM-DD"T"HH24:MI'),
       vc.id, 60, 7, 2
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email = 'abc-crowd@vamostaxi.eu' and vc.slug = 'abc-bus';

set local session_replication_role = replica;

insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
  expires_at, quote_lock_expires_at
)
select
  gen_random_uuid(), vc.id, rv.id, false, sv.id, 'quote-engine@abc', 2, 2, '[]'::jsonb,
  jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                     'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                     'settings_version_id', sv.id, 'modification_deadline_hours', 24,
                     'min_advance_minutes', 180, 'policy_doc', 'test'),
  1, 0, 0, 1, now() + interval '1 day', now() + interval '1 day'
from public.vehicle_classes vc
cross join lateral (select id from public.rate_versions order by id limit 1) rv
cross join lateral (select id from public.settings_versions order by id limit 1) sv
cross join generate_series(1, 2) as g(n)
where vc.slug = 'abc-bus';

insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at)
select b.id, ps.id, 'pi_abc_bus', 1, 'succeeded', now()
  from public.bookings b
  cross join lateral (select id from public.price_snapshots order by id desc limit 1 offset 0) ps
 where b.contact_email = 'abc-bus@vamostaxi.eu';
insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at)
select b.id, ps.id, 'pi_abc_crowd', 1, 'succeeded', now()
  from public.bookings b
  cross join lateral (select id from public.price_snapshots order by id desc limit 1 offset 1) ps
 where b.contact_email = 'abc-crowd@vamostaxi.eu';

set local session_replication_role = origin;

create temporary table fx as
select
  (select id from public.bookings where contact_email = 'abc-bus@vamostaxi.eu') as trip,
  (select id from public.bookings where contact_email = 'abc-crowd@vamostaxi.eu') as crowded,
  (select id from public.chauffeurs where licence_number = 'LIC-ABC-M') as marco,
  (select id from public.chauffeurs where licence_number = 'LIC-ABC-L') as luca,
  (select id from public.chauffeurs where licence_number = 'LIC-ABC-N') as nina,
  'a0816000-0000-4000-8000-000000000816'::uuid as actor,
  (select count(*) from public.vehicles) as vehicles_before;
grant select on fx to public;

-- ── (a) chauffeurs.plate ────────────────────────────────────────────────────────────────────
select has_column('public', 'chauffeurs', 'plate', 'chauffeurs.plate exists');
select col_type_is('public', 'chauffeurs', 'plate', 'text', 'chauffeurs.plate is text');
select col_is_null('public', 'chauffeurs', 'plate', 'chauffeurs.plate may be empty (live rows start without one)');

select lives_ok(
  $q$insert into public.chauffeurs (full_name, phone, licence_number, plate)
     values ('ABC Same Plate', '+41 79 816 00 09', 'LIC-ABC-S', 'ZH 816 001')$q$,
  'two active chauffeurs may carry the same plate (owner, decision 7)'
);
select hasnt_index('public', 'chauffeurs', 'chauffeurs_plate_active_key', 'no unique plate index');
select lives_ok(
  $q$insert into public.chauffeurs (full_name, phone, licence_number) values
     ('ABC No Plate 1', '+41 79 816 00 11', 'LIC-ABC-P1'),
     ('ABC No Plate 2', '+41 79 816 00 12', 'LIC-ABC-P2')$q$,
  'the column may stay empty (old rows; the form asks for it)'
);
select throws_ok(
  $q$insert into public.chauffeurs (full_name, phone, licence_number, plate)
     values ('ABC Spaces', '+41 79 816 00 13', 'LIC-ABC-W', ' ZH 1 ')$q$,
  '23514', null, 'a plate is stored trimmed'
);

-- ── (b) ops_assign_leg by class ─────────────────────────────────────────────────────────────
select function_privs_are('public', 'ops_assign_leg', '{uuid,uuid,uuid}'::text[], 'vamos_system', '{EXECUTE}'::text[], 'ops_assign_leg: vamos_system holds EXECUTE');
select function_privs_are('public', 'ops_assign_leg', '{uuid,uuid,uuid}'::text[], 'vamos_staff', '{}'::text[], 'ops_assign_leg: vamos_staff holds no EXECUTE');
select function_privs_are('public', 'ops_assign_leg', '{uuid,uuid,uuid}'::text[], 'authenticated', '{}'::text[], 'ops_assign_leg: authenticated holds no EXECUTE');
select function_privs_are('public', 'ops_assign_leg', '{uuid,uuid,uuid}'::text[], 'anon', '{}'::text[], 'ops_assign_leg: anon holds no EXECUTE');
select ok((select prosecdef and proconfig = array['search_path=""'] from pg_proc where oid = 'public.ops_assign_leg(uuid,uuid,uuid)'::regprocedure),
  'ops_assign_leg: SECURITY DEFINER with an empty search_path');

select throws_ok(
  format($f$select * from public.ops_assign_leg(%L::uuid, %L::uuid, %L::uuid)$f$,
         (select trip from fx), (select luca from fx), (select actor from fx)),
  'P0001', 'class-mismatch', 'an Economy driver is refused on a Business trip'
);
select throws_ok(
  format($f$select * from public.ops_assign_leg(%L::uuid, %L::uuid, %L::uuid)$f$,
         (select trip from fx), (select nina from fx), (select actor from fx)),
  'P0001', 'no-class', 'a driver without a class is refused'
);
select throws_ok(
  format($f$select * from public.ops_assign_leg(%L::uuid, %L::uuid, %L::uuid)$f$,
         (select crowded from fx), (select marco from fx), (select actor from fx)),
  'P0001', 'capacity', 'seven passengers do not fit the six-seat class'
);
select ok(
  not exists (
    select 1 from public.booking_legs
     where booking_id in ((select trip from fx), (select crowded from fx))
       and assigned_chauffeur_id is not null
  ),
  'a refusal writes nothing'
);

select lives_ok(
  format($f$select * from public.ops_assign_leg(%L::uuid, %L::uuid, %L::uuid)$f$,
         (select trip from fx), (select marco from fx), (select actor from fx)),
  'a Business driver without any car is assigned to the Business trip'
);
select ok(
  exists (
    select 1 from public.booking_legs
     where booking_id = (select trip from fx)
       and assigned_chauffeur_id = (select marco from fx)
       and assigned_vehicle_id is null
       and status = 'assigned'
  ),
  'the leg has the driver and no vehicle'
);
select is(
  (select status::text from public.bookings where id = (select trip from fx)),
  'assigned',
  'the booking is assigned'
);
select is(
  (select count(*)::int from public.booking_events where booking_id = (select trip from fx) and kind = 'assignment.chauffeur_set'),
  1, 'one assignment.chauffeur_set event'
);
select is(
  (select count(*)::int from public.booking_events where booking_id = (select trip from fx) and kind = 'assignment.vehicle_set'),
  0, 'no assignment.vehicle_set event'
);
select is((select count(*) from public.vehicles), (select vehicles_before from fx), 'no vehicle row was created or deleted');

-- ── (c) reminder_24h_candidates: the chauffeur's plate, no model ────────────────────────────
update public.bookings set status = 'assigned' where id = (select trip from fx);
select function_privs_are('public','reminder_24h_candidates','{timestamptz,timestamptz}'::text[],'vamos_system','{EXECUTE}'::text[],'reminder: vamos_system has EXECUTE');
select function_privs_are('public','reminder_24h_candidates','{timestamptz,timestamptz}'::text[],'authenticated','{}'::text[],'reminder: authenticated has no EXECUTE');
select ok((select prosecdef and proconfig = array['search_path=""'] from pg_proc where oid = 'public.reminder_24h_candidates(timestamptz,timestamptz)'::regprocedure),
  'reminder: SECURITY DEFINER with an empty search_path');

set local role vamos_system;
create temporary table abc_rem as
  select * from public.reminder_24h_candidates(now() + interval '24 hours', now() + interval '25 hours');
reset role;

select is((select plate from abc_rem where contact_email = 'abc-bus@vamostaxi.eu'), 'ZH 816 001', 'reminder: the chauffeur''s plate');
select ok((select vehicle is null from abc_rem where contact_email = 'abc-bus@vamostaxi.eu'), 'reminder: no car model');
select is((select chauffeur_name from abc_rem where contact_email = 'abc-bus@vamostaxi.eu'), 'Marco Business', 'reminder: the chauffeur''s name');

-- ── (d) manage_driver_for: the chauffeur's plate, no model, four keys ──────────────────────
select ok((select prosecdef and proconfig = array['search_path=""'] from pg_proc where oid = 'public.manage_driver_for(uuid)'::regprocedure),
  'manage_driver_for: SECURITY DEFINER with an empty search_path');
select function_privs_are('public', 'manage_driver_for', '{uuid}'::text[], 'authenticated', '{}'::text[], 'manage_driver_for: authenticated has no EXECUTE');
select is((select public.manage_driver_for((select trip from fx)) ->> 'plate'), 'ZH 816 001', 'manage: the chauffeur''s plate');
select ok((select public.manage_driver_for((select trip from fx)) -> 'vehicle_model' = 'null'::jsonb), 'manage: no car model');
select is((select array_agg(k order by k) from jsonb_object_keys(public.manage_driver_for((select trip from fx))) k),
  array['first_name', 'phone', 'plate', 'vehicle_model'], 'manage: still exactly the four keys');

-- ── (e) ops_delete_chauffeur: keep the row, unassign what is not finished ─────────────────────
select has_column('public', 'chauffeurs', 'deleted_at', 'chauffeurs.deleted_at exists');
select col_type_is('public', 'chauffeurs', 'deleted_at', 'timestamp with time zone', 'chauffeurs.deleted_at is timestamptz');
select function_privs_are('public', 'ops_delete_chauffeur', '{uuid,uuid}'::text[], 'vamos_system', '{EXECUTE}'::text[], 'ops_delete_chauffeur: vamos_system holds EXECUTE');
select function_privs_are('public', 'ops_delete_chauffeur', '{uuid,uuid}'::text[], 'vamos_staff', '{}'::text[], 'ops_delete_chauffeur: vamos_staff holds no EXECUTE');
select function_privs_are('public', 'ops_delete_chauffeur', '{uuid,uuid}'::text[], 'authenticated', '{}'::text[], 'ops_delete_chauffeur: authenticated holds no EXECUTE');
select function_privs_are('public', 'ops_delete_chauffeur', '{uuid,uuid}'::text[], 'anon', '{}'::text[], 'ops_delete_chauffeur: anon holds no EXECUTE');
select ok((select prosecdef and proconfig = array['search_path=""'] from pg_proc where oid = 'public.ops_delete_chauffeur(uuid,uuid)'::regprocedure),
  'ops_delete_chauffeur: SECURITY DEFINER with an empty search_path');

-- Marco: the Business trip above (assigned, pickup tomorrow), plus a finished trip and a trip
-- whose pickup has passed but that nobody closed.
insert into public.bookings (reference, contact_name, contact_email, status, locale)
values (public.next_booking_reference(), 'ABC Done', 'abc-done@vamostaxi.eu', 'confirmed', 'en'),
       (public.next_booking_reference(), 'ABC Stale', 'abc-stale@vamostaxi.eu', 'confirmed', 'en');
set local session_replication_role = replica;
insert into public.booking_legs (
  booking_id, leg_seq, direction, pickup_text, dropoff_text, scheduled_at, original_scheduled_at,
  scheduled_local, vehicle_class_id, estimated_duration_minutes, pax, bags,
  assigned_chauffeur_id, status, turnaround_buffer_minutes
)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB', t.at, t.at, to_char(t.at, 'YYYY-MM-DD"T"HH24:MI'),
       vc.id, 60, 2, 2, (select marco from fx), t.st::public.booking_status, 15
  from public.bookings b
  join (values ('abc-done@vamostaxi.eu', now() - interval '10 days', 'completed'),
               ('abc-stale@vamostaxi.eu', now() - interval '2 hours', 'assigned')) as t(mail, at, st)
    on t.mail = b.contact_email
  cross join public.vehicle_classes vc
 where vc.slug = 'abc-bus';
update public.bookings set status = 'completed' where contact_email = 'abc-done@vamostaxi.eu';
update public.bookings set status = 'assigned' where contact_email = 'abc-stale@vamostaxi.eu';
set local session_replication_role = origin;

create temporary table abc_del as
  select r.reference from public.ops_delete_chauffeur((select marco from fx), (select actor from fx)) as r;
grant select on abc_del to public;

select set_eq(
  'select reference from abc_del',
  $q$select reference from public.bookings where contact_email in ('abc-bus@vamostaxi.eu', 'abc-stale@vamostaxi.eu')$q$,
  'answers the references taken off him: the future trip and the passed-but-not-closed one'
);
select ok(
  not exists (
    select 1 from public.booking_legs l join public.bookings b on b.id = l.booking_id
     where b.contact_email in ('abc-bus@vamostaxi.eu', 'abc-stale@vamostaxi.eu')
       and (l.assigned_chauffeur_id is not null or l.status = 'assigned')
  ),
  'those trips are back to unassigned (no driver, leg confirmed)'
);
select is(
  (select array_agg(status::text order by contact_email) from public.bookings where contact_email in ('abc-bus@vamostaxi.eu', 'abc-stale@vamostaxi.eu')),
  array['confirmed', 'confirmed'],
  'their bookings are confirmed again'
);
select is(
  (select count(*)::int from public.booking_events e join public.bookings b on b.id = e.booking_id
    where b.contact_email in ('abc-bus@vamostaxi.eu', 'abc-stale@vamostaxi.eu') and e.kind = 'assignment.cleared'),
  2, 'one assignment.cleared event per trip taken off him'
);
select ok(
  exists (
    select 1 from public.booking_legs l join public.bookings b on b.id = l.booking_id
     where b.contact_email = 'abc-done@vamostaxi.eu'
       and l.assigned_chauffeur_id = (select marco from fx) and l.status = 'completed'
  ),
  'his finished trip keeps him'
);
select ok(
  (select deleted_at is not null and not active from public.chauffeurs where id = (select marco from fx)),
  'the row stays, marked deleted and inactive'
);
select is((select full_name from public.chauffeurs where id = (select marco from fx)), 'Marco Business', 'his name and details stay for the finished trip');
select throws_ok(
  format($f$select * from public.ops_assign_leg(%L::uuid, %L::uuid, %L::uuid)$f$,
         (select trip from fx), (select marco from fx), (select actor from fx)),
  'P0002', 'not-found', 'a deleted chauffeur cannot be assigned'
);
select throws_ok(
  format($f$select * from public.ops_delete_chauffeur(%L::uuid, %L::uuid)$f$, (select marco from fx), (select actor from fx)),
  'P0002', 'not-found', 'deleting him twice answers not-found'
);
select lives_ok(
  $q$insert into public.chauffeurs (full_name, phone, licence_number, email, plate)
     values ('Marco Again', '+41 79 816 00 21', 'LIC-ABC-M2', 'abc-marco@vamostaxi.eu', 'ZH 816 001')$q$,
  'his e-mail can be used again by a new chauffeur (the e-mail index skips deleted rows)'
);
select is((select count(*) from public.vehicles), (select vehicles_before from fx), 'still no vehicle row created or deleted');

select * from finish();
rollback;

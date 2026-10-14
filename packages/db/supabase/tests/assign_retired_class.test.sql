-- assign_retired_class.test.sql
--
-- Phase 30 (vehicle class lifecycle), plan 30-01, migration 20261012210000_assign_refuses_retired_class.sql.
--   CLS-09: ops_assign_leg refuses a chauffeur whose class is retired ('class-retired'); an existing
--           assignment stays.
--   Decision 3: the Retire dialog's count of paid trips with no chauffeur and Assign share one
--           paid/frozen rule (app.booking_assign_refusal): a trip is counted exactly when Assign accepts it.
-- Does not touch assign_by_class.test.sql or ops_assign_leg.test.sql; both must stay green.
-- Rolled back. Synthetic 1-rappen figures only, never a product CHF.
begin;
select plan(36);

-- ── fixtures ────────────────────────────────────────────────────────────────────────────────────
insert into public.vehicle_classes (slug, name, passenger_capacity, luggage_capacity, active)
values ('ar-cls', 'AR class', 6, 6, true),
       ('ar-cls2', 'AR class two', 6, 6, true);

insert into public.chauffeurs (full_name, phone, email, licence_number, vehicle_class_id, plate)
select 'AR Driver', '+41 79 830 00 01', 'ar-driver@vamostaxi.eu', 'LIC-AR-1', vc.id, 'ZH 830 001'
  from public.vehicle_classes vc where vc.slug = 'ar-cls';
insert into public.chauffeurs (full_name, phone, email, licence_number, vehicle_class_id, plate)
select 'AR Driver Two', '+41 79 830 00 02', 'ar-driver2@vamostaxi.eu', 'LIC-AR-2', vc.id, 'ZH 830 002'
  from public.vehicle_classes vc where vc.slug = 'ar-cls2';

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('30000000-0000-4000-b000-000000000001', 'ar-dispatcher@vamostaxi.eu', 'authenticated',
        'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.staff (user_id, role, active, full_name)
values ('30000000-0000-4000-b000-000000000001', 'dispatcher', true, 'AR Dispatcher');

-- label, status, erased, days ahead, class slug
create temporary table ar_spec (label text, st text, erased boolean, days int, cls text);
insert into ar_spec values
  ('i',   'confirmed', false,  2, 'ar-cls'),   -- paid, upcoming, no chauffeur: counted and assignable
  ('ii',  'confirmed', false,  3, 'ar-cls'),   -- no captured payment: not-paid
  ('iii', 'cancelled', false,  4, 'ar-cls'),   -- captured payment but cancelled: frozen
  ('iv',  'confirmed', true,   5, 'ar-cls'),   -- erased: not-found for Assign
  ('v',   'confirmed', false, -1, 'ar-cls'),   -- paid but already in the past: not upcoming
  ('vi',  'confirmed', false,  6, 'ar-cls'),   -- paid, already has a chauffeur
  ('t0',  'confirmed', false,  7, 'ar-cls2'),
  ('t0b', 'confirmed', false,  8, 'ar-cls2');

insert into public.bookings (reference, contact_name, contact_email, status, locale, erased_at)
select public.next_booking_reference(), 'AR ' || s.label, 'ar-' || s.label || '@vamostaxi.eu',
       s.st::public.booking_status, 'en', case when s.erased then now() end
  from ar_spec s;

insert into public.booking_legs (
  booking_id, leg_seq, direction, pickup_text, dropoff_text,
  scheduled_at, scheduled_local, vehicle_class_id, estimated_duration_minutes, pax, bags
)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
       now() + make_interval(days => s.days), to_char(now() + make_interval(days => s.days), 'YYYY-MM-DD"T"HH24:MI'),
       vc.id, 60, 2, 2
  from ar_spec s
  join public.bookings b on b.contact_email = 'ar-' || s.label || '@vamostaxi.eu'
  join public.vehicle_classes vc on vc.slug = s.cls;

-- trip vi already has its chauffeur
update public.booking_legs
   set assigned_chauffeur_id = (select id from public.chauffeurs where licence_number = 'LIC-AR-1'),
       status = 'assigned'
 where booking_id = (select id from public.bookings where contact_email = 'ar-vi@vamostaxi.eu');

set local session_replication_role = replica;
create temporary table ar_ps (n int, id bigint);
with ins as (
  insert into public.price_snapshots (
    quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
    engine_version, pax, bags, lines, policy,
    subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
    expires_at, quote_lock_expires_at
  )
  select
    gen_random_uuid(), vc.id, rv.id, false, sv.id, 'quote-engine@ar', 2, 2, '[]'::jsonb,
    jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                       'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                       'settings_version_id', sv.id, 'modification_deadline_hours', 24,
                       'min_advance_minutes', 180, 'policy_doc', 'test'),
    1, 0, 0, 1, now() + interval '1 day', now() + interval '1 day'
  from public.vehicle_classes vc
  cross join lateral (select id from public.rate_versions order by id limit 1) rv
  cross join lateral (select id from public.settings_versions order by id limit 1) sv
  cross join generate_series(1, 7) as g(n)
  where vc.slug = 'ar-cls'
  returning id
)
insert into ar_ps select row_number() over (order by id), id from ins;

-- a captured payment for every trip except ii
insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at)
select b.id, p.id, 'pi_ar_' || x.label, 1, 'succeeded', now()
  from (select label, row_number() over (order by label) as n from ar_spec where label <> 'ii') x
  join ar_ps p on p.n = x.n
  join public.bookings b on b.contact_email = 'ar-' || x.label || '@vamostaxi.eu';
set local session_replication_role = origin;

create temporary table fx as
select
  (select id from public.bookings where contact_email = 'ar-i@vamostaxi.eu')   as t_i,
  (select id from public.bookings where contact_email = 'ar-ii@vamostaxi.eu')  as t_ii,
  (select id from public.bookings where contact_email = 'ar-iii@vamostaxi.eu') as t_iii,
  (select id from public.bookings where contact_email = 'ar-iv@vamostaxi.eu')  as t_iv,
  (select id from public.bookings where contact_email = 'ar-v@vamostaxi.eu')   as t_v,
  (select id from public.bookings where contact_email = 'ar-t0@vamostaxi.eu')  as t_t0,
  (select id from public.bookings where contact_email = 'ar-t0b@vamostaxi.eu') as t_t0b,
  (select id from public.chauffeurs where licence_number = 'LIC-AR-1') as d1,
  (select id from public.chauffeurs where licence_number = 'LIC-AR-2') as d2,
  (select id from public.vehicle_classes where slug = 'ar-cls')  as c1,
  (select id from public.vehicle_classes where slug = 'ar-cls2') as c2,
  '30000000-0000-4000-b000-000000000001'::uuid as actor;
grant select on fx to public;

-- ── privileges ──────────────────────────────────────────────────────────────────────────────────
select function_privs_are('public', 'ops_assign_leg', '{uuid,uuid,uuid}'::text[], 'vamos_system', '{EXECUTE}'::text[], 'ops_assign_leg: vamos_system holds EXECUTE');
select function_privs_are('public', 'ops_assign_leg', '{uuid,uuid,uuid}'::text[], 'vamos_staff', '{}'::text[], 'ops_assign_leg: vamos_staff holds no EXECUTE');
select ok((select prosecdef and proconfig = array['search_path=""'] from pg_proc where oid = 'public.ops_assign_leg(uuid,uuid,uuid)'::regprocedure),
  'ops_assign_leg: SECURITY DEFINER with an empty search_path');
select has_function('public', 'ops_vehicle_class_unassigned_paid_trips', array['uuid'], 'ops_vehicle_class_unassigned_paid_trips(uuid) exists');
select ok(not has_function_privilege('anon', 'public.ops_vehicle_class_unassigned_paid_trips(uuid)', 'execute'), 'anon cannot execute the count');
select ok(not has_function_privilege('authenticated', 'public.ops_vehicle_class_unassigned_paid_trips(uuid)', 'execute'), 'authenticated cannot execute the count');
select ok(has_function_privilege('vamos_staff', 'public.ops_vehicle_class_unassigned_paid_trips(uuid)', 'execute'), 'vamos_staff can execute the count');
select ok((select prosecdef and proconfig = array['search_path=""'] from pg_proc where oid = 'public.ops_vehicle_class_unassigned_paid_trips(uuid)'::regprocedure),
  'the count is SECURITY DEFINER with an empty search_path');
select has_function('app', 'booking_assign_refusal', array['uuid'], 'app.booking_assign_refusal(uuid) exists');
select ok(not has_function_privilege('anon', 'app.booking_assign_refusal(uuid)', 'execute'), 'anon cannot execute the shared rule');
select ok(not has_function_privilege('authenticated', 'app.booking_assign_refusal(uuid)', 'execute'), 'authenticated cannot execute the shared rule');
select ok(not has_function_privilege('vamos_staff', 'app.booking_assign_refusal(uuid)', 'execute'), 'vamos_staff cannot execute the shared rule');

-- ── one paid/frozen rule: the count and Assign agree case by case ───────────────────────────────
select is(public.ops_vehicle_class_unassigned_paid_trips((select c1 from fx)), 1,
  'the count sees only trip (i): paid, upcoming, no chauffeur, not erased');
select is(app.booking_assign_refusal((select t_i from fx)), null, '(i) paid and confirmed: the rule accepts');
select is(app.booking_assign_refusal((select t_ii from fx)), 'not-paid', '(ii) no captured payment: not-paid');
select is(app.booking_assign_refusal((select t_iii from fx)), 'frozen', '(iii) cancelled: frozen');
select is(app.booking_assign_refusal((select t_v from fx)), null, '(v) a past paid trip passes the money rule; only the upcoming filter excludes it');

select throws_ok(
  format($f$select * from public.ops_assign_leg(%L::uuid, %L::uuid, %L::uuid)$f$, (select t_ii from fx), (select d1 from fx), (select actor from fx)),
  'P0001', 'not-paid', '(ii) Assign refuses with not-paid, as the count does');
select throws_ok(
  format($f$select * from public.ops_assign_leg(%L::uuid, %L::uuid, %L::uuid)$f$, (select t_iii from fx), (select d1 from fx), (select actor from fx)),
  'P0001', 'frozen', '(iii) Assign refuses with frozen, as the count does');
select throws_ok(
  format($f$select * from public.ops_assign_leg(%L::uuid, %L::uuid, %L::uuid)$f$, (select t_iv from fx), (select d1 from fx), (select actor from fx)),
  'P0002', 'not-found', '(iv) Assign cannot see an erased booking, the count excludes it');
select lives_ok(
  format($f$select * from public.ops_assign_leg(%L::uuid, %L::uuid, %L::uuid)$f$, (select t_i from fx), (select d1 from fx), (select actor from fx)),
  '(i) Assign accepts the trip the count included');
select is(
  (select assigned_chauffeur_id from public.booking_legs where booking_id = (select t_i from fx)),
  (select d1 from fx), '(i) the leg now has the chauffeur');
select is(public.ops_vehicle_class_unassigned_paid_trips((select c1 from fx)), 0,
  'the count drops to 0 once the only countable trip has a chauffeur');
select is(
  (select count(*)::int from public.booking_legs where booking_id = (select t_ii from fx) and assigned_chauffeur_id is not null)
  + (select count(*)::int from public.booking_legs where booking_id = (select t_iii from fx) and assigned_chauffeur_id is not null),
  0, 'the refusals wrote nothing');

-- ── CLS-09: a retired class takes no new trips ──────────────────────────────────────────────────
select lives_ok(
  format($f$select * from public.ops_assign_leg(%L::uuid, %L::uuid, %L::uuid)$f$, (select t_t0 from fx), (select d2 from fx), (select actor from fx)),
  'while the class is Live, its chauffeur takes a trip');
select is(public.ops_vehicle_class_unassigned_paid_trips((select c2 from fx)), 1,
  'class two: one countable trip (t0b) before the retire');

update public.vehicle_classes set hidden_at = now(), active = false where id = (select c2 from fx);

select throws_ok(
  format($f$select * from public.ops_assign_leg(%L::uuid, %L::uuid, %L::uuid)$f$, (select t_t0b from fx), (select d2 from fx), (select actor from fx)),
  'P0001', 'class-retired', 'CLS-09: a chauffeur of a retired class is refused with class-retired');
select is(
  (select assigned_chauffeur_id from public.booking_legs where booking_id = (select t_t0 from fx)),
  (select d2 from fx), 'the assignment made before the retire stays');
select is(
  (select assigned_chauffeur_id from public.booking_legs where booking_id = (select t_t0b from fx)),
  null, 'the refused trip stays unassigned');
select is(public.ops_vehicle_class_unassigned_paid_trips((select c2 from fx)), 1,
  'the count still shows the unassigned trip of the retired class');
select throws_ok(
  format($f$select * from public.ops_assign_leg(%L::uuid, %L::uuid, %L::uuid)$f$, (select t_t0b from fx), (select d1 from fx), (select actor from fx)),
  'P0001', 'class-mismatch', 'a Live-class chauffeur still cannot take a trip of another class');

-- bringing the class back lets Assign work again (the documented way to assign such a trip)
update public.vehicle_classes set hidden_at = null, hidden_reason = null where id = (select c2 from fx);
select lives_ok(
  format($f$select * from public.ops_assign_leg(%L::uuid, %L::uuid, %L::uuid)$f$, (select t_t0b from fx), (select d2 from fx), (select actor from fx)),
  'after the class is a Draft again (not retired), the guard no longer applies');
select is(
  (select assigned_chauffeur_id from public.booking_legs where booking_id = (select t_t0b from fx)),
  (select d2 from fx), 'the trip took the chauffeur');
select is(public.ops_vehicle_class_unassigned_paid_trips('00000000-0000-4000-a000-000000000000'::uuid), 0,
  'an unknown class counts 0');
select is(
  (select count(*)::int from public.booking_events where booking_id = (select t_t0 from fx) and kind = 'assignment.chauffeur_set'),
  1, 'one assignment.chauffeur_set event for the first trip, none from the refusal');
select is(public.ops_vehicle_class_unassigned_paid_trips((select c1 from fx)), 0,
  'class one stays at 0 (trip v is past, vi has a chauffeur, iv is erased)');

select * from finish();
rollback;

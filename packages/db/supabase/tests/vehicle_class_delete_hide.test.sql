-- vehicle_class_delete_hide.test.sql
--
-- 26.1-19 D-15: delete in the dashboard is a hard delete when nothing but draft rate rows
-- references the class; otherwise the admin gives a reason and the class is hidden
-- everywhere (hidden_at, hidden_reason, active = false, draft distance_rates hidden).
-- Every FK to vehicle_classes counts: booking_legs, price_snapshots, vehicles, chauffeurs,
-- reviews, and non-draft distance_rates / fixed_routes / distance_bands.
-- Rolled back. Synthetic integer rappen only, never a product CHF.
begin;
select plan(32);

-- ── schema ──────────────────────────────────────────────────────────────────────── 5
select has_column('public', 'vehicle_classes', 'hidden_at', 'vehicle_classes.hidden_at exists');
select has_column('public', 'vehicle_classes', 'hidden_reason', 'vehicle_classes.hidden_reason exists');
select has_function('public', 'ops_vehicle_class_delete_or_hide', array['uuid', 'text'],
  'ops_vehicle_class_delete_or_hide(uuid, text) exists');
select ok(
  not has_function_privilege('anon', 'public.ops_vehicle_class_delete_or_hide(uuid, text)', 'execute'),
  'anon cannot execute ops_vehicle_class_delete_or_hide');
select ok(
  not has_function_privilege('authenticated', 'public.ops_vehicle_class_delete_or_hide(uuid, text)', 'execute'),
  'authenticated cannot execute ops_vehicle_class_delete_or_hide');

-- ── fixtures ────────────────────────────────────────────────────────────────────────
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity, name) values
  ('vh-free', 3, 3, 'VH free'),
  ('vh-free2', 3, 3, 'VH free two'),
  ('vh-leg', 3, 3, 'VH leg'),
  ('vh-snap', 3, 3, 'VH snap'),
  ('vh-veh', 3, 3, 'VH vehicle'),
  ('vh-chf', 3, 3, 'VH chauffeur'),
  ('vh-rev', 3, 3, 'VH review'),
  ('vh-live', 3, 3, 'VH live rate');

create temporary table vh as
select
  (select id from public.vehicle_classes where slug = 'vh-free') as free,
  (select id from public.vehicle_classes where slug = 'vh-free2') as free2,
  (select id from public.vehicle_classes where slug = 'vh-leg') as leg,
  (select id from public.vehicle_classes where slug = 'vh-snap') as snap,
  (select id from public.vehicle_classes where slug = 'vh-veh') as veh,
  (select id from public.vehicle_classes where slug = 'vh-chf') as chf,
  (select id from public.vehicle_classes where slug = 'vh-rev') as rev,
  (select id from public.vehicle_classes where slug = 'vh-live') as live,
  (select id from public.rate_versions where status = 'draft' order by id limit 1) as draft_rv;
grant select on vh to vamos_staff;

-- Draft-only references: these never block a delete.
insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax)
select draft_rv, free, 3 from vh
union all
select draft_rv, leg, 3 from vh;

insert into public.fixed_routes (rate_version_id, origin_zone_id, dest_zone_id, vehicle_class_id)
select vh.draft_rv, z.a, z.b, vh.free
  from vh
  cross join lateral (
    select (select id from public.service_zones order by slug limit 1) as a,
           (select id from public.service_zones order by slug offset 1 limit 1) as b
  ) z;

insert into public.distance_bands (rate_version_id, vehicle_class_id, from_km, per_km_rappen)
select draft_rv, free, 900, 0 from vh;

-- Real references.
insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('26119000-0000-4000-a000-000000000001', 'vh-admin@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('26119000-0000-4000-a000-000000000002', 'vh-dispatch@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.staff (user_id, role, active, accepted_at, full_name) values
  ('26119000-0000-4000-a000-000000000001', 'admin', true, now(), 'VH Admin'),
  ('26119000-0000-4000-a000-000000000002', 'dispatcher', true, now(), 'VH Dispatcher');

insert into public.bookings (contact_name, contact_email, status)
values ('VH Leg', 'vh-leg@vamostaxi.eu', 'pending'),
       ('VH Snap', 'vh-snap@vamostaxi.eu', 'pending');

insert into public.booking_legs (
  booking_id, leg_seq, direction, pickup_text, dropoff_text,
  scheduled_at, scheduled_local, vehicle_class_id, status
)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
       now() + interval '3 days',
       to_char(now() + interval '3 days', 'YYYY-MM-DD"T"HH24:MI'),
       vh.leg, 'confirmed'
  from public.bookings b cross join vh
 where b.contact_email = 'vh-leg@vamostaxi.eu';

insert into public.vehicles (vehicle_class_id, model, plate)
select veh, 'VH Model', 'ZH 261190' from vh;

insert into public.chauffeurs (full_name, phone, licence_number, vehicle_class_id)
select 'VH Chauffeur', '+41000000000', 'VH-261190', chf from vh;

insert into public.reviews (author_name, body, vehicle_class_id)
select 'VH Reviewer', 'VH body', rev from vh;

set local session_replication_role = replica;

insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
  expires_at, quote_lock_expires_at, booking_id
)
select
  gen_random_uuid(), vh.snap, vh.draft_rv, false,
  (select id from public.settings_versions order by id limit 1),
  'quote-engine@26.1-19-vh', 2, 2, '[]'::jsonb, '{}'::jsonb,
  8000, 0, 0, 8000,
  now() + interval '1 day', now() + interval '1 day', b.id
from public.bookings b cross join vh
where b.contact_email = 'vh-snap@vamostaxi.eu';

-- A retired (frozen) rate version rating vh-live: a published price row is a reference.
insert into public.rate_versions (slug, label, status, published_at)
values ('vh-retired', 'VH retired', 'retired', now());

insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax)
select (select id from public.rate_versions where slug = 'vh-retired'), live, 3 from vh;

set local session_replication_role = origin;

-- ── a dispatcher is refused ─────────────────────────────────────────────────────── 2
set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', '26119000-0000-4000-a000-000000000002', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'dispatcher'))::text,
  true);
select throws_ok(
  format($f$select public.ops_vehicle_class_delete_or_hide(%L::uuid, null)$f$, (select free from vh)),
  '42501', null, 'a dispatcher cannot delete a class');
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from public.vehicle_classes where id = (select free from vh)),
  1, 'the refused dispatcher call changed nothing');

-- ── admin ───────────────────────────────────────────────────────────────────────── 25 (17 + 8 after)
set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', '26119000-0000-4000-a000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'admin'))::text,
  true);

select is(
  public.ops_vehicle_class_delete_or_hide((select free from vh), null),
  'deleted', 'D-15: a class with only draft rate rows is deleted');
select is(
  public.ops_vehicle_class_delete_or_hide((select free2 from vh), '   '),
  'deleted', 'D-15: an unreferenced class is deleted; a blank reason is ignored');

select is(
  public.ops_vehicle_class_delete_or_hide((select leg from vh), null),
  'in-use', 'D-15: a booking leg blocks the delete (no reason -> in-use)');
select is(
  public.ops_vehicle_class_delete_or_hide((select leg from vh), '  '),
  'in-use', 'D-15: a whitespace reason counts as no reason');
select is(
  public.ops_vehicle_class_delete_or_hide((select snap from vh), null),
  'in-use', 'D-15: a price snapshot blocks the delete');
select is(
  public.ops_vehicle_class_delete_or_hide((select veh from vh), null),
  'in-use', 'D-15: a vehicle blocks the delete');
select is(
  public.ops_vehicle_class_delete_or_hide((select chf from vh), null),
  'in-use', 'D-15: a chauffeur blocks the delete');
select is(
  public.ops_vehicle_class_delete_or_hide((select rev from vh), null),
  'in-use', 'D-15: a review blocks the delete');
select is(
  public.ops_vehicle_class_delete_or_hide((select live from vh), null),
  'in-use', 'D-15: a frozen (non-draft) rate row blocks the delete');

select throws_ok(
  format($f$select public.ops_vehicle_class_delete_or_hide(%L::uuid, %L)$f$,
    (select leg from vh), repeat('x', 141)),
  '22001', 'reason-too-long', 'a reason over 140 characters is refused');
select throws_ok(
  $f$select public.ops_vehicle_class_delete_or_hide('00000000-0000-4000-a000-000000000000'::uuid, null)$f$,
  'P0002', 'not-found', 'an unknown class is not-found');

select is(
  public.ops_vehicle_class_delete_or_hide((select leg from vh), '  Retired from the fleet  '),
  'hidden', 'D-15: a referenced class with a reason is hidden');
select is(
  public.ops_vehicle_class_delete_or_hide((select snap from vh), 'VH reason'),
  'hidden', 'snapshot-referenced class hides with a reason');
select is(
  public.ops_vehicle_class_delete_or_hide((select veh from vh), 'VH reason'),
  'hidden', 'vehicle-referenced class hides with a reason');
select is(
  public.ops_vehicle_class_delete_or_hide((select chf from vh), 'VH reason'),
  'hidden', 'chauffeur-referenced class hides with a reason');
select is(
  public.ops_vehicle_class_delete_or_hide((select rev from vh), 'VH reason'),
  'hidden', 'review-referenced class hides with a reason');
select is(
  public.ops_vehicle_class_delete_or_hide((select live from vh), 'VH reason'),
  'hidden', 'frozen-rate-referenced class hides with a reason');

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*)::int from public.vehicle_classes where slug in ('vh-free', 'vh-free2')),
  0, 'deleted classes are gone');
select is(
  (select count(*)::int from public.distance_rates where vehicle_class_id = (select free from vh))
  + (select count(*)::int from public.fixed_routes where vehicle_class_id = (select free from vh))
  + (select count(*)::int from public.distance_bands where vehicle_class_id = (select free from vh)),
  0, 'the deleted class''s draft rate rows are gone');
select isnt(
  (select hidden_at from public.vehicle_classes where id = (select leg from vh)),
  null, 'hidden_at is set');
select is(
  (select hidden_reason from public.vehicle_classes where id = (select leg from vh)),
  'Retired from the fleet', 'hidden_reason is the trimmed reason');
select is(
  (select active from public.vehicle_classes where id = (select leg from vh)),
  false, 'a hidden class is inactive');
select is(
  (select bool_and(hide_from_public) from public.distance_rates
    where vehicle_class_id = (select leg from vh) and rate_version_id = (select draft_rv from vh)),
  true, 'a hidden class is hidden from public on the draft');
select is(
  (select count(*)::int from public.vehicle_classes
    where slug in ('vh-leg', 'vh-snap', 'vh-veh', 'vh-chf', 'vh-rev', 'vh-live')
      and hidden_at is not null and active = false),
  6, 'every referenced class still exists, hidden');
select is(
  (select count(*)::int from public.distance_rates where vehicle_class_id = (select live from vh)),
  1, 'the frozen rate row is untouched');

select * from finish();
rollback;

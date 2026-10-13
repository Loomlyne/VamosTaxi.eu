-- pricing_staff_policies.test.sql
--
-- Migration 20261012250000 (owner decision 2026-10-13 item 2, finding D-30-03-1; region_premiums added
-- 2026-10-14). public.distance_bands, public.rate_version_rules and public.region_premiums had only
-- RESTRICTIVE policies for vamos_staff, so every staff session read zero rows.
--   A  shape: the new permissive policy exists on all three tables; the four restrictive policies each are untouched.
--   B  an admin reads all three tables, writes a draft book, and cannot write a published (live) book.
--   C  a dispatcher reads but still cannot insert, update or delete.
--   E  Discard (the route's delete sequence, as admin) removes a draft that has region premiums.
--   D  root cause: without the new permissive policies a staff session reads zero rows, and Discard of a
--      draft with region premiums hits their foreign key.
-- Rolled back. Synthetic integer rappen only.
begin;
select plan(47);

-- Fixtures (as the connecting superuser) ---------------------------------------------------
update public.rate_versions set status = 'retired' where status = 'live';
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('psp-eco', 3, 3);

insert into public.rate_versions (slug, label) values ('psp-draft', 'staff policies draft fixture');
insert into public.rate_versions (slug, label) values ('psp-pub', 'staff policies published fixture');
insert into public.rate_versions (slug, label) values ('psp-draft2', 'staff policies discard fixture');
insert into public.service_zones (slug) values ('psp-zone-a'), ('psp-zone-b');

insert into public.distance_bands (rate_version_id, vehicle_class_id, from_km, to_km, per_km_rappen)
select rv.id, vc.id, 0, 50, 10
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug in ('psp-draft', 'psp-pub') and vc.slug = 'psp-eco';
insert into public.rate_version_rules (rate_version_id, kind, payload)
select rv.id, 'city_pair', jsonb_build_object('pairId', rv.slug)
  from public.rate_versions rv
 where rv.slug in ('psp-draft', 'psp-pub');
-- psp-draft2 holds only a region premium, so its Discard in D can fail on nothing else.
insert into public.region_premiums (rate_version_id, zone_id, percent)
select rv.id, z.id, 5
  from public.rate_versions rv, public.service_zones z
 where rv.slug in ('psp-draft', 'psp-pub', 'psp-draft2') and z.slug = 'psp-zone-a';

update public.rate_versions set status = 'live' where slug = 'psp-pub';

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('f0000000-0000-4000-a000-0000000000a1', 'psp-admin@vamostaxi.eu', 'authenticated', 'authenticated',
        '{}'::jsonb, '{}'::jsonb, now(), now()),
       ('f0000000-0000-4000-a000-0000000000a2', 'psp-dispatcher@vamostaxi.eu', 'authenticated', 'authenticated',
        '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.staff (user_id, role, active, accepted_at, full_name)
values ('f0000000-0000-4000-a000-0000000000a1', 'admin', true, now(), 'PSP Admin'),
       ('f0000000-0000-4000-a000-0000000000a2', 'dispatcher', true, now(), 'PSP Dispatcher');

-- A  shape ----------------------------------------------------------------------------------
select is(
  (select permissive || '|' || roles::text || '|' || cmd || '|' || qual || '|' || with_check
     from pg_policies
    where schemaname = 'public' and tablename = 'distance_bands' and policyname = 'distance_bands_staff_read_write'),
  'PERMISSIVE|{vamos_staff}|ALL|true|true',
  '(A1) distance_bands_staff_read_write is a permissive ALL policy for vamos_staff, using/check true'
);
select is(
  (select permissive || '|' || roles::text || '|' || cmd || '|' || qual || '|' || with_check
     from pg_policies
    where schemaname = 'public' and tablename = 'rate_version_rules' and policyname = 'rate_version_rules_staff_read_write'),
  'PERMISSIVE|{vamos_staff}|ALL|true|true',
  '(A2) rate_version_rules_staff_read_write is a permissive ALL policy for vamos_staff, using/check true'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'distance_bands' and permissive = 'RESTRICTIVE'
      and policyname in ('distance_bands_staff_all', 'distance_bands_admin_insert',
                         'distance_bands_admin_delete', 'distance_bands_admin_update')),
  4,
  '(A3) the four restrictive policies on distance_bands are still present'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'rate_version_rules' and permissive = 'RESTRICTIVE'
      and policyname in ('rate_version_rules_staff_all', 'rate_version_rules_admin_insert',
                         'rate_version_rules_admin_delete', 'rate_version_rules_admin_update')),
  4,
  '(A4) the four restrictive policies on rate_version_rules are still present'
);
select is(
  (select permissive || '|' || roles::text || '|' || cmd || '|' || qual || '|' || with_check
     from pg_policies
    where schemaname = 'public' and tablename = 'region_premiums' and policyname = 'region_premiums_staff_read_write'),
  'PERMISSIVE|{vamos_staff}|ALL|true|true',
  '(A5) region_premiums_staff_read_write is a permissive ALL policy for vamos_staff, using/check true'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'region_premiums' and permissive = 'RESTRICTIVE'
      and policyname in ('region_premiums_staff_all', 'region_premiums_admin_insert',
                         'region_premiums_admin_delete', 'region_premiums_admin_update')),
  4,
  '(A6) the four restrictive policies on region_premiums are still present'
);

-- B  admin ---------------------------------------------------------------------------------
set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'f0000000-0000-4000-a000-0000000000a1', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'admin'))::text,
  true);

select is(
  (select count(*)::int from public.distance_bands b join public.rate_versions rv on rv.id = b.rate_version_id
    where rv.slug in ('psp-draft', 'psp-pub')),
  2,
  '(B1) an admin staff session reads the seeded distance_bands rows (draft and published book)'
);
select is(
  (select count(*)::int from public.rate_version_rules r join public.rate_versions rv on rv.id = r.rate_version_id
    where rv.slug in ('psp-draft', 'psp-pub')),
  2,
  '(B2) an admin staff session reads the seeded rate_version_rules rows (draft and published book)'
);
select lives_ok(
  $$ insert into public.distance_bands (rate_version_id, vehicle_class_id, from_km, to_km, per_km_rappen)
     select rv.id, vc.id, 50, 200, 7 from public.rate_versions rv, public.vehicle_classes vc
      where rv.slug = 'psp-draft' and vc.slug = 'psp-eco' $$,
  '(B3) an admin can insert a distance band into a draft book'
);
select lives_ok(
  $$ insert into public.rate_version_rules (rate_version_id, kind, payload)
     select rv.id, 'city_pair', '{"pairId":"psp-new"}'::jsonb from public.rate_versions rv where rv.slug = 'psp-draft' $$,
  '(B4) an admin can insert a city_pair rule into a draft book'
);
select lives_ok(
  $$ update public.distance_bands set per_km_rappen = 11
      where rate_version_id = (select id from public.rate_versions where slug = 'psp-draft') and from_km = 0 $$,
  '(B5) an admin can update a distance band of a draft book'
);
select throws_ok(
  $$ insert into public.distance_bands (rate_version_id, vehicle_class_id, from_km, to_km, per_km_rappen)
     select rv.id, vc.id, 50, 200, 7 from public.rate_versions rv, public.vehicle_classes vc
      where rv.slug = 'psp-pub' and vc.slug = 'psp-eco' $$,
  '23001', null,
  '(B6) even an admin cannot insert a distance band into a published book (frozen trigger)'
);
select throws_ok(
  $$ insert into public.rate_version_rules (rate_version_id, kind, payload)
     select rv.id, 'city_pair', '{"pairId":"psp-late"}'::jsonb from public.rate_versions rv where rv.slug = 'psp-pub' $$,
  '23001', null,
  '(B7) even an admin cannot insert a rule into a published book (frozen trigger)'
);
select throws_ok(
  $$ update public.distance_bands set per_km_rappen = 99
      where rate_version_id = (select id from public.rate_versions where slug = 'psp-pub') $$,
  '23001', null,
  '(B8) even an admin cannot update a distance band of a published book'
);
select throws_ok(
  $$ update public.rate_version_rules set payload = '{"pairId":"changed"}'::jsonb
      where rate_version_id = (select id from public.rate_versions where slug = 'psp-pub') $$,
  '23001', null,
  '(B9) even an admin cannot update a rule of a published book'
);
select throws_ok(
  $$ delete from public.distance_bands
      where rate_version_id = (select id from public.rate_versions where slug = 'psp-pub') $$,
  '23001', null,
  '(B10) even an admin cannot delete a distance band of a published book'
);
select throws_ok(
  $$ delete from public.rate_version_rules
      where rate_version_id = (select id from public.rate_versions where slug = 'psp-pub') $$,
  '23001', null,
  '(B11) even an admin cannot delete a rule of a published book'
);
select is(
  (select count(*)::int from public.region_premiums p join public.rate_versions rv on rv.id = p.rate_version_id
    where rv.slug in ('psp-draft', 'psp-pub')),
  2,
  '(B12) an admin staff session reads the seeded region_premiums rows (draft and published book)'
);
select lives_ok(
  $$ insert into public.region_premiums (rate_version_id, zone_id, percent)
     select rv.id, z.id, 3 from public.rate_versions rv, public.service_zones z
      where rv.slug = 'psp-draft' and z.slug = 'psp-zone-b' $$,
  '(B13) an admin can insert a region premium into a draft book'
);
select lives_ok(
  $$ update public.region_premiums set percent = 6
      where rate_version_id = (select id from public.rate_versions where slug = 'psp-draft') $$,
  '(B14) an admin can update a region premium of a draft book'
);
select throws_ok(
  $$ insert into public.region_premiums (rate_version_id, zone_id, percent)
     select rv.id, z.id, 3 from public.rate_versions rv, public.service_zones z
      where rv.slug = 'psp-pub' and z.slug = 'psp-zone-b' $$,
  '23001', null,
  '(B15) even an admin cannot insert a region premium into a published book (frozen trigger)'
);
select throws_ok(
  $$ update public.region_premiums set percent = 9
      where rate_version_id = (select id from public.rate_versions where slug = 'psp-pub') $$,
  '23001', null,
  '(B16) even an admin cannot update a region premium of a published book'
);
select throws_ok(
  $$ delete from public.region_premiums
      where rate_version_id = (select id from public.rate_versions where slug = 'psp-pub') $$,
  '23001', null,
  '(B17) even an admin cannot delete a region premium of a published book'
);
reset role;

-- C  dispatcher ----------------------------------------------------------------------------
-- A dispatcher cannot read rate_versions (admin-only restrictive policy), so ids are resolved here, as the
-- superuser, into a temp table the dispatcher may read; the row-count helper runs the statement as the caller.
create temp table psp_ids as
  select (select id from public.rate_versions where slug = 'psp-draft') as draft,
         (select id from public.rate_versions where slug = 'psp-pub') as pub,
         (select id from public.rate_versions where slug = 'psp-draft2') as draft2,
         (select id from public.vehicle_classes where slug = 'psp-eco') as cls,
         (select id from public.service_zones where slug = 'psp-zone-b') as zone_b;
grant select on psp_ids to vamos_staff;
create function pg_temp.psp_rows(p_sql text) returns integer language plpgsql as $$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;

set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'f0000000-0000-4000-a000-0000000000a2', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'dispatcher'))::text,
  true);

select ok(
  (select count(*) from public.distance_bands where rate_version_id in (select draft from psp_ids union select pub from psp_ids)) > 0,
  '(C1) a dispatcher reads distance_bands rows'
);
select ok(
  (select count(*) from public.rate_version_rules where rate_version_id in (select draft from psp_ids union select pub from psp_ids)) > 0,
  '(C2) a dispatcher reads rate_version_rules rows'
);
select throws_ok(
  $$ insert into public.distance_bands (rate_version_id, vehicle_class_id, from_km, to_km, per_km_rappen)
     values ((select draft from psp_ids), (select cls from psp_ids), 200, 400, 5) $$,
  '23001', null,
  '(C3) a dispatcher cannot insert a distance band (refused by the frozen trigger: it cannot read rate_versions, so the book does not read as draft; 42501 would be the admin-only policy)'
);
select throws_ok(
  $$ insert into public.rate_version_rules (rate_version_id, kind, payload)
     values ((select draft from psp_ids), 'city_pair', '{"pairId":"psp-disp"}'::jsonb) $$,
  '23001', null,
  '(C4) a dispatcher cannot insert a rule (refused by the frozen trigger: it cannot read rate_versions, so the book does not read as draft; 42501 would be the admin-only policy)'
);
select is(
  pg_temp.psp_rows('update public.distance_bands set per_km_rappen = 1 where rate_version_id = (select draft from psp_ids)'),
  0,
  '(C5) a dispatcher update of a draft distance band affects 0 rows'
);
select is(
  pg_temp.psp_rows('delete from public.distance_bands where rate_version_id = (select draft from psp_ids)'),
  0,
  '(C6) a dispatcher delete of a draft distance band affects 0 rows'
);
select is(
  pg_temp.psp_rows($q$update public.rate_version_rules set payload = '{}'::jsonb where rate_version_id = (select draft from psp_ids)$q$),
  0,
  '(C7) a dispatcher update of a draft rule affects 0 rows'
);
select is(
  pg_temp.psp_rows('delete from public.rate_version_rules where rate_version_id = (select draft from psp_ids)'),
  0,
  '(C8) a dispatcher delete of a draft rule affects 0 rows'
);
-- A published book: the *_admin_update policies let a dispatcher's UPDATE through
-- (`or app.rate_version_published(...)`), so the frozen trigger is what refuses it. DELETE has no
-- published carve-out, so the admin-only policy filters every row out.
select throws_ok(
  $$ update public.distance_bands set per_km_rappen = 1 where rate_version_id = (select pub from psp_ids) $$,
  '23001', null,
  '(C9) a dispatcher update of a published distance band is refused by the frozen trigger'
);
select is(
  pg_temp.psp_rows('delete from public.distance_bands where rate_version_id = (select pub from psp_ids)'),
  0,
  '(C10) a dispatcher delete of a published distance band affects 0 rows'
);
select throws_ok(
  $$ update public.rate_version_rules set payload = '{}'::jsonb where rate_version_id = (select pub from psp_ids) $$,
  '23001', null,
  '(C11) a dispatcher update of a published rule is refused by the frozen trigger'
);
select is(
  pg_temp.psp_rows('delete from public.rate_version_rules where rate_version_id = (select pub from psp_ids)'),
  0,
  '(C12) a dispatcher delete of a published rule affects 0 rows'
);
select ok(
  (select count(*) from public.region_premiums where rate_version_id in (select draft from psp_ids union select pub from psp_ids)) > 0,
  '(C13) a dispatcher reads region_premiums rows'
);
select throws_ok(
  $$ insert into public.region_premiums (rate_version_id, zone_id, percent)
     values ((select draft2 from psp_ids), (select zone_b from psp_ids), 4) $$,
  '23001', null,
  '(C14) a dispatcher cannot insert a region premium (refused by the frozen trigger, as C3)'
);
select is(
  pg_temp.psp_rows('update public.region_premiums set percent = 1 where rate_version_id = (select draft from psp_ids)'),
  0,
  '(C15) a dispatcher update of a draft region premium affects 0 rows'
);
select is(
  pg_temp.psp_rows('delete from public.region_premiums where rate_version_id = (select draft from psp_ids)'),
  0,
  '(C16) a dispatcher delete of a draft region premium affects 0 rows'
);
select throws_ok(
  $$ update public.region_premiums set percent = 1 where rate_version_id = (select pub from psp_ids) $$,
  '23001', null,
  '(C17) a dispatcher update of a published region premium is refused by the frozen trigger'
);
select is(
  pg_temp.psp_rows('delete from public.region_premiums where rate_version_id = (select pub from psp_ids)'),
  0,
  '(C18) a dispatcher delete of a published region premium affects 0 rows'
);
reset role;

-- E  Discard of a draft with region premiums (the discard route's delete sequence, as admin) -------
set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'f0000000-0000-4000-a000-0000000000a1', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'admin'))::text,
  true);
select lives_ok(
  $$ delete from public.coupons where rate_version_id = (select draft from psp_ids);
     delete from public.surcharges where rate_version_id = (select draft from psp_ids);
     delete from public.rate_version_rules where rate_version_id = (select draft from psp_ids);
     delete from public.distance_bands where rate_version_id = (select draft from psp_ids);
     delete from public.region_premiums where rate_version_id = (select draft from psp_ids);
     delete from public.fixed_routes where rate_version_id = (select draft from psp_ids);
     delete from public.distance_rates where rate_version_id = (select draft from psp_ids);
     delete from public.rate_versions where id = (select draft from psp_ids) and status = 'draft' $$,
  '(E1) an admin discards a draft that holds region premiums, bands and rules'
);
reset role;
select is(
  (select count(*)::int from public.rate_versions where id = (select draft from psp_ids))
    + (select count(*)::int from public.region_premiums where rate_version_id = (select draft from psp_ids)),
  0,
  '(E2) the discarded draft and its region premiums are gone'
);

-- D  root cause: without the permissive policies staff reads nothing ------------------------
drop policy distance_bands_staff_read_write on public.distance_bands;
drop policy rate_version_rules_staff_read_write on public.rate_version_rules;
drop policy region_premiums_staff_read_write on public.region_premiums;

set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'f0000000-0000-4000-a000-0000000000a1', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'admin'))::text,
  true);
select is(
  (select count(*)::int from public.distance_bands b join public.rate_versions rv on rv.id = b.rate_version_id
    where rv.slug in ('psp-draft', 'psp-pub')),
  0,
  '(D1) without the permissive policy an admin staff session reads zero distance_bands rows (the bug)'
);
select is(
  (select count(*)::int from public.rate_version_rules r join public.rate_versions rv on rv.id = r.rate_version_id
    where rv.slug in ('psp-draft', 'psp-pub')),
  0,
  '(D2) without the permissive policy an admin staff session reads zero rate_version_rules rows (the bug)'
);
select is(
  (select count(*)::int from public.region_premiums p join public.rate_versions rv on rv.id = p.rate_version_id
    where rv.slug in ('psp-pub', 'psp-draft2')),
  0,
  '(D3) without the permissive policy an admin staff session reads zero region_premiums rows (the bug)'
);
select throws_ok(
  $$ delete from public.region_premiums where rate_version_id = (select draft2 from psp_ids);
     delete from public.rate_versions where id = (select draft2 from psp_ids) and status = 'draft' $$,
  '23503', null,
  '(D4) without the permissive policy Discard of a draft with region premiums deletes none of them and hits their foreign key (the bug)'
);
reset role;

select * from finish();
rollback;

-- canton_zones.test.sql
--
-- 26.1-10 (D-10, D-10a, D-13): the pricing engine gets real areas to match.
--   - zone_type 'canton' is legal and the 26 Swiss cantons exist once as service_zones
--     (slug canton-<code>, tag canton:<CODE>) with their official, non-translatable names in
--     content_strings (zone.canton-<code>).
--   - ops_fill_canton_pairs(version, price) fills every unordered canton -> different canton
--     pair, once, for every class that has a distance_rates row in a DRAFT version. It skips a
--     pair that already exists in either direction, returns the inserted count, and refuses
--     live/retired versions (frozen) and non-admin callers.
--
-- The price passed below is a synthetic in-transaction integer (rolled back at the end of the
-- file). The real pair amount is typed by the owner as a function argument in the SQL editor;
-- no amount for it is stored anywhere in the repo (D-10a, D-13).
begin;
select plan(24);

-- ── 26 canton zones ──────────────────────────────────────────────────────────────────────────
select is(
  (select count(*) from public.service_zones where zone_type = 'canton')::int,
  26,
  'exactly 26 service_zones carry zone_type canton (D-10a)'
);

select set_eq(
  $$ select slug, tags from public.service_zones where zone_type = 'canton' $$,
  $$ select 'canton-' || lower(c), array['canton:' || c]
       from unnest(array['AG','AI','AR','BE','BL','BS','FR','GE','GL','GR','JU','LU','NE',
                         'NW','OW','SG','SH','SO','SZ','TG','TI','UR','VD','VS','ZG','ZH']) as c $$,
  'each canton zone is slug canton-<code> with the single tag canton:<CODE>'
);

select is(
  (select count(*) from public.service_zones where zone_type = 'canton' and active)::int,
  26,
  'all 26 canton zones are active'
);

select is(
  (select count(*)
     from public.content_strings cs
     join public.service_zones z on cs.key = 'zone.' || z.slug
    where z.zone_type = 'canton'
      and cs.non_translatable
      and cs.de = cs.en and cs.fr = cs.en and cs.ar = cs.en)::int,
  26,
  'every canton has a non-translatable zone.<slug> display name, same in en/de/fr/ar'
);

select results_eq(
  $$ select en from public.content_strings where key in ('zone.canton-ge','zone.canton-gr','zone.canton-zh') order by key $$,
  $$ values ('Genève'::text), ('Graubünden'), ('Zürich') $$,
  'canton display names are the official proper names'
);

select lives_ok(
  $$ insert into public.service_zones (slug, zone_type) values ('ccz-extra-canton', 'canton') $$,
  'zone_type CHECK accepts canton'
);
delete from public.service_zones where slug = 'ccz-extra-canton';

-- ── function shape and grants ────────────────────────────────────────────────────────────────
select has_function('public', 'ops_fill_canton_pairs', array['bigint', 'rappen'],
  'ops_fill_canton_pairs(bigint, rappen) exists');

select ok(
  not has_function_privilege('anon', 'public.ops_fill_canton_pairs(bigint, public.rappen)', 'execute')
  and not has_function_privilege('authenticated', 'public.ops_fill_canton_pairs(bigint, public.rappen)', 'execute'),
  'anon and authenticated cannot execute ops_fill_canton_pairs'
);

select ok(
  has_function_privilege('vamos_staff', 'public.ops_fill_canton_pairs(bigint, public.rappen)', 'execute'),
  'vamos_staff can execute ops_fill_canton_pairs (the function itself requires app.is_admin())'
);

-- ── fixtures ─────────────────────────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('26100000-0000-4000-a000-000000000001', 'ccz-admin@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('26100000-0000-4000-a000-000000000002', 'ccz-dispatch@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.staff (user_id, role, active, accepted_at) values
  ('26100000-0000-4000-a000-000000000001', 'admin', true, now()),
  ('26100000-0000-4000-a000-000000000002', 'dispatcher', true, now());

-- Draft A: all three seeded classes. Draft B: economy only, with one pair pre-entered in the
-- reverse direction. Draft C: economy only, published below to prove the frozen refusal.
insert into public.rate_versions (slug, label) values
  ('ccz-draft-a', 'Canton test A'),
  ('ccz-draft-b', 'Canton test B'),
  ('ccz-draft-c', 'Canton test C');

insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax)
select rv.id, vc.id, 3
  from public.rate_versions rv
  join public.vehicle_classes vc
    on (rv.slug = 'ccz-draft-a')
    or (rv.slug in ('ccz-draft-b', 'ccz-draft-c') and vc.slug = 'economy');

-- Reverse direction (ZH -> AG) of the unordered pair AG/ZH, on draft B.
insert into public.fixed_routes (rate_version_id, origin_zone_id, dest_zone_id, vehicle_class_id, price_rappen, live)
select rv.id,
       (select id from public.service_zones where slug = 'canton-zh'),
       (select id from public.service_zones where slug = 'canton-ag'),
       (select id from public.vehicle_classes where slug = 'economy'),
       null, false
  from public.rate_versions rv where rv.slug = 'ccz-draft-b';

-- ── draft fill as the owner (postgres, no role switch) ───────────────────────────────────────
select is(
  public.ops_fill_canton_pairs((select id from public.rate_versions where slug = 'ccz-draft-a'), 1),
  325 * 3,
  'draft A: 325 unordered pairs x 3 classes inserted, count returned'
);

select is(
  (select count(*)
     from public.fixed_routes f
     join public.service_zones o on o.id = f.origin_zone_id
     join public.service_zones d on d.id = f.dest_zone_id
    where f.rate_version_id = (select id from public.rate_versions where slug = 'ccz-draft-a')
      and o.zone_type = 'canton' and d.zone_type = 'canton'
      and o.slug < d.slug
      and f.live
      and f.price_rappen = 1)::int,
  325 * 3,
  'every filled row is canton -> canton, origin code < dest code, live, at the given price'
);

select is(
  (select count(distinct (f.origin_zone_id, f.dest_zone_id))
     from public.fixed_routes f
    where f.rate_version_id = (select id from public.rate_versions where slug = 'ccz-draft-a'))::int,
  325,
  'one row per unordered pair per class (26 choose 2 = 325 pairs)'
);

select is(
  public.ops_fill_canton_pairs((select id from public.rate_versions where slug = 'ccz-draft-a'), 1),
  0,
  'second run on the same draft inserts 0'
);

select is(
  public.ops_fill_canton_pairs((select id from public.rate_versions where slug = 'ccz-draft-b'), 1),
  324,
  'draft B: only economy is filled, and the pair entered in reverse direction is skipped'
);

select is(
  (select count(*) from public.fixed_routes
    where rate_version_id = (select id from public.rate_versions where slug = 'ccz-draft-b')
      and price_rappen is null)::int,
  1,
  'the pre-existing reverse-direction row on draft B is left untouched'
);

select throws_ok(
  $$ select public.ops_fill_canton_pairs((select id from public.rate_versions where slug = 'ccz-draft-c'), null) $$,
  '22004',
  null,
  'a null price is refused'
);

select throws_ok(
  $$ select public.ops_fill_canton_pairs(-1, 1) $$,
  'P0002',
  null,
  'an unknown rate version is refused'
);

-- ── caller gate ──────────────────────────────────────────────────────────────────────────────
set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', '26100000-0000-4000-a000-000000000002', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'dispatcher'))::text,
  true);
select throws_ok(
  $$ select public.ops_fill_canton_pairs((select id from public.rate_versions where slug = 'ccz-draft-c'), 1) $$,
  '42501',
  null,
  'a dispatcher (vamos_staff, not admin) is refused'
);
reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select count(*) from public.fixed_routes
    where rate_version_id = (select id from public.rate_versions where slug = 'ccz-draft-c'))::int,
  0,
  'the refused dispatcher call inserted nothing'
);

set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', '26100000-0000-4000-a000-000000000001', 'role', 'authenticated', 'aal', 'aal1',
    'app_metadata', jsonb_build_object('vamos_role', 'admin'))::text,
  true);
select is(
  public.ops_fill_canton_pairs((select id from public.rate_versions where slug = 'ccz-draft-c'), 1),
  325,
  'the admin (vamos_staff + app.is_admin()) fills a draft'
);
reset role;

-- ── frozen: live and retired versions are refused ────────────────────────────────────────────
-- Remove draft C's rows again so it can be published with no fixed routes, then publish it
-- with synthetic in-transaction start/per-km figures (rolled back; never a real amount).
delete from public.fixed_routes
 where rate_version_id = (select id from public.rate_versions where slug = 'ccz-draft-c');
update public.distance_rates set base_fare_rappen = 1, per_km_rappen = 1
 where rate_version_id = (select id from public.rate_versions where slug = 'ccz-draft-c');
select set_config('request.jwt.claims',
  '{"sub":"26100000-0000-4000-a000-000000000001","role":"authenticated"}', true);
update public.rate_versions set status = 'live' where slug = 'ccz-draft-c';

select throws_ok(
  $$ select public.ops_fill_canton_pairs((select id from public.rate_versions where slug = 'ccz-draft-c'), 1) $$,
  '23001',
  null,
  'a live version is refused (frozen)'
);
select is(
  (select count(*) from public.fixed_routes
    where rate_version_id = (select id from public.rate_versions where slug = 'ccz-draft-c'))::int,
  0,
  'the refused live call inserted nothing'
);

update public.rate_versions set status = 'retired' where slug = 'ccz-draft-c';
select throws_ok(
  $$ select public.ops_fill_canton_pairs((select id from public.rate_versions where slug = 'ccz-draft-c'), 1) $$,
  '23001',
  null,
  'a retired version is refused (frozen)'
);
select is(
  (select count(*) from public.fixed_routes
    where rate_version_id = (select id from public.rate_versions where slug = 'ccz-draft-c'))::int,
  0,
  'the refused retired call inserted nothing'
);

select * from finish();
rollback;

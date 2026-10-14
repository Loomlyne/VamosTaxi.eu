-- vehicle_class_lifecycle.test.sql
--
-- Phase 30 (vehicle class lifecycle), plan 30-01, migration 20261012200000_class_lifecycle.sql.
-- Draft -> Live (Go live guard), Live|Draft -> Retired, Retired -> Draft (Bring back), the shared
-- "what is missing" function, admin-only grants, the draft price-book strip, the audit trail,
-- the test-classes guard (decision 1) and empty seats/bags until Live (decision 6).
-- Most calls run as the table owner with staff claims (app.is_admin() reads only the claims and
-- the staff row); the grant checks and one real vamos_staff call prove the role path.
-- Rolled back. Synthetic integer rappen only, never a product CHF.
begin;
select plan(82);

-- ── fixtures ────────────────────────────────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('30000000-0000-4000-a000-000000000001', 'lc-admin@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('30000000-0000-4000-a000-000000000002', 'lc-dispatch@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.staff (user_id, role, active, accepted_at, full_name) values
  ('30000000-0000-4000-a000-000000000001', 'admin', true, now(), 'LC Admin'),
  ('30000000-0000-4000-a000-000000000002', 'dispatcher', true, now(), 'LC Dispatcher');

-- Draft classes (active = false). Photo, seats and bags as each case needs.
insert into public.vehicle_classes (slug, name, passenger_capacity, luggage_capacity, active, photo_path) values
  ('lc-new',     'LC new',     3,    2,    false, null),
  ('lc-nophoto', 'LC nophoto', 3,    2,    false, null),
  ('lc-hidden',  'LC hidden',  3,    2,    false, 'site/lc-hidden.jpg'),
  ('lc-ret',     'LC ret',     3,    2,    false, 'site/lc-ret.jpg'),
  ('lc-back',    'LC back',    3,    2,    false, 'site/lc-back.jpg'),
  ('lc-sb1',     'LC sb1',     null, null, false, null),
  ('lc-sb',      'LC sb',      null, null, false, 'site/lc-sb.jpg'),
  ('lc-sb2',     'LC sb2',     null, null, false, null);

create temporary table lc as
select
  (select id from public.vehicle_classes where slug = 'lc-new')     as c_new,
  (select id from public.vehicle_classes where slug = 'lc-nophoto') as c_nophoto,
  (select id from public.vehicle_classes where slug = 'lc-hidden')  as c_hidden,
  (select id from public.vehicle_classes where slug = 'lc-ret')     as c_ret,
  (select id from public.vehicle_classes where slug = 'lc-back')    as c_back,
  (select id from public.vehicle_classes where slug = 'lc-sb1')     as c_sb1,
  (select id from public.vehicle_classes where slug = 'lc-sb')      as c_sb,
  (select id from public.vehicle_classes where slug = 'lc-sb2')     as c_sb2;
grant select on lc to vamos_staff;

-- Live book 1 (the fixture order of rest_function_grants: retire the current live book first).
update public.rate_versions set status = 'retired' where status = 'live';
insert into public.rate_versions (slug, label) values ('lc-live1', 'LC live book 1');
insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen, available, hide_from_public)
select (select id from public.rate_versions where slug = 'lc-live1'), c.cid, 3, 1, 2, 3, true, c.hid
  from lc, lateral (values (lc.c_nophoto, false), (lc.c_hidden, true), (lc.c_ret, false), (lc.c_back, false), (lc.c_sb, false)) as c(cid, hid);
-- A surcharge in the book that is about to be frozen (km bands, region % and the Rules list are
-- gone since 20261012300000, decision 2026-10-13 items 10 and 13).
insert into public.surcharges (rate_version_id, code, kind, amount_rappen, predicate)
select rv.id, 'lc_frozen', 'amount', 100, '{"lc": true}'::jsonb
  from public.rate_versions rv where rv.slug = 'lc-live1';
update public.rate_versions set status = 'live' where slug = 'lc-live1';

-- Draft book A (the newest draft): rows of lc-ret that Retire must strip.
insert into public.rate_versions (slug, label) values ('lc-draftA', 'LC draft A');
insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen)
select (select id from public.rate_versions where slug = 'lc-draftA'), lc.c_ret, 3, 1, 2, 3 from lc;
insert into public.fixed_routes (rate_version_id, origin_zone_id, dest_zone_id, vehicle_class_id)
select (select id from public.rate_versions where slug = 'lc-draftA'), z.a, z.b, lc.c_ret
  from lc cross join lateral (
    select (select id from public.service_zones order by slug limit 1) as a,
           (select id from public.service_zones order by slug offset 1 limit 1) as b) z;
insert into public.surcharges (rate_version_id, code, kind, amount_rappen, predicate)
select rv.id, 'lc_extra', 'amount', 100, '{"lc": true}'::jsonb
  from public.rate_versions rv where rv.slug = 'lc-draftA';

create temporary table lcv as
select (select id from public.rate_versions where slug = 'lc-live1') as live1,
       (select id from public.rate_versions where slug = 'lc-draftA') as draft_a;
create temporary table lcaud (k text, n int);
create temporary table lcsnap (k text, v text);

-- What a refused call reports in DETAIL.
create function pg_temp.lc_detail(p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  execute p_sql;
  return 'no error';
exception when others then
  get stacked diagnostics v = pg_exception_detail;
  return coalesce(v, '');
end $f$;

-- ── schema and grants ───────────────────────────────────────────────────────────────────────────
select has_function('public', 'ops_vehicle_class_missing', array['uuid'], 'ops_vehicle_class_missing(uuid) exists');
select has_function('public', 'ops_vehicle_class_set_status', array['uuid', 'text', 'text'], 'ops_vehicle_class_set_status(uuid, text, text) exists');
select ok(not has_function_privilege('anon', 'public.ops_vehicle_class_missing(uuid)', 'execute'), 'anon cannot execute ops_vehicle_class_missing');
select ok(not has_function_privilege('authenticated', 'public.ops_vehicle_class_missing(uuid)', 'execute'), 'authenticated cannot execute ops_vehicle_class_missing');
select ok(not has_function_privilege('anon', 'public.ops_vehicle_class_set_status(uuid, text, text)', 'execute'), 'anon cannot execute ops_vehicle_class_set_status');
select ok(not has_function_privilege('authenticated', 'public.ops_vehicle_class_set_status(uuid, text, text)', 'execute'), 'authenticated cannot execute ops_vehicle_class_set_status');
select ok(has_function_privilege('vamos_staff', 'public.ops_vehicle_class_missing(uuid)', 'execute'), 'vamos_staff can execute ops_vehicle_class_missing');
select ok(has_function_privilege('vamos_staff', 'public.ops_vehicle_class_set_status(uuid, text, text)', 'execute'), 'vamos_staff can execute ops_vehicle_class_set_status');
select is(
  (select count(*)::int from pg_proc p
    where p.oid in ('public.ops_vehicle_class_missing(uuid)'::regprocedure, 'public.ops_vehicle_class_set_status(uuid, text, text)'::regprocedure)
      and p.prosecdef and p.proconfig = array['search_path=""']),
  2, 'both are security definer with an empty search_path');
select ok(
  not exists (select 1 from pg_proc p
    where p.oid in ('public.ops_vehicle_class_missing(uuid)'::regprocedure, 'public.ops_vehicle_class_set_status(uuid, text, text)'::regprocedure)
      and p.proacl::text ~ '(^|[{,])=X/'),
  'PUBLIC holds EXECUTE on neither');
select col_is_null('public', 'vehicle_classes', 'passenger_capacity', 'passenger_capacity is nullable (decision 6)');
select col_is_null('public', 'vehicle_classes', 'luggage_capacity', 'luggage_capacity is nullable (decision 6)');
select col_is_null('public', 'distance_rates', 'max_pax', 'distance_rates.max_pax is nullable (decision 6)');

-- ── a dispatcher is refused ─────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  jsonb_build_object('sub', '30000000-0000-4000-a000-000000000002', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'dispatcher'))::text, true);
select throws_ok(
  format($f$select public.ops_vehicle_class_set_status(%L::uuid, 'retired', null)$f$, (select c_nophoto from lc)),
  '42501', 'admin-only', 'a dispatcher cannot change a class state');
set local role vamos_staff;
select throws_ok(
  format($f$select public.ops_vehicle_class_set_status(%L::uuid, 'live', null)$f$, (select c_nophoto from lc)),
  '42501', 'admin-only', 'a dispatcher on the real vamos_staff role cannot change a class state');
reset role;
select is(
  (select count(*)::int from public.vehicle_classes where slug = 'lc-nophoto' and active = false and hidden_at is null),
  1, 'the refused calls changed nothing');

-- ── admin ───────────────────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims',
  jsonb_build_object('sub', '30000000-0000-4000-a000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'admin'))::text, true);
set local role vamos_staff;
select is(public.ops_vehicle_class_missing((select c_new from lc)), 'photo,price',
  'vamos_staff (admin) reads the missing list through the role');
reset role;

-- What is missing (Go live guard, same function)
select is(public.ops_vehicle_class_missing((select c_nophoto from lc)), 'photo',
  'priced class without a photo: photo is missing');
select is(public.ops_vehicle_class_missing((select c_hidden from lc)), 'price',
  'R8: a priced row hidden from public is not a price');
select is(public.ops_vehicle_class_missing((select c_ret from lc)), '',
  'photo, seats, bags and a live-book price: nothing is missing');
select is(public.ops_vehicle_class_missing('00000000-0000-4000-a000-000000000000'::uuid), null,
  'an unknown class answers null');
select throws_ok(
  format($f$select public.ops_vehicle_class_set_status(%L::uuid, 'live', null)$f$, (select c_new from lc)),
  'P0001', 'incomplete', 'Go live without photo and price is refused');
select is(pg_temp.lc_detail(format($f$select public.ops_vehicle_class_set_status(%L::uuid, 'live', null)$f$, (select c_new from lc))),
  'photo,price', 'the refusal names what is missing in DETAIL');
select throws_ok(
  format($f$select public.ops_vehicle_class_set_status(%L::uuid, 'live', null)$f$, (select c_hidden from lc)),
  'P0001', 'incomplete', 'R8: Go live with only a hidden-from-public price is refused');
select throws_ok(
  format($f$select public.ops_vehicle_class_set_status(%L::uuid, 'live', null)$f$, (select c_nophoto from lc)),
  'P0001', 'incomplete', 'Go live without a photo is refused');
select is(
  (select active from public.vehicle_classes where id = (select c_new from lc)), false,
  'a refused Go live leaves the class a Draft');
select throws_ok($f$select public.ops_vehicle_class_set_status('00000000-0000-4000-a000-000000000000'::uuid, 'live', null)$f$,
  'P0002', 'not-found', 'an unknown class is not-found');
select throws_ok(
  format($f$select public.ops_vehicle_class_set_status(%L::uuid, 'gone', null)$f$, (select c_ret from lc)),
  '22023', 'bad-status', 'an unknown target state is bad-status');
select throws_ok(
  format($f$select public.ops_vehicle_class_set_status(%L::uuid, 'draft', null)$f$, (select c_ret from lc)),
  'P0001', 'bad-transition', 'draft -> draft is a bad transition');

-- Decision 6: seats and bags empty until Live
select is(public.ops_vehicle_class_missing((select c_sb1 from lc)), 'photo,seats,bags,price',
  'decision 6: a class with nothing set lists all four items in the fixed order');
select is(public.ops_vehicle_class_missing((select c_sb from lc)), 'seats,bags',
  'decision 6: photo and a live price, seats and bags empty -> seats,bags');
select is(pg_temp.lc_detail(format($f$select public.ops_vehicle_class_set_status(%L::uuid, 'live', null)$f$, (select c_sb from lc))),
  'seats,bags', 'decision 6: Go live names seats,bags in DETAIL');
select throws_ok(
  format($f$select public.ops_vehicle_class_set_status(%L::uuid, 'live', null)$f$, (select c_sb from lc)),
  'P0001', 'incomplete', 'decision 6: Go live with empty seats and bags is refused');
update public.vehicle_classes set passenger_capacity = 4 where id = (select c_sb from lc);
select is(public.ops_vehicle_class_missing((select c_sb from lc)), 'bags', 'decision 6: seats set -> only bags missing');
update public.vehicle_classes set luggage_capacity = 2 where id = (select c_sb from lc);
select is(public.ops_vehicle_class_missing((select c_sb from lc)), '', 'decision 6: seats and bags set -> nothing missing');
select is(public.ops_vehicle_class_set_status((select c_sb from lc), 'live', null), 'live',
  'decision 6: Go live works once seats and bags are set');
select throws_ok(
  format($f$update public.vehicle_classes set active = true where id = %L::uuid$f$, (select c_sb1 from lc)),
  '23514', null, 'decision 6: active = true with empty seats and bags is refused by the CHECK');
select throws_ok(
  format($f$update public.vehicle_classes set passenger_capacity = null where id = %L::uuid$f$, (select c_sb from lc)),
  '23514', null, 'decision 6: seats cannot be emptied on a Live class');
select throws_ok(
  format($f$update public.vehicle_classes set luggage_capacity = null where id = %L::uuid$f$, (select c_sb from lc)),
  '23514', null, 'decision 6: bags cannot be emptied on a Live class');

-- Go live (lc-ret) leaves the price books alone
insert into lcsnap select 'rv-before', string_agg(id::text || ':' || status, ',' order by id) from public.rate_versions;
insert into lcaud select 'ret-0', count(*) from public.audit_log where table_name = 'vehicle_classes' and record_id = (select c_ret from lc)::text;
select is(public.ops_vehicle_class_set_status((select c_ret from lc), 'live', null), 'live', 'Go live returns live');
select is(
  (select active and hidden_at is null and hidden_reason is null from public.vehicle_classes where id = (select c_ret from lc)),
  true, 'the class is Live: active, not retired');
select is(
  (select string_agg(id::text || ':' || status, ',' order by id) from public.rate_versions),
  (select v from lcsnap where k = 'rv-before'), 'Go live changed no rate version');
select throws_ok(
  format($f$select public.ops_vehicle_class_set_status(%L::uuid, 'live', null)$f$, (select c_ret from lc)),
  'P0001', 'bad-transition', 'live -> live is a bad transition');

-- Retire (lc-ret): reason cap, then the strip
insert into lcaud select 'ret-1', count(*) from public.audit_log where table_name = 'vehicle_classes' and record_id = (select c_ret from lc)::text;
select throws_ok(
  format($f$select public.ops_vehicle_class_set_status(%L::uuid, 'retired', %L)$f$, (select c_ret from lc), repeat('x', 141)),
  '22001', 'reason-too-long', 'a reason over 140 characters is refused');
select is(
  (select active from public.vehicle_classes where id = (select c_ret from lc)), true,
  'the refused reason left the class Live');
insert into lcsnap select 'frozen-rows', (select count(*)::text from public.distance_rates where vehicle_class_id = (select c_ret from lc) and rate_version_id = (select live1 from lcv))
  || '/' || (select count(*)::text from public.surcharges where rate_version_id = (select live1 from lcv));
select lives_ok(
  format($f$select public.ops_vehicle_class_set_status(%L::uuid, 'retired', 'No longer offered')$f$, (select c_ret from lc)),
  'Retire succeeds with a draft surcharge in the open book');
select is(
  (select hidden_reason from public.vehicle_classes where id = (select c_ret from lc)), 'No longer offered',
  'the reason is stored');
select is(
  (select hidden_at is not null and active = false and photo_path = 'site/lc-ret.jpg' from public.vehicle_classes where id = (select c_ret from lc)),
  true, 'Retired: hidden_at set, inactive, photo kept');
insert into lcaud select 'ret-2', count(*) from public.audit_log where table_name = 'vehicle_classes' and record_id = (select c_ret from lc)::text;
select is(
  (select count(*)::int from public.distance_rates where vehicle_class_id = (select c_ret from lc) and rate_version_id = (select draft_a from lcv)), 0,
  'decision 2: the class left the draft distance_rates');
select is(
  (select count(*)::int from public.fixed_routes where vehicle_class_id = (select c_ret from lc) and rate_version_id = (select draft_a from lcv)), 0,
  'decision 2: the class left the draft fixed_routes');
select is(
  (select count(*)::int from public.distance_rates where vehicle_class_id = (select c_ret from lc) and rate_version_id = (select live1 from lcv)), 1,
  'the frozen live-book price row of the class is kept');
select is(
  (select count(*)::int from public.surcharges where rate_version_id = (select draft_a from lcv) and code = 'lc_extra'), 1,
  'the draft surcharge stays (an extra the owner added survives Retire)');
select is(
  (select (select count(*)::text from public.distance_rates where vehicle_class_id = (select c_ret from lc) and rate_version_id = (select live1 from lcv))
    || '/' || (select count(*)::text from public.surcharges where rate_version_id = (select live1 from lcv))),
  (select v from lcsnap where k = 'frozen-rows'), 'the frozen book keeps its price row and surcharge');

-- Moves out of Retired
select throws_ok(
  format($f$select public.ops_vehicle_class_set_status(%L::uuid, 'live', null)$f$, (select c_ret from lc)),
  'P0001', 'bad-transition', 'retired -> live is a bad transition');
select throws_ok(
  format($f$select public.ops_vehicle_class_set_status(%L::uuid, 'retired', null)$f$, (select c_ret from lc)),
  'P0001', 'bad-transition', 'retired -> retired is a bad transition');
select is(public.ops_vehicle_class_set_status((select c_ret from lc), 'draft', null), 'draft', 'Bring back returns draft');
insert into lcaud select 'ret-3', count(*) from public.audit_log where table_name = 'vehicle_classes' and record_id = (select c_ret from lc)::text;
select is(
  (select hidden_at is null and hidden_reason is null and active = false from public.vehicle_classes where id = (select c_ret from lc)),
  true, 'Bring back clears the reason and leaves the class inactive');
select is(
  (select count(*)::int from public.distance_rates where vehicle_class_id = (select c_ret from lc) and rate_version_id = (select draft_a from lcv)
      and available = false and base_fare_rappen is null and per_km_rappen is null and max_pax = 3 and hide_from_public = false), 1,
  'R6: the newest draft holds exactly one unpriced, parked row for the class');
select is(public.ops_vehicle_class_missing((select c_ret from lc)), 'price',
  'R3: after Bring back the old live-book price no longer counts');

-- Audit trail: one more audit_log row per transition
select ok(
  (select a.n < b.n and b.n < c.n and c.n < d.n
     from (select n from lcaud where k = 'ret-0') a,
          (select n from lcaud where k = 'ret-1') b,
          (select n from lcaud where k = 'ret-2') c,
          (select n from lcaud where k = 'ret-3') d),
  'every transition (Go live, Retire, Bring back) leaves an audit_log row');

-- R3 with a second class: Live, retired, brought back, old price does not count; a newer publish does
select is(public.ops_vehicle_class_set_status((select c_back from lc), 'live', null), 'live', 'lc-back goes Live on its live-book price');
select is(public.ops_vehicle_class_set_status((select c_back from lc), 'retired', null), 'retired', 'lc-back is retired without a reason');
select is(
  (select hidden_reason from public.vehicle_classes where id = (select c_back from lc)), null, 'a blank reason is stored as null');
select is(public.ops_vehicle_class_set_status((select c_back from lc), 'draft', null), 'draft', 'lc-back is brought back');
select is(public.ops_vehicle_class_missing((select c_back from lc)), 'price',
  'R3: lc-back still has a price in the live book, but from before the Bring back: price is missing');
select throws_ok(
  format($f$select public.ops_vehicle_class_set_status(%L::uuid, 'live', null)$f$, (select c_back from lc)),
  'P0001', 'incomplete', 'R3: Go live after Bring back needs a newly published price');

-- Decision 6 on the Retired and Bring back path: a Draft with empty seats can be retired and brought back
select is(public.ops_vehicle_class_set_status((select c_sb2 from lc), 'retired', 'never live'), 'retired',
  'decision 6: a Draft with empty seats and bags can be retired');
select is(
  (select passenger_capacity is null and luggage_capacity is null from public.vehicle_classes where id = (select c_sb2 from lc)),
  true, 'decision 6: its seats and bags stay empty');
select is(public.ops_vehicle_class_set_status((select c_sb2 from lc), 'draft', null), 'draft',
  'decision 6: and brought back');
select is(
  (select count(*)::int from public.distance_rates where vehicle_class_id = (select c_sb2 from lc) and rate_version_id = (select draft_a from lcv)
      and max_pax is null and available = false), 1,
  'decision 6: its parked draft row has max_pax null and available = false');

-- R6: a parked row never blocks Publish; an available unpriced one does
update public.distance_rates set available = true
 where vehicle_class_id = (select c_back from lc) and rate_version_id = (select draft_a from lcv);
select throws_ok(
  format($f$update public.rate_versions set status = 'live' where id = %L$f$, (select draft_a from lcv)),
  '23001', null, 'R6: an available unpriced row blocks Publish with restrict_violation (this is what parking avoids)');
update public.distance_rates set available = false
 where vehicle_class_id = (select c_back from lc) and rate_version_id = (select draft_a from lcv);
update public.rate_versions set status = 'retired' where id = (select live1 from lcv);
select lives_ok(
  format($f$update public.rate_versions set status = 'live' where id = %L$f$, (select draft_a from lcv)),
  'R6 + decision 6: parked rows (also with max_pax null) do not block Publish');
select is(public.ops_vehicle_class_missing((select c_back from lc)), 'price',
  'a parked row published in a book is not a price');

-- R3: price the brought-back class in a newer draft and publish it
insert into public.rate_versions (slug, label) values ('lc-draftB', 'LC draft B');
insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen, available)
select (select id from public.rate_versions where slug = 'lc-draftB'), lc.c_back, 3, 1, 2, 3, true from lc;
update public.rate_versions set status = 'retired' where id = (select draft_a from lcv);
update public.rate_versions set status = 'live' where slug = 'lc-draftB';
select is(public.ops_vehicle_class_missing((select c_back from lc)), '',
  'R3: a price published after the Bring back counts');
select is(public.ops_vehicle_class_set_status((select c_back from lc), 'live', null), 'live',
  'R3: Go live works after the new price is published');

-- ── test-classes guard (decision 1) ─────────────────────────────────────────────────────────────
select has_function('app', 'p30_assert_test_classes_gone', array[]::text[], 'app.p30_assert_test_classes_gone() exists');
select ok(not has_function_privilege('anon', 'app.p30_assert_test_classes_gone()', 'execute'), 'anon cannot execute the guard');
select ok(not has_function_privilege('authenticated', 'app.p30_assert_test_classes_gone()', 'execute'), 'authenticated cannot execute the guard');
select ok(not has_function_privilege('vamos_staff', 'app.p30_assert_test_classes_gone()', 'execute'), 'vamos_staff cannot execute the guard');
select throws_like('select app.p30_assert_test_classes_gone()', 'p30-test-classes-present%',
  'decision 1: the guard raises while the lab seed classes (economy, business, van) exist');
update public.vehicle_classes set slug = 'p30x-' || slug
 where slug in ('business', 'economy', 'first', 'van', 'mahaha');
select lives_ok('select app.p30_assert_test_classes_gone()', 'decision 1: the guard passes once the five slugs are gone');
insert into public.vehicle_classes (slug, name, passenger_capacity, luggage_capacity, active) values ('mahaha', 'LC mahaha', 2, 2, false);
select throws_like('select app.p30_assert_test_classes_gone()', 'p30-test-classes-present%',
  'decision 1: one leftover test class (mahaha) raises again');

select * from finish();
rollback;

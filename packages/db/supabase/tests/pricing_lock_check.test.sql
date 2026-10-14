-- pricing_lock_check.test.sql
--
-- PR #81 re-scope, owner decisions 2026-10-13 items 10, 12 and 13 (.planning/decisions/
-- 2026-10-13-p30-ship-p31-lines-rls-fix.md).
--   L  Part A (20261012250000) lock check: tg_pricing_row_frozen refuses an UPDATE that moves a
--      distance_rates / fixed_routes / surcharges row OUT of a live or retired book, for an admin and
--      for the connecting superuser; moving INTO a published book and in-place edits stay refused;
--      the availability-only toggle still works; draft edits still work.
--   Q  quote_rate_book returns no distance_bands / region_premiums key (live branch and null-version
--      branch) and keeps every other key.
--   B  Part B (20261012300000) shape: the three tables and surcharges.rule_id are gone; the two class
--      functions no longer name them and keep their grants.
--   G  Part B guard app.pricing_assert_bands_premiums_rules_gone(): owner-only, passes on the real
--      schema, refuses a stand-in table with a row or a surcharges.rule_id link (stand-ins created and
--      rolled back inside this file).
-- Rolled back. Synthetic integer rappen only (1, 2, 3), never a product CHF.
begin;
select plan(45);

-- ── fixtures (connecting superuser) ─────────────────────────────────────────────────────────────
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('plc-a', 3, 3), ('plc-b', 3, 3);
insert into public.service_zones (slug, iata) values ('plc-zone-a', 'ZRH'), ('plc-zone-b', null);

-- Retire whatever book is live, then: book R (published, then retired), book L (live), book D (draft).
update public.rate_versions set status = 'retired' where status = 'live';
insert into public.rate_versions (slug, label)
values ('plc-ret', 'lock check retired book'), ('plc-live', 'lock check live book'), ('plc-draft', 'lock check draft book');

insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen)
select rv.id, vc.id, 3, 1, 2, 3
  from public.rate_versions rv, public.vehicle_classes vc
 where (rv.slug in ('plc-ret', 'plc-live') and vc.slug = 'plc-a')
    or (rv.slug = 'plc-draft' and vc.slug = 'plc-b');

insert into public.fixed_routes (rate_version_id, origin_zone_id, dest_zone_id, vehicle_class_id, price_rappen, live)
select rv.id, z1.id, z2.id, vc.id, 1, true
  from public.rate_versions rv, public.service_zones z1, public.service_zones z2, public.vehicle_classes vc
 where z1.slug = 'plc-zone-a' and z2.slug = 'plc-zone-b'
   and ((rv.slug in ('plc-ret', 'plc-live') and vc.slug = 'plc-a')
     or (rv.slug = 'plc-draft' and vc.slug = 'plc-b'));

insert into public.surcharges (rate_version_id, code, kind, amount_rappen, predicate)
select rv.id, case rv.slug when 'plc-draft' then 'plc_d' else 'plc_x' end, 'amount', 1, '{"kind":"always"}'::jsonb
  from public.rate_versions rv where rv.slug in ('plc-ret', 'plc-live', 'plc-draft');

update public.rate_versions set status = 'live' where slug = 'plc-ret';
update public.rate_versions set status = 'retired' where slug = 'plc-ret';
update public.rate_versions set status = 'live' where slug = 'plc-live';

create temporary table plc as
select (select id from public.rate_versions where slug = 'plc-ret')   as ret,
       (select id from public.rate_versions where slug = 'plc-live')  as live,
       (select id from public.rate_versions where slug = 'plc-draft') as draft;
create temporary table plc_row as
select 'distance_rates'::text as t, (select id from public.distance_rates where rate_version_id = plc.live) as live_id,
       (select id from public.distance_rates where rate_version_id = plc.ret) as ret_id from plc
union all
select 'fixed_routes', (select id from public.fixed_routes where rate_version_id = plc.live),
       (select id from public.fixed_routes where rate_version_id = plc.ret) from plc
union all
select 'surcharges', (select id from public.surcharges where rate_version_id = plc.live),
       (select id from public.surcharges where rate_version_id = plc.ret) from plc;
grant select on plc, plc_row to vamos_staff;

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('f0000000-0000-4000-a000-0000000000c1', 'plc-admin@vamostaxi.eu', 'authenticated', 'authenticated',
        '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.staff (user_id, role, active, accepted_at, full_name)
values ('f0000000-0000-4000-a000-0000000000c1', 'admin', true, now(), 'PLC Admin');

-- The refusal Part A adds, for one table and row id.
create function pg_temp.plc_out(p_table text, p_id bigint) returns text language sql immutable as $f$
  select format('pricing rows cannot leave a published rate_version (public.%s id=%s)', p_table, p_id)
$f$;
create function pg_temp.plc_frozen(p_table text, p_id bigint) returns text language sql immutable as $f$
  select format('pricing rows are immutable once their rate_version leaves draft (public.%s id=%s)', p_table, p_id)
$f$;

-- ── L  lock check, as an admin on the real vamos_staff role ───────────────────────────────────────
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'f0000000-0000-4000-a000-0000000000c1', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'admin'))::text,
  true);
set local role vamos_staff;

select throws_ok(
  format('update public.distance_rates set rate_version_id = %s where id = %s',
         (select draft from plc), (select live_id from plc_row where t = 'distance_rates')),
  '23001', pg_temp.plc_out('distance_rates', (select live_id from plc_row where t = 'distance_rates')),
  '(L1) admin: a distance_rates row cannot move from the live book to the draft');
select throws_ok(
  format('update public.fixed_routes set rate_version_id = %s where id = %s',
         (select draft from plc), (select live_id from plc_row where t = 'fixed_routes')),
  '23001', pg_temp.plc_out('fixed_routes', (select live_id from plc_row where t = 'fixed_routes')),
  '(L2) admin: a fixed_routes row cannot move from the live book to the draft');
select throws_ok(
  format('update public.surcharges set rate_version_id = %s where id = %s',
         (select draft from plc), (select live_id from plc_row where t = 'surcharges')),
  '23001', pg_temp.plc_out('surcharges', (select live_id from plc_row where t = 'surcharges')),
  '(L3) admin: a surcharges row cannot move from the live book to the draft');

select throws_ok(
  format('update public.distance_rates set rate_version_id = %s where id = %s',
         (select draft from plc), (select ret_id from plc_row where t = 'distance_rates')),
  '23001', pg_temp.plc_out('distance_rates', (select ret_id from plc_row where t = 'distance_rates')),
  '(L4a) admin: a distance_rates row cannot move from a retired book to the draft');
select throws_ok(
  format('update public.fixed_routes set rate_version_id = %s where id = %s',
         (select draft from plc), (select ret_id from plc_row where t = 'fixed_routes')),
  '23001', pg_temp.plc_out('fixed_routes', (select ret_id from plc_row where t = 'fixed_routes')),
  '(L4b) admin: a fixed_routes row cannot move from a retired book to the draft');
select throws_ok(
  format('update public.surcharges set rate_version_id = %s where id = %s',
         (select draft from plc), (select ret_id from plc_row where t = 'surcharges')),
  '23001', pg_temp.plc_out('surcharges', (select ret_id from plc_row where t = 'surcharges')),
  '(L4c) admin: a surcharges row cannot move from a retired book to the draft');

-- L6 moving a draft row INTO the live book: refused as before (the NEW-book check).
select throws_ok(
  format('update public.distance_rates set rate_version_id = %s where rate_version_id = %s',
         (select live from plc), (select draft from plc)),
  '23001', null,
  '(L6) admin: a draft distance_rates row cannot move into the live book');
select throws_ok(
  format('update public.surcharges set rate_version_id = %s where rate_version_id = %s',
         (select live from plc), (select draft from plc)),
  '23001', null,
  '(L6b) admin: a draft surcharges row cannot move into the live book');

-- L7 in-place price change on a live row: refused as before.
select throws_ok(
  format('update public.distance_rates set per_km_rappen = 10 where id = %s',
         (select live_id from plc_row where t = 'distance_rates')),
  '23001', pg_temp.plc_frozen('distance_rates', (select live_id from plc_row where t = 'distance_rates')),
  '(L7) admin: an in-place price change on a live row is refused (unchanged)');

-- L8 availability-only toggles on live rows still work and change the value.
select lives_ok(
  format('update public.distance_rates set available = false where id = %s',
         (select live_id from plc_row where t = 'distance_rates')),
  '(L8a) admin: distance_rates.available toggles on a live row');
select lives_ok(
  format('update public.fixed_routes set live = false where id = %s',
         (select live_id from plc_row where t = 'fixed_routes')),
  '(L8b) admin: fixed_routes.live toggles on a live row');
select lives_ok(
  format('update public.surcharges set active = false where id = %s',
         (select live_id from plc_row where t = 'surcharges')),
  '(L8c) admin: surcharges.active toggles on a live row');

-- L9 a toggle together with a move out: the carve-out does not open the move.
select throws_ok(
  format('update public.fixed_routes set live = true, rate_version_id = %s where id = %s',
         (select draft from plc), (select live_id from plc_row where t = 'fixed_routes')),
  '23001', pg_temp.plc_out('fixed_routes', (select live_id from plc_row where t = 'fixed_routes')),
  '(L9) admin: toggle plus move out in one UPDATE is refused');

-- L10 draft edits still work.
select lives_ok(
  format('update public.distance_rates set per_km_rappen = 10 where rate_version_id = %s', (select draft from plc)),
  '(L10a) admin: an in-place price change on a draft row works');
select lives_ok(
  format($s$insert into public.surcharges (rate_version_id, code, kind, amount_rappen, predicate)
            values (%s, 'plc_d2', 'amount', 1, '{"kind":"always"}'::jsonb)$s$, (select draft from plc)),
  '(L10b) admin: an insert into the draft works');

reset role;
select set_config('request.jwt.claims', '', true);

select is(
  (select available::text || '/' || (select live::text from public.fixed_routes where id = (select live_id from plc_row where t = 'fixed_routes'))
       || '/' || (select active::text from public.surcharges where id = (select live_id from plc_row where t = 'surcharges'))
     from public.distance_rates where id = (select live_id from plc_row where t = 'distance_rates')),
  'false/false/false',
  '(L8d) the three availability toggles changed the live rows');
select is(
  (select per_km_rappen::integer from public.distance_rates where rate_version_id = (select draft from plc)),
  10, '(L10c) the draft price change was written');

-- L5 the connecting superuser (no role switch) is bound too.
select throws_ok(
  format('update public.distance_rates set rate_version_id = %s where id = %s',
         (select draft from plc), (select live_id from plc_row where t = 'distance_rates')),
  '23001', pg_temp.plc_out('distance_rates', (select live_id from plc_row where t = 'distance_rates')),
  '(L5a) superuser: a distance_rates row cannot move from the live book to the draft');
select throws_ok(
  format('update public.surcharges set rate_version_id = %s where id = %s',
         (select draft from plc), (select ret_id from plc_row where t = 'surcharges')),
  '23001', pg_temp.plc_out('surcharges', (select ret_id from plc_row where t = 'surcharges')),
  '(L5b) superuser: a surcharges row cannot move from a retired book to the draft');

select is(
  (select (select count(*) from public.distance_rates where rate_version_id = plc.live)
       || '/' || (select count(*) from public.fixed_routes where rate_version_id = plc.live)
       || '/' || (select count(*) from public.surcharges where rate_version_id = plc.live)
       || '|' || (select count(*) from public.distance_rates where rate_version_id = plc.ret)
       || '/' || (select count(*) from public.fixed_routes where rate_version_id = plc.ret)
       || '/' || (select count(*) from public.surcharges where rate_version_id = plc.ret)
     from plc),
  '1/1/1|1/1/1',
  '(L11) the live and the retired book still hold every row');

-- ── Q  quote_rate_book keys ───────────────────────────────────────────────────────────────────────
select ok(not (public.quote_rate_book(true) ? 'distance_bands'),
  '(Q1a) live branch: no distance_bands key');
select ok(not (public.quote_rate_book(true) ? 'region_premiums'),
  '(Q1b) live branch: no region_premiums key');
select ok(public.quote_rate_book(true) ?& array['rate_version', 'classes', 'distance_rates', 'fixed_routes', 'surcharges', 'coupons', 'zones', 'public_chf', 'vat_rate_bps'],
  '(Q1c) live branch: every other key is still there');
select is((public.quote_rate_book(true) -> 'rate_version' ->> 'id')::bigint, (select live from plc),
  '(Q1d) live branch: the live book is the one returned');

-- ── B  Part B shape ───────────────────────────────────────────────────────────────────────────────
select is(to_regclass('public.distance_bands')::text, null, '(B1) public.distance_bands is gone');
select is(to_regclass('public.region_premiums')::text, null, '(B2) public.region_premiums is gone');
select is(to_regclass('public.rate_version_rules')::text, null, '(B3) public.rate_version_rules is gone');
select hasnt_column('public', 'surcharges', 'rule_id', '(B4) surcharges.rule_id is gone');
select ok(
  pg_get_functiondef('public.ops_vehicle_class_set_status(uuid, text, text)'::regprocedure)
    !~ '(distance_bands|region_premiums|rate_version_rules|rule_id)',
  '(B5a) ops_vehicle_class_set_status no longer names bands, premiums, rules or rule_id');
select ok(
  pg_get_functiondef('public.ops_vehicle_class_delete_or_hide(uuid, text)'::regprocedure)
    !~ '(distance_bands|region_premiums|rate_version_rules|rule_id)',
  '(B5b) ops_vehicle_class_delete_or_hide no longer names bands, premiums, rules or rule_id');
select is(
  has_function_privilege('vamos_staff', 'public.ops_vehicle_class_set_status(uuid, text, text)', 'execute')::text
    || '/' || has_function_privilege('anon', 'public.ops_vehicle_class_set_status(uuid, text, text)', 'execute')::text
    || '/' || has_function_privilege('authenticated', 'public.ops_vehicle_class_set_status(uuid, text, text)', 'execute')::text,
  'true/false/false', '(B5c) ops_vehicle_class_set_status: vamos_staff executes, anon and authenticated do not');
select is(
  has_function_privilege('vamos_staff', 'public.ops_vehicle_class_delete_or_hide(uuid, text)', 'execute')::text
    || '/' || has_function_privilege('anon', 'public.ops_vehicle_class_delete_or_hide(uuid, text)', 'execute')::text
    || '/' || has_function_privilege('authenticated', 'public.ops_vehicle_class_delete_or_hide(uuid, text)', 'execute')::text,
  'true/false/false', '(B5d) ops_vehicle_class_delete_or_hide: vamos_staff executes, anon and authenticated do not');
select is(
  (select prosecdef::text || '/' || array_to_string(proconfig, ',')
     from pg_proc where oid = 'public.ops_vehicle_class_set_status(uuid, text, text)'::regprocedure),
  'true/search_path=""', '(B5e) ops_vehicle_class_set_status is still security definer with an empty search_path');
select is(
  (select prosecdef::text || '/' || array_to_string(proconfig, ',')
     from pg_proc where oid = 'public.ops_vehicle_class_delete_or_hide(uuid, text)'::regprocedure),
  'true/search_path=""', '(B5f) ops_vehicle_class_delete_or_hide is still security definer with an empty search_path');

-- ── G  Part B guard ───────────────────────────────────────────────────────────────────────────────
select has_function('app', 'pricing_assert_bands_premiums_rules_gone', '{}'::name[],
  '(G1) app.pricing_assert_bands_premiums_rules_gone() exists');
select is(
  has_function_privilege('anon', 'app.pricing_assert_bands_premiums_rules_gone()', 'execute')::text
    || '/' || has_function_privilege('authenticated', 'app.pricing_assert_bands_premiums_rules_gone()', 'execute')::text
    || '/' || has_function_privilege('vamos_staff', 'app.pricing_assert_bands_premiums_rules_gone()', 'execute')::text,
  'false/false/false', '(G2) anon, authenticated and vamos_staff cannot execute the guard');
select lives_ok('select app.pricing_assert_bands_premiums_rules_gone()',
  '(G3) the guard passes on the real schema');

create table public.distance_bands (id int);
insert into public.distance_bands values (1);
select throws_like('select app.pricing_assert_bands_premiums_rules_gone()',
  'pricing-bands-premiums-rules-present: public.distance_bands%',
  '(G4) a distance_bands stand-in with a row is refused');
delete from public.distance_bands;
select lives_ok('select app.pricing_assert_bands_premiums_rules_gone()',
  '(G5) an empty distance_bands stand-in passes');

create table public.rate_version_rules (id int);
insert into public.rate_version_rules values (1);
select throws_like('select app.pricing_assert_bands_premiums_rules_gone()',
  'pricing-bands-premiums-rules-present: public.rate_version_rules%',
  '(G6) a rate_version_rules stand-in with a row is refused');
drop table public.rate_version_rules;

alter table public.surcharges add column rule_id bigint;
update public.surcharges set rule_id = 1 where rate_version_id = (select draft from plc) and code = 'plc_d';
select throws_like('select app.pricing_assert_bands_premiums_rules_gone()',
  'pricing-bands-premiums-rules-present: surcharges.rule_id%',
  '(G7) a surcharges.rule_id link is refused');
update public.surcharges set rule_id = null where rate_version_id = (select draft from plc);
select lives_ok('select app.pricing_assert_bands_premiums_rules_gone()',
  '(G8) an empty surcharges.rule_id column passes');
alter table public.surcharges drop column rule_id;
drop table public.distance_bands;

-- ── Q  null-version branch (no live book, no draft preferred) ─────────────────────────────────────
update public.rate_versions set status = 'retired' where status = 'live';
select is(public.quote_rate_book(false) -> 'rate_version', 'null'::jsonb,
  '(Q2a) null-version branch: rate_version is null');
select ok(not (public.quote_rate_book(false) ?| array['distance_bands', 'region_premiums']),
  '(Q2b) null-version branch: no distance_bands or region_premiums key');
select ok(public.quote_rate_book(false) ?& array['classes', 'distance_rates', 'fixed_routes', 'surcharges', 'coupons', 'zones', 'public_chf', 'vat_rate_bps'],
  '(Q2c) null-version branch: every other key is still there');

select * from finish();
rollback;

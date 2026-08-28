-- surcharge_predicate.test.sql
--
-- Proves D-09 / D-10 / U38 (plan 04-04):
--   - surcharges.predicate and quantity_source exist with the pairing CHECK
--   - service_zones.zone_type and tags exist with the four-member vocabulary
--   - tg_rate_version_transition refuses draft→live while any ACTIVE surcharge
--     carries predicate = {} (including kind='included'); inactive blanks do not block
--   - create or replace did not silently restore PUBLIC EXECUTE on the gate function
--   - seed-placeholder ships exactly five U38 blank-predicate codes, typed airport zones,
--     and alpine ski tags
--
-- Synthetic unit-free integers flip completeness gates only; rolled back at file end — never
-- a CHF figure (D-46).
begin;
select plan(22);

-- 1–2. Columns exist -------------------------------------------------------------------
select has_column('public', 'surcharges', 'predicate', 'surcharges.predicate exists (D-09)');
select has_column('public', 'surcharges', 'quantity_source', 'surcharges.quantity_source exists (D-09)');

-- 3–4. predicate default + NOT NULL ----------------------------------------------------
select col_default_is(
  'public', 'surcharges', 'predicate',
  '{}'::jsonb,
  'surcharges.predicate defaults to empty jsonb object'
);
select col_not_null('public', 'surcharges', 'predicate', 'surcharges.predicate is NOT NULL');

-- 5–8. service_zones columns -----------------------------------------------------------
select has_column('public', 'service_zones', 'zone_type', 'service_zones.zone_type exists (D-10)');
select has_column('public', 'service_zones', 'tags', 'service_zones.tags exists (D-10)');
select col_not_null('public', 'service_zones', 'zone_type', 'service_zones.zone_type is NOT NULL');
select col_not_null('public', 'service_zones', 'tags', 'service_zones.tags is NOT NULL');

-- 9. zone_type CHECK vocabulary --------------------------------------------------------
select throws_ok(
  $$ insert into public.service_zones (slug, zone_type) values ('sp-bad-zone', 'harbour') $$,
  '23514',
  null,
  'zone_type CHECK refuses a value outside airport/city/ski/other'
);

-- Fixtures for pairing + publish-gate cases (rolled back) ------------------------------
insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('c0000000-0000-0000-0000-000000000001', 'sp-admin@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.staff (user_id, role, active)
values ('c0000000-0000-0000-0000-000000000001', 'admin', true);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('first', 3, 3);

insert into public.rate_versions (slug, label) values ('sp-gate', 'Predicate gate fixture');

insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax,
                                   base_fare_rappen, per_km_rappen, min_fare_rappen)
select rv.id, vc.id, 3, 1, 2, 3
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug = 'sp-gate' and vc.slug = 'first';

select set_config(
  'request.jwt.claims',
  '{"sub":"c0000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

-- 10–11. quantity / quantity_source pairing constraint ---------------------------------
select throws_ok(
  $$
    insert into public.surcharges (rate_version_id, code, kind, predicate, quantity_source)
    select rv.id, 'sp-qty-null', 'amount', '{"kind":"quantity"}'::jsonb, null
      from public.rate_versions rv where rv.slug = 'sp-gate'
  $$,
  '23514',
  null,
  'quantity predicate without quantity_source is refused'
);
select throws_ok(
  $$
    insert into public.surcharges (rate_version_id, code, kind, predicate, quantity_source)
    select rv.id, 'sp-src-always', 'amount', '{"kind":"always"}'::jsonb, 'extra_stops'
      from public.rate_versions rv where rv.slug = 'sp-gate'
  $$,
  '23514',
  null,
  'quantity_source on a non-quantity predicate is refused'
);

-- 12. PUBLIC holds no EXECUTE after create or replace (T-04-11) ------------------------
select function_privs_are(
  'public', 'tg_rate_version_transition', array[]::name[],
  'public', array[]::name[],
  'PUBLIC holds zero privileges on tg_rate_version_transition after create or replace'
);

-- 13. Publish gate negative: one active blank-predicate surcharge refuses draft→live ---
insert into public.surcharges (rate_version_id, code, kind, amount_rappen, predicate)
select rv.id, 'sp-blank', 'amount', 1, '{}'::jsonb
  from public.rate_versions rv where rv.slug = 'sp-gate';

select throws_ok(
  $$ update public.rate_versions set status = 'live' where slug = 'sp-gate' $$,
  '23001',
  null,
  'draft→live refused while an active surcharge carries empty predicate (D-09)'
);

-- 14. Publish gate positive: same row with a predicate succeeds ------------------------
update public.surcharges
   set predicate = '{"kind":"always"}'::jsonb
 where rate_version_id = (select id from public.rate_versions where slug = 'sp-gate')
   and code = 'sp-blank';

select lives_ok(
  $$ update public.rate_versions set status = 'live' where slug = 'sp-gate' $$,
  'draft→live succeeds once every active surcharge has a non-empty predicate'
);

-- Retire so we can reuse the version shape for included / inactive cases ---------------
update public.rate_versions set status = 'retired' where slug = 'sp-gate';

-- Fresh draft for cases 15–16 ----------------------------------------------------------
insert into public.rate_versions (slug, label) values ('sp-gate-2', 'Predicate gate fixture 2');

insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax,
                                   base_fare_rappen, per_km_rappen, min_fare_rappen)
select rv.id, vc.id, 3, 1, 2, 3
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug = 'sp-gate-2' and vc.slug = 'first';

-- A priced amount row with a real predicate so the only blank is the included one.
insert into public.surcharges (rate_version_id, code, kind, amount_rappen, predicate)
select rv.id, 'sp-priced', 'amount', 1, '{"kind":"always"}'::jsonb
  from public.rate_versions rv where rv.slug = 'sp-gate-2';

insert into public.surcharges (rate_version_id, code, kind, predicate)
select rv.id, 'sp-included-blank', 'included', '{}'::jsonb
  from public.rate_versions rv where rv.slug = 'sp-gate-2';

-- 15. included rows are covered too ----------------------------------------------------
select throws_ok(
  $$ update public.rate_versions set status = 'live' where slug = 'sp-gate-2' $$,
  '23001',
  null,
  'draft→live refused when the only blank predicate is on kind=included (D-09)'
);

-- 16. active=false blank does NOT block ------------------------------------------------
update public.surcharges
   set active = false
 where rate_version_id = (select id from public.rate_versions where slug = 'sp-gate-2')
   and code = 'sp-included-blank';

select lives_ok(
  $$ update public.rate_versions set status = 'live' where slug = 'sp-gate-2' $$,
  'draft→live succeeds when the blank-predicate row is inactive'
);

-- 17. Seed reality: exactly five U38 blank-predicate active codes on seed-placeholder --
select is(
  (
    select array_agg(code order by code)
      from public.surcharges
     where rate_version_id = (select id from public.rate_versions where slug = 'seed-placeholder')
       and active
       and predicate = '{}'::jsonb
  ),
  array['airport_pickup', 'meet_greet', 'ski_rack', 'waiting_airport', 'waiting_city']::text[],
  'seed-placeholder has exactly the five U38 blank-predicate codes, sorted'
);

-- 18–19. Airport zones typed; alpine tag present ---------------------------------------
select is(
  (
    select count(*)::integer
      from public.service_zones
     where slug in ('zrh-airport', 'gva-airport')
       and zone_type = 'airport'
  ),
  2,
  'zrh-airport and gva-airport carry zone_type=airport (D-10)'
);
select ok(
  (
    select 'ski' = any(tags)
      from public.service_zones
     where slug = 'zermatt'
  ),
  'zermatt carries ski in tags (D-10)'
);

-- 20–22. Extra seed shape: night predicate window + ten surcharges + return_trip always
select is(
  (
    select predicate ->> 'from'
      from public.surcharges
     where rate_version_id = (select id from public.rate_versions where slug = 'seed-placeholder')
       and code = 'night'
  ),
  '20:00',
  'night predicate from=20:00 (D-39, not the mock 22:00)'
);
select is(
  (
    select count(*)::integer
      from public.surcharges
     where rate_version_id = (select id from public.rate_versions where slug = 'seed-placeholder')
  ),
  10,
  'seed-placeholder carries exactly ten surcharges'
);
select is(
  (
    select predicate
      from public.surcharges
     where rate_version_id = (select id from public.rate_versions where slug = 'seed-placeholder')
       and code = 'return_trip'
  ),
  '{"kind":"always"}'::jsonb,
  'return_trip carries predicate kind=always (D-12)'
);

select * from finish();
rollback;

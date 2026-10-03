-- pricing_frozen.test.sql
--
-- Proves QUOTE-05 (02-SCHEMA-DRAFT.md §15) — once a rate_version leaves 'draft', its priced
-- child rows (distance_rates, fixed_routes, surcharges) are immutable via
-- tg_pricing_row_frozen, EXCEPT the availability-only carve-out (`available` / `live` /
-- `active`), which stays an ordinary audited UPDATE. Proven on both a `live` version and a
-- still-`draft` control, where every one of the same statements succeeds.
begin;
select plan(15);

-- Fixtures --------------------------------------------------------------------------------
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('first', 3, 3);
-- DEVIATION (Rule 1, bug fix -- Plan 02-09 seeds real service_zones rows): 'zrh-airport' and
-- 'zurich-city' now collide with the seed (D-36's zone list); test-scoped slugs avoid it.
insert into public.service_zones (slug, iata) values ('pf-zone-a', 'ZRH'), ('pf-zone-b', null);

-- === A live version, fully priced then published ==========================================
insert into public.rate_versions (slug, label) values ('live-frozen', 'Live frozen fixture');

-- Synthetic figures, rolled back at the end of this file — never a real CHF amount (D-34).
insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen)
select rv.id, vc.id, 3, 1, 2, 3
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug = 'live-frozen' and vc.slug = 'first';

insert into public.surcharges (rate_version_id, code, kind, percent, predicate)
select rv.id, 'night', 'percent', 10.00, '{"kind":"always"}'::jsonb
  from public.rate_versions rv where rv.slug = 'live-frozen';

insert into public.fixed_routes (rate_version_id, origin_zone_id, dest_zone_id, vehicle_class_id, price_rappen, live)
select rv.id, z1.id, z2.id, vc.id, 1, false
  from public.rate_versions rv, public.service_zones z1, public.service_zones z2, public.vehicle_classes vc
 where rv.slug = 'live-frozen' and z1.slug = 'pf-zone-a' and z2.slug = 'pf-zone-b' and vc.slug = 'first';

-- An extra priced while the version is still a draft (any name: no rule is keyed on it).
insert into public.surcharges (rate_version_id, code, kind, amount_rappen, predicate, quantity_source)
select rv.id, 'pf_any_extra', 'amount', 2000, '{"kind":"quantity"}'::jsonb, 'child_seats'
  from public.rate_versions rv where rv.slug = 'live-frozen';

update public.rate_versions set status = 'live' where slug = 'live-frozen';

-- (1) A non-availability field is frozen. --------------------------------------------------
select throws_ok(
  $$ update public.distance_rates set per_km_rappen = 4
       where rate_version_id = (select id from public.rate_versions where slug = 'live-frozen') $$,
  '23001',
  null,
  'distance_rates: editing per_km_rappen on a live version is refused'
);

-- (2) The availability flag is the carve-out. ------------------------------------------------
select lives_ok(
  $$ update public.distance_rates set available = false
       where rate_version_id = (select id from public.rate_versions where slug = 'live-frozen') $$,
  'distance_rates: toggling available on a live version succeeds (carve-out)'
);

-- (3) Deleting a priced row of a live version is refused. -----------------------------------
select throws_ok(
  $$ delete from public.surcharges
       where rate_version_id = (select id from public.rate_versions where slug = 'live-frozen') and code = 'night' $$,
  '23001',
  null,
  'surcharges: deleting a row of a live version is refused'
);

-- (4) surcharges.active is the same carve-out. -----------------------------------------------
select lives_ok(
  $$ update public.surcharges set active = false
       where rate_version_id = (select id from public.rate_versions where slug = 'live-frozen') and code = 'night' $$,
  'surcharges: toggling active on a live version succeeds (carve-out)'
);

-- (5) fixed_routes.live is the same carve-out. -----------------------------------------------
select lives_ok(
  $$ update public.fixed_routes set live = true
       where rate_version_id = (select id from public.rate_versions where slug = 'live-frozen') $$,
  'fixed_routes: toggling live on a live version succeeds (carve-out)'
);

-- (6) fixed_routes.price_rappen is frozen. ---------------------------------------------------
select throws_ok(
  $$ update public.fixed_routes set price_rappen = 5
       where rate_version_id = (select id from public.rate_versions where slug = 'live-frozen') $$,
  '23001',
  null,
  'fixed_routes: editing price_rappen on a live version is refused'
);

-- (7–9) Extras change like every other price: draft, then Publish (owner, 2026-10-02,
-- decisions/2026-10-02-live-extras-draft-then-publish.md; matches live tg_pricing_row_frozen).
select throws_ok(
  $$ insert into public.surcharges (rate_version_id, code, kind, amount_rappen, predicate, quantity_source)
     select rv.id, 'child_seat', 'amount', 2000, '{"kind":"quantity"}'::jsonb, 'child_seats'
       from public.rate_versions rv where rv.slug = 'live-frozen' $$,
  '23001',
  null,
  'surcharges: adding an extra to a live version is refused, whatever its name'
);
select throws_ok(
  $$ update public.surcharges set amount_rappen = 2500
       where rate_version_id = (select id from public.rate_versions where slug = 'live-frozen')
         and code = 'pf_any_extra' $$,
  '23001',
  null,
  'surcharges: editing an extra amount on a live version is refused'
);
select throws_ok(
  $$ delete from public.surcharges
       where rate_version_id = (select id from public.rate_versions where slug = 'live-frozen')
         and code = 'pf_any_extra' $$,
  '23001',
  null,
  'surcharges: deleting an extra on a live version is refused'
);

-- === A draft control — every one of the same statements succeeds ==========================
insert into public.rate_versions (slug, label) values ('draft-control', 'Draft control fixture');

insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen)
select rv.id, vc.id, 3, 1, 2, 3
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug = 'draft-control' and vc.slug = 'first';

-- Two rows: one for the delete test, one for the active-toggle test (a deleted row cannot
-- also be updated afterwards).
insert into public.surcharges (rate_version_id, code, kind, percent)
select rv.id, 'night', 'percent', 10.00
  from public.rate_versions rv where rv.slug = 'draft-control';
insert into public.surcharges (rate_version_id, code, kind, percent)
select rv.id, 'waiting_city', 'percent', 5.00
  from public.rate_versions rv where rv.slug = 'draft-control';

insert into public.fixed_routes (rate_version_id, origin_zone_id, dest_zone_id, vehicle_class_id, price_rappen, live)
select rv.id, z1.id, z2.id, vc.id, 1, false
  from public.rate_versions rv, public.service_zones z1, public.service_zones z2, public.vehicle_classes vc
 where rv.slug = 'draft-control' and z1.slug = 'pf-zone-a' and z2.slug = 'pf-zone-b' and vc.slug = 'first';

select lives_ok(
  $$ update public.distance_rates set per_km_rappen = 4
       where rate_version_id = (select id from public.rate_versions where slug = 'draft-control') $$,
  'distance_rates: editing per_km_rappen on a draft version succeeds'
);
select lives_ok(
  $$ update public.distance_rates set available = false
       where rate_version_id = (select id from public.rate_versions where slug = 'draft-control') $$,
  'distance_rates: toggling available on a draft version succeeds'
);
select lives_ok(
  $$ delete from public.surcharges
       where rate_version_id = (select id from public.rate_versions where slug = 'draft-control') and code = 'night' $$,
  'surcharges: deleting a row of a draft version succeeds'
);
select lives_ok(
  $$ update public.surcharges set active = false
       where rate_version_id = (select id from public.rate_versions where slug = 'draft-control') and code = 'waiting_city' $$,
  'surcharges: toggling active on a draft version succeeds'
);
select lives_ok(
  $$ update public.fixed_routes set live = true
       where rate_version_id = (select id from public.rate_versions where slug = 'draft-control') $$,
  'fixed_routes: toggling live on a draft version succeeds'
);
select lives_ok(
  $$ update public.fixed_routes set price_rappen = 5
       where rate_version_id = (select id from public.rate_versions where slug = 'draft-control') $$,
  'fixed_routes: editing price_rappen on a draft version succeeds'
);

select * from finish();
rollback;

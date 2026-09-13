-- rate_version_publish.test.sql
--
-- Proves QUOTE-10 (02-SCHEMA-DRAFT.md §15) — the publish gate is forward-designed, not a
-- checklist item: exactly one `rate_versions` row may be `live` (D-09), a version cannot go
-- live half-priced (tg_rate_version_transition). D-08 completeness is class name/slug, start
-- (base_fare_rappen), per-km, and max_pax — the first-X-km floor is not required.
-- Two hardened bypasses the review pass found are closed:
--   F-04 / T-02-43 — a `live` row cannot be born by INSERT, skipping the completeness and
--     attribution gates (tg_rate_version_insert_draft, case h).
--   F-12 / T-02-44 — a priced row cannot be inserted straight into a non-draft version, out
--     of band from any version transition (tg_pricing_row_frozen on BEFORE INSERT, case i).
--
-- Plan 04-04 extended the assertion count by two: empty-predicate draft→live refusal + restore path.
--
-- Run as `postgres` (the admin-only RLS restriction on this UPDATE — `rate_versions_
-- admin_write` — is Plan 02-08's job; this file proves the trigger itself fires regardless of
-- caller, per the review pass's T-02-14 finding). `request.jwt.claims.sub` is set to a real
-- staff/admin uuid throughout so `app.uid()` stamps a real `published_by`.
begin;
select plan(19);

-- Fixtures ------------------------------------------------------------------------------
insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('b0000000-0000-0000-0000-000000000001', 'admin@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.staff (user_id, role, active)
values ('b0000000-0000-0000-0000-000000000001', 'admin', true);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('first', 3, 3);

-- DEVIATION (Rule 1, bug fix -- Plan 02-09 seeds real service_zones rows): 'zrh-airport' and
-- 'zurich-city' now collide with the seed (D-36's zone list); test-scoped slugs avoid it.
insert into public.service_zones (slug, iata) values ('rvp-zone-a', 'ZRH'), ('rvp-zone-b', null);

-- Born draft (F-04's insert trigger nulls attribution, which is null already here).
insert into public.rate_versions (slug, label) values ('test-matrix', 'Test matrix');

-- D-08: max_pax is required on the class row; slug 'first' is the name/slug key.
insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax)
select rv.id, vc.id, 3
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug = 'test-matrix' and vc.slug = 'first';

insert into public.surcharges (rate_version_id, code, kind)
select rv.id, 'night', 'percent'
  from public.rate_versions rv where rv.slug = 'test-matrix';

select set_config(
  'request.jwt.claims',
  '{"sub":"b0000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

-- (a) Publishing with an unpriced distance_rates row is refused. -------------------------
select throws_ok(
  $$ update public.rate_versions set status = 'live' where slug = 'test-matrix' $$,
  '23001',
  null,
  'draft->live refused while distance_rates has NULL amounts (completeness gate)'
);

-- D-08: start alone is not enough — per-km still null. Literal 1 is in-transaction-only
-- (rolled back; never a real CHF amount, D-34).
update public.distance_rates set base_fare_rappen = 1
 where rate_version_id = (select id from public.rate_versions where slug = 'test-matrix');
select throws_ok(
  $$ update public.rate_versions set status = 'live' where slug = 'test-matrix' $$,
  '23001',
  null,
  'draft->live refused while distance_rates.per_km_rappen is NULL (D-08)'
);

-- Synthetic, in-transaction-only figures purely to flip the completeness gate — rolled back
-- at the end of this file, never a real CHF amount (D-34). D-08: start + per-km; max_pax
-- already on the row.
update public.distance_rates set per_km_rappen = 2
 where rate_version_id = (select id from public.rate_versions where slug = 'test-matrix');

-- (b) Still refused: the surcharges row is priced by kind='percent' but percent is NULL. ----
select throws_ok(
  $$ update public.rate_versions set status = 'live' where slug = 'test-matrix' $$,
  '23001',
  null,
  'draft->live still refused while surcharges.percent is NULL (completeness gate)'
);

-- A percentage rate, not a CHF amount — D-34 does not apply to `percent`.
update public.surcharges set percent = 10.00
 where rate_version_id = (select id from public.rate_versions where slug = 'test-matrix')
   and code = 'night';

-- Plan 04-04 (D-09 fourth gate): fixture surcharges need a non-empty predicate before
-- case (c), or the new clause refuses the transition this test exists to prove.
update public.surcharges
   set predicate = '{"kind":"always"}'::jsonb
 where rate_version_id = (select id from public.rate_versions where slug = 'test-matrix');

-- (c−) Empty predicate refuses draft→live even when every amount is priced (04-04).
update public.surcharges
   set predicate = '{}'::jsonb
 where rate_version_id = (select id from public.rate_versions where slug = 'test-matrix')
   and code = 'night';
select throws_ok(
  $$ update public.rate_versions set status = 'live' where slug = 'test-matrix' $$,
  '23001',
  null,
  'draft->live refused while an active surcharge has empty predicate (04-04 D-09 gate)'
);

-- Restore predicate so case (c) can publish.
update public.surcharges
   set predicate = '{"kind":"always"}'::jsonb
 where rate_version_id = (select id from public.rate_versions where slug = 'test-matrix')
   and code = 'night';

-- (c) Fully priced with predicate: draft->live succeeds and stamps attribution. ----------
select lives_ok(
  $$ update public.rate_versions set status = 'live' where slug = 'test-matrix' $$,
  'draft->live succeeds once every priced row is complete (and predicates are set)'
);
select isnt(
  (select published_at from public.rate_versions where slug = 'test-matrix'),
  null,
  'published_at is stamped by the trigger, not the caller'
);
select is(
  (select published_by from public.rate_versions where slug = 'test-matrix'),
  'b0000000-0000-0000-0000-000000000001'::uuid,
  'published_by is stamped from app.uid(), matching the admin session'
);

-- (c+) 04-04 second new assertion: status is live after the empty-predicate refuse path
-- was restored and case (c) published — pairs with the throws_ok above without a second publish.
select is(
  (select status::text from public.rate_versions where slug = 'test-matrix'),
  'live',
  'draft->live succeeded again once the empty predicate was restored (04-04)'
);

-- (i) F-12 — a priced row cannot be INSERTed straight into a version that is already live. --
-- 'test-matrix' is live from case (c); a second, still-draft version is the control case.
insert into public.rate_versions (slug, label) values ('test-matrix-draft2', 'Draft control');

-- Synthetic price_rappen, in a transaction rolled back at the end of this file — never a
-- real CHF amount (D-34).
select throws_ok(
  $$
    insert into public.fixed_routes (rate_version_id, origin_zone_id, dest_zone_id, vehicle_class_id, price_rappen, live)
    select rv.id, z1.id, z2.id, vc.id, 1, true
      from public.rate_versions rv, public.service_zones z1, public.service_zones z2, public.vehicle_classes vc
     where rv.slug = 'test-matrix' and z1.slug = 'rvp-zone-a' and z2.slug = 'rvp-zone-b' and vc.slug = 'first'
  $$,
  '23001',
  null,
  'INSERT of a priced fixed_routes row against a live rate_version is refused (F-12)'
);
select lives_ok(
  $$
    insert into public.fixed_routes (rate_version_id, origin_zone_id, dest_zone_id, vehicle_class_id, price_rappen, live)
    select rv.id, z1.id, z2.id, vc.id, 1, true
      from public.rate_versions rv, public.service_zones z1, public.service_zones z2, public.vehicle_classes vc
     where rv.slug = 'test-matrix-draft2' and z1.slug = 'rvp-zone-a' and z2.slug = 'rvp-zone-b' and vc.slug = 'first'
  $$,
  'the same INSERT against a draft rate_version succeeds'
);
select throws_ok(
  $$
    insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax)
    select rv.id, vc.id, 3
      from public.rate_versions rv, public.vehicle_classes vc
     where rv.slug = 'test-matrix' and vc.slug = 'first'
  $$,
  '23001',
  null,
  'INSERT of a distance_rates row against a live rate_version is refused (F-12)'
);
select throws_ok(
  $$
    insert into public.surcharges (rate_version_id, code, kind, predicate)
    select rv.id, 'airport_pickup', 'included', '{"kind":"always"}'::jsonb
      from public.rate_versions rv where rv.slug = 'test-matrix'
  $$,
  '23001',
  null,
  'INSERT of a surcharges row against a live rate_version is refused (F-12)'
);

-- (d) rate_versions_one_live: a second version cannot also go live. ----------------------
insert into public.rate_versions (slug, label) values ('test-matrix-2', 'Test matrix 2');
select throws_ok(
  $$ update public.rate_versions set status = 'live' where slug = 'test-matrix-2' $$,
  '23505',
  null,
  'a second draft->live raises 23505 (rate_versions_one_live, D-09)'
);

-- (e) live->draft is illegal — the frozen matrix could never be reversed silently. --------
select throws_ok(
  $$ update public.rate_versions set status = 'draft' where slug = 'test-matrix' $$,
  '23001',
  null,
  'live->draft is refused (only draft->live and live->retired are legal)'
);

-- (f) live->retired is the only legal way out of live. ------------------------------------
select lives_ok(
  $$ update public.rate_versions set status = 'retired' where slug = 'test-matrix' $$,
  'live->retired succeeds'
);

-- (g) retired is terminal. -----------------------------------------------------------------
select throws_ok(
  $$ update public.rate_versions set status = 'live' where slug = 'test-matrix' $$,
  '23001',
  null,
  'retired->live is refused — retired is terminal'
);

-- (h) F-04 — a live row cannot be born by INSERT, and attacker-supplied attribution on an
-- INSERT is nulled regardless of what the caller supplies. --------------------------------
select throws_ok(
  $$
    insert into public.rate_versions (slug, label, status, published_at, published_by)
    values ('backdoor', 'x', 'live', now(), 'b0000000-0000-0000-0000-000000000001')
  $$,
  '23001',
  null,
  'INSERT with status=''live'' is refused — a rate_version is always born draft (F-04)'
);
select lives_ok(
  $$
    insert into public.rate_versions (slug, label, status, published_at)
    values ('stamped', 'x', 'draft', now())
  $$,
  'INSERT with status=''draft'' succeeds even when the caller also supplies published_at'
);
select is(
  (select published_at from public.rate_versions where slug = 'stamped'),
  null,
  'the insert-draft trigger nulls attacker-supplied published_at on INSERT (F-04)'
);

select * from finish();
rollback;

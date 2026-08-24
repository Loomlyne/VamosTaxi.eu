-- snapshot_shape.test.sql
--
-- Proves D-07/D-08/D-11/D-29/D-31/D-34 (02-SCHEMA-DRAFT.md §15) — the price/policy snapshot
-- refuses a row without its policy, its lines array, or a half-priced amount set; a forged
-- rate_version_is_live is overwritten by tg_snapshot_rate_version_flag; the legs table takes
-- only leg_seq 1/2; is_chargeable is STORED (D-28); and (appended by Plan 02-06's Task 2)
-- coupon_redemptions is consumed at payment (D-29), never a snapshot.
--
-- Snapshot half only in this pass — Task 2 appends the payments/coupon_redemptions
-- assertions and raises the plan() count.
begin;
select plan(15);

-- Fixtures --------------------------------------------------------------------------------
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('economy', 3, 3);

-- Stays draft on purpose: proves the flag trigger overwrites a caller-forged
-- rate_version_is_live => true (assertion 4 below) rather than trusting it.
insert into public.rate_versions (slug, label) values ('snap-shape-draft', 'Snapshot shape draft fixture');

insert into public.settings_versions (slug, label) values ('test-policy', 'Test policy fixture');

insert into public.bookings (contact_name, contact_email) values ('Snapshot Shape Test', 'shape@example.test');

create temporary table fx as
select vc.id as vehicle_class_id, rv.id as rate_version_id, sv.id as settings_version_id,
       b.id as booking_id
  from public.vehicle_classes vc, public.rate_versions rv, public.settings_versions sv, public.bookings b
 where vc.slug = 'economy' and rv.slug = 'snap-shape-draft' and sv.slug = 'test-policy'
   and b.contact_email = 'shape@example.test';

create temporary table snap_fixture as select gen_random_uuid() as quote_id;

-- A full, valid policy object — reused by every fixture insert that must not itself trip
-- price_snapshots_policy_shape.
-- (1) policy = '{}' raises 23514 (price_snapshots_policy_shape). ------------------------------
select throws_ok(
  $$ insert into public.price_snapshots
       (quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
        engine_version, pax, bags, lines, policy, expires_at)
     select gen_random_uuid(), fx.vehicle_class_id, fx.rate_version_id, false, fx.settings_version_id,
            'quote-engine@test', 1, 0, '[]'::jsonb, '{}'::jsonb, now() + interval '30 minutes'
       from fx $$,
  '23514',
  null,
  'a snapshot with policy = {} raises 23514 (price_snapshots_policy_shape)'
);

-- (2) lines = '{}' (object, not array) raises 23514 (price_snapshots_lines_array). -------------
select throws_ok(
  $$ insert into public.price_snapshots
       (quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
        engine_version, pax, bags, lines, policy, expires_at)
     select gen_random_uuid(), fx.vehicle_class_id, fx.rate_version_id, false, fx.settings_version_id,
            'quote-engine@test', 1, 0, '{}'::jsonb,
            jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                                'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                                'settings_version_id', 1),
            now() + interval '30 minutes'
       from fx $$,
  '23514',
  null,
  'a snapshot with lines = {} (an object, not an array) raises 23514 (price_snapshots_lines_array)'
);

-- (3) total_rappen set (0, so price_snapshots_total_sums itself is satisfied) but the other
-- three amount columns NULL raises 23514 (price_snapshots_all_or_nothing), isolated from the
-- total-sums constraint by choosing an amount that also sums correctly. -----------------------
select throws_ok(
  $$ insert into public.price_snapshots
       (quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
        engine_version, pax, bags, lines, policy, total_rappen, expires_at)
     select gen_random_uuid(), fx.vehicle_class_id, fx.rate_version_id, false, fx.settings_version_id,
            'quote-engine@test', 1, 0, '[]'::jsonb,
            jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                                'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                                'settings_version_id', 1),
            0, now() + interval '30 minutes'
       from fx $$,
  '23514',
  null,
  'total_rappen set with subtotal/surcharges/discount NULL raises 23514 (price_snapshots_all_or_nothing)'
);

-- (4) A valid all-NULL-amount snapshot, with a FORGED rate_version_is_live => true, inserts
-- cleanly and reads back rate_version_is_live = false / is_chargeable = false — the version
-- cited is still 'draft', so tg_snapshot_rate_version_flag must overwrite the caller's claim,
-- never trust it (D-09). ------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.price_snapshots
       (quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
        engine_version, pax, bags, lines, policy, expires_at)
     select sf.quote_id, fx.vehicle_class_id, fx.rate_version_id,
            true,   -- FORGED: the caller claims the draft version is live
            fx.settings_version_id, 'quote-engine@test', 1, 0, '[]'::jsonb,
            jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                                'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                                'settings_version_id', 1),
            now() + interval '30 minutes'
       from fx, snap_fixture sf $$,
  'a valid all-NULL-amount snapshot with a forged rate_version_is_live inserts'
);
select is(
  (select rate_version_is_live from public.price_snapshots ps join snap_fixture sf on sf.quote_id = ps.quote_id),
  false,
  'tg_snapshot_rate_version_flag overwrote the forged true -- the cited rate_version is still draft'
);
select is(
  (select is_chargeable from public.price_snapshots ps join snap_fixture sf on sf.quote_id = ps.quote_id),
  false,
  'is_chargeable is false: total_rappen is NULL and rate_version_is_live is false'
);

-- (5) display_currency: exists, defaults CHF (D-31). --------------------------------------------
select has_column('public', 'price_snapshots', 'display_currency', 'price_snapshots has display_currency (D-31)');
select col_default_is('public', 'price_snapshots', 'display_currency', 'CHF', 'display_currency defaults to CHF');

-- (6) price_snapshot_legs: leg_seq outside {1,2} raises 23514. ----------------------------------
select throws_ok(
  $$ insert into public.price_snapshot_legs (snapshot_id, leg_seq)
     select ps.id, 3 from public.price_snapshots ps
       join snap_fixture sf on sf.quote_id = ps.quote_id $$,
  '23514',
  null,
  'price_snapshot_legs.leg_seq = 3 raises 23514'
);

-- (7) leg_seq = 1 and 2 for the same snapshot both succeed (D-11: legs SHARE one snapshot). -----
select lives_ok(
  $$ insert into public.price_snapshot_legs (snapshot_id, leg_seq)
     select ps.id, 1 from public.price_snapshots ps
       join snap_fixture sf on sf.quote_id = ps.quote_id $$,
  'price_snapshot_legs leg_seq = 1 succeeds'
);
select lives_ok(
  $$ insert into public.price_snapshot_legs (snapshot_id, leg_seq)
     select ps.id, 2 from public.price_snapshots ps
       join snap_fixture sf on sf.quote_id = ps.quote_id $$,
  'price_snapshot_legs leg_seq = 2 succeeds (same snapshot as leg_seq = 1)'
);

-- (8) bookings.price_snapshot_id pointing at a non-existent id raises 23503 (bookings_price_snapshot_fk). --
select throws_ok(
  $$ update public.bookings set price_snapshot_id = 999999999
       where contact_email = 'shape@example.test' $$,
  '23503',
  null,
  'bookings.price_snapshot_id -> a non-existent price_snapshots id raises 23503 (bookings_price_snapshot_fk)'
);

-- (9) is_chargeable is a STORED generated column (D-28). -----------------------------------------
select is(
  (select attgenerated from pg_attribute
    where attrelid = 'public.price_snapshots'::regclass and attname = 'is_chargeable'),
  's',
  'price_snapshots.is_chargeable is STORED (attgenerated = ''s'', D-28)'
);

-- (10) tg_booking_price_cache: binding price_snapshot_id to the forged-but-unchargeable snapshot
-- copies its (NULL) total into bookings.price_total_rappen, never invents a number (D-34). -------
select lives_ok(
  $$ update public.bookings set price_snapshot_id =
       (select ps.id from public.price_snapshots ps join snap_fixture sf on sf.quote_id = ps.quote_id)
       where contact_email = 'shape@example.test' $$,
  'binding bookings.price_snapshot_id to the fixture snapshot succeeds (FK target now exists)'
);
select is(
  (select price_total_rappen from public.bookings where contact_email = 'shape@example.test'),
  null::rappen,
  'tg_booking_price_cache copied the (NULL) snapshot total, never invented a number (D-34)'
);

select * from finish();
rollback;

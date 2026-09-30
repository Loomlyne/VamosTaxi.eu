-- seed_idempotent.test.sql
--
-- Proves DATA-07 (D-22, D-27): a fresh environment's seed loads vehicle classes, settings,
-- content strings and reviews with the confirmed ADR-014 values (D-35), exactly three vehicle
-- classes (D-36), no CHF amount and no live rate version (D-34, D-09) -- and that running the
-- seed a SECOND time changes no row count on any of the nine seeded tables and does not raise,
-- even though settings_versions is append-only (F-02: its conflict clause is DO NOTHING, never
-- DO UPDATE, so the second run cannot trip tg_append_only's restrict_violation).
--
-- The seed itself is already loaded (supabase/seed.sql ran as part of `supabase db reset`
-- before pgTAP ever starts) -- this file re-invokes the generator's own
-- public.__seed_apply() function a second time, inside this test's transaction, rather than
-- shelling out to psql to re-source the .sql file (pg_prove cannot \i a file mid-test).
begin;
select plan(37);

-- ── Capture the nine seeded tables' row counts before the second run ────────────────────────
create temporary table seed_counts_before as
select 'vehicle_classes'::text as t, count(*) as n from public.vehicle_classes
union all select 'service_zones', count(*) from public.service_zones
union all select 'settings', count(*) from public.settings
union all select 'settings_versions', count(*) from public.settings_versions
union all select 'rate_versions', count(*) from public.rate_versions
union all select 'distance_rates', count(*) from public.distance_rates
union all select 'surcharges', count(*) from public.surcharges
union all select 'content_strings', count(*) from public.content_strings
union all select 'reviews', count(*) from public.reviews;

-- D-27 / F-02: re-running the seed's own apply function must not raise, even though
-- settings_versions is append-only and every other target uses ON CONFLICT ... DO UPDATE.
select lives_ok(
  $$ select public.__seed_apply() $$,
  'running the seed a second time does not raise (F-02: settings_versions is DO NOTHING)'
);

create temporary table seed_counts_after as
select 'vehicle_classes'::text as t, count(*) as n from public.vehicle_classes
union all select 'service_zones', count(*) from public.service_zones
union all select 'settings', count(*) from public.settings
union all select 'settings_versions', count(*) from public.settings_versions
union all select 'rate_versions', count(*) from public.rate_versions
union all select 'distance_rates', count(*) from public.distance_rates
union all select 'surcharges', count(*) from public.surcharges
union all select 'content_strings', count(*) from public.content_strings
union all select 'reviews', count(*) from public.reviews;

-- D-27: identical row counts, one assertion per seeded table.
select is((select n from seed_counts_after where t = 'vehicle_classes')::int, (select n from seed_counts_before where t = 'vehicle_classes')::int, 'vehicle_classes row count unchanged after a second seed run');
select is((select n from seed_counts_after where t = 'service_zones')::int, (select n from seed_counts_before where t = 'service_zones')::int, 'service_zones row count unchanged after a second seed run');
select is((select n from seed_counts_after where t = 'settings')::int, (select n from seed_counts_before where t = 'settings')::int, 'settings row count unchanged after a second seed run');
select is((select n from seed_counts_after where t = 'settings_versions')::int, (select n from seed_counts_before where t = 'settings_versions')::int, 'settings_versions row count unchanged after a second seed run (F-02 DO NOTHING)');
select is((select n from seed_counts_after where t = 'rate_versions')::int, (select n from seed_counts_before where t = 'rate_versions')::int, 'rate_versions row count unchanged after a second seed run');
select is((select n from seed_counts_after where t = 'distance_rates')::int, (select n from seed_counts_before where t = 'distance_rates')::int, 'distance_rates row count unchanged after a second seed run');
select is((select n from seed_counts_after where t = 'surcharges')::int, (select n from seed_counts_before where t = 'surcharges')::int, 'surcharges row count unchanged after a second seed run');
select is((select n from seed_counts_after where t = 'content_strings')::int, (select n from seed_counts_before where t = 'content_strings')::int, 'content_strings row count unchanged after a second seed run');
select is((select n from seed_counts_after where t = 'reviews')::int, (select n from seed_counts_before where t = 'reviews')::int, 'reviews row count unchanged after a second seed run');

-- ── D-36: exactly Economy 3/3, Business 3/3, Van 8/8 -- no `first` class ────────────────────
select results_eq(
  $$ select slug, passenger_capacity::int, luggage_capacity::int from public.vehicle_classes order by sort_order $$,
  $$ values ('economy'::text, 3::int, 3::int), ('business', 3, 3), ('van', 8, 8) $$,
  'vehicle_classes are exactly economy 3/3, business 3/3, van 8/8, in sort order (D-36)'
);
select is((select count(*) from public.vehicle_classes where slug = 'first')::int, 0, 'no first class ships (D-36)');

-- ── D-35: the twelve ADR-014 §5 values on the one launch-baseline settings_versions row ─────
select is((select free_cancel_hours from public.settings_versions where slug = 'launch-baseline'), 24, 'free_cancel_hours = 24 (D-35)');
select is((select cancellation_tiers from public.settings_versions where slug = 'launch-baseline'),
  '[{"from_hours_before":24,"refund_percent":100},{"from_hours_before":0,"refund_percent":75},{"no_show":true,"refund_percent":0}]'::jsonb,
  'cancellation_tiers is the 100/75/0 three-element array (D-35)');
select is((select airport_waiting_minutes from public.settings_versions where slug = 'launch-baseline'), 60, 'airport_waiting_minutes = 60 (D-35)');
select is((select city_waiting_minutes from public.settings_versions where slug = 'launch-baseline'), 15, 'city_waiting_minutes = 15 (D-35)');
select is((select min_advance_minutes from public.settings_versions where slug = 'launch-baseline'), 180, 'min_advance_minutes = 180 (D-35)');
select is((select manage_link_validity_days from public.settings_versions where slug = 'launch-baseline'), 30, 'manage_link_validity_days = 30 (D-35)');
select is((select round_trip_discount_percent from public.settings_versions where slug = 'launch-baseline'), 10::numeric, 'round_trip_discount_percent = 10 (D-35)');
select is((select night_window_start from public.settings_versions where slug = 'launch-baseline'), '20:00'::time, 'night_window_start = 20:00 (D-35)');
select is((select night_window_end from public.settings_versions where slug = 'launch-baseline'), '06:00'::time, 'night_window_end = 06:00 (D-35)');
select is((select night_window_tz from public.settings_versions where slug = 'launch-baseline'), 'Europe/Zurich', 'night_window_tz = Europe/Zurich (D-35)');
select is((select quote_lock_minutes from public.settings_versions where slug = 'launch-baseline'), 1440, 'quote_lock_minutes = 1440 (D-31 remainder 24h)');
select is((select checkout_window_minutes from public.settings_versions where slug = 'launch-baseline'), 1440, 'checkout_window_minutes = 1440 (D-31 remainder 24h)');
select is((select modification_deadline_hours from public.settings_versions where slug = 'launch-baseline'), null::integer, 'modification_deadline_hours stays NULL (ADR-002, unconfirmed)');

-- ── D-14: the one internal parameter that seeds a number, not NULL ──────────────────────────
select is((select chauffeur_turnaround_minutes from public.settings where id = 1), 30, 'settings.chauffeur_turnaround_minutes = 30 (D-14)');

-- ── D-34 / D-09 (Law 04): no live rate_version, no priced column carries a non-null amount ──
select is((select count(*) from public.rate_versions where status = 'live')::int, 0, 'no live rate_version -- pricing_live stays false by data (D-09)');
select is(
  (select count(*) from public.distance_rates where base_fare_rappen is not null or per_km_rappen is not null or min_fare_rappen is not null)::int,
  0,
  'no distance_rates amount is non-null (D-34)'
);
select is(
  (select count(*) from public.surcharges where amount_rappen is not null or percent is not null)::int,
  0,
  'no surcharges amount is non-null (D-34)'
);

-- ── reviews ──────────────────────────────────────────────────────────────────────────────────
-- 29aa137 (06-08): the review store ships empty and hydrates from /api/staff/reviews, so the
-- seed carries no placeholder reviews. Real ones arrive from the platforms (owner decision 11).
select is((select count(*) from public.reviews)::int, 0, 'no review is seeded: empty list is the shipping state (29aa137)');
select is((select count(*) from public.reviews where locked)::int, 0, 'no locked (imported) review is seeded');
select is((select count(*) from public.reviews where published)::int, 0, 'no seeded review is published on the home page');

-- ── content_strings ──────────────────────────────────────────────────────────────────────────
-- Counts track the generated seed header (packages/db/supabase/seed.sql; regenerated in 8b409c7, Phase 6).
-- Counts are the generator's own output (pnpm db:seed:gen; 26.3-22 re-read them from the seed header: 2596 keys, 75 no-param reasons).
-- 26.4-10: en.json gained 4 keys in 26.4 (trip flight add/optional/hint, Stripe product name): 2600 keys.
-- 26.1-10: migration 20260928130000_canton_city_zones.sql (not the seed) adds 26 non-translatable
-- canton display names (zone.canton-<code>); canton_zones.test.sql pins those 26 on their own.
-- 26.5: re-pinned to the generated seed after 26.5's 36 new strings: 2670 keys (main had 2634 before 26.5).
select is((select count(*) from public.content_strings)::int, 2670 + 26, 'content_strings row count = flattened en.json key count + 26 migration canton names');
select is((select count(*) from public.content_strings where pending_value)::int, 16, '16 pending-value keys (ADR-011, Law 04 data-tok)');
select is((select count(*) from public.content_strings where non_translatable)::int, 8 + 26, '8 non-translatable seed keys (ADR-012) + 26 migration canton names');
select is((select count(*) from public.content_strings where no_param_reason is not null)::int, 94, '94 no-param-reason keys (I18N-06; count re-read from the seed header in 26.5)');
select ok(
  (select de is not null and fr is not null and ar is not null from public.content_strings where key = 'price.surcharge.night.rule'),
  'price.surcharge.night.rule (Plan 02-04) has a non-null de/fr/ar translation'
);

select * from finish();
rollback;

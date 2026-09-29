-- reference_tables.test.sql
--
-- Proves DATA-01: all seven reference tables (plus settings_versions and content_strings)
-- exist from a zero `supabase db reset`, with the D-35 policy-column set, the D-10
-- singleton/history split (settings never carries manage_link_validity_days), the D-36-
-- tolerant vehicle_classes CHECK, the D-19 erasure guard, and the D-22 content_strings $meta
-- facts.
begin;
select plan(43);

-- DATA-01: every reference table this plan and its predecessors create.
select has_table('public', 'settings', 'public.settings exists');
select has_table('public', 'settings_versions', 'public.settings_versions exists');
select has_table('public', 'vehicle_classes', 'public.vehicle_classes exists');
select has_table('public', 'vehicles', 'public.vehicles exists');
select has_table('public', 'chauffeurs', 'public.chauffeurs exists');
select has_table('public', 'customers', 'public.customers exists');
select has_table('public', 'staff', 'public.staff exists');
select has_table('public', 'content_strings', 'public.content_strings exists');
select has_table('public', 'reviews', 'public.reviews exists');

-- D-35: the seven ADR-014 §5 columns land on settings_versions, not settings.
select has_column('public', 'settings_versions', 'manage_link_validity_days', 'settings_versions has manage_link_validity_days (D-35)');
select has_column('public', 'settings_versions', 'round_trip_discount_percent', 'settings_versions has round_trip_discount_percent (D-35)');
select has_column('public', 'settings_versions', 'night_window_start', 'settings_versions has night_window_start (D-35)');
select has_column('public', 'settings_versions', 'night_window_end', 'settings_versions has night_window_end (D-35)');
select has_column('public', 'settings_versions', 'night_window_tz', 'settings_versions has night_window_tz (D-35)');
select has_column('public', 'settings_versions', 'quote_lock_minutes', 'settings_versions has quote_lock_minutes (D-35)');
select has_column('public', 'settings_versions', 'checkout_window_minutes', 'settings_versions has checkout_window_minutes (D-35)');

-- The pre-existing ADR-005/ADR-002 policy columns settings_versions already carried.
select has_column('public', 'settings_versions', 'free_cancel_hours', 'settings_versions has free_cancel_hours');
select has_column('public', 'settings_versions', 'airport_waiting_minutes', 'settings_versions has airport_waiting_minutes');
select has_column('public', 'settings_versions', 'city_waiting_minutes', 'settings_versions has city_waiting_minutes');
select has_column('public', 'settings_versions', 'min_advance_minutes', 'settings_versions has min_advance_minutes');
select has_column('public', 'settings_versions', 'cancellation_tiers', 'settings_versions has cancellation_tiers');

-- D-10/D-35: manage_link_validity_days is a versioned policy value, never operational config.
select hasnt_column('public', 'settings', 'manage_link_validity_days', 'settings does NOT carry manage_link_validity_days — it lives only on settings_versions (D-35)');

-- D-14: the one internal parameter that defaults to a number, not NULL.
select col_default_is('public', 'settings', 'chauffeur_turnaround_minutes', '30', 'chauffeur_turnaround_minutes defaults to 30 (D-14)');

-- Schema-qualified citext, never dependent on search_path.
select col_type_is('public', 'customers', 'email', 'extensions.citext', 'customers.email is extensions.citext');

-- ADR-002 gap discipline: an ADR-014-confirmed column still ships nullable in the schema —
-- the seed (Plan 02-09) supplies the value, this migration never does.
select col_is_null('public', 'settings_versions', 'round_trip_discount_percent', 'round_trip_discount_percent is nullable (ADR-002 gap discipline)');

-- vehicle_classes slug CHECK: Phase 18 D-29 (20260914191000) replaced the fixed slug list with
-- vehicle_classes_slug_kebab -- any kebab slug is a class, anything else is still rejected.
select throws_ok(
  $$ insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity) values ('Limo Class', 3, 3) $$,
  '23514',
  null,
  'vehicle_classes rejects a slug that is not kebab-case (vehicle_classes_slug_kebab)'
);
-- DEVIATION (Rule 1, bug fix -- Plan 02-09 seeds a real 'van' row): inserting a second 'van'
-- now collides with vehicle_classes_slug_key. 'first' is the one CHECK-list slug the seed
-- never occupies (D-36), so it proves the same thing -- the CHECK's capacity range accepts an
-- 8/8 row -- without depending on which slug carries it.
select lives_ok(
  $$ insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity) values ('first', 8, 8) $$,
  'vehicle_classes accepts an 8/8-capacity row (D-36 confirmed capacity range)'
);

-- settings singleton CHECK: only id = 1 may ever exist.
select throws_ok(
  $$ insert into public.settings (id) values (2) $$,
  '23514',
  null,
  'settings rejects a second row (id must be 1)'
);

-- reviews.locked derives from source, never seeded directly.
insert into public.customers (full_name, email) values ('Erasure Test', 'erasure-test@vamostaxi.eu');
insert into public.reviews (external_ref, source) values ('rv-t1', 'google');
select is(
  (select locked from public.reviews where external_ref = 'rv-t1'),
  true,
  'an imported review (source <> manual) is locked'
);
insert into public.reviews (external_ref, source) values ('rv-t2', 'manual');
select is(
  (select locked from public.reviews where external_ref = 'rv-t2'),
  false,
  'a manual review is not locked'
);

-- D-19: erased_at can only be set through the admin path — an ordinary update with no staff
-- identity set raises restrict_violation (23001), the errcode tg_customers_erasure_guard
-- declares.
select throws_ok(
  $$ update public.customers set erased_at = now() where email = 'erasure-test@vamostaxi.eu' $$,
  '23001',
  null,
  'an ordinary update to erased_at raises restrict_violation without app.is_admin()'
);

-- D-22: the three $meta facts content_strings carries alongside en/de/fr/ar.
select has_column('public', 'content_strings', 'pending_value', 'content_strings has pending_value (Law 04 data-tok, ADR-011)');
select has_column('public', 'content_strings', 'non_translatable', 'content_strings has non_translatable (ADR-012)');
select has_column('public', 'content_strings', 'no_param_reason', 'content_strings has no_param_reason (I18N-06)');

-- Plan 04-05: snapshot board, second clock, service-area polygon column.
select has_column('public', 'price_snapshots', 'shown_alternatives', 'price_snapshots has shown_alternatives (D-22)');
select has_column('public', 'price_snapshots', 'quote_lock_expires_at', 'price_snapshots has quote_lock_expires_at (D-25)');
select has_column('public', 'settings_versions', 'service_area_geojson', 'settings_versions has service_area_geojson (D-17)');

-- Plan 04-06: coupon release ledger + evaluate_coupon.
select has_column('public', 'coupon_redemptions', 'released_at', 'coupon_redemptions has released_at (D-31)');
select has_column('public', 'coupon_redemptions', 'released_reason', 'coupon_redemptions has released_reason (D-31)');
select has_function('public', 'evaluate_coupon', 'evaluate_coupon exists (D-30)');
select has_function('public', 'create_quote_snapshot', 'create_quote_snapshot exists (D-44a)');

-- Plan 04-12: flight provenance columns Phase 9 reads.
select has_column('public', 'booking_legs', 'flight_checked_at', 'booking_legs has flight_checked_at (D-20)');
select has_column('public', 'booking_legs', 'flight_time_source', 'booking_legs has flight_time_source (D-20)');

select * from finish();
rollback;

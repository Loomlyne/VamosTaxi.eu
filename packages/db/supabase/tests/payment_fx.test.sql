-- payment_fx.test.sql
--
-- Proves plan 07-01: FX columns and constraints on booking_payments; charge gate
-- untouched and currency-blind (D-11); extended UPDATE whitelist; booking_refunds
-- unchanged (D-12). Fixture slugs/emails prefixed payment-fx- so this file does not
-- collide with charge_gate.test.sql.
--
-- Synthetic figures, rolled back at the end of this file — never a real CHF amount (D-34).
begin;
select plan(24);

-- slug CHECK is economy|business|first|van. Seed occupies the first three; 'first' is free (D-36).
-- Emails / rate-version slugs stay payment-fx- prefixed so this file does not collide with charge_gate.
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('first', 3, 3);

insert into public.rate_versions (slug, label)
values ('payment-fx-rv', 'payment-fx rate fixture');

insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen)
select rv.id, vc.id, 3, 1, 2, 3
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug = 'payment-fx-rv' and vc.slug = 'first';

insert into public.surcharges (rate_version_id, code, kind, percent, predicate)
select rv.id, 'night', 'percent', 10.00, '{"kind":"always"}'::jsonb
  from public.rate_versions rv where rv.slug = 'payment-fx-rv';

insert into public.settings_versions (slug, label)
values ('payment-fx-policy', 'payment-fx policy fixture');

insert into public.customers (full_name, email)
values ('payment-fx Customer', 'payment-fx@example.test');

insert into public.bookings (contact_name, contact_email, customer_id)
select 'payment-fx Booking', 'payment-fx-booking@example.test', c.id
  from public.customers c where c.email = 'payment-fx@example.test';

insert into public.bookings (contact_name, contact_email, customer_id)
select 'payment-fx Booking 2', 'payment-fx-booking-2@example.test', c.id
  from public.customers c where c.email = 'payment-fx@example.test';

insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                  scheduled_at, scheduled_local, vehicle_class_id)
select b.id, 1, 'outbound', 'ZRH', 'Zurich HB', now() + interval '3 days',
       to_char(now() + interval '3 days', 'YYYY-MM-DD"T"HH24:MI'), vc.id
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email = 'payment-fx-booking@example.test' and vc.slug = 'first';

create temporary table fx as
select vc.id as vehicle_class_id, rv.id as rate_version_id, sv.id as settings_version_id,
       b.id as booking_id
  from public.vehicle_classes vc, public.rate_versions rv, public.settings_versions sv,
       public.bookings b
 where vc.slug = 'first' and rv.slug = 'payment-fx-rv'
   and sv.slug = 'payment-fx-policy'
   and b.contact_email = 'payment-fx-booking@example.test';

create temporary table pol as
select jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                           'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                           'settings_version_id', 1,
                           'modification_deadline_hours', 24,
                           'min_advance_minutes', 180,
                           'policy_doc', 'test') as policy;

update public.rate_versions set status = 'live' where slug = 'payment-fx-rv';

insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy, booking_id,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen, expires_at, quote_lock_expires_at
)
select gen_random_uuid(), fx.vehicle_class_id, fx.rate_version_id, true, fx.settings_version_id,
       'payment-fx@s1', 1, 0, jsonb_build_array(jsonb_build_object(
         'seq', 1, 'code', 'distance_fare', 'kind', 'fare',
         'i18n_key', 'price.line.distance', 'amount_rappen', 6
       )), pol.policy, fx.booking_id, 6, 0, 0, 6,
       now() + interval '30 minutes', now() + interval '30 minutes'
  from fx, pol;

insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy, booking_id,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen, expires_at, quote_lock_expires_at
)
select gen_random_uuid(), fx.vehicle_class_id, fx.rate_version_id, true, fx.settings_version_id,
       'payment-fx@s2', 1, 0, jsonb_build_array(jsonb_build_object(
         'seq', 1, 'code', 'distance_fare', 'kind', 'fare',
         'i18n_key', 'price.line.distance', 'amount_rappen', 6
       )), pol.policy, fx.booking_id, 6, 0, 0, 6,
       now() + interval '30 minutes', now() + interval '30 minutes'
  from fx, pol;

update public.bookings set price_snapshot_id =
  (select id from public.price_snapshots where engine_version = 'payment-fx@s1')
 where id = (select booking_id from fx);

-- Charge gate is untouched and currency-blind (D-11) -----------------------------------------
select ok(
  (select p.prosrc !~ 'fx_rate'
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'tg_payment_matches_snapshot'),
  'D-11: charge gate source does not mention fx_rate'
);
select ok(
  (select p.prosrc !~ 'fx_source'
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'tg_payment_matches_snapshot'),
  'D-11: charge gate source does not mention fx_source'
);
select ok(
  (select p.prosrc !~ 'fx_quoted_at'
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'tg_payment_matches_snapshot'),
  'D-11: charge gate source does not mention fx_quoted_at'
);
select ok(
  (select p.prosrc !~ 'presentment_amount_minor'
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'tg_payment_matches_snapshot'),
  'D-11: charge gate source does not mention presentment_amount_minor'
);
select ok(
  (select p.prosrc !~ 'charged_currency'
     from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'tg_payment_matches_snapshot'),
  'D-11: charge gate source does not mention charged_currency'
);

select throws_ok(
  $$ insert into public.booking_payments (
       booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status,
       charged_currency, fx_rate, fx_source, fx_quoted_at, presentment_amount_minor
     )
     select fx.booking_id, ps.id, 'pi_payment_fx_mismatch', 7, 'requires_payment',
            'EUR', 0.92, 'stripe', now(), 8
       from fx, public.price_snapshots ps where ps.engine_version = 'payment-fx@s1' $$,
  '23001',
  null,
  'D-11: EUR charge with charged_rappen not equal to snapshot total still raises restrict_violation'
);

select lives_ok(
  $$ insert into public.booking_payments (
       booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status,
       charged_currency, fx_rate, fx_source, fx_quoted_at, presentment_amount_minor
     )
     select fx.booking_id, ps.id, 'pi_payment_fx_eur', 6, 'requires_payment',
            'EUR', 0.92, 'stripe', now(), 8
       from fx, public.price_snapshots ps where ps.engine_version = 'payment-fx@s1' $$,
  'D-11: EUR charge with charged_rappen equal to snapshot total succeeds'
);

select has_index(
  'public', 'booking_payments', 'booking_payments_one_success_per_snapshot',
  'booking_payments_one_success_per_snapshot unique index exists (08-07 extra settle)'
);

-- New constraints ----------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.booking_payments (
       booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status,
       charged_currency, fx_rate, fx_source, fx_quoted_at, presentment_amount_minor
     )
     select fx.booking_id, ps.id, 'pi_payment_fx_gbp', 6, 'requires_payment',
            'GBP', 0.92, 'stripe', now(), 8
       from fx, public.price_snapshots ps where ps.engine_version = 'payment-fx@s1' $$,
  '23514',
  null,
  'booking_payments_currency_allowed: GBP raises check_violation'
);

select throws_ok(
  $$ insert into public.booking_payments (
       booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status,
       charged_currency
     )
     select fx.booking_id, ps.id, 'pi_payment_fx_eur_no_fx', 6, 'requires_payment', 'EUR'
       from fx, public.price_snapshots ps where ps.engine_version = 'payment-fx@s1' $$,
  '23514',
  null,
  'booking_payments_fx_currency_pair: EUR with fx_rate NULL raises check_violation'
);

select throws_ok(
  $$ insert into public.booking_payments (
       booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status,
       charged_currency, fx_rate, fx_source, fx_quoted_at, presentment_amount_minor
     )
     select fx.booking_id, ps.id, 'pi_payment_fx_chf_fx', 6, 'requires_payment',
            'CHF', 0.92, 'stripe', now(), 8
       from fx, public.price_snapshots ps where ps.engine_version = 'payment-fx@s1' $$,
  '23514',
  null,
  'booking_payments_fx_currency_pair: CHF with non-NULL fx_rate raises check_violation'
);

select throws_ok(
  $$ insert into public.booking_payments (
       booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status,
       charged_currency, fx_rate, fx_source
     )
     select fx.booking_id, ps.id, 'pi_payment_fx_half', 6, 'requires_payment',
            'EUR', 0.92, 'stripe'
       from fx, public.price_snapshots ps where ps.engine_version = 'payment-fx@s1' $$,
  '23514',
  null,
  'booking_payments_fx_complete: two of four FX columns raises check_violation'
);

-- Extended whitelist -------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.booking_payments (
       booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status
     )
     select fx.booking_id, ps.id, 'pi_payment_fx_chf', 6, 'requires_payment'
       from fx, public.price_snapshots ps where ps.engine_version = 'payment-fx@s1' $$,
  'CHF requires_payment insert (default currency, no FX) succeeds'
);

select lives_ok(
  $$ update public.booking_payments
        set status = 'requires_payment', captured_at = now()
      where stripe_payment_intent_id = 'pi_payment_fx_chf' $$,
  'whitelist: UPDATE status and captured_at on a requires_payment row succeeds'
);

select lives_ok(
  $$ update public.booking_payments
        set charged_currency = 'EUR',
            fx_rate = 0.92,
            fx_source = 'stripe',
            fx_quoted_at = now(),
            presentment_amount_minor = 8
      where stripe_payment_intent_id = 'pi_payment_fx_chf' $$,
  'whitelist: settlement write (charged_currency + FX quadruple) on requires_payment succeeds'
);

select throws_ok(
  $$ update public.booking_payments set charged_rappen = 5
      where stripe_payment_intent_id = 'pi_payment_fx_chf' $$,
  '23001',
  null,
  'whitelist: UPDATE charged_rappen raises restrict_violation'
);

select throws_ok(
  $$ update public.booking_payments set snapshot_id =
       (select id from public.price_snapshots where engine_version = 'payment-fx@s2')
      where stripe_payment_intent_id = 'pi_payment_fx_chf' $$,
  '23001',
  null,
  'whitelist: UPDATE snapshot_id raises restrict_violation'
);

select throws_ok(
  $$ update public.booking_payments set booking_id =
       (select id from public.bookings where contact_email = 'payment-fx-booking-2@example.test')
      where stripe_payment_intent_id = 'pi_payment_fx_chf' $$,
  '23001',
  null,
  'whitelist: UPDATE booking_id raises restrict_violation'
);

select throws_ok(
  $$ update public.booking_payments set stripe_payment_intent_id = 'pi_payment_fx_other'
      where stripe_payment_intent_id = 'pi_payment_fx_chf' $$,
  '23001',
  null,
  'whitelist: UPDATE stripe_payment_intent_id raises restrict_violation'
);

select throws_ok(
  $$ update public.booking_payments set fx_rate = 0.91
      where stripe_payment_intent_id = 'pi_payment_fx_chf' $$,
  '23001',
  null,
  'whitelist: changing an already-non-NULL fx_rate raises restrict_violation (write-once)'
);

select lives_ok(
  $$ update public.booking_payments set status = 'succeeded', captured_at = now()
      where stripe_payment_intent_id = 'pi_payment_fx_chf' $$,
  'whitelist: moving requires_payment to succeeded succeeds'
);

-- now() is constant inside this transaction, so a real change needs a different value; the
-- 08-05 guard compares values and lets a no-op UPDATE through (20260910170935).
select throws_ok(
  $$ update public.booking_payments set captured_at = now() + interval '1 minute'
      where stripe_payment_intent_id = 'pi_payment_fx_chf' $$,
  '23001',
  null,
  'whitelist: any change to a succeeded row raises restrict_violation'
);

-- booking_refunds untouched (D-12) -----------------------------------------------------------
select has_column(
  'public', 'booking_refunds', 'basis_rappen',
  'D-12: booking_refunds.basis_rappen still exists'
);

select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'booking_refunds'
      and (column_name like 'fx_%' or column_name = 'presentment_amount_minor')),
  0,
  'D-12: booking_refunds has no fx_ column and no presentment_amount_minor'
);

select * from finish();
rollback;

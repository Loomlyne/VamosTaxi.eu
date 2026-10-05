-- settle_second_delivery_processed.test.sql
--
-- 261005 money hardening, migration 20261007310000.
-- (U15) A paid checkout is settled twice: by the Stripe webhook and by the return route
-- (`return_<cs_id>`). Whichever comes second reaches the already-settled branch of
-- checkout_payment_settle; it must mark its own stripe_events row processed too, and write nothing
-- else. Both arrival orders. Before 20261007310000 the second row stayed unprocessed.
-- (U26) The vat_rate_bps column comments say tenths of a percent, not hundredths.
-- Synthetic rappen integers only.
begin;
select plan(16);

-- Fixtures --------------------------------------------------------------------------------
update public.rate_versions set status = 'retired' where status = 'live';
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('sdp-economy', 3, 3);
insert into public.rate_versions (slug, label) values ('sdp-rv', 'second delivery fixture');
insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen)
select rv.id, vc.id, 3, 1, 2, 3
  from public.rate_versions rv, public.vehicle_classes vc
 where rv.slug = 'sdp-rv' and vc.slug = 'sdp-economy';
update public.rate_versions set status = 'live' where slug = 'sdp-rv';
insert into public.settings_versions (slug, label) values ('sdp-policy', 'second delivery fixture');

-- A: the return route settles first, the webhook second. B: the webhook first, the return route second.
insert into public.bookings (contact_name, contact_email, contact_phone, quote_id, status)
values
  ('Ada Return', 'sdp-a@example.test', '+41000000021', gen_random_uuid(), 'pending'),
  ('Bo Webhook', 'sdp-b@example.test', '+41000000022', gen_random_uuid(), 'pending');

insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy, booking_id, expires_at, quote_lock_expires_at,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen, coupon_id, coupon_code
)
select b.quote_id, vc.id, rv.id, true, sv.id, 'quote-engine@sdp', 1, 0,
       '[{"seq":1,"leg_seq":1,"kind":"fare","code":"distance_fare","i18n_key":"price.line.transfer","amount_rappen":9}]'::jsonb,
       jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                          'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                          'settings_version_id', 1, 'modification_deadline_hours', 24,
                          'min_advance_minutes', 180, 'policy_doc', 'test'),
       b.id, now() + interval '30 minutes', now() + interval '30 minutes',
       9, 0, 0, 9, null, null
  from public.bookings b, public.vehicle_classes vc, public.rate_versions rv, public.settings_versions sv
 where vc.slug = 'sdp-economy' and rv.slug = 'sdp-rv' and sv.slug = 'sdp-policy'
   and b.contact_email in ('sdp-a@example.test', 'sdp-b@example.test');

update public.bookings b
   set price_snapshot_id = (select s.id from public.price_snapshots s where s.booking_id = b.id),
       price_total_rappen = 9
 where b.contact_email in ('sdp-a@example.test', 'sdp-b@example.test');

insert into public.booking_legs (
  booking_id, leg_seq, direction, pickup_text, dropoff_text,
  scheduled_at, scheduled_local, vehicle_class_id, status
)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
       now() + interval '3 days', to_char(now() + interval '3 days', 'YYYY-MM-DD"T"HH24:MI'),
       vc.id, 'pending'
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email in ('sdp-a@example.test', 'sdp-b@example.test') and vc.slug = 'sdp-economy';

insert into public.booking_payments (
  booking_id, snapshot_id, stripe_payment_intent_id, stripe_checkout_session_id,
  charged_rappen, charged_currency, status
)
select b.id, b.price_snapshot_id, 'cs_sdp_' || substr(b.contact_email, 5, 1), 'cs_sdp_' || substr(b.contact_email, 5, 1),
       9, 'CHF', 'requires_payment'
  from public.bookings b where b.contact_email in ('sdp-a@example.test', 'sdp-b@example.test');

insert into public.stripe_events (id, type, stripe_created, object_id, payload)
values
  ('evt_sdp_a', 'checkout.session.completed', now(), 'cs_sdp_a', '{}'::jsonb),
  ('return_cs_sdp_a', 'checkout.session.completed', now(), 'cs_sdp_a', '{}'::jsonb),
  ('evt_sdp_b', 'checkout.session.completed', now(), 'cs_sdp_b', '{}'::jsonb),
  ('return_cs_sdp_b', 'checkout.session.completed', now(), 'cs_sdp_b', '{}'::jsonb);

create temporary table sdp_first (k text, already_settled boolean);
create temporary table sdp_second (k text, already_settled boolean);
create temporary table sdp_events (k text, n bigint);
grant all on sdp_first, sdp_second, sdp_events to public;

-- A: return route first -----------------------------------------------------------------------
set local role vamos_system;
insert into sdp_first
select 'a', s.already_settled
  from public.checkout_payment_settle('return_cs_sdp_a', 'cs_sdp_a', 'pi_sdp_a', 'succeeded', 'CHF', null, null, null, null) as s;
reset role;
insert into sdp_events
select 'a', count(*) from public.booking_events e join public.bookings b on b.id = e.booking_id
 where b.contact_email = 'sdp-a@example.test';
set local role vamos_system;
insert into sdp_second
select 'a', s.already_settled
  from public.checkout_payment_settle('evt_sdp_a', 'cs_sdp_a', 'pi_sdp_a', 'succeeded', 'CHF', null, null, null, null) as s;
reset role;

select is((select already_settled from sdp_first where k = 'a'), false, '(1) A: the return route settles the payment');
select is((select already_settled from sdp_second where k = 'a'), true, '(2) A: the webhook arrives second and finds it already settled');
select ok((select processed_at is not null from public.stripe_events where id = 'return_cs_sdp_a'), '(3) A: the return row is processed');
select ok((select processed_at is not null from public.stripe_events where id = 'evt_sdp_a'),
  '(4) A: the second (webhook) row is processed too (U15)');
select is(
  (select count(*) from public.booking_events e join public.bookings b on b.id = e.booking_id where b.contact_email = 'sdp-a@example.test'),
  (select n from sdp_events where k = 'a'),
  '(5) A: the second settle writes no booking event');
select is(
  (select status from public.booking_payments where stripe_checkout_session_id = 'cs_sdp_a'),
  'succeeded', '(6) A: the payment is succeeded once');

-- B: webhook first ----------------------------------------------------------------------------
set local role vamos_system;
insert into sdp_first
select 'b', s.already_settled
  from public.checkout_payment_settle('evt_sdp_b', 'cs_sdp_b', 'pi_sdp_b', 'succeeded', 'CHF', null, null, null, null) as s;
reset role;
insert into sdp_events
select 'b', count(*) from public.booking_events e join public.bookings b on b.id = e.booking_id
 where b.contact_email = 'sdp-b@example.test';
set local role vamos_system;
insert into sdp_second
select 'b', s.already_settled
  from public.checkout_payment_settle('return_cs_sdp_b', 'cs_sdp_b', 'pi_sdp_b', 'succeeded', 'CHF', null, null, null, null) as s;
reset role;

select is((select already_settled from sdp_first where k = 'b'), false, '(7) B: the webhook settles the payment');
select is((select already_settled from sdp_second where k = 'b'), true, '(8) B: the return route arrives second');
select ok((select processed_at is not null from public.stripe_events where id = 'evt_sdp_b'), '(9) B: the webhook row is processed');
select ok((select processed_at is not null from public.stripe_events where id = 'return_cs_sdp_b'),
  '(10) B: the second (return) row is processed too (U15)');
select is(
  (select count(*) from public.booking_events e join public.bookings b on b.id = e.booking_id where b.contact_email = 'sdp-b@example.test'),
  (select n from sdp_events where k = 'b'),
  '(11) B: the second settle writes no booking event');
select is(
  (select status::text from public.bookings where contact_email = 'sdp-b@example.test'),
  'confirmed', '(12) B: the booking is confirmed once');

-- Grants unchanged ----------------------------------------------------------------------------
select ok(has_function_privilege('vamos_system',
  'public.checkout_payment_settle(text,text,text,text,text,numeric,text,timestamptz,bigint,text)', 'EXECUTE'),
  '(13) vamos_system keeps EXECUTE');
select is(
  (select count(*)::int from unnest(array['anon', 'authenticated', 'vamos_checkout', 'vamos_guest', 'vamos_staff', 'vamos_edge', 'vamos_public']) r
    where has_function_privilege(r, 'public.checkout_payment_settle(text,text,text,text,text,numeric,text,timestamptz,bigint,text)', 'EXECUTE')),
  0, '(14) no other API or Worker role can settle');

-- U26: vat_rate_bps comments ------------------------------------------------------------------
select ok(
  col_description('public.settings'::regclass,
    (select attnum from pg_attribute where attrelid = 'public.settings'::regclass and attname = 'vat_rate_bps'))
  ~ 'tenths of a percent' and
  col_description('public.settings'::regclass,
    (select attnum from pg_attribute where attrelid = 'public.settings'::regclass and attname = 'vat_rate_bps'))
  !~ 'hundredths',
  '(15) settings.vat_rate_bps: tenths of a percent (U26)');
select ok(
  col_description('public.rate_versions'::regclass,
    (select attnum from pg_attribute where attrelid = 'public.rate_versions'::regclass and attname = 'vat_rate_bps'))
  ~ 'tenths of a percent' and
  col_description('public.rate_versions'::regclass,
    (select attnum from pg_attribute where attrelid = 'public.rate_versions'::regclass and attname = 'vat_rate_bps'))
  !~ 'hundredths',
  '(16) rate_versions.vat_rate_bps: tenths of a percent (U26)');

select * from finish();
rollback;

-- retired_class_in_flight.test.sql
--
-- Phase 30 decision 8. Bookings in flight when a class is retired. Rolled back. Synthetic integer
-- rappen only.
--   1  a staff class change INTO a retired class is refused (unknown-class, 20261007280000:1505-1513);
--      the same change into a Live class is not.
--   2  a pay link already sent for an unpaid booking whose class is then retired still opens, at its
--      saved price (checkout_pay_link_by_hash checks token and hold expiry only). The owner can still
--      cancel the booking. If the owner later decides otherwise, this assertion flips in the plan
--      that changes it.
begin;
select plan(5);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('if-eco', 4, 4), ('if-biz', 7, 7), ('if-van', 8, 8), ('if-pay', 4, 4);

insert into public.rate_versions (slug, label) values ('if-rv', 'retired_class_in_flight fixture');
update public.rate_versions set status = 'live' where slug = 'if-rv';
insert into public.settings_versions (slug, label) values ('if-policy', 'retired_class_in_flight fixture');

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('30000000-0000-4000-c000-000000000001', 'if-admin@vamostaxi.eu', 'authenticated', 'authenticated',
        '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.staff (user_id, role, active, accepted_at, full_name)
values ('30000000-0000-4000-c000-000000000001', 'admin', true, now(), 'IF Admin');

-- One paid booking in if-eco: one leg, a price record with a fare and a VAT line, one captured payment.
insert into public.bookings (reference, contact_name, contact_email, status, locale)
values (public.next_booking_reference(), 'IF paid', 'if-paid@vamostaxi.eu', 'confirmed', 'de');
insert into public.booking_legs (
  booking_id, leg_seq, direction, pickup_text, dropoff_text,
  scheduled_at, scheduled_local, vehicle_class_id, status, pax, bags, estimated_duration_minutes
)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zug',
       now() + interval '48 hours', to_char(now() + interval '48 hours', 'YYYY-MM-DD"T"HH24:MI'),
       vc.id, 'confirmed', 2, 1, 40
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email = 'if-paid@vamostaxi.eu' and vc.slug = 'if-eco';

set local session_replication_role = replica;
insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
  expires_at, quote_lock_expires_at, booking_id, source, distance_km, duration_min
)
select gen_random_uuid(), vc.id, rv.id, true, sv.id, 'quote-engine@if', 2, 1,
       jsonb_build_array(
         jsonb_build_object('seq', 1, 'leg_seq', 1, 'code', 'distance_fare', 'kind', 'fare',
                            'i18n_key', 'price.line.transfer', 'amount_rappen', 9),
         jsonb_build_object('seq', 2, 'leg_seq', 1, 'code', 'vat', 'kind', 'vat',
                            'i18n_key', 'price.line.vat', 'params', jsonb_build_object('vatRateBps', 81),
                            'amount_rappen', 1)),
       jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                          'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                          'settings_version_id', sv.id, 'modification_deadline_hours', 24,
                          'min_advance_minutes', 180, 'policy_doc', 'test', 'extras', '[]'::jsonb),
       10, 0, 0, 10, now() + interval '1 day', now() + interval '1 day', b.id, 'web', 31.4, 40
  from public.vehicle_classes vc
  cross join public.bookings b
  cross join lateral (select id from public.rate_versions where slug = 'if-rv') rv
  cross join lateral (select id from public.settings_versions order by id limit 1) sv
 where vc.slug = 'if-eco' and b.contact_email = 'if-paid@vamostaxi.eu';
update public.bookings b
   set price_snapshot_id = (select s.id from public.price_snapshots s where s.booking_id = b.id)
 where b.contact_email = 'if-paid@vamostaxi.eu';
insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at)
select b.id, b.price_snapshot_id, 'pi_if_paid', 10, 'succeeded', now()
  from public.bookings b where b.contact_email = 'if-paid@vamostaxi.eu';
set local session_replication_role = origin;

create function pg_temp.if_lines(p_total int) returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('seq', 1, 'leg_seq', 1, 'code', 'distance_fare', 'kind', 'fare',
                       'i18n_key', 'price.line.transfer', 'params', jsonb_build_object('vehicleClass', 'x'),
                       'amount_rappen', p_total - 1),
    jsonb_build_object('seq', 2, 'leg_seq', 1, 'code', 'vat', 'kind', 'vat',
                       'i18n_key', 'price.line.vat', 'params', jsonb_build_object('vatRateBps', 81),
                       'amount_rappen', 1))
$$;

create function pg_temp.if_change(p_class text, p_total int, p_expected int default null)
returns table (request_id uuid, booking_id uuid, outcome text, difference_rappen int, new_total_rappen int,
               paid_rappen int, quote_snapshot_id bigint, extra_snapshot_id bigint, old_extra_session_id text,
               old_extra_snapshot_id bigint, unassigned_chauffeur_id uuid)
language sql as $$
  select * from public.booking_staff_change(
    (select b.id from public.bookings b where b.contact_email = 'if-paid@vamostaxi.eu'),
    '30000000-0000-4000-c000-000000000001'::uuid,
    p_class,
    (select rv.id from public.rate_versions as rv where rv.slug = 'if-rv'),
    p_total,
    pg_temp.if_lines(p_total),
    'quote-engine@if-test',
    p_expected
  )
$$;

-- An unpaid booking in if-pay with a live pay link (token + hold), saved price 900.
insert into public.bookings (contact_name, contact_email, contact_phone, quote_id, status)
values ('IF pay', 'if-pay@example.test', '+41000000030', gen_random_uuid(), 'pending');
insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy, booking_id, expires_at, quote_lock_expires_at,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen, coupon_id, coupon_code
)
select b.quote_id, vc.id, rv.id, false, sv.id, 'quote-engine@if', 1, 0,
       '[{"seq":1,"leg_seq":1,"kind":"fare","code":"distance_fare","i18n_key":"price.line.transfer","amount_rappen":900}]'::jsonb,
       jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                          'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                          'settings_version_id', 1, 'modification_deadline_hours', 24,
                          'min_advance_minutes', 180, 'policy_doc', 'test'),
       b.id, now() + interval '30 minutes', now() + interval '30 minutes',
       900, 0, 0, 900, null, null
  from public.bookings b, public.vehicle_classes vc, public.rate_versions rv, public.settings_versions sv
 where b.contact_email = 'if-pay@example.test' and vc.slug = 'if-pay' and rv.slug = 'if-rv' and sv.slug = 'if-policy';
update public.bookings b
   set price_snapshot_id = (select s.id from public.price_snapshots s where s.booking_id = b.id),
       price_total_rappen = 900
 where b.contact_email = 'if-pay@example.test';
insert into public.booking_legs (
  booking_id, leg_seq, direction, pickup_text, dropoff_text,
  scheduled_at, scheduled_local, vehicle_class_id, status
)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
       now() + interval '3 days', to_char(now() + interval '3 days', 'YYYY-MM-DD"T"HH24:MI'),
       vc.id, 'pending'
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email = 'if-pay@example.test' and vc.slug = 'if-pay';
insert into public.booking_access_tokens (booking_id, purpose, token_hash, expires_at)
select b.id, 'pay', extensions.digest('if-pay-link', 'sha256'), now() + interval '1 day'
  from public.bookings b where b.contact_email = 'if-pay@example.test';

-- Retire if-biz and if-pay (the shape a retire leaves: inactive and hidden).
update public.vehicle_classes set active = false, hidden_at = now() where slug in ('if-biz', 'if-pay');

-- 1. A class change into a retired class is refused; into a Live class it is not.
select throws_ok($$select * from pg_temp.if_change('if-biz', 13, 10)$$,
  'P0001', 'unknown-class', 'a staff class change into a retired class is refused (unknown-class)');
select lives_ok($$select * from pg_temp.if_change('if-van', 13, 10)$$,
  'the same change into a Live class is not refused');

-- 2. The pay link sent before the retire still opens, at its saved price.
set local role vamos_checkout;
select is(
  (select count(*)::int from public.checkout_pay_link_by_hash(extensions.digest('if-pay-link', 'sha256'))),
  1, 'a pay link already sent still opens after its class is retired');
select is(
  (select charged_rappen::int from public.checkout_pay_link_by_hash(extensions.digest('if-pay-link', 'sha256'))),
  900, 'it opens at the saved price');
reset role;
select isnt(
  (select hidden_at from public.vehicle_classes where slug = 'if-pay'),
  null, 'the class of that booking is retired (the fixture holds)');

select * from finish();
rollback;

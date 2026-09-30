-- pay_link_erased_booking.test.sql
--
-- Phase 20 plan 20-12. Staff e-mail a pay link for an unpaid booking, then erase the booking
-- (bookings.erased_at). The link must then answer like an unknown or expired one in all three
-- pay-link functions, and a payment arriving for the erased booking must take the missing-booking
-- outcome (P0002, which the Worker refunds in full) and write nothing. A normal pending booking's
-- pay link keeps working. Synthetic values only. Token secrets: 'epl-pay-a', 'epl-pay-b'.
begin;
select plan(13);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('epl-economy', 3, 3);
insert into public.rate_versions (slug, label) values ('epl-rv', 'pay_link_erased_booking fixture');
insert into public.settings_versions (slug, label) values ('epl-policy', 'pay_link_erased_booking fixture');

-- A: normal pending booking. B: pending booking that is erased later.
insert into public.bookings (contact_name, contact_email, contact_phone, quote_id, status)
values
  ('Ada Normal', 'epl-a@example.test', '+41000000011', gen_random_uuid(), 'pending'),
  ('Bo Erased',  'epl-b@example.test', '+41000000012', gen_random_uuid(), 'pending');

insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy, booking_id, expires_at, quote_lock_expires_at,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen, coupon_id, coupon_code
)
select b.quote_id, vc.id, rv.id, false, sv.id, 'quote-engine@epl', 1, 0,
       '[{"seq":1,"leg_seq":1,"kind":"fare","code":"distance_fare","i18n_key":"price.line.transfer","amount_rappen":900}]'::jsonb,
       jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                          'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                          'settings_version_id', 1, 'modification_deadline_hours', 24,
                          'min_advance_minutes', 180, 'policy_doc', 'test'),
       b.id, now() + interval '30 minutes', now() + interval '30 minutes',
       900, 0, 0, 900, null, null
  from public.bookings b, public.vehicle_classes vc, public.rate_versions rv, public.settings_versions sv
 where vc.slug = 'epl-economy' and rv.slug = 'epl-rv' and sv.slug = 'epl-policy'
   and b.contact_email in ('epl-a@example.test', 'epl-b@example.test');

update public.bookings b
   set price_snapshot_id = (select s.id from public.price_snapshots s where s.booking_id = b.id),
       price_total_rappen = 900
 where b.contact_email in ('epl-a@example.test', 'epl-b@example.test');

insert into public.booking_legs (
  booking_id, leg_seq, direction, pickup_text, dropoff_text,
  scheduled_at, scheduled_local, vehicle_class_id, status
)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
       now() + interval '3 days', to_char(now() + interval '3 days', 'YYYY-MM-DD"T"HH24:MI'),
       vc.id, 'pending'
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email in ('epl-a@example.test', 'epl-b@example.test') and vc.slug = 'epl-economy';

insert into public.booking_access_tokens (booking_id, purpose, token_hash, expires_at)
select b.id, 'pay', extensions.digest('epl-pay-' || substr(b.contact_email, 5, 1), 'sha256'),
       now() + interval '1 day'
  from public.bookings b
 where b.contact_email in ('epl-a@example.test', 'epl-b@example.test');

-- B has an open Checkout Session. The charge gate refuses a not-live snapshot, so the fixture
-- bypasses it the way manage_token_purpose does.
set local session_replication_role = replica;
insert into public.booking_payments (
  booking_id, snapshot_id, stripe_payment_intent_id, stripe_checkout_session_id,
  charged_rappen, charged_currency, status
)
select b.id, b.price_snapshot_id, 'cs_epl_b', 'cs_epl_b', 900, 'CHF', 'requires_payment'
  from public.bookings b where b.contact_email = 'epl-b@example.test';
set local session_replication_role = origin;

insert into public.stripe_events (id, type, stripe_created, object_id, payload)
values ('evt_epl_b', 'checkout.session.completed', now(), 'cs_epl_b', '{}'::jsonb);

-- Before the erase both links work ------------------------------------------------------------
set local role vamos_checkout;
select is(
  (select count(*)::int from public.checkout_pay_link_by_hash(extensions.digest('epl-pay-a', 'sha256'))),
  1, '(1) normal booking: checkout_pay_link_by_hash returns the booking');
select is(
  (select state from public.checkout_pay_link_state(extensions.digest('epl-pay-a', 'sha256'))),
  'payable', '(2) normal booking: checkout_pay_link_state says payable');
select is(
  (select count(*)::int from public.checkout_pay_link_lines(extensions.digest('epl-pay-a', 'sha256'))),
  1, '(3) normal booking: checkout_pay_link_lines returns the fare line');
select is(
  (select state from public.checkout_pay_link_state(extensions.digest('epl-pay-b', 'sha256'))),
  'payable', '(4) before the erase: the second booking''s link is payable');
reset role;

-- Staff erase booking B (application SQL: apps/web/lib/ops/bookings-write.ts eraseBooking).
update public.bookings set erased_at = now(), updated_at = now()
 where contact_email = 'epl-b@example.test' and erased_at is null;

set local role vamos_checkout;
select throws_ok(
  $$select * from public.checkout_pay_link_by_hash(extensions.digest('epl-pay-b', 'sha256'))$$,
  'P0002', 'not_found', '(5) erased booking: checkout_pay_link_by_hash answers not_found');
select is(
  (select state from public.checkout_pay_link_state(extensions.digest('epl-pay-b', 'sha256'))),
  'expired', '(6) erased booking: checkout_pay_link_state says expired');
select is(
  (select reference from public.checkout_pay_link_state(extensions.digest('epl-pay-b', 'sha256'))),
  null, '(7) erased booking: no reference leaves checkout_pay_link_state');
select is(
  (select count(*)::int from public.checkout_pay_link_lines(extensions.digest('epl-pay-b', 'sha256'))),
  0, '(8) erased booking: checkout_pay_link_lines returns nothing');
select is(
  (select count(*)::int from public.checkout_pay_link_by_hash(extensions.digest('epl-pay-a', 'sha256'))),
  1, '(9) the normal booking''s link still works after the other one was erased');
reset role;

-- A payment for the erased booking takes the missing-booking outcome and writes nothing -------
set local role vamos_system;
select throws_ok(
  $$select * from public.checkout_payment_settle(
      'evt_epl_b', 'cs_epl_b', 'pi_epl_b', 'succeeded', 'CHF', null, null, null, null)$$,
  'P0002', 'payment_not_found', '(10) settle for an erased booking raises the missing-booking P0002');
reset role;

select is(
  (select status::text from public.booking_payments where stripe_checkout_session_id = 'cs_epl_b'),
  'requires_payment', '(11) the erased booking''s payment is not marked succeeded');
select is(
  (select status::text from public.bookings where contact_email = 'epl-b@example.test'),
  'pending', '(12) the erased booking is not marked paid or confirmed');
select is(
  (select processed_at is null from public.stripe_events where id = 'evt_epl_b'),
  true, '(13) the event is left unprocessed so the Worker takes the refund path');

select * from finish();
rollback;

-- manage_token_purpose.test.sql
--
-- Phase 20 plan 20-07, finding F1. A booking_access_tokens row with purpose = 'pay' (staff pay
-- link) must open nothing a guest "manage" token opens: no ticket read, no extras, no
-- confirmation, no checkout resume, no cancel, no review, no guest RLS row. The 'manage' token
-- keeps working, and the pay functions keep answering to the pay token. Synthetic values only.
-- Token secrets in this file: 'mtp-manage-a', 'mtp-pay-a', 'mtp-manage-b', 'mtp-pay-b', 'mtp-pay-c'.
begin;
select plan(20);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('mtp-economy', 3, 3);
insert into public.rate_versions (slug, label) values ('mtp-rv', 'manage_token_purpose fixture');
insert into public.settings_versions (slug, label) values ('mtp-policy', 'manage_token_purpose fixture');

create temporary table mtp_q as select gen_random_uuid() as quote_id;
grant select on mtp_q to public;

-- A: pending booking with a price snapshot and a leg (resume, ticket read, cancel).
insert into public.bookings (contact_name, contact_email, contact_phone, quote_id, status)
select 'Mia Manage', 'mtp-a@example.test', '+41000000002', q.quote_id, 'pending' from mtp_q q;
-- B: completed booking (review submit).
insert into public.bookings (contact_name, contact_email, status)
values ('Rex Review', 'mtp-b@example.test', 'completed');

insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy, booking_id, expires_at, quote_lock_expires_at,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen, coupon_id, coupon_code
)
select q.quote_id, vc.id, rv.id, false, sv.id, 'quote-engine@mtp', 1, 0,
       '[{"seq":1,"leg_seq":1,"kind":"fare","code":"distance_fare","i18n_key":"price.line.transfer","amount_rappen":900}]'::jsonb,
       jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                          'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                          'settings_version_id', 1, 'modification_deadline_hours', 24,
                          'min_advance_minutes', 180, 'policy_doc', 'test'),
       b.id, now() + interval '30 minutes', now() + interval '30 minutes',
       900, 0, 0, 900, null, null
  from mtp_q q, public.vehicle_classes vc, public.rate_versions rv, public.settings_versions sv, public.bookings b
 where vc.slug = 'mtp-economy' and rv.slug = 'mtp-rv' and sv.slug = 'mtp-policy'
   and b.contact_email = 'mtp-a@example.test';

update public.bookings
   set price_snapshot_id = (select id from public.price_snapshots where engine_version = 'quote-engine@mtp'),
       price_total_rappen = 900
 where contact_email = 'mtp-a@example.test';

-- B also needs a snapshot and a captured payment before a review is allowed.
insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy, booking_id, expires_at, quote_lock_expires_at,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen, coupon_id, coupon_code
)
select gen_random_uuid(), vc.id, rv.id, false, sv.id, 'quote-engine@mtp-b', 1, 0,
       '[{"seq":1,"leg_seq":1,"kind":"fare","code":"distance_fare","i18n_key":"price.line.transfer","amount_rappen":900}]'::jsonb,
       jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                          'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                          'settings_version_id', 1, 'modification_deadline_hours', 24,
                          'min_advance_minutes', 180, 'policy_doc', 'test'),
       b.id, now() + interval '30 minutes', now() + interval '30 minutes',
       900, 0, 0, 900, null, null
  from public.vehicle_classes vc, public.rate_versions rv, public.settings_versions sv, public.bookings b
 where vc.slug = 'mtp-economy' and rv.slug = 'mtp-rv' and sv.slug = 'mtp-policy'
   and b.contact_email = 'mtp-b@example.test';
update public.bookings
   set price_snapshot_id = (select id from public.price_snapshots where engine_version = 'quote-engine@mtp-b'),
       price_total_rappen = 900
 where contact_email = 'mtp-b@example.test';
-- The charge gate trigger refuses a not-live snapshot; the fixture bypasses it as review_submission does.
set local session_replication_role = replica;
insert into public.booking_payments (
  booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at
)
select b.id, b.price_snapshot_id, 'pi_mtp_b', 900, 'succeeded', now()
  from public.bookings b where b.contact_email = 'mtp-b@example.test';
set local session_replication_role = origin;

insert into public.booking_legs (
  booking_id, leg_seq, direction, pickup_text, dropoff_text,
  scheduled_at, scheduled_local, vehicle_class_id, status
)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
       now() + interval '3 days', to_char(now() + interval '3 days', 'YYYY-MM-DD"T"HH24:MI'),
       vc.id, 'confirmed'
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email in ('mtp-a@example.test', 'mtp-b@example.test') and vc.slug = 'mtp-economy';

-- One manage token and one pay token per booking: 'mtp-manage-a', 'mtp-pay-a', 'mtp-manage-b', 'mtp-pay-b'.
insert into public.booking_access_tokens (booking_id, purpose, token_hash, expires_at)
select b.id, p.purpose, extensions.digest('mtp-' || p.purpose || '-' || substr(b.contact_email, 5, 1), 'sha256'),
       now() + interval '1 day'
  from public.bookings b, (values ('manage'), ('pay')) as p(purpose)
 where b.contact_email in ('mtp-a@example.test', 'mtp-b@example.test');

create temporary table mtp_ref as select reference from public.bookings where contact_email = 'mtp-a@example.test';
grant select on mtp_ref to public;

-- Pay token: every guest lookup is refused --------------------------------------------------
set local role vamos_guest;
select throws_ok(
  $$select * from public.manage_booking_read(extensions.digest('mtp-pay-a', 'sha256'))$$,
  'P0002', 'not_found', '(1) pay token: manage_booking_read raises not_found');
select is(
  public.manage_booking_extras(extensions.digest('mtp-pay-a', 'sha256')),
  null, '(2) pay token: manage_booking_extras returns null');
select is(
  public.guest_confirmation_read((select reference from mtp_ref), extensions.digest('mtp-pay-a', 'sha256')),
  null, '(3) pay token: guest_confirmation_read returns null');
select throws_ok(
  $$select * from public.manage_booking_cancel(extensions.digest('mtp-pay-a', 'sha256'))$$,
  'P0002', 'not_found', '(4) pay token: manage_booking_cancel refuses');
select throws_ok(
  $$select * from public.submit_review(extensions.digest('mtp-pay-b', 'sha256'), 5::smallint, 5::smallint, 5::smallint, 'pay', null)$$,
  'P0002', 'not_found', '(5) pay token: submit_review refuses');
select set_config('request.vamos.manage_token_hash',
  encode(extensions.digest('mtp-pay-a', 'sha256'), 'hex'), true);
select is((select count(*)::int from public.bookings), 0, '(6) pay token: guest RLS select on bookings sees 0 rows');
reset role;

set local role vamos_checkout;
select is(
  (select count(*)::int from public.checkout_resume_read((select quote_id from mtp_q), extensions.digest('mtp-pay-a', 'sha256'))),
  0, '(7) pay token: checkout_resume_read returns no row');
reset role;

-- Manage token: everything still works -------------------------------------------------------
set local role vamos_guest;
select is(
  (select count(*)::int from public.manage_booking_read(extensions.digest('mtp-manage-a', 'sha256'))),
  1, '(8) manage token: manage_booking_read returns the booking');
select isnt(
  public.manage_booking_extras(extensions.digest('mtp-manage-a', 'sha256')),
  null, '(9) manage token: manage_booking_extras returns money and driver');
select isnt(
  public.guest_confirmation_read((select reference from mtp_ref), extensions.digest('mtp-manage-a', 'sha256')),
  null, '(10) manage token: guest_confirmation_read returns the payload');
select set_config('request.vamos.manage_token_hash',
  encode(extensions.digest('mtp-manage-a', 'sha256'), 'hex'), true);
select is((select count(*)::int from public.bookings), 1, '(11) manage token: guest RLS select on bookings sees the booking');
select lives_ok(
  $$select * from public.submit_review(extensions.digest('mtp-manage-b', 'sha256'), 5::smallint, 5::smallint, 5::smallint, 'ok', null)$$,
  '(12) manage token: submit_review on a completed booking works');
reset role;

-- Same-device resume of the PENDING booking, before it is cancelled below.
set local role vamos_checkout;
select is(
  (select count(*)::int from public.checkout_resume_read((select quote_id from mtp_q), extensions.digest('mtp-manage-a', 'sha256'))),
  1, '(13) manage token: checkout_resume_read returns the pending booking');
reset role;

set local role vamos_guest;
select lives_ok(
  $$select * from public.manage_booking_cancel(extensions.digest('mtp-manage-a', 'sha256'))$$,
  '(14) manage token: manage_booking_cancel works');
reset role;

-- Pay functions still answer to the pay token ---------------------------------------------------
-- Fresh pending booking C for the pay-link lookups.
insert into public.bookings (contact_name, contact_email, quote_id, status)
select 'Pat Payer', 'mtp-c@example.test', gen_random_uuid(), 'pending';
insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy, booking_id, expires_at, quote_lock_expires_at,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen, coupon_id, coupon_code
)
select b.quote_id, vc.id, rv.id, false, sv.id, 'quote-engine@mtp-c', 1, 0,
       '[{"seq":1,"leg_seq":1,"kind":"fare","code":"distance_fare","i18n_key":"price.line.transfer","amount_rappen":900}]'::jsonb,
       jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                          'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                          'settings_version_id', 1, 'modification_deadline_hours', 24,
                          'min_advance_minutes', 180, 'policy_doc', 'test'),
       b.id, now() + interval '30 minutes', now() + interval '30 minutes',
       900, 0, 0, 900, null, null
  from public.bookings b, public.vehicle_classes vc, public.rate_versions rv, public.settings_versions sv
 where vc.slug = 'mtp-economy' and rv.slug = 'mtp-rv' and sv.slug = 'mtp-policy'
   and b.contact_email = 'mtp-c@example.test';
update public.bookings
   set price_snapshot_id = (select id from public.price_snapshots where engine_version = 'quote-engine@mtp-c'),
       price_total_rappen = 900
 where contact_email = 'mtp-c@example.test';
insert into public.booking_legs (
  booking_id, leg_seq, direction, pickup_text, dropoff_text,
  scheduled_at, scheduled_local, vehicle_class_id, status
)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
       now() + interval '3 days', to_char(now() + interval '3 days', 'YYYY-MM-DD"T"HH24:MI'),
       vc.id, 'confirmed'
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email = 'mtp-c@example.test' and vc.slug = 'mtp-economy';
insert into public.booking_access_tokens (booking_id, purpose, token_hash, expires_at)
select b.id, 'pay', extensions.digest('mtp-pay-c', 'sha256'), now() + interval '1 day'
  from public.bookings b where b.contact_email = 'mtp-c@example.test';

set local role vamos_checkout;
select is(
  (select count(*)::int from public.checkout_pay_link_by_hash(extensions.digest('mtp-pay-c', 'sha256'))),
  1, '(15) pay token: checkout_pay_link_by_hash still returns the booking');
select is(
  (select state from public.checkout_pay_link_state(extensions.digest('mtp-pay-c', 'sha256'))),
  'payable', '(16) pay token: checkout_pay_link_state still says payable');
select throws_ok(
  $$select * from public.checkout_pay_link_by_hash(extensions.digest('mtp-manage-a', 'sha256'))$$,
  'P0002', 'not_found', '(17) manage token: checkout_pay_link_by_hash refuses');
reset role;

-- Grants and definer flag are unchanged.
select ok(
  has_function_privilege('vamos_guest', 'app.booking_has_manage_token(uuid)', 'execute')
  and has_function_privilege('vamos_guest', 'public.manage_booking_read(bytea)', 'execute')
  and not has_function_privilege('anon', 'public.manage_booking_read(bytea)', 'execute'),
  '(18) grants: vamos_guest yes, anon no');
select ok(
  has_function_privilege('vamos_checkout', 'public.checkout_resume_read(uuid, bytea)', 'execute')
  and not has_function_privilege('vamos_guest', 'public.checkout_resume_read(uuid, bytea)', 'execute'),
  '(19) grants: checkout_resume_read only for vamos_checkout');
select ok(
  (select bool_and(prosecdef) from pg_proc
    where oid in ('public.manage_booking_read(bytea)'::regprocedure,
                  'public.manage_booking_cancel(bytea, smallint)'::regprocedure,
                  'public.submit_review(bytea, smallint, smallint, smallint, text, text)'::regprocedure)),
  '(20) the changed functions stay SECURITY DEFINER');

select * from finish();
rollback;

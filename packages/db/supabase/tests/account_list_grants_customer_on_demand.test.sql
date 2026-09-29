-- account_list_grants_customer_on_demand.test.sql
--
-- Quick 260929-acl. (1) authenticated reads bookings.pay_link_sent_at and bookings.is_test (the
-- account list selects both). (2) A confirmed auth user with no customers row gets one on demand
-- and links the guest bookings; unconfirmed gets nothing; an erased customer is never touched.
begin;
select plan(14);

select ok(has_column_privilege('authenticated', 'public.bookings', 'pay_link_sent_at', 'SELECT'),
  'authenticated can select bookings.pay_link_sent_at');
select ok(has_column_privilege('authenticated', 'public.bookings', 'is_test', 'SELECT'),
  'authenticated can select bookings.is_test');

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
values
  ('a3000000-0000-0000-0000-000000000001', 'od-ok@example.test', 'authenticated', 'authenticated', '{}', '{}', now(), now(), now()),
  ('a3000000-0000-0000-0000-000000000002', 'od-unconfirmed@example.test', 'authenticated', 'authenticated', '{}', '{}', now(), now(), null),
  ('a3000000-0000-0000-0000-000000000003', 'od-erased@example.test', 'authenticated', 'authenticated', '{}', '{}', now(), now(), now());

-- Simulate users that signed up with no customers row (pre-trigger or never linked).
delete from public.customers where user_id in (
  'a3000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000002');
-- Erased customer owns the e-mail of user 3; user 3 has no live row.
alter table public.customers disable trigger customers_erasure_guard;
update public.customers set erased_at = now(), user_id = null
 where user_id = 'a3000000-0000-0000-0000-000000000003';
alter table public.customers enable trigger customers_erasure_guard;

insert into public.bookings (id, contact_name, contact_email) values
  ('b3000000-0000-0000-0000-000000000001', 'Guest OK', 'OD-OK@Example.test'),
  ('b3000000-0000-0000-0000-000000000002', 'Guest Unconfirmed', 'od-unconfirmed@example.test');

-- authenticated reads the two columns through a real select.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a3000000-0000-0000-0000-000000000002","role":"authenticated","email":"od-unconfirmed@example.test"}', true);
select is(public.customer_claim_guest_bookings(), 0, 'unconfirmed e-mail with no row claims nothing');
reset role;
select is((select count(*)::int from public.customers where user_id = 'a3000000-0000-0000-0000-000000000002'), 0,
  'unconfirmed: no customers row is created');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a3000000-0000-0000-0000-000000000001","role":"authenticated","email":"od-ok@example.test"}', true);
select is(public.customer_claim_guest_bookings(), 1, 'confirmed user without a row links the guest booking');
select lives_ok($$select b.pay_link_sent_at, b.is_test from public.bookings b where b.contact_email = 'od-ok@example.test'$$,
  'authenticated select of pay_link_sent_at and is_test runs');
reset role;

select is((select count(*)::int from public.customers where user_id = 'a3000000-0000-0000-0000-000000000001' and erased_at is null), 1,
  'the customers row was created on demand');
select is((select c.user_id from public.bookings b join public.customers c on c.id = b.customer_id
            where b.id = 'b3000000-0000-0000-0000-000000000001'), 'a3000000-0000-0000-0000-000000000001'::uuid,
  'the booking belongs to the new row');
select is((select count(*)::int from public.booking_events where kind = 'booking.linked'
            and booking_id = 'b3000000-0000-0000-0000-000000000001'), 1, 'one booking.linked event');
select is((select customer_id from public.bookings where id = 'b3000000-0000-0000-0000-000000000002'), null,
  'the unconfirmed user booking stays a guest booking');

-- Erased customer untouched; a new live row is made for user 3 instead.
select isnt(public.customer_id_for_user('a3000000-0000-0000-0000-000000000003'), null,
  'customer_id_for_user creates a row for a confirmed user');
select is((select count(*)::int from public.customers where email = 'od-erased@example.test' and erased_at is not null and user_id is null), 1,
  'the erased customer row is untouched');

-- customer_id_for_user: unconfirmed is null, existing is returned unchanged.
select is(public.customer_id_for_user('a3000000-0000-0000-0000-000000000002'), null, 'customer_id_for_user: unconfirmed is null');
select is(public.customer_id_for_user('a3000000-0000-0000-0000-000000000001'),
  (select id from public.customers where user_id = 'a3000000-0000-0000-0000-000000000001'), 'customer_id_for_user returns the existing row');

select * from finish();
rollback;

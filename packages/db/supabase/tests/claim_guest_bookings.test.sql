-- claim_guest_bookings.test.sql
--
-- Plan 26.3-07 Task 2 (D-32, T-26.3-07-04). A signed-in customer with a CONFIRMED e-mail links the
-- guest bookings made with that e-mail; unconfirmed claims nothing; other e-mails never match;
-- already-linked bookings are untouched; each link writes one booking.linked event.
begin;
select plan(13);

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
values
  ('a2000000-0000-0000-0000-000000000001', 'claim-ok@example.test', 'authenticated', 'authenticated', '{}', '{}', now(), now(), now()),
  ('a2000000-0000-0000-0000-000000000002', 'claim-unconfirmed@example.test', 'authenticated', 'authenticated', '{}', '{}', now(), now(), null),
  ('a2000000-0000-0000-0000-000000000003', 'claim-other@example.test', 'authenticated', 'authenticated', '{}', '{}', now(), now(), now());

insert into public.bookings (id, contact_name, contact_email) values
  ('b2000000-0000-0000-0000-000000000001', 'Guest One', 'Claim-OK@Example.test'),
  ('b2000000-0000-0000-0000-000000000002', 'Guest Two', 'claim-ok@example.test'),
  ('b2000000-0000-0000-0000-000000000003', 'Guest Unconfirmed', 'claim-unconfirmed@example.test'),
  ('b2000000-0000-0000-0000-000000000004', 'Guest Other', 'someone-else@example.test');
insert into public.bookings (id, contact_name, contact_email, customer_id)
select 'b2000000-0000-0000-0000-000000000005', 'Already Linked', 'claim-ok@example.test', c.id
  from public.customers c where c.user_id = 'a2000000-0000-0000-0000-000000000003';

select function_privs_are('public', 'customer_claim_guest_bookings', '{}'::text[], 'anon', '{}'::text[], 'claim: anon has no EXECUTE');
select function_privs_are('public', 'customer_claim_guest_bookings', '{}'::text[], 'authenticated', '{EXECUTE}'::text[], 'claim: authenticated has EXECUTE');

-- Unconfirmed e-mail claims nothing.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000002","role":"authenticated","email":"claim-unconfirmed@example.test"}', true);
select is(public.customer_claim_guest_bookings(), 0, 'unconfirmed e-mail claims nothing');
reset role;
select is((select customer_id from public.bookings where id = 'b2000000-0000-0000-0000-000000000003'), null, 'unconfirmed: booking stays a guest booking');

-- Confirmed e-mail claims both (case-insensitive), not the other's.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-0000-0000-000000000001","role":"authenticated","email":"claim-ok@example.test"}', true);
select is(public.customer_claim_guest_bookings(), 2, 'confirmed e-mail claims two guest bookings');
select is(public.customer_claim_guest_bookings(), 0, 'second call is idempotent');
reset role;

select is((select count(*)::int from public.bookings b join public.customers c on c.id = b.customer_id
            where c.user_id = 'a2000000-0000-0000-0000-000000000001'), 2, 'both bookings now belong to the caller');
select is((select customer_id from public.bookings where id = 'b2000000-0000-0000-0000-000000000004'), null, 'another e-mail is never matched');
select is((select c.user_id from public.bookings b join public.customers c on c.id = b.customer_id where b.id = 'b2000000-0000-0000-0000-000000000005'),
  'a2000000-0000-0000-0000-000000000003'::uuid, 'an already-linked booking is untouched');
select is((select count(*)::int from public.booking_events where kind = 'booking.linked'
            and booking_id in ('b2000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000002')), 2, 'one booking.linked event per link');
select is((select count(*)::int from public.booking_events where kind = 'booking.linked'
            and booking_id in ('b2000000-0000-0000-0000-000000000003','b2000000-0000-0000-0000-000000000004','b2000000-0000-0000-0000-000000000005')), 0, 'no events for untouched bookings');

-- Erased bookings are never claimed; unauthenticated context claims nothing.
insert into public.bookings (id, contact_name, contact_email, erased_at)
values ('b2000000-0000-0000-0000-000000000006', 'Erased', 'claim-ok@example.test', now());
set local role authenticated;
select is(public.customer_claim_guest_bookings(), 0, 'erased booking is not claimed');
select set_config('request.jwt.claims', '{}', true);
select is(public.customer_claim_guest_bookings(), 0, 'no auth.uid() claims nothing');
reset role;

select * from finish();
rollback;

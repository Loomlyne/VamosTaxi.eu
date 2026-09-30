-- customer_hide_unpaid_bookings.test.sql
--
-- Phase 26.5 plan 10, guard G1 (D-16). Role authenticated never reads a quote row or a pending row
-- without a pay link, even when linked to the customer or matched by e-mail; a pending row with a
-- staff-sent pay link and paid/confirmed rows stay readable; staff, manage-token guest and the
-- checkout definer path are unchanged. No prices: the only amounts are synthetic rappen integers.
begin;
select plan(15);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('chu-economy', 3, 3);

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
values ('c1000000-0000-4000-8000-00000000000a', 'chu-a@example.test', 'authenticated', 'authenticated',
        '{}'::jsonb, '{}'::jsonb, now(), now(), now());

-- Bookings: all for the same customer e-mail. Linked (customer_id) and by-email-only rows.
insert into public.bookings (contact_name, contact_email, status, pay_link_sent_at, quote_id) values
  ('Pending nolink', 'chu-a@example.test', 'pending',   null,  gen_random_uuid()),
  ('Pending link',   'chu-a@example.test', 'pending',   now(), gen_random_uuid()),
  ('Quote row',      'chu-a@example.test', 'quote',     null,  gen_random_uuid()),
  ('Paid row',       'chu-a@example.test', 'paid',      null,  gen_random_uuid()),
  ('Confirmed row',  'chu-a@example.test', 'confirmed', null,  gen_random_uuid());

insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                  scheduled_at, scheduled_local, vehicle_class_id)
select b.id, 1, 'outbound', 'ZRH', 'Zurich HB', now() + interval '3 days',
       to_char(now() + interval '3 days', 'YYYY-MM-DD"T"HH24:MI'), vc.id
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email = 'chu-a@example.test' and vc.slug = 'chu-economy'
   and b.contact_name in ('Pending nolink', 'Paid row');

insert into public.booking_access_tokens (booking_id, token_hash, expires_at)
select b.id, extensions.digest('chu-token', 'sha256'), now() + interval '1 day'
  from public.bookings b where b.contact_name = 'Pending nolink';

create temporary table chu_fx as
select (select id from public.bookings where contact_name = 'Pending nolink') as pending_nolink,
       (select quote_id from public.bookings where contact_name = 'Pending nolink') as pending_quote,
       (select reference from public.bookings where contact_name = 'Pending nolink') as pending_ref;
grant select on chu_fx to public;

-- 1-2. policy shape
select is(
  (select polpermissive from pg_policy where polname = 'bookings_customer_hide_unpaid'
     and polrelid = 'public.bookings'::regclass),
  false, '(1) the policy exists and is RESTRICTIVE');
select is(
  (select array(select r.rolname::text from pg_policy p, unnest(p.polroles) o(oid)
                  join pg_roles r on r.oid = o.oid
                 where p.polname = 'bookings_customer_hide_unpaid' and p.polrelid = 'public.bookings'::regclass)),
  array['authenticated']::text[], '(2) it applies to authenticated only');
select is(
  (select polcmd::text from pg_policy where polname = 'bookings_customer_hide_unpaid'
     and polrelid = 'public.bookings'::regclass),
  'r', '(3) it is for select');

-- 4-8. authenticated by e-mail match only (no customer link yet)
set local role authenticated;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'c1000000-0000-4000-8000-00000000000a', 'role', 'authenticated',
                     'email', 'chu-a@example.test')::text, true);
select is(
  (select array_agg(contact_name order by contact_name) from public.bookings),
  array['Confirmed row', 'Paid row', 'Pending link']::text[],
  '(4) by e-mail: only Confirmed, Paid and Pending-with-pay-link are readable');
select is(
  (select count(*) from public.bookings where id = (select pending_nolink from chu_fx))::int, 0,
  '(5) the pending row without a pay link is not readable by id');
select is(
  (select count(*) from public.bookings where status::text = 'quote')::int, 0,
  '(6) a quote row is not readable');
select is(
  (select count(*) from public.booking_legs)::int, 1,
  '(7) legs follow the parent: only the paid booking''s leg is readable, the pending leg is hidden');

-- claim links the rows; the pending one must stay hidden afterwards
select ok(public.customer_claim_guest_bookings() >= 0, '(8) claim runs');
select is(
  (select array_agg(contact_name order by contact_name) from public.bookings),
  array['Confirmed row', 'Paid row', 'Pending link']::text[],
  '(9) after the claim linked the rows the pending row without a pay link stays hidden');
select is(
  public.customer_booking_extras((select pending_ref from chu_fx)), null,
  '(10) customer_booking_extras of the pending reference still returns null');
reset role;

-- 11. staff, guest, checkout and system roles are not named by the policy. Staff and system read
-- bookings only through definer functions (no direct bookings policy exists for them).
select is(
  (select count(*)::int from pg_policy p, unnest(p.polroles) o(oid) join pg_roles r on r.oid = o.oid
    where p.polname = 'bookings_customer_hide_unpaid' and p.polrelid = 'public.bookings'::regclass
      and r.rolname in ('vamos_staff', 'vamos_guest', 'vamos_checkout', 'vamos_system')),
  0, '(11) the policy names none of vamos_staff, vamos_guest, vamos_checkout, vamos_system');

-- 12. guest with the manage token hash still reads the pending row (same-device continuation)
set local role vamos_guest;
select set_config('request.vamos.manage_token_hash', encode(extensions.digest('chu-token', 'sha256'), 'hex'), true);
select is(
  (select id from public.bookings), (select pending_nolink from chu_fx),
  '(12) vamos_guest with the booking''s manage token still reads the pending row');
reset role;

-- 13-14. checkout definer read for the right hash still returns it
set local role vamos_checkout;
select is(
  (select count(*)::int from public.checkout_resume_read((select pending_quote from chu_fx),
                                                          extensions.digest('chu-token', 'sha256'))),
  1, '(13) checkout_resume_read with the right hash still returns the pending booking');
select is(
  (select count(*)::int from public.checkout_resume_read((select pending_quote from chu_fx),
                                                          extensions.digest('chu-wrong', 'sha256'))),
  0, '(14) a wrong hash returns nothing');
reset role;

-- 15. no drop of the permissive policy
select is(
  (select count(*)::int from pg_policy where polname = 'bookings_select_own' and polrelid = 'public.bookings'::regclass),
  1, '(15) bookings_select_own is untouched');

select * from finish();
rollback;

-- security_hardening.test.sql
--
-- Phase 20 plan 20-07/20-08. F5 customer_confirmation_read derives the customer from the session;
-- F10 the hourly confirmation resend skips test bookings and captures older than 7 days;
-- F14 staff_extra_label_upsert refuses a non-admin staff role. Synthetic figures, rolled back.
begin;
select plan(13);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity, name)
values ('sh-class', 4, 4, 'Van luxury');
insert into public.rate_versions (slug, label) values ('sh-rv', 'security_hardening fixture');

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('20200000-0000-4000-a000-00000000000a', 'sh-a@example.test', 'authenticated', 'authenticated', '{}', '{}', now(), now()),
  ('20200000-0000-4000-a000-00000000000b', 'sh-b@example.test', 'authenticated', 'authenticated', '{}', '{}', now(), now()),
  ('20200000-0000-4000-a000-00000000000c', 'sh-admin@example.test', 'authenticated', 'authenticated', '{}', '{}', now(), now()),
  ('20200000-0000-4000-a000-00000000000d', 'sh-dispatch@example.test', 'authenticated', 'authenticated', '{}', '{}', now(), now());
insert into public.staff (user_id, role, active, accepted_at) values
  ('20200000-0000-4000-a000-00000000000c', 'admin', true, now()),
  ('20200000-0000-4000-a000-00000000000d', 'dispatcher', true, now());

update public.customers set full_name = 'SH A', email = 'sh-cust-a@example.test'
 where user_id = '20200000-0000-4000-a000-00000000000a';
update public.customers set full_name = 'SH B', email = 'sh-cust-b@example.test'
 where user_id = '20200000-0000-4000-a000-00000000000b';

-- F5 fixtures: one booking per customer.
insert into public.bookings (reference, contact_name, contact_email, status, locale, customer_id)
select public.next_booking_reference(), 'SH Booking A', 'sh-booking-a@example.test', 'confirmed', 'en', c.id
  from public.customers c where c.email = 'sh-cust-a@example.test';
insert into public.bookings (reference, contact_name, contact_email, status, locale, customer_id)
select public.next_booking_reference(), 'SH Booking B', 'sh-booking-b@example.test', 'confirmed', 'en', c.id
  from public.customers c where c.email = 'sh-cust-b@example.test';

-- F10 fixtures: fresh, old, test. All confirmed with a captured payment and no confirmation row.
insert into public.bookings (reference, contact_name, contact_email, status, locale, is_test)
values
  (public.next_booking_reference(), 'SH Fresh', 'sh-fresh@example.test', 'confirmed', 'en', false),
  (public.next_booking_reference(), 'SH Old',   'sh-old@example.test',   'confirmed', 'en', false),
  (public.next_booking_reference(), 'SH Test',  'sh-test@example.test',  'confirmed', 'en', true);

set local session_replication_role = replica;

insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy,
  subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
  expires_at, quote_lock_expires_at, booking_id, source
)
select
  gen_random_uuid(), vc.id, rv.id, true, sv.id, 'sh-hardening@1', 2, 2,
  jsonb_build_array(jsonb_build_object('seq', 1, 'code', 'distance_fare', 'kind', 'fare', 'i18n_key', 'price.line.transfer', 'amount_rappen', 8)),
  jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                     'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                     'settings_version_id', sv.id, 'modification_deadline_hours', 24,
                     'min_advance_minutes', 180, 'policy_doc', 'test'),
  8, 0, 0, 8, now() + interval '1 day', now() + interval '1 day', b.id, 'web'
from public.vehicle_classes vc
cross join public.bookings b
cross join lateral (select id from public.rate_versions where slug = 'sh-rv') rv
cross join lateral (select id from public.settings_versions order by id limit 1) sv
where vc.slug = 'sh-class'
  and b.contact_email in ('sh-fresh@example.test', 'sh-old@example.test', 'sh-test@example.test');

update public.bookings b set price_snapshot_id = s.id
  from public.price_snapshots s
 where s.booking_id = b.id and s.engine_version = 'sh-hardening@1';

insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at)
select b.id, b.price_snapshot_id, 'pi_sh_' || substr(b.contact_email, 4, 5), 8, 'succeeded',
       case b.contact_email
         when 'sh-fresh@example.test' then now() - interval '2 hours'
         when 'sh-old@example.test'   then now() - interval '30 days'
         else now() - interval '2 hours'
       end
  from public.bookings b
 where b.contact_email in ('sh-fresh@example.test', 'sh-old@example.test', 'sh-test@example.test');

set local session_replication_role = origin;

create temporary table sh as
select
  (select reference from public.bookings where contact_email = 'sh-booking-a@example.test') as ref_a,
  (select reference from public.bookings where contact_email = 'sh-booking-b@example.test') as ref_b,
  (select id from public.customers where email = 'sh-cust-a@example.test') as cust_a,
  (select id from public.customers where email = 'sh-cust-b@example.test') as cust_b,
  (select id from public.bookings where contact_email = 'sh-fresh@example.test') as fresh,
  (select id from public.bookings where contact_email = 'sh-old@example.test') as old,
  (select id from public.bookings where contact_email = 'sh-test@example.test') as test;
grant select on sh to public;

-- F5: customer A, own session.
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub','20200000-0000-4000-a000-00000000000a','role','authenticated')::text, true);

select is(
  public.customer_confirmation_read(
    (select ref_b from sh),
    (select cust_b from sh)),
  null::jsonb, 'F5: A cannot read B''s booking with B''s reference and B''s customer id');
select is(
  public.customer_confirmation_read(
    (select ref_b from sh),
    (select cust_a from sh)),
  null::jsonb, 'F5: A cannot read B''s booking with B''s reference and A''s own customer id');
select is(
  public.customer_confirmation_read(
    (select ref_b from sh), null),
  null::jsonb, 'F5: A cannot read B''s booking with a null id');
select is(
  public.customer_confirmation_read(
    (select ref_a from sh),
    (select cust_b from sh)),
  null::jsonb, 'F5: A''s own booking with B''s customer id is refused');
select is(
  public.customer_confirmation_read(
    (select ref_a from sh),
    (select cust_a from sh))
    #>> '{booking,contact_name}',
  'SH Booking A', 'F5: A reads A''s booking with A''s reference and own customer id');
select is(
  public.customer_confirmation_read(
    (select ref_a from sh),
    '20200000-0000-4000-a000-00000000000a')
    #>> '{booking,contact_name}',
  'SH Booking A', 'F5: A reads A''s booking when the id is A''s own auth user id (what the Worker passes)');
select is(
  public.customer_confirmation_read(
    (select ref_a from sh), null)
    #>> '{booking,contact_name}',
  'SH Booking A', 'F5: a null id means "the session customer"');

select set_config('request.jwt.claims', '', true);
select is(
  public.customer_confirmation_read(
    (select ref_a from sh),
    (select cust_a from sh)),
  null::jsonb, 'F5: no session, no answer');
reset role;

-- F10
set local role vamos_system;
select is(
  (select count(*)::int from public.notification_confirmation_missing('1 hour'::interval)
    where booking_id = (select fresh from sh)),
  1, 'F10: a booking captured 2 hours ago with no confirmation row is a candidate');
select is(
  (select count(*)::int from public.notification_confirmation_missing('1 hour'::interval)
    where booking_id = (select old from sh)),
  0, 'F10: a booking captured 30 days ago is not a candidate');
select is(
  (select count(*)::int from public.notification_confirmation_missing('1 hour'::interval)
    where booking_id = (select test from sh)),
  0, 'F10: a test booking is not a candidate');
reset role;

-- F14
set local role vamos_staff;
select set_config('request.jwt.claims', jsonb_build_object('sub','20200000-0000-4000-a000-00000000000d','role','authenticated','aal','aal2','app_metadata',jsonb_build_object('vamos_role','dispatcher'))::text, true);
select throws_ok($$ select public.staff_extra_label_upsert('sh_code','Sh',null,null,null,'{}') $$, '42501', null, 'F14: a dispatcher is refused');
select set_config('request.jwt.claims', jsonb_build_object('sub','20200000-0000-4000-a000-00000000000c','role','authenticated','aal','aal2','app_metadata',jsonb_build_object('vamos_role','admin'))::text, true);
select lives_ok($$ select public.staff_extra_label_upsert('sh_code','Sh',null,null,null,'{}') $$, 'F14: an admin is accepted');
reset role;

select * from finish();
rollback;

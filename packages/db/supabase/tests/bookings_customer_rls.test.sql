-- bookings_customer_rls.test.sql
--
-- Proves DATA-02: customer A sees only A's bookings/legs/snapshots/snapshot_legs, zero of B's;
-- an authenticated session with no bound identity sees zero rows -- the restrictive belt
-- (bookings_require_identity), not merely an unmatched permissive policy; and `authenticated`
-- holds no INSERT and no UPDATE grant on `bookings` at all (a quote becomes a booking through a
-- server-authoritative route, never the browser).
begin;
select plan(8);

-- Fixtures --------------------------------------------------------------------------------
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('first', 3, 3);
insert into public.rate_versions (slug, label) values ('bcr-rv', 'bookings_customer_rls fixture');
insert into public.settings_versions (slug, label) values ('bcr-policy', 'bookings_customer_rls fixture');

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('b0000000-0000-0000-0000-00000000000a', 'bcr-a@example.test', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('b0000000-0000-0000-0000-00000000000b', 'bcr-b@example.test', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.customers (user_id, full_name, email)
values ('b0000000-0000-0000-0000-00000000000a', 'Customer A', 'bcr-cust-a@example.test'),
       ('b0000000-0000-0000-0000-00000000000b', 'Customer B', 'bcr-cust-b@example.test');

insert into public.bookings (contact_name, contact_email, customer_id)
select 'Booking A', 'bcr-booking-a@example.test', c.id from public.customers c where c.email = 'bcr-cust-a@example.test';
insert into public.bookings (contact_name, contact_email, customer_id)
select 'Booking B', 'bcr-booking-b@example.test', c.id from public.customers c where c.email = 'bcr-cust-b@example.test';

insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                  scheduled_at, scheduled_local, vehicle_class_id)
select b.id, 1, 'outbound', 'ZRH', 'Zurich HB', now() + interval '3 days',
       to_char(now() + interval '3 days', 'YYYY-MM-DD"T"HH24:MI'), vc.id
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email = 'bcr-booking-a@example.test' and vc.slug = 'first';
insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                  scheduled_at, scheduled_local, vehicle_class_id)
select b.id, 1, 'outbound', 'ZRH', 'Zurich HB', now() + interval '3 days',
       to_char(now() + interval '3 days', 'YYYY-MM-DD"T"HH24:MI'), vc.id
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email = 'bcr-booking-b@example.test' and vc.slug = 'first';

create temporary table pol as
select jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                           'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                           'settings_version_id', 1,
                           'modification_deadline_hours', 24,
                           'min_advance_minutes', 180,
                           'policy_doc', 'test') as policy;

insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy, booking_id, expires_at, quote_lock_expires_at
)
select gen_random_uuid(), vc.id, rv.id, false, sv.id, 'quote-engine@bcr-a', 1, 0, '[]'::jsonb,
       pol.policy, b.id, now() + interval '30 minutes', now() + interval '30 minutes'
  from public.vehicle_classes vc, public.rate_versions rv, public.settings_versions sv,
       public.bookings b, pol
 where vc.slug = 'first' and rv.slug = 'bcr-rv' and sv.slug = 'bcr-policy'
   and b.contact_email = 'bcr-booking-a@example.test';
insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy, booking_id, expires_at, quote_lock_expires_at
)
select gen_random_uuid(), vc.id, rv.id, false, sv.id, 'quote-engine@bcr-b', 1, 0, '[]'::jsonb,
       pol.policy, b.id, now() + interval '30 minutes', now() + interval '30 minutes'
  from public.vehicle_classes vc, public.rate_versions rv, public.settings_versions sv,
       public.bookings b, pol
 where vc.slug = 'first' and rv.slug = 'bcr-rv' and sv.slug = 'bcr-policy'
   and b.contact_email = 'bcr-booking-b@example.test';

insert into public.price_snapshot_legs (snapshot_id, leg_seq, booking_leg_id)
select ps.id, 1, bl.id
  from public.price_snapshots ps, public.booking_legs bl, public.bookings b
 where ps.engine_version = 'quote-engine@bcr-a' and bl.booking_id = b.id and b.contact_email = 'bcr-booking-a@example.test';
insert into public.price_snapshot_legs (snapshot_id, leg_seq, booking_leg_id)
select ps.id, 1, bl.id
  from public.price_snapshots ps, public.booking_legs bl, public.bookings b
 where ps.engine_version = 'quote-engine@bcr-b' and bl.booking_id = b.id and b.contact_email = 'bcr-booking-b@example.test';

create temporary table fx as
select (select id from public.bookings where contact_email = 'bcr-booking-a@example.test') as booking_a,
       (select id from public.bookings where contact_email = 'bcr-booking-b@example.test') as booking_b;
-- Temp tables default to owner-only privileges; the role switches below need to read it too.
grant select on fx to public;

-- As authenticated with A's claims ---------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'b0000000-0000-0000-0000-00000000000a', 'role', 'authenticated', 'aal', 'aal2')::text,
  true);

select is(
  (select id from public.bookings),
  (select booking_a from fx),
  '(1) authenticated as customer A sees exactly A''s booking, zero of B''s'
);
select is(
  (select count(*) from public.bookings where id = (select booking_b from fx))::int,
  0,
  '(2) A cannot see B''s booking by id'
);
select is(
  (select count(*) from public.booking_legs)::int, 1,
  '(3) A sees exactly one booking_legs row -- A''s leg, via legs_select_via_parent'
);
select is(
  (select count(*) from public.price_snapshots)::int, 1,
  '(4) A sees exactly one price_snapshots row, via snapshots_select_via_parent'
);
select is(
  (select count(*) from public.price_snapshot_legs)::int, 1,
  '(5) A sees exactly one price_snapshot_legs row, via snapshot_legs_select_via_parent'
);
reset role;

-- No bound identity: the restrictive belt, not merely an unmatched permissive policy --------
set local role authenticated;
select set_config('request.jwt.claims', '', true);
select is(
  (select count(*) from public.bookings)::int, 0,
  '(6) authenticated with no bound identity sees zero bookings (bookings_require_identity)'
);
reset role;

-- No INSERT, no UPDATE grant on bookings for authenticated ----------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'b0000000-0000-0000-0000-00000000000a', 'role', 'authenticated', 'aal', 'aal2')::text,
  true);
select throws_ok(
  $$ insert into public.bookings (contact_name, contact_email) values ('x', 'x@example.test') $$,
  '42501', null,
  '(7) authenticated cannot INSERT into bookings -- a quote becomes a booking server-side, never from the browser'
);
select throws_ok(
  format($$ update public.bookings set note = 'x' where id = %L $$, (select booking_a from fx)),
  '42501', null,
  '(8) authenticated cannot UPDATE bookings.note -- no UPDATE grant on bookings at all'
);
reset role;

select * from finish();
rollback;

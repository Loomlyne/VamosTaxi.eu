-- flight_provenance.test.sql
--
-- Proves D-20: booking_legs.flight_checked_at / flight_time_source exist with the paired
-- constraint, and booking_events.kind accepts flight.autofilled without losing the seventeen
-- kinds it inherited. Synthetic unit-free integers inside one rolled-back transaction (D-46).
--
-- Run as `postgres` by `supabase test db`. Local postgres is not superuser in the sense of
-- impersonating reserved roles — assert on catalogs, never SET ROLE to a reserved name.
begin;
select plan(12);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('first', 3, 3);

insert into public.customers (full_name, email)
values ('Flight Provenance Customer', 'fp-customer@example.test');

insert into public.bookings (contact_name, contact_email, customer_id)
select 'Flight Provenance Booking', 'fp-booking@example.test', c.id
  from public.customers c where c.email = 'fp-customer@example.test';

-- 1–2. columns exist (three-argument has_column, matching reference_tables.test.sql)
select has_column('public', 'booking_legs', 'flight_checked_at',
  'booking_legs has flight_checked_at (D-20)');
select has_column('public', 'booking_legs', 'flight_time_source',
  'booking_legs has flight_time_source (D-20)');

-- 3–4. types
select col_type_is('public', 'booking_legs', 'flight_checked_at',
  'timestamp with time zone', 'flight_checked_at is timestamptz');
select col_type_is('public', 'booking_legs', 'flight_time_source',
  'text', 'flight_time_source is text');

-- 5. CHECK vocabulary: 'landed' is not a source
select throws_ok(
  $$ insert into public.booking_legs (
       booking_id, leg_seq, direction, pickup_text, dropoff_text,
       scheduled_at, scheduled_local, vehicle_class_id,
       flight_no, flight_checked_at, flight_time_source
     )
     select b.id, 1, 'outbound', 'ZRH', 'Zurich HB', now() + interval '3 days',
            to_char(now() + interval '3 days', 'YYYY-MM-DD"T"HH24:MI'), vc.id,
            'LX318', now(), 'landed'
       from public.bookings b, public.vehicle_classes vc
      where b.contact_email = 'fp-booking@example.test' and vc.slug = 'first' $$,
  '23514',
  null,
  'flight_time_source rejects landed'
);

-- 6. paired: checked_at without source
select throws_ok(
  $$ insert into public.booking_legs (
       booking_id, leg_seq, direction, pickup_text, dropoff_text,
       scheduled_at, scheduled_local, vehicle_class_id,
       flight_no, flight_checked_at, flight_time_source
     )
     select b.id, 1, 'outbound', 'ZRH', 'Zurich HB', now() + interval '3 days',
            to_char(now() + interval '3 days', 'YYYY-MM-DD"T"HH24:MI'), vc.id,
            'LX318', now(), null
       from public.bookings b, public.vehicle_classes vc
      where b.contact_email = 'fp-booking@example.test' and vc.slug = 'first' $$,
  '23514',
  null,
  'flight_checked_at without flight_time_source is refused'
);

-- 7. paired: source without flight_no (checked_at set so the failure is the flight_no rule)
select throws_ok(
  $$ insert into public.booking_legs (
       booking_id, leg_seq, direction, pickup_text, dropoff_text,
       scheduled_at, scheduled_local, vehicle_class_id,
       flight_no, flight_checked_at, flight_time_source
     )
     select b.id, 1, 'outbound', 'ZRH', 'Zurich HB', now() + interval '3 days',
            to_char(now() + interval '3 days', 'YYYY-MM-DD"T"HH24:MI'), vc.id,
            null, now(), 'actual'
       from public.bookings b, public.vehicle_classes vc
      where b.contact_email = 'fp-booking@example.test' and vc.slug = 'first' $$,
  '23514',
  null,
  'flight_time_source without flight_no is refused'
);

-- 8. consistent triple lives
select lives_ok(
  $$ insert into public.booking_legs (
       booking_id, leg_seq, direction, pickup_text, dropoff_text,
       scheduled_at, scheduled_local, vehicle_class_id,
       flight_no, flight_checked_at, flight_time_source
     )
     select b.id, 1, 'outbound', 'ZRH', 'Zurich HB', now() + interval '3 days',
            to_char(now() + interval '3 days', 'YYYY-MM-DD"T"HH24:MI'), vc.id,
            'LX318', now(), 'actual'
       from public.bookings b, public.vehicle_classes vc
      where b.contact_email = 'fp-booking@example.test' and vc.slug = 'first' $$,
  'leg with flight_no + checked_at + actual source is accepted'
);

-- 9. new kind accepted
select lives_ok(
  $$ insert into public.booking_events (booking_id, kind, actor_kind, actor_label, payload)
     select b.id, 'flight.autofilled', 'system', 'flight provenance fixture', '{}'::jsonb
       from public.bookings b
      where b.contact_email = 'fp-booking@example.test' $$,
  'booking_events accepts flight.autofilled'
);

-- 10. typo refused — proves the CHECK was recreated rather than dropped
select throws_ok(
  $$ insert into public.booking_events (booking_id, kind, actor_kind, actor_label, payload)
     select b.id, 'flight.autofilledd', 'system', 'flight provenance fixture', '{}'::jsonb
       from public.bookings b
      where b.contact_email = 'fp-booking@example.test' $$,
  '23514',
  null,
  'booking_events rejects flight.autofilledd (CHECK still present)'
);

-- 11–12. two of the pre-existing 17 kinds survived the recreate
select lives_ok(
  $$ insert into public.booking_events (booking_id, kind, actor_kind, actor_label, payload)
     select b.id, 'note.added', 'staff', 'flight provenance fixture', '{}'::jsonb
       from public.bookings b
      where b.contact_email = 'fp-booking@example.test' $$,
  'booking_events still accepts note.added'
);

select lives_ok(
  $$ insert into public.booking_events (booking_id, kind, actor_kind, actor_label, payload)
     select b.id, 'flight.delayed', 'system', 'flight provenance fixture', '{}'::jsonb
       from public.bookings b
      where b.contact_email = 'fp-booking@example.test' $$,
  'booking_events still accepts flight.delayed'
);

select * from finish();
rollback;

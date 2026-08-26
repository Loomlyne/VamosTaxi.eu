-- exclusion.test.sql
--
-- Proves OPS-03 (02-SCHEMA-DRAFT.md §15, forward-designed for Phase 8): overlapping chauffeur
-- assignment raises 23P01 naming booking_legs_chauffeur_no_overlap; a cancelled leg releases
-- the resource; a 3-hour leg blocks a second assignment 40 minutes later but not 3h40m later;
-- assigning a chauffeur to a leg with a NULL duration raises 23514 (booking_legs_assignable);
-- the same exclusion proof for assigned_vehicle_id; D-14's buffer snapshot is immune to a later
-- settings change; D-13's DEFERRABLE property lets a two-statement swap succeed; D-28's STORED
-- generated column is proven at the catalog level.
--
-- Run as `postgres` by `supabase test db`. Each booking used below is one-way (leg_seq=1) so
-- multiple independent scenarios never collide on the (booking_id, leg_seq) unique constraint;
-- distinct chauffeurs/vehicles/dates isolate each scenario from the others' persisted state
-- (throws_ok rolls its statement back; lives_ok's effects persist for the rest of the file).
begin;
select plan(12);

-- Fixtures -----------------------------------------------------------------------------------
-- DEVIATION (Rule 1, bug fix -- Plan 02-09 seeds the settings singleton): the id=1 row already
-- exists from supabase/seed.sql with chauffeur_turnaround_minutes=30 (D-14), so this insert
-- would collide on settings_pkey and is no longer needed.

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('first', 3, 3);

insert into public.vehicles (vehicle_class_id, model, plate)
select vc.id, 'Mercedes E-Class', 'ZH-1 EXCL' from public.vehicle_classes vc where vc.slug = 'first';
insert into public.vehicles (vehicle_class_id, model, plate)
select vc.id, 'Mercedes E-Class', 'ZH-2 EXCL' from public.vehicle_classes vc where vc.slug = 'first';

insert into public.chauffeurs (full_name, phone, licence_number) values ('Chauffeur A', '+41 79 000 00 01', 'LIC-A');
insert into public.chauffeurs (full_name, phone, licence_number) values ('Chauffeur C', '+41 79 000 00 03', 'LIC-C');
insert into public.chauffeurs (full_name, phone, licence_number) values ('Chauffeur X', '+41 79 000 00 24', 'LIC-X');
insert into public.chauffeurs (full_name, phone, licence_number) values ('Chauffeur Y', '+41 79 000 00 25', 'LIC-Y');

-- (1) Overlapping chauffeur assignment raises 23P01, naming booking_legs_chauffeur_no_overlap. -
insert into public.bookings (reference, contact_name, contact_email)
values (public.next_booking_reference(), 'Exclusion Fixture 1', 'excl-1@vamostaxi.eu');
insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                  scheduled_at, scheduled_local, vehicle_class_id,
                                  estimated_duration_minutes, assigned_chauffeur_id)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
       '2027-06-01 10:00:00+02'::timestamptz, '2027-06-01T10:00',
       vc.id, 60, c.id
  from public.bookings b, public.vehicle_classes vc, public.chauffeurs c
 where b.contact_email = 'excl-1@vamostaxi.eu' and vc.slug = 'first' and c.full_name = 'Chauffeur A';

select throws_ok(
  $$
    with nb as (
      insert into public.bookings (reference, contact_name, contact_email)
      values (public.next_booking_reference(), 'Exclusion Fixture 2', 'excl-2@vamostaxi.eu')
      returning id
    )
    insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                      scheduled_at, scheduled_local, vehicle_class_id,
                                      estimated_duration_minutes, assigned_chauffeur_id)
    select nb.id, 1, 'outbound', 'Zurich HB', 'ZRH Airport',
           '2027-06-01 10:30:00+02'::timestamptz, '2027-06-01T10:30',
           vc.id, 60, c.id
      from nb, public.vehicle_classes vc, public.chauffeurs c
     where vc.slug = 'first' and c.full_name = 'Chauffeur A'
  $$,
  '23P01',
  null,
  'a second, overlapping assignment of the same chauffeur raises 23P01 (booking_legs_chauffeur_no_overlap)'
);
select throws_like(
  $$
    with nb as (
      insert into public.bookings (reference, contact_name, contact_email)
      values (public.next_booking_reference(), 'Exclusion Fixture 2b', 'excl-2b@vamostaxi.eu')
      returning id
    )
    insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                      scheduled_at, scheduled_local, vehicle_class_id,
                                      estimated_duration_minutes, assigned_chauffeur_id)
    select nb.id, 1, 'outbound', 'Zurich HB', 'ZRH Airport',
           '2027-06-01 10:30:00+02'::timestamptz, '2027-06-01T10:30',
           vc.id, 60, c.id
      from nb, public.vehicle_classes vc, public.chauffeurs c
     where vc.slug = 'first' and c.full_name = 'Chauffeur A'
  $$,
  '%booking_legs_chauffeur_no_overlap%',
  'the 23P01 violation names booking_legs_chauffeur_no_overlap in its message'
);

-- (2) Cancelling the first leg releases the chauffeur; the same overlapping assignment now
--     succeeds. This INSERT's effects persist (lives_ok does not roll back on success). --------
update public.booking_legs set status = 'cancelled'
 where pickup_text = 'ZRH Airport' and scheduled_at = '2027-06-01 10:00:00+02'::timestamptz;

select lives_ok(
  $$
    with nb as (
      insert into public.bookings (reference, contact_name, contact_email)
      values (public.next_booking_reference(), 'Exclusion Fixture 3', 'excl-3@vamostaxi.eu')
      returning id
    )
    insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                      scheduled_at, scheduled_local, vehicle_class_id,
                                      estimated_duration_minutes, assigned_chauffeur_id)
    select nb.id, 1, 'outbound', 'Zurich HB', 'ZRH Airport',
           '2027-06-01 10:30:00+02'::timestamptz, '2027-06-01T10:30',
           vc.id, 60, c.id
      from nb, public.vehicle_classes vc, public.chauffeurs c
     where vc.slug = 'first' and c.full_name = 'Chauffeur A'
  $$,
  'a cancelled leg does not block: the same overlapping assignment now succeeds'
);

-- (3) A 3-hour leg (10:00 + 180min duration + 30min buffer = range ending 13:30) blocks a
--     second assignment 40 minutes later (10:40) but not 3h40m later (13:40). ------------------
insert into public.bookings (reference, contact_name, contact_email)
values (public.next_booking_reference(), 'Exclusion Fixture 4', 'excl-4@vamostaxi.eu');
insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                  scheduled_at, scheduled_local, vehicle_class_id,
                                  estimated_duration_minutes, assigned_chauffeur_id)
select b.id, 1, 'outbound', 'Zurich HB', 'Zermatt',
       '2027-06-02 10:00:00+02'::timestamptz, '2027-06-02T10:00',
       vc.id, 180, c.id
  from public.bookings b, public.vehicle_classes vc, public.chauffeurs c
 where b.contact_email = 'excl-4@vamostaxi.eu' and vc.slug = 'first' and c.full_name = 'Chauffeur C';

select throws_ok(
  $$
    with nb as (
      insert into public.bookings (reference, contact_name, contact_email)
      values (public.next_booking_reference(), 'Exclusion Fixture 5', 'excl-5@vamostaxi.eu')
      returning id
    )
    insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                      scheduled_at, scheduled_local, vehicle_class_id,
                                      estimated_duration_minutes, assigned_chauffeur_id)
    select nb.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
           '2027-06-02 10:40:00+02'::timestamptz, '2027-06-02T10:40',
           vc.id, 60, c.id
      from nb, public.vehicle_classes vc, public.chauffeurs c
     where vc.slug = 'first' and c.full_name = 'Chauffeur C'
  $$,
  '23P01',
  null,
  'a 3-hour leg starting 10:00 blocks a second assignment starting 10:40 (inside the range)'
);
select lives_ok(
  $$
    with nb as (
      insert into public.bookings (reference, contact_name, contact_email)
      values (public.next_booking_reference(), 'Exclusion Fixture 6', 'excl-6@vamostaxi.eu')
      returning id
    )
    insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                      scheduled_at, scheduled_local, vehicle_class_id,
                                      estimated_duration_minutes, assigned_chauffeur_id)
    select nb.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
           '2027-06-02 13:40:00+02'::timestamptz, '2027-06-02T13:40',
           vc.id, 60, c.id
      from nb, public.vehicle_classes vc, public.chauffeurs c
     where vc.slug = 'first' and c.full_name = 'Chauffeur C'
  $$,
  'the same 3-hour leg does NOT block a second assignment starting 13:40 (outside the range)'
);

-- (4) Assigning a chauffeur to a leg with a NULL duration raises 23514 (booking_legs_assignable). -
select throws_ok(
  $$
    with nb as (
      insert into public.bookings (reference, contact_name, contact_email)
      values (public.next_booking_reference(), 'Exclusion Fixture 7', 'excl-7@vamostaxi.eu')
      returning id
    )
    insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                      scheduled_at, scheduled_local, vehicle_class_id,
                                      assigned_chauffeur_id)
    select nb.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
           '2027-06-03 09:00:00+02'::timestamptz, '2027-06-03T09:00',
           vc.id, c.id
      from nb, public.vehicle_classes vc, public.chauffeurs c
     where vc.slug = 'first' and c.full_name = 'Chauffeur A'
  $$,
  '23514',
  null,
  'assigning a chauffeur to a leg with a NULL estimated_duration_minutes raises 23514 (booking_legs_assignable)'
);

-- (5) The same exclusion proof on assigned_vehicle_id. ------------------------------------------
insert into public.bookings (reference, contact_name, contact_email)
values (public.next_booking_reference(), 'Exclusion Fixture 8', 'excl-8@vamostaxi.eu');
insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                  scheduled_at, scheduled_local, vehicle_class_id,
                                  estimated_duration_minutes, assigned_vehicle_id)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
       '2027-06-04 10:00:00+02'::timestamptz, '2027-06-04T10:00',
       vc.id, 60, v.id
  from public.bookings b, public.vehicle_classes vc, public.vehicles v
 where b.contact_email = 'excl-8@vamostaxi.eu' and vc.slug = 'first' and v.plate = 'ZH-1 EXCL';

select throws_ok(
  $$
    with nb as (
      insert into public.bookings (reference, contact_name, contact_email)
      values (public.next_booking_reference(), 'Exclusion Fixture 9', 'excl-9@vamostaxi.eu')
      returning id
    )
    insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                      scheduled_at, scheduled_local, vehicle_class_id,
                                      estimated_duration_minutes, assigned_vehicle_id)
    select nb.id, 1, 'outbound', 'Zurich HB', 'ZRH Airport',
           '2027-06-04 10:30:00+02'::timestamptz, '2027-06-04T10:30',
           vc.id, 60, v.id
      from nb, public.vehicle_classes vc, public.vehicles v
     where vc.slug = 'first' and v.plate = 'ZH-1 EXCL'
  $$,
  '23P01',
  null,
  'a second, overlapping assignment of the same vehicle raises 23P01 (booking_legs_vehicle_no_overlap)'
);
select throws_like(
  $$
    with nb as (
      insert into public.bookings (reference, contact_name, contact_email)
      values (public.next_booking_reference(), 'Exclusion Fixture 9b', 'excl-9b@vamostaxi.eu')
      returning id
    )
    insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                      scheduled_at, scheduled_local, vehicle_class_id,
                                      estimated_duration_minutes, assigned_vehicle_id)
    select nb.id, 1, 'outbound', 'Zurich HB', 'ZRH Airport',
           '2027-06-04 10:30:00+02'::timestamptz, '2027-06-04T10:30',
           vc.id, 60, v.id
      from nb, public.vehicle_classes vc, public.vehicles v
     where vc.slug = 'first' and v.plate = 'ZH-1 EXCL'
  $$,
  '%booking_legs_vehicle_no_overlap%',
  'the 23P01 violation names booking_legs_vehicle_no_overlap in its message'
);

-- (6) D-14: the buffer is snapshotted at assignment, immune to a later settings change. --------
insert into public.bookings (reference, contact_name, contact_email)
values (public.next_booking_reference(), 'Exclusion Fixture 10', 'excl-10@vamostaxi.eu');
insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                  scheduled_at, scheduled_local, vehicle_class_id,
                                  estimated_duration_minutes, assigned_chauffeur_id)
select b.id, 1, 'outbound', 'Buffer Snapshot Fixture', 'Zurich HB',
       '2027-06-05 09:00:00+02'::timestamptz, '2027-06-05T09:00',
       vc.id, 60, c.id
  from public.bookings b, public.vehicle_classes vc, public.chauffeurs c
 where b.contact_email = 'excl-10@vamostaxi.eu' and vc.slug = 'first' and c.full_name = 'Chauffeur X';

select is(
  (select turnaround_buffer_minutes from public.booking_legs where pickup_text = 'Buffer Snapshot Fixture'),
  30,
  'turnaround_buffer_minutes is snapshotted from settings.chauffeur_turnaround_minutes at assignment (D-14)'
);

update public.settings set chauffeur_turnaround_minutes = 90 where id = 1;

select is(
  (select upper(scheduled_range) from public.booking_legs where pickup_text = 'Buffer Snapshot Fixture'),
  '2027-06-05 09:00:00+02'::timestamptz + interval '90 minutes',
  'a later settings change does not recompute an already-assigned leg''s scheduled_range (D-14, QUOTE-05)'
);

-- (7) D-13: DEFERRABLE INITIALLY IMMEDIATE lets a two-statement swap succeed, even though the
--     first UPDATE alone would raise if checked immediately. ------------------------------------
insert into public.bookings (reference, contact_name, contact_email)
values (public.next_booking_reference(), 'Exclusion Fixture 11', 'excl-11@vamostaxi.eu');
insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                  scheduled_at, scheduled_local, vehicle_class_id,
                                  estimated_duration_minutes, assigned_chauffeur_id)
select b.id, 1, 'outbound', 'Swap Leg P', 'Zurich HB',
       '2027-06-06 10:00:00+02'::timestamptz, '2027-06-06T10:00',
       vc.id, 60, c.id
  from public.bookings b, public.vehicle_classes vc, public.chauffeurs c
 where b.contact_email = 'excl-11@vamostaxi.eu' and vc.slug = 'first' and c.full_name = 'Chauffeur X';

insert into public.bookings (reference, contact_name, contact_email)
values (public.next_booking_reference(), 'Exclusion Fixture 12', 'excl-12@vamostaxi.eu');
insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                  scheduled_at, scheduled_local, vehicle_class_id,
                                  estimated_duration_minutes, assigned_chauffeur_id)
select b.id, 1, 'outbound', 'Swap Leg Q', 'Zurich HB',
       '2027-06-06 10:00:00+02'::timestamptz, '2027-06-06T10:00',
       vc.id, 60, c.id
  from public.bookings b, public.vehicle_classes vc, public.chauffeurs c
 where b.contact_email = 'excl-12@vamostaxi.eu' and vc.slug = 'first' and c.full_name = 'Chauffeur Y';

select lives_ok(
  $$
    do $do$
    declare
      v_leg_p uuid;
      v_leg_q uuid;
      v_chauffeur_x uuid;
      v_chauffeur_y uuid;
    begin
      select id into v_leg_p from public.booking_legs where pickup_text = 'Swap Leg P';
      select id into v_leg_q from public.booking_legs where pickup_text = 'Swap Leg Q';
      select id into v_chauffeur_x from public.chauffeurs where full_name = 'Chauffeur X';
      select id into v_chauffeur_y from public.chauffeurs where full_name = 'Chauffeur Y';

      set constraints all deferred;
      update public.booking_legs set assigned_chauffeur_id = v_chauffeur_y where id = v_leg_p;
      update public.booking_legs set assigned_chauffeur_id = v_chauffeur_x where id = v_leg_q;
      set constraints all immediate;
    end
    $do$;
  $$,
  'swapping two chauffeurs across two overlapping legs succeeds when checking is deferred to end-of-transaction (D-13)'
);

-- (8) D-28: scheduled_range is a STORED generated column. ---------------------------------------
select is(
  (select attgenerated::text from pg_attribute
    where attrelid = 'public.booking_legs'::regclass and attname = 'scheduled_range'),
  's',
  'booking_legs.scheduled_range is a STORED generated column (D-28)'
);

select * from finish();
rollback;

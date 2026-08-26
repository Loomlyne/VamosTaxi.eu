-- manage_booking_mutation.test.sql
--
-- D-16/D-17 end-to-end: the first time manage_booking_cancel (Plan 02-05) executes against the
-- real booking_events table. One atomic check-and-act, one generic error per failure class (no
-- oracle), one event row per state change, and no other write path for a guest. F-09: the
-- past-pickup guard and the LIFE-03 refund basis read from the booking's OWN pinned
-- price_snapshots.policy, never the live settings_versions row.
--
-- Run as `postgres` by `supabase test db`.
begin;
select plan(29);

-- Fixtures ------------------------------------------------------------------------------------
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('first', 3, 3);

insert into public.rate_versions (slug, label) values ('mbm-rv', 'Manage-booking fixture rate version');

insert into public.settings_versions (slug, label, free_cancel_hours, cancellation_tiers,
                                       airport_waiting_minutes, city_waiting_minutes)
values ('mbm-policy', 'Manage-booking fixture policy', 24,
        '[{"from_hours_before":24,"refund_percent":100},{"from_hours_before":0,"refund_percent":75}]'::jsonb,
        60, 15);

-- B1: a return-trip booking (D-11), two legs, both in the future.
insert into public.bookings (contact_name, contact_email, status)
values ('Manage Mutation Fixture', 'mbm-fixture@vamostaxi.eu', 'confirmed');

insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                  scheduled_at, scheduled_local, vehicle_class_id, status)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB', now() + interval '3 days',
       to_char(now() + interval '3 days', 'YYYY-MM-DD"T"HH24:MI'), vc.id, 'confirmed'
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email = 'mbm-fixture@vamostaxi.eu' and vc.slug = 'first';
insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                  scheduled_at, scheduled_local, vehicle_class_id, status)
select b.id, 2, 'return', 'Zurich HB', 'ZRH Airport', now() + interval '5 days',
       to_char(now() + interval '5 days', 'YYYY-MM-DD"T"HH24:MI'), vc.id, 'confirmed'
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email = 'mbm-fixture@vamostaxi.eu' and vc.slug = 'first';

-- B1's own pinned snapshot -- the LIFE-03 basis (6c) is read from THIS row, never a live
-- settings_versions read.
insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy, booking_id, expires_at
)
select gen_random_uuid(), vc.id, rv.id, false, sv.id, 'quote-engine@mbm-b1', 1, 0, '[]'::jsonb,
       jsonb_build_object('cancellation_tiers', sv.cancellation_tiers,
                           'free_cancel_hours', sv.free_cancel_hours,
                           'airport_waiting_minutes', sv.airport_waiting_minutes,
                           'city_waiting_minutes', sv.city_waiting_minutes,
                           'settings_version_id', sv.id),
       b.id, now() + interval '30 minutes'
  from public.vehicle_classes vc, public.rate_versions rv, public.settings_versions sv,
       public.bookings b
 where vc.slug = 'first' and rv.slug = 'mbm-rv' and sv.slug = 'mbm-policy'
   and b.contact_email = 'mbm-fixture@vamostaxi.eu';

update public.bookings set price_snapshot_id =
  (select id from public.price_snapshots where engine_version = 'quote-engine@mbm-b1')
  where contact_email = 'mbm-fixture@vamostaxi.eu';

-- Three tokens bound to B1: valid, revoked, expired.
insert into public.booking_access_tokens (booking_id, token_hash, expires_at)
select b.id, extensions.digest('mbm-token-a', 'sha256'), now() + interval '1 day'
  from public.bookings b where b.contact_email = 'mbm-fixture@vamostaxi.eu';
insert into public.booking_access_tokens (booking_id, token_hash, expires_at, revoked_at)
select b.id, extensions.digest('mbm-token-r', 'sha256'), now() + interval '1 day', now()
  from public.bookings b where b.contact_email = 'mbm-fixture@vamostaxi.eu';
insert into public.booking_access_tokens (booking_id, token_hash, expires_at)
select b.id, extensions.digest('mbm-token-e', 'sha256'), now() - interval '1 hour'
  from public.bookings b where b.contact_email = 'mbm-fixture@vamostaxi.eu';

-- B3: F-09(a)'s past-pickup fixture. Leg 1 already under way, leg 2 in the future.
insert into public.bookings (contact_name, contact_email, status)
values ('Manage Mutation Past-Pickup Fixture', 'mbm-past-fixture@vamostaxi.eu', 'confirmed');
insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                  scheduled_at, scheduled_local, vehicle_class_id, status)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB', now() - interval '10 minutes',
       to_char(now() - interval '10 minutes', 'YYYY-MM-DD"T"HH24:MI'), vc.id, 'confirmed'
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email = 'mbm-past-fixture@vamostaxi.eu' and vc.slug = 'first';
insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                  scheduled_at, scheduled_local, vehicle_class_id, status)
select b.id, 2, 'return', 'Zurich HB', 'ZRH Airport', now() + interval '4 days',
       to_char(now() + interval '4 days', 'YYYY-MM-DD"T"HH24:MI'), vc.id, 'confirmed'
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email = 'mbm-past-fixture@vamostaxi.eu' and vc.slug = 'first';
insert into public.booking_access_tokens (booking_id, token_hash, expires_at)
select b.id, extensions.digest('mbm-token-p', 'sha256'), now() + interval '1 day'
  from public.bookings b where b.contact_email = 'mbm-past-fixture@vamostaxi.eu';

-- (1)-(3): wrong / revoked / expired hash -- the same generic error, no oracle. --------------
set local role vamos_guest;
select throws_ok(
  $$ select * from public.manage_booking_cancel(extensions.digest('mbm-token-wrong', 'sha256')) $$,
  'P0002', null, '(1) a hash matching no token raises P0002'
);
select throws_ok(
  $$ select * from public.manage_booking_cancel(extensions.digest('mbm-token-r', 'sha256')) $$,
  'P0002', null, '(2) a revoked token raises P0002 -- same code as not-found'
);
select throws_ok(
  $$ select * from public.manage_booking_cancel(extensions.digest('mbm-token-e', 'sha256')) $$,
  'P0002', null, '(3) an expired token raises P0002 -- same code as not-found'
);

-- (4): cancel leg 2 only. -----------------------------------------------------------------------
select lives_ok(
  $$ select * from public.manage_booking_cancel(extensions.digest('mbm-token-a', 'sha256'), 2::smallint) $$,
  '(4a) manage_booking_cancel(hash_a, 2) lives_ok'
);
reset role;

select is(
  (select l.status from public.booking_legs l join public.bookings b on b.id = l.booking_id
    where b.contact_email = 'mbm-fixture@vamostaxi.eu' and l.leg_seq = 2)::text,
  'cancelled',
  '(4b) leg 2 status = cancelled'
);
select is(
  (select l.status from public.booking_legs l join public.bookings b on b.id = l.booking_id
    where b.contact_email = 'mbm-fixture@vamostaxi.eu' and l.leg_seq = 1)::text,
  'confirmed',
  '(4c) leg 1 unchanged'
);
select is(
  (select status from public.bookings where contact_email = 'mbm-fixture@vamostaxi.eu')::text,
  'partially_cancelled',
  '(4d) bookings.status = partially_cancelled'
);
select is(
  (select count(*) from public.booking_events be join public.bookings b on b.id = be.booking_id
    where b.contact_email = 'mbm-fixture@vamostaxi.eu')::int,
  1,
  '(4e) exactly one booking_events row so far'
);
select is(
  (select kind from public.booking_events be join public.bookings b on b.id = be.booking_id
    where b.contact_email = 'mbm-fixture@vamostaxi.eu'),
  'booking.status_changed',
  '(4f) event kind = booking.status_changed'
);
select is(
  (select actor_kind from public.booking_events be join public.bookings b on b.id = be.booking_id
    where b.contact_email = 'mbm-fixture@vamostaxi.eu'),
  'guest',
  '(4g) event actor_kind = guest'
);
select is(
  (select to_status from public.booking_events be join public.bookings b on b.id = be.booking_id
    where b.contact_email = 'mbm-fixture@vamostaxi.eu')::text,
  'partially_cancelled',
  '(4h) event to_status = partially_cancelled'
);
select is(
  (select be.booking_leg_id from public.booking_events be join public.bookings b on b.id = be.booking_id
    where b.contact_email = 'mbm-fixture@vamostaxi.eu'),
  (select l.id from public.booking_legs l join public.bookings b on b.id = l.booking_id
    where b.contact_email = 'mbm-fixture@vamostaxi.eu' and l.leg_seq = 2),
  '(4i) event booking_leg_id = leg 2''s id'
);
select is(
  (select payload ->> 'via' from public.booking_events be join public.bookings b on b.id = be.booking_id
    where b.contact_email = 'mbm-fixture@vamostaxi.eu'),
  'manage_link',
  '(4j) event payload->''via'' = manage_link'
);
select is(
  (select use_count from public.booking_access_tokens where token_hash = extensions.digest('mbm-token-a', 'sha256')),
  1,
  '(4k) token use_count = 1'
);
select ok(
  (select last_used_at is not null from public.booking_access_tokens where token_hash = extensions.digest('mbm-token-a', 'sha256')),
  '(4l) token last_used_at is not null'
);

-- (5): cancel the whole booking (the return leg is already gone; only leg 1 is live). ----------
set local role vamos_guest;
select lives_ok(
  $$ select * from public.manage_booking_cancel(extensions.digest('mbm-token-a', 'sha256')) $$,
  '(5a) manage_booking_cancel(hash_a) -- whole booking -- lives_ok'
);
reset role;

select is(
  (select status from public.bookings where contact_email = 'mbm-fixture@vamostaxi.eu')::text,
  'cancelled',
  '(5b) bookings.status = cancelled'
);
select is(
  (select l.status from public.booking_legs l join public.bookings b on b.id = l.booking_id
    where b.contact_email = 'mbm-fixture@vamostaxi.eu' and l.leg_seq = 1)::text,
  'cancelled',
  '(5c) leg 1 status = cancelled'
);
select is(
  (select count(*) from public.booking_events be join public.bookings b on b.id = be.booking_id
    where b.contact_email = 'mbm-fixture@vamostaxi.eu')::int,
  2,
  '(5d) a second booking_events row now exists'
);

-- (6): a booking already in a terminal state raises P0001 (not_cancellable), never P0002. ------
set local role vamos_guest;
select throws_ok(
  $$ select * from public.manage_booking_cancel(extensions.digest('mbm-token-a', 'sha256')) $$,
  'P0001', null, '(6) cancelling an already-cancelled booking raises P0001'
);

-- (6b) F-09: a leg whose pickup has already passed refuses, and does not free the assignment. ---
select throws_ok(
  $$ select * from public.manage_booking_cancel(extensions.digest('mbm-token-p', 'sha256'), 1::smallint) $$,
  'P0001', null, '(6b-1) a past-pickup leg raises P0001, not P0002 -- no oracle'
);
reset role;
select is(
  (select l.status from public.booking_legs l join public.bookings b on b.id = l.booking_id
    where b.contact_email = 'mbm-past-fixture@vamostaxi.eu' and l.leg_seq = 1)::text,
  'confirmed',
  '(6b-2) the past-pickup leg is still not cancelled'
);
set local role vamos_guest;
select lives_ok(
  $$ select * from public.manage_booking_cancel(extensions.digest('mbm-token-p', 'sha256'), 2::smallint) $$,
  '(6b-3) the SAME booking''s future leg cancels lives_ok'
);
reset role;

-- (6c) F-09: the LIFE-03 basis on the (4) event is read from the booking''s OWN pinned snapshot. -
select ok(
  (select (payload ->> 'free_cancel_hours') is not null
     from public.booking_events be join public.bookings b on b.id = be.booking_id
    where b.contact_email = 'mbm-fixture@vamostaxi.eu' and be.to_status = 'partially_cancelled'),
  '(6c-1) payload->''free_cancel_hours'' is not null'
);
select is(
  (select payload ->> 'settings_version_id' from public.booking_events be join public.bookings b on b.id = be.booking_id
    where b.contact_email = 'mbm-fixture@vamostaxi.eu' and be.to_status = 'partially_cancelled'),
  (select settings_version_id::text from public.price_snapshots where engine_version = 'quote-engine@mbm-b1'),
  '(6c-2) payload->''settings_version_id'' equals the booking''s OWN snapshot''s settings_version_id'
);
select ok(
  (select (payload ->> 'hours_before') is not null
     from public.booking_events be join public.bookings b on b.id = be.booking_id
    where b.contact_email = 'mbm-fixture@vamostaxi.eu' and be.to_status = 'partially_cancelled'),
  '(6c-3) payload->''hours_before'' is present'
);

-- (7): EXECUTE is vamos_guest only. -------------------------------------------------------------
set local role authenticated;
select throws_ok(
  $$ select * from public.manage_booking_cancel(extensions.digest('mbm-token-a', 'sha256')) $$,
  '42501', null, '(7) authenticated cannot call manage_booking_cancel'
);
reset role;

-- (8): no other write path for a guest -- no grant on booking_events, before RLS even applies. -
set local role vamos_guest;
select throws_ok(
  $$ delete from public.booking_events $$,
  '42501', null, '(8a) vamos_guest cannot DELETE booking_events'
);
select throws_ok(
  $$ update public.booking_events set actor_label = 'x' $$,
  '42501', null, '(8b) vamos_guest cannot UPDATE booking_events'
);
reset role;

select * from finish();
rollback;

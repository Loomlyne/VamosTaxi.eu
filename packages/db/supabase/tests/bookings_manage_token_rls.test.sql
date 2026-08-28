-- bookings_manage_token_rls.test.sql
--
-- Proves DATA-03: a correct manage-token hash returns exactly one booking (and its legs,
-- snapshot and snapshot legs) via bookings_select_by_manage_token; wrong/expired/revoked/unset
-- all return zero rows -- never an error, and never someone else's booking (D-16, the
-- inline-subquery bug this SECURITY DEFINER-helper design avoids). vamos_guest can never read
-- booking_access_tokens directly, and has no write path outside manage_booking_cancel.
begin;
select plan(13);

-- Fixtures ------------------------------------------------------------------------------------
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('first', 3, 3);
insert into public.rate_versions (slug, label) values ('bmtr-rv', 'bookings_manage_token_rls fixture');
insert into public.settings_versions (slug, label) values ('bmtr-policy', 'bookings_manage_token_rls fixture');

insert into public.bookings (contact_name, contact_email) values ('Booking A', 'bmtr-booking-a@example.test');
insert into public.bookings (contact_name, contact_email) values ('Booking B', 'bmtr-booking-b@example.test');

insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                  scheduled_at, scheduled_local, vehicle_class_id)
select b.id, 1, 'outbound', 'ZRH', 'Zurich HB', now() + interval '3 days',
       to_char(now() + interval '3 days', 'YYYY-MM-DD"T"HH24:MI'), vc.id
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email = 'bmtr-booking-a@example.test' and vc.slug = 'first';
insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                  scheduled_at, scheduled_local, vehicle_class_id)
select b.id, 1, 'outbound', 'ZRH', 'Zurich HB', now() + interval '3 days',
       to_char(now() + interval '3 days', 'YYYY-MM-DD"T"HH24:MI'), vc.id
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email = 'bmtr-booking-b@example.test' and vc.slug = 'first';

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
select gen_random_uuid(), vc.id, rv.id, false, sv.id, 'quote-engine@bmtr-a', 1, 0, '[]'::jsonb,
       pol.policy, b.id, now() + interval '30 minutes', now() + interval '30 minutes'
  from public.vehicle_classes vc, public.rate_versions rv, public.settings_versions sv,
       public.bookings b, pol
 where vc.slug = 'first' and rv.slug = 'bmtr-rv' and sv.slug = 'bmtr-policy'
   and b.contact_email = 'bmtr-booking-a@example.test';
insert into public.price_snapshots (
  quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
  engine_version, pax, bags, lines, policy, booking_id, expires_at, quote_lock_expires_at
)
select gen_random_uuid(), vc.id, rv.id, false, sv.id, 'quote-engine@bmtr-b', 1, 0, '[]'::jsonb,
       pol.policy, b.id, now() + interval '30 minutes', now() + interval '30 minutes'
  from public.vehicle_classes vc, public.rate_versions rv, public.settings_versions sv,
       public.bookings b, pol
 where vc.slug = 'first' and rv.slug = 'bmtr-rv' and sv.slug = 'bmtr-policy'
   and b.contact_email = 'bmtr-booking-b@example.test';

insert into public.price_snapshot_legs (snapshot_id, leg_seq, booking_leg_id)
select ps.id, 1, bl.id
  from public.price_snapshots ps, public.booking_legs bl, public.bookings b
 where ps.engine_version = 'quote-engine@bmtr-a' and bl.booking_id = b.id and b.contact_email = 'bmtr-booking-a@example.test';
insert into public.price_snapshot_legs (snapshot_id, leg_seq, booking_leg_id)
select ps.id, 1, bl.id
  from public.price_snapshots ps, public.booking_legs bl, public.bookings b
 where ps.engine_version = 'quote-engine@bmtr-b' and bl.booking_id = b.id and b.contact_email = 'bmtr-booking-b@example.test';

-- Three tokens on booking A: valid, expired, revoked.
insert into public.booking_access_tokens (booking_id, token_hash, expires_at)
select b.id, extensions.digest('bmtr-token-a', 'sha256'), now() + interval '1 day'
  from public.bookings b where b.contact_email = 'bmtr-booking-a@example.test';
insert into public.booking_access_tokens (booking_id, token_hash, expires_at)
select b.id, extensions.digest('bmtr-token-x', 'sha256'), now() - interval '1 hour'
  from public.bookings b where b.contact_email = 'bmtr-booking-a@example.test';
insert into public.booking_access_tokens (booking_id, token_hash, expires_at, revoked_at)
select b.id, extensions.digest('bmtr-token-r', 'sha256'), now() + interval '1 day', now()
  from public.bookings b where b.contact_email = 'bmtr-booking-a@example.test';

create temporary table fx as
select (select id from public.bookings where contact_email = 'bmtr-booking-a@example.test') as booking_a,
       (select id from public.bookings where contact_email = 'bmtr-booking-b@example.test') as booking_b;
-- Temp tables default to owner-only privileges; the role switches below need to read it too.
grant select on fx to public;

-- (1)-(4) a valid hash returns exactly A's booking, leg, snapshot, snapshot_leg -- zero of B's. -
set local role vamos_guest;
select set_config('request.vamos.manage_token_hash', encode(extensions.digest('bmtr-token-a', 'sha256'), 'hex'), true);
select is(
  (select id from public.bookings), (select booking_a from fx),
  '(1) a valid token hash returns exactly A''s booking'
);
select is(
  (select count(*) from public.booking_legs)::int, 1,
  '(2) a valid token hash returns exactly one booking_legs row (A''s leg)'
);
select is(
  (select count(*) from public.price_snapshots)::int, 1,
  '(3) a valid token hash returns exactly one price_snapshots row (A''s snapshot)'
);
select is(
  (select count(*) from public.price_snapshot_legs)::int, 1,
  '(4) a valid token hash returns exactly one price_snapshot_legs row'
);
reset role;

-- (5) an expired token hash returns zero rows. --------------------------------------------------
set local role vamos_guest;
select set_config('request.vamos.manage_token_hash', encode(extensions.digest('bmtr-token-x', 'sha256'), 'hex'), true);
select is((select count(*) from public.bookings)::int, 0, '(5) an expired token hash returns zero rows');
reset role;

-- (6) a revoked token hash returns zero rows. ----------------------------------------------------
set local role vamos_guest;
select set_config('request.vamos.manage_token_hash', encode(extensions.digest('bmtr-token-r', 'sha256'), 'hex'), true);
select is((select count(*) from public.bookings)::int, 0, '(6) a revoked token hash returns zero rows');
reset role;

-- (7) a hash matching no token returns zero rows. ------------------------------------------------
set local role vamos_guest;
select set_config('request.vamos.manage_token_hash', encode(extensions.digest('bmtr-token-nonexistent', 'sha256'), 'hex'), true);
select is((select count(*) from public.bookings)::int, 0, '(7) a hash matching no token returns zero rows');
reset role;

-- (8)-(9) an UNSET GUC returns zero rows and does NOT raise -- the inline-subquery bug this
-- SECURITY DEFINER helper design avoids (T-02-15). ------------------------------------------------
set local role vamos_guest;
select set_config('request.vamos.manage_token_hash', '', true);
select lives_ok(
  $$ select count(*) from public.bookings $$,
  '(8) an unset manage_token_hash GUC does not raise (app.manage_token_hash() degrades to NULL)'
);
select is((select count(*) from public.bookings)::int, 0, '(9) an unset GUC returns zero rows, never someone else''s booking');

-- (10) the guest can never read booking_access_tokens directly -- no grant on that table at all.
select throws_ok(
  $$ select count(*) from public.booking_access_tokens $$,
  '42501', null,
  '(10) vamos_guest cannot select booking_access_tokens (no grant, by design)'
);

-- (11) no write path on bookings for a guest outside manage_booking_cancel. ----------------------
select set_config('request.vamos.manage_token_hash', encode(extensions.digest('bmtr-token-a', 'sha256'), 'hex'), true);
select throws_ok(
  $$ update public.bookings set note = 'x' $$,
  '42501', null,
  '(11) vamos_guest cannot UPDATE bookings.note (no UPDATE grant on bookings at all)'
);

-- (12)-(13) no write path on the evidence tables either. -----------------------------------------
select throws_ok(
  $$ insert into public.booking_events (booking_id, kind, actor_kind, actor_label)
     values (gen_random_uuid(), 'note.added', 'guest', 'test') $$,
  '42501', null,
  '(12) vamos_guest cannot INSERT into booking_events'
);
select throws_ok(
  $$ delete from public.booking_events $$,
  '42501', null,
  '(13) vamos_guest cannot DELETE from booking_events'
);
reset role;

select * from finish();
rollback;

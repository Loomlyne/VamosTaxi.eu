-- reference_format.test.sql
--
-- Proves (02-SCHEMA-DRAFT.md §15, ADR-003, D-12): `next_booking_reference()` returns
-- VT-YY-####, increments within a year via booking_reference_counters, and is executable only
-- by `service_role` and `vamos_staff` -- never `anon` or `authenticated` (F-16, T-02-13).
-- Also proves the D-07/D-11/D-13/D-15 supersession: none of the four GSD-LAUNCH columns exist
-- on `bookings`, and the two partial unique indexes (PAY-05/T-02-06) exist.
--
-- Run as `postgres` by `supabase test db`. `postgres` owns next_booking_reference() (created by
-- this migration as `postgres`), so it may call the function directly regardless of grants --
-- exactly like the precedent in staff_hook_claim.test.sql for custom_access_token_hook.
--
-- DEVIATION (Rule 3, blocking-issue auto-fix): `set local role vamos_staff` is refused on this
-- image with `permission denied to set role "vamos_staff"` -- `postgres`'s membership in the
-- four vamos_* application roles carries `admin_option=true` but `set_option=false`
-- (`pg_auth_members`), unlike its membership in the pre-existing `anon`/`authenticated` roles,
-- which carry `set_option=true`. F-16's positive half (vamos_staff CAN execute the function) is
-- proven instead via `function_privs_are` -- a catalog assertion needing no impersonation, and
-- exactly the technique the binding notes already prescribe for this Postgres image.
begin;
select plan(18);

-- Capture two consecutive calls in one transaction so the increment assertions are stable and
-- do not depend on how many times the function has already been called by earlier statements.
create temporary table ref_capture (id int generated always as identity primary key, ref text);
insert into ref_capture (ref) select public.next_booking_reference();
insert into ref_capture (ref) select public.next_booking_reference();

select matches(
  (select ref from ref_capture where id = 1),
  '^VT-[0-9]{2}-[0-9]{4}$',
  'next_booking_reference() returns VT-YY-#### (ADR-003)'
);
select is(
  (select substring(ref from 4 for 2) from ref_capture where id = 1),
  to_char(now() at time zone 'Europe/Zurich', 'YY'),
  'the YY segment is the current Europe/Zurich year'
);
select isnt(
  (select ref from ref_capture where id = 1),
  (select ref from ref_capture where id = 2),
  'two consecutive calls return different references'
);
select is(
  (select substring(ref from 7 for 4)::int from ref_capture where id = 2),
  (select substring(ref from 7 for 4)::int from ref_capture where id = 1) + 1,
  'the second call''s serial is the first + 1 (per-year sequence, not the mock''s random generator)'
);
select is(
  (select count(*)::int from public.booking_reference_counters),
  1,
  'booking_reference_counters has exactly one row after two calls in the same year'
);

-- F-16: anon and authenticated are denied; vamos_staff is allowed (a dispatcher's phone-booking
-- INSERT evaluates the reference DEFAULT as itself, per Plan 02-08's OPS-04 grant).
set local role anon;
select throws_ok(
  $$ select public.next_booking_reference() $$,
  '42501',
  null,
  'anon raises 42501 calling next_booking_reference() (not granted)'
);
reset role;

set local role authenticated;
select throws_ok(
  $$ select public.next_booking_reference() $$,
  '42501',
  null,
  'authenticated raises 42501 calling next_booking_reference() (not granted)'
);
reset role;

select lives_ok(
  $$ select public.next_booking_reference() $$,
  'the function owner (postgres) can execute next_booking_reference() directly'
);

select matches(
  public.next_booking_reference(),
  '^VT-[0-9]{2}-[0-9]{4}$',
  'a fresh next_booking_reference() call still returns the VT-YY-#### shape'
);

select function_privs_are(
  'public', 'next_booking_reference', array[]::name[],
  'service_role', array['EXECUTE']::name[],
  'service_role holds EXECUTE on next_booking_reference()'
);
select function_privs_are(
  'public', 'next_booking_reference', array[]::name[],
  'vamos_staff', array['EXECUTE']::name[],
  'vamos_staff holds EXECUTE on next_booking_reference() (F-16)'
);
select function_privs_are(
  'public', 'next_booking_reference', array[]::name[],
  'authenticated', array[]::name[],
  'authenticated holds zero privileges on next_booking_reference()'
);

-- D-07/D-11/D-13/D-15 supersession proof: the four GSD-LAUNCH rows do not exist on bookings.
select hasnt_column('public', 'bookings', 'price_chf', 'bookings has no price_chf column (D-07 -- price_snapshots)');
select hasnt_column('public', 'bookings', 'manage_token', 'bookings has no manage_token column (D-15 -- booking_access_tokens)');
select hasnt_column('public', 'bookings', 'assigned_chauffeur_id', 'bookings has no assigned_chauffeur_id column (D-13 -- booking_legs)');
select hasnt_column('public', 'bookings', 'return_at', 'bookings has no return_at column (D-11 -- a second booking_legs row)');

select has_index('public', 'bookings', 'bookings_idempotency', 'bookings_idempotency partial unique index exists (PAY-05/T-02-06)');
select has_index('public', 'bookings', 'bookings_quote', 'bookings_quote partial unique index exists');

select * from finish();
rollback;

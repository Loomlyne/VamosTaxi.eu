-- manage_token_shape.test.sql
--
-- Proves the D-15/D-16 shape (02-SCHEMA-DRAFT.md §15): booking_access_tokens' hash-length
-- CHECK and NOT NULL expires_at; app.booking_has_manage_token() returns false, never an error,
-- with an unset GUC (T-02-15), true only for a matching, unrevoked, unexpired hash, and false
-- for a wrong hash, a revoked token, or an expired token; the EXECUTE grants on both the read
-- helper and the manage_booking_cancel RPC are narrow (vamos_guest only). Does NOT call
-- manage_booking_cancel -- its booking_events insert is exercised by Plan 02-07's
-- manage_booking_mutation.test.sql once price_snapshots exists.
--
-- Run as `postgres` by `supabase test db`.
begin;
select plan(12);

-- Fixtures -----------------------------------------------------------------------------------
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('economy', 3, 3);

insert into public.bookings (reference, contact_name, contact_email)
values (public.next_booking_reference(), 'Manage Token Fixture', 'manage-token-fixture@vamostaxi.eu');

insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text,
                                  scheduled_at, scheduled_local, vehicle_class_id)
select b.id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
       '2027-06-10 09:00:00+02'::timestamptz, '2027-06-10T09:00', vc.id
  from public.bookings b, public.vehicle_classes vc
 where b.contact_email = 'manage-token-fixture@vamostaxi.eu' and vc.slug = 'economy';

insert into public.booking_access_tokens (booking_id, token_hash, expires_at)
select b.id, extensions.digest('token-a', 'sha256'), now() + interval '1 day'
  from public.bookings b where b.contact_email = 'manage-token-fixture@vamostaxi.eu';

-- (1) A 31-byte hash violates the octet_length = 32 CHECK. -------------------------------------
select throws_ok(
  $$
    insert into public.booking_access_tokens (booking_id, token_hash, expires_at)
    select b.id, decode(repeat('ab', 31), 'hex'), now() + interval '1 day'
      from public.bookings b where b.contact_email = 'manage-token-fixture@vamostaxi.eu'
  $$,
  '23514',
  null,
  'a 31-byte token_hash raises 23514 (booking_access_tokens_hash_len)'
);

-- (2) NOT NULL expires_at -- issuance must refuse rather than invent a window. ------------------
select throws_ok(
  $$
    insert into public.booking_access_tokens (booking_id, token_hash)
    select b.id, extensions.digest('token-no-expiry', 'sha256')
      from public.bookings b where b.contact_email = 'manage-token-fixture@vamostaxi.eu'
  $$,
  '23502',
  null,
  'inserting a token without expires_at raises 23502 (NOT NULL)'
);

-- (3)-(7): app.booking_has_manage_token() shape. -------------------------------------------------
select is(
  (select app.booking_has_manage_token(b.id) from public.bookings b
    where b.contact_email = 'manage-token-fixture@vamostaxi.eu'),
  false,
  'app.booking_has_manage_token() with no GUC set returns false, not an error (T-02-15)'
);

select set_config('request.vamos.manage_token_hash', encode(extensions.digest('token-a', 'sha256'), 'hex'), true);
select is(
  (select app.booking_has_manage_token(b.id) from public.bookings b
    where b.contact_email = 'manage-token-fixture@vamostaxi.eu'),
  true,
  'app.booking_has_manage_token() returns true for the matching, unrevoked, unexpired hash'
);

select set_config('request.vamos.manage_token_hash', encode(extensions.digest('token-b', 'sha256'), 'hex'), true);
select is(
  (select app.booking_has_manage_token(b.id) from public.bookings b
    where b.contact_email = 'manage-token-fixture@vamostaxi.eu'),
  false,
  'app.booking_has_manage_token() returns false for a non-matching hash'
);

update public.booking_access_tokens set revoked_at = now()
 where token_hash = extensions.digest('token-a', 'sha256');
select set_config('request.vamos.manage_token_hash', encode(extensions.digest('token-a', 'sha256'), 'hex'), true);
select is(
  (select app.booking_has_manage_token(b.id) from public.bookings b
    where b.contact_email = 'manage-token-fixture@vamostaxi.eu'),
  false,
  'app.booking_has_manage_token() returns false once the token is revoked'
);

update public.booking_access_tokens
   set revoked_at = null, expires_at = now() - interval '1 second'
 where token_hash = extensions.digest('token-a', 'sha256');
select is(
  (select app.booking_has_manage_token(b.id) from public.bookings b
    where b.contact_email = 'manage-token-fixture@vamostaxi.eu'),
  false,
  'app.booking_has_manage_token() returns false once the token is expired (revoked_at cleared, so expiry alone denies)'
);

-- (8)-(11): narrow EXECUTE grants, catalog proof, no impersonation needed. -----------------------
select function_privs_are(
  'app', 'booking_has_manage_token', array['uuid']::name[],
  'vamos_guest', array['EXECUTE']::name[],
  'vamos_guest holds EXECUTE on app.booking_has_manage_token(uuid)'
);
select function_privs_are(
  'app', 'booking_has_manage_token', array['uuid']::name[],
  'anon', array[]::name[],
  'anon holds zero privileges on app.booking_has_manage_token(uuid)'
);
select function_privs_are(
  'public', 'manage_booking_cancel', array['bytea', 'smallint']::name[],
  'vamos_guest', array['EXECUTE']::name[],
  'vamos_guest holds EXECUTE on manage_booking_cancel(bytea, smallint)'
);
select function_privs_are(
  'public', 'manage_booking_cancel', array['bytea', 'smallint']::name[],
  'authenticated', array[]::name[],
  'authenticated holds zero privileges on manage_booking_cancel(bytea, smallint)'
);

-- (12) D-15 supersession: no token column on bookings itself. -----------------------------------
select hasnt_column('public', 'bookings', 'manage_token', 'bookings has no manage_token column (D-15 -- booking_access_tokens)');

select * from finish();
rollback;

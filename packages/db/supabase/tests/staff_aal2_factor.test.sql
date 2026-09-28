-- staff_aal2_factor.test.sql
--
-- INT-09 / D-16 / D-16a / audit S1: app.is_staff() and app.is_admin() accept an aal1 session
-- only while the caller has no verified second factor. Once auth.mfa_factors holds a verified
-- factor for the caller, every staff check (and so every RESTRICTIVE *_staff_gate policy)
-- requires aal = 'aal2'. An unverified (half-enrolled) factor never locks the admin out.
-- Also covers staff.sign_in_method and public.staff_set_sign_in_method(text).
begin;
select plan(39);

-- Helper: set the request JWT for a user at a given AAL (called as postgres, before SET ROLE).
create function pg_temp.as_user(p_uid uuid, p_role text, p_aal text) returns void
language sql as $$
  select set_config('request.jwt.claims',
    jsonb_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal,
      'app_metadata', jsonb_build_object('vamos_role', p_role))::text,
    true)::void
$$;

-- Schema: sign_in_method -----------------------------------------------------------------------
select has_column('public', 'staff', 'sign_in_method', 'public.staff.sign_in_method exists');
select col_not_null('public', 'staff', 'sign_in_method', 'staff.sign_in_method is NOT NULL');
select col_default_is('public', 'staff', 'sign_in_method', 'password',
  'staff.sign_in_method defaults to password');

select has_function('public', 'staff_set_sign_in_method', array['text'],
  'public.staff_set_sign_in_method(text) exists');
select function_privs_are('public', 'staff_set_sign_in_method', array['text'],
  'vamos_staff', array['EXECUTE'], 'vamos_staff holds EXECUTE on staff_set_sign_in_method');
select function_privs_are('public', 'staff_set_sign_in_method', array['text'],
  'public', '{}'::text[], 'PUBLIC holds no EXECUTE on staff_set_sign_in_method');
select function_privs_are('public', 'staff_set_sign_in_method', array['text'],
  'anon', '{}'::text[], 'anon holds no EXECUTE on staff_set_sign_in_method');
select function_privs_are('public', 'staff_set_sign_in_method', array['text'],
  'authenticated', '{}'::text[], 'authenticated holds no EXECUTE on staff_set_sign_in_method');
select is(
  (select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'staff_set_sign_in_method'),
  true, 'staff_set_sign_in_method is SECURITY DEFINER');
select ok(
  (select 'search_path=""' = any(p.proconfig) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'staff_set_sign_in_method'),
  'staff_set_sign_in_method pins search_path to empty');

-- Fixtures ------------------------------------------------------------------------------------
insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('26120000-0000-4000-a000-000000000001', 'aal-admin@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('26120000-0000-4000-a000-000000000002', 'aal-admin-two@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('26120000-0000-4000-a000-000000000003', 'aal-dispatcher@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.staff (user_id, role, full_name, active, accepted_at)
values
  ('26120000-0000-4000-a000-000000000001', 'admin', 'AAL Admin', true, now()),
  ('26120000-0000-4000-a000-000000000002', 'admin', 'AAL Admin Two', true, now()),
  ('26120000-0000-4000-a000-000000000003', 'dispatcher', 'AAL Dispatcher', true, now());

select is(
  (select sign_in_method from public.staff where user_id = '26120000-0000-4000-a000-000000000001'),
  'password', 'a new staff row gets sign_in_method = password');
select throws_ok(
  $$ update public.staff set sign_in_method = 'sms' where user_id = '26120000-0000-4000-a000-000000000001' $$,
  '23514', null, 'sign_in_method CHECK rejects a value outside (password, magic_link)');

-- No factor: aal1 is enough (D-16) -------------------------------------------------------------
select pg_temp.as_user('26120000-0000-4000-a000-000000000001', 'admin', 'aal1');
set local role vamos_staff;
select is(app.is_admin(), true, 'admin with no factor at aal1 is admin (D-16)');
select is(app.is_staff(), true, 'admin with no factor at aal1 is staff (D-16)');
select ok((select count(*) from public.staff) >= 3, 'admin with no factor at aal1 reads staff rows');
reset role;

-- Unverified factor: still no step-up (T-26.1-64 lockout guard) -------------------------------
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('26120000-0000-4000-b000-000000000001', '26120000-0000-4000-a000-000000000001', 'half-enrolled', 'totp', 'unverified', now(), now());

select pg_temp.as_user('26120000-0000-4000-a000-000000000001', 'admin', 'aal1');
set local role vamos_staff;
select is(app.is_admin(), true, 'an unverified factor does not require aal2 (is_admin)');
select is(app.is_staff(), true, 'an unverified factor does not require aal2 (is_staff)');
reset role;

-- Verified factor: aal1 is refused everywhere (D-16a, S1) --------------------------------------
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('26120000-0000-4000-b000-000000000002', '26120000-0000-4000-a000-000000000001', 'authenticator', 'totp', 'verified', now(), now());

select pg_temp.as_user('26120000-0000-4000-a000-000000000001', 'admin', 'aal1');
set local role vamos_staff;
select is(app.is_admin(), false, 'admin with a verified factor at aal1 is not admin (D-16a)');
select is(app.is_staff(), false, 'admin with a verified factor at aal1 is not staff (D-16a)');
select is((select count(*) from public.staff)::int, 0,
  'staff RLS read returns zero rows at aal1 once a factor is verified');
select is((select count(*) from public.vehicles)::int, 0,
  'vehicles RLS read returns zero rows at aal1 once a factor is verified');
select throws_ok(
  $$ select public.staff_set_sign_in_method('magic_link') $$,
  '42501', null, 'staff_set_sign_in_method refuses aal1 once a factor is verified');
reset role;

-- A token with no aal claim is treated as aal1.
select set_config('request.jwt.claims',
  jsonb_build_object('sub', '26120000-0000-4000-a000-000000000001', 'role', 'authenticated',
    'app_metadata', jsonb_build_object('vamos_role', 'admin'))::text, true);
set local role vamos_staff;
select is(app.is_admin(), false, 'a token without aal is treated as aal1 (verified factor → refused)');
reset role;

-- Verified factor at aal2: allowed ------------------------------------------------------------
select pg_temp.as_user('26120000-0000-4000-a000-000000000001', 'admin', 'aal2');
set local role vamos_staff;
select is(app.is_admin(), true, 'admin with a verified factor at aal2 is admin');
select is(app.is_staff(), true, 'admin with a verified factor at aal2 is staff');
select ok((select count(*) from public.staff) >= 3, 'admin at aal2 reads staff rows');
reset role;

-- Another user's verified factor does not affect a factor-less admin.
select pg_temp.as_user('26120000-0000-4000-a000-000000000002', 'admin', 'aal1');
set local role vamos_staff;
select is(app.is_admin(), true, 'a second admin with no factor stays admin at aal1 (factor is per user)');
reset role;

-- Dispatcher with a verified factor: same rule in SQL -----------------------------------------
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at)
values ('26120000-0000-4000-b000-000000000003', '26120000-0000-4000-a000-000000000003', 'authenticator', 'totp', 'verified', now(), now());

select pg_temp.as_user('26120000-0000-4000-a000-000000000003', 'dispatcher', 'aal1');
set local role vamos_staff;
select is(app.is_staff(), false, 'dispatcher with a verified factor at aal1 is not staff');
reset role;

-- staff_set_sign_in_method: admin sets their own row only --------------------------------------
select pg_temp.as_user('26120000-0000-4000-a000-000000000001', 'admin', 'aal2');
set local role vamos_staff;
select lives_ok($$ select public.staff_set_sign_in_method('magic_link') $$,
  'admin at aal2 can set their sign-in method');
select throws_ok($$ select public.staff_set_sign_in_method('sms') $$,
  '22023', null, 'staff_set_sign_in_method rejects an unknown method');
select throws_ok($$ select public.staff_set_sign_in_method(null) $$,
  '22023', null, 'staff_set_sign_in_method rejects null');
reset role;

select is(
  (select sign_in_method from public.staff where user_id = '26120000-0000-4000-a000-000000000001'),
  'magic_link', 'the admin row now reads magic_link');
select is(
  (select sign_in_method from public.staff where user_id = '26120000-0000-4000-a000-000000000002'),
  'password', 'the other admin row is untouched');

select pg_temp.as_user('26120000-0000-4000-a000-000000000002', 'admin', 'aal1');
set local role vamos_staff;
select lives_ok($$ select public.staff_set_sign_in_method('password') $$,
  'admin with no factor at aal1 can set their sign-in method');
reset role;
select is(
  (select sign_in_method from public.staff where user_id = '26120000-0000-4000-a000-000000000001'),
  'magic_link', 'a second admin cannot change the first admin''s method');

select pg_temp.as_user('26120000-0000-4000-a000-000000000003', 'dispatcher', 'aal2');
set local role vamos_staff;
select throws_ok($$ select public.staff_set_sign_in_method('magic_link') $$,
  '42501', null, 'a dispatcher cannot set a sign-in method (admin only, D-16)');
reset role;
select is(
  (select sign_in_method from public.staff where user_id = '26120000-0000-4000-a000-000000000003'),
  'password', 'the dispatcher row is untouched');

set local role anon;
select throws_ok($$ select public.staff_set_sign_in_method('magic_link') $$,
  '42501', null, 'anon cannot call staff_set_sign_in_method');
reset role;

set local role authenticated;
select throws_ok($$ select public.staff_set_sign_in_method('magic_link') $$,
  '42501', null, 'authenticated cannot call staff_set_sign_in_method');
reset role;

select * from finish();
rollback;

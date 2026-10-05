-- staff_reset_recipient.test.sql
--
-- 261005 sign-up safety, migration 20261007330000. public.staff_active_for_email(text): one boolean for an
-- e-mail, true only while the address belongs to an ACTIVE staff row. The send-email hook uses it so a
-- recovery link asked for through the dashboard host reaches staff only. Behaviour, grants, shape.
-- Synthetic rows, rolled back.
begin;
select plan(23);

-- Fixtures --------------------------------------------------------------------------------
insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('26100501-0000-4000-a000-000000000001', 'srr-admin@vamostaxi.eu',      'authenticated', 'authenticated', '{}', '{}', now(), now()),
  ('26100501-0000-4000-a000-000000000002', 'SRR-Dispatcher@Vamostaxi.EU', 'authenticated', 'authenticated', '{}', '{}', now(), now()),
  ('26100501-0000-4000-a000-000000000003', 'srr-off@vamostaxi.eu',        'authenticated', 'authenticated', '{}', '{}', now(), now()),
  ('26100501-0000-4000-a000-000000000004', 'srr-invited@vamostaxi.eu',    'authenticated', 'authenticated', '{}', '{}', now(), now()),
  ('26100501-0000-4000-a000-000000000005', 'srr-customer@example.test',   'authenticated', 'authenticated', '{}', '{}', now(), now());
insert into public.staff (user_id, role, active, accepted_at) values
  ('26100501-0000-4000-a000-000000000001', 'admin',      true,  now()),
  ('26100501-0000-4000-a000-000000000002', 'dispatcher', true,  now()),
  ('26100501-0000-4000-a000-000000000003', 'dispatcher', false, now()),
  ('26100501-0000-4000-a000-000000000004', 'dispatcher', true,  null);

-- (1) Behaviour -----------------------------------------------------------------------------
select is(public.staff_active_for_email('srr-admin@vamostaxi.eu'), true, 'an active admin: true');
select is(public.staff_active_for_email('srr-dispatcher@vamostaxi.eu'), true, 'an active dispatcher: true, whatever the case of the stored address');
select is(public.staff_active_for_email('  SRR-ADMIN@vamostaxi.eu '), true, 'case and surrounding spaces of the typed address do not matter');
select is(public.staff_active_for_email('srr-off@vamostaxi.eu'), false, 'a staff row switched to inactive: false');
select is(public.staff_active_for_email('srr-invited@vamostaxi.eu'), true, 'an invited, not yet accepted, active row: true (the person owns the address)');
select is(public.staff_active_for_email('srr-customer@example.test'), false, 'a customer account with no staff row: false');
select is(public.staff_active_for_email('nobody@example.test'), false, 'an unknown address: false');
select is(public.staff_active_for_email(''), false, 'empty: false');
select is(public.staff_active_for_email(null), false, 'null: false');

-- The row turning inactive is seen at once.
update public.staff set active = false where user_id = '26100501-0000-4000-a000-000000000002';
select is(public.staff_active_for_email('srr-dispatcher@vamostaxi.eu'), false, 'switching the row to inactive turns the answer to false');
update public.staff set active = true where user_id = '26100501-0000-4000-a000-000000000002';
select is(public.staff_active_for_email('srr-dispatcher@vamostaxi.eu'), true, 'and back to true');

-- (2) Shape ---------------------------------------------------------------------------------
select is(pg_typeof(public.staff_active_for_email('x@example.test'))::text, 'boolean', 'returns a plain boolean (no id, role or name)');
select is((select p.prosecdef from pg_proc p where p.oid = 'public.staff_active_for_email(text)'::regprocedure), true, 'security definer');
select is((select p.proconfig from pg_proc p where p.oid = 'public.staff_active_for_email(text)'::regprocedure), array['search_path=""'], 'empty search_path');
select is((select p.provolatile::text from pg_proc p where p.oid = 'public.staff_active_for_email(text)'::regprocedure), 's', 'stable');

-- (3) Grants: vamos_system only -----------------------------------------------------------------
select is(has_function_privilege('vamos_system', 'public.staff_active_for_email(text)', 'execute'), true, 'vamos_system: EXECUTE');
select is(
  (select count(*)::int from unnest(array['anon', 'authenticated', 'vamos_checkout', 'vamos_staff', 'vamos_edge', 'vamos_public']) r
    where has_function_privilege(r, 'public.staff_active_for_email(text)', 'execute')),
  0, 'no other Worker role, and neither anon nor authenticated, holds EXECUTE');
select is(
  (select count(*)::int from pg_proc p where p.oid = 'public.staff_active_for_email(text)'::regprocedure and p.proacl::text ~ '(^|[{,])=X/'),
  0, 'PUBLIC holds no EXECUTE');

-- (4) As each caller would call it ------------------------------------------------------------
set local role anon;
select throws_ok($$ select public.staff_active_for_email('srr-admin@vamostaxi.eu') $$, '42501', null, 'anon (REST) cannot ask who is staff');
reset role;
set local role authenticated;
select throws_ok($$ select public.staff_active_for_email('srr-admin@vamostaxi.eu') $$, '42501', null, 'authenticated (REST) cannot ask who is staff');
reset role;
set local role vamos_staff;
select throws_ok($$ select public.staff_active_for_email('srr-admin@vamostaxi.eu') $$, '42501', null, 'the staff role cannot call it either');
reset role;
set local role vamos_system;
select is(public.staff_active_for_email('srr-admin@vamostaxi.eu'), true, 'as vamos_system (the Worker''s asSystem): works for staff');
select is(public.staff_active_for_email('srr-customer@example.test'), false, 'as vamos_system: false for a customer');
reset role;

select * from finish();
rollback;

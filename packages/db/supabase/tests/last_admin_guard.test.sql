-- last_admin_guard.test.sql
--
-- G17: the database refuses any role/active change or delete that would leave public.staff with
-- zero accepted, active admins. Concurrent removals are serialised by an advisory lock inside
-- the trigger; here the second removal is simulated sequentially, after the first has landed.
--
-- Run as `postgres` by `supabase test db`.
begin;
select plan(10);

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('20f00000-0000-4000-a000-000000000001', 'lag-admin-a@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('20f00000-0000-4000-a000-000000000002', 'lag-admin-b@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('20f00000-0000-4000-a000-000000000003', 'lag-dispatcher@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('20f00000-0000-4000-a000-000000000004', 'lag-invitee@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now());

-- Fixture state: exactly one accepted active admin (A), one dispatcher, one unaccepted admin invite.
delete from public.staff;
insert into public.staff (user_id, role, full_name, active, accepted_at) values
  ('20f00000-0000-4000-a000-000000000001', 'admin',      'Admin A',    true, now()),
  ('20f00000-0000-4000-a000-000000000003', 'dispatcher', 'Dispatcher', true, now());
insert into public.staff (user_id, role, full_name, active, accepted_at) values
  ('20f00000-0000-4000-a000-000000000004', 'admin', 'Unaccepted invite', true, null);

select throws_ok(
  $$update public.staff set role = 'dispatcher' where user_id = '20f00000-0000-4000-a000-000000000001'$$,
  '23514', 'staff-last-admin', 'demoting the last admin is refused (an unaccepted invite does not count)');
select throws_ok(
  $$update public.staff set active = false where user_id = '20f00000-0000-4000-a000-000000000001'$$,
  '23514', 'staff-last-admin', 'deactivating the last admin is refused');
select throws_ok(
  $$delete from public.staff where user_id = '20f00000-0000-4000-a000-000000000001'$$,
  '23514', 'staff-last-admin', 'deleting the last admin is refused');
select lives_ok(
  $$update public.staff set full_name = 'Admin A2', lang = 'de' where user_id = '20f00000-0000-4000-a000-000000000001'$$,
  'editing a profile column of the last admin is allowed');
select lives_ok(
  $$update public.staff set role = 'dispatcher', active = false where user_id = '20f00000-0000-4000-a000-000000000004'$$,
  'changing an unaccepted invite never counts against the guard');

insert into public.staff (user_id, role, full_name, active, accepted_at) values
  ('20f00000-0000-4000-a000-000000000002', 'admin', 'Admin B', true, now());

select lives_ok(
  $$update public.staff set role = 'dispatcher' where user_id = '20f00000-0000-4000-a000-000000000001'$$,
  'with two admins, demoting one works');
select throws_ok(
  $$update public.staff set active = false where user_id = '20f00000-0000-4000-a000-000000000002'$$,
  '23514', 'staff-last-admin', 'the second removal after the first is refused');
select throws_ok(
  $$delete from public.staff where user_id = '20f00000-0000-4000-a000-000000000002'$$,
  '23514', 'staff-last-admin', 'deleting the remaining admin is refused too');
select lives_ok(
  $$update public.staff set role = 'admin' where user_id = '20f00000-0000-4000-a000-000000000001'$$,
  'promoting a dispatcher to admin is allowed');
select lives_ok(
  $$delete from public.staff where user_id = '20f00000-0000-4000-a000-000000000002'$$,
  'with two admins again, deleting one works');

select * from finish();
rollback;

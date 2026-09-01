-- settings_versions_append_only_console.test.sql
--
-- D-27 / F-02: the console's own connection (vamos_staff) cannot UPDATE settings_versions.
-- 06-11 may only ever insert a new dated row. Superuser trigger proof lives in append_only.test.sql;
-- this file is the console-role contract.
begin;
select plan(5);

select has_table('public', 'settings_versions', 'public.settings_versions exists');

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('06010000-0000-4000-a000-000000000011', 'sss-sv-dispatcher@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('06010000-0000-4000-a000-000000000012', 'sss-sv-admin@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.staff (user_id, role, active) values
  ('06010000-0000-4000-a000-000000000011', 'dispatcher', true),
  ('06010000-0000-4000-a000-000000000012', 'admin', true);

insert into public.settings_versions (slug, label)
values ('sss-console-policy', '06-01 console append-only fixture');

set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', '06010000-0000-4000-a000-000000000011', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'dispatcher'))::text,
  true);
select throws_ok(
  $$ update public.settings_versions set free_cancel_hours = 0 where slug = 'sss-console-policy' $$,
  '42501', null,
  'dispatcher vamos_staff UPDATE on settings_versions raises (no UPDATE grant; F-02)'
);
reset role;

set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', '06010000-0000-4000-a000-000000000012', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'admin'))::text,
  true);
select throws_ok(
  $$ update public.settings_versions set free_cancel_hours = 0 where slug = 'sss-console-policy' $$,
  '42501', null,
  'admin vamos_staff UPDATE on settings_versions raises (console cannot mutate a row; D-27)'
);
select lives_ok(
  $$ insert into public.settings_versions (slug, label, effective_from)
     values ('sss-console-policy-v2', '06-01 dated successor', timestamptz '2026-09-01 00:00:00+00') $$,
  'admin INSERT of a new dated settings_versions row succeeds'
);
reset role;

select ok(
  (select count(*) from public.settings_versions where slug = 'sss-console-policy-v2') = 1,
  'the dated successor row is present after admin INSERT'
);

select * from finish();
rollback;

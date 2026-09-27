-- staff_self_service.test.sql
--
-- OPS-09 / AUTH-05 / D-07 / D-05: self-scoped staff functions. A dispatcher at aal2 reads and
-- edits only their own public.staff row; privilege columns stay out of the SET list; claim
-- stamps accepted_at once; audit_log attributes the write to the caller, never system.
begin;
select plan(31);

select has_function('app', 'staff_self', 'app.staff_self exists');
select has_function('public', 'staff_update_self', 'public.staff_update_self exists');
select has_function('public', 'staff_claim_invite', 'public.staff_claim_invite exists');

select function_privs_are(
  'app', 'staff_self', '{}'::text[],
  'vamos_staff', '{EXECUTE}'::text[],
  'vamos_staff holds EXECUTE on app.staff_self()'
);
select function_privs_are(
  'public', 'staff_update_self', '{text,text,text,boolean,text}'::text[],
  'vamos_staff', '{EXECUTE}'::text[],
  'vamos_staff holds EXECUTE on public.staff_update_self(...)'
);
select function_privs_are(
  'public', 'staff_claim_invite', '{}'::text[],
  'vamos_staff', '{EXECUTE}'::text[],
  'vamos_staff holds EXECUTE on public.staff_claim_invite()'
);

select function_privs_are(
  'app', 'staff_self', '{}'::text[],
  'public', '{}'::text[],
  'PUBLIC holds no EXECUTE on app.staff_self()'
);
select function_privs_are(
  'public', 'staff_update_self', '{text,text,text,boolean,text}'::text[],
  'public', '{}'::text[],
  'PUBLIC holds no EXECUTE on public.staff_update_self(...)'
);
select function_privs_are(
  'public', 'staff_claim_invite', '{}'::text[],
  'public', '{}'::text[],
  'PUBLIC holds no EXECUTE on public.staff_claim_invite()'
);

select function_privs_are(
  'app', 'staff_self', '{}'::text[],
  'anon', '{}'::text[],
  'anon holds no EXECUTE on app.staff_self()'
);
select function_privs_are(
  'public', 'staff_update_self', '{text,text,text,boolean,text}'::text[],
  'anon', '{}'::text[],
  'anon holds no EXECUTE on public.staff_update_self(...)'
);
select function_privs_are(
  'public', 'staff_claim_invite', '{}'::text[],
  'anon', '{}'::text[],
  'anon holds no EXECUTE on public.staff_claim_invite()'
);

select function_privs_are(
  'app', 'staff_self', '{}'::text[],
  'authenticated', '{}'::text[],
  'authenticated holds no EXECUTE on app.staff_self()'
);
select function_privs_are(
  'public', 'staff_update_self', '{text,text,text,boolean,text}'::text[],
  'authenticated', '{}'::text[],
  'authenticated holds no EXECUTE on public.staff_update_self(...)'
);
select function_privs_are(
  'public', 'staff_claim_invite', '{}'::text[],
  'authenticated', '{}'::text[],
  'authenticated holds no EXECUTE on public.staff_claim_invite()'
);

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('06010000-0000-4000-a000-000000000001', 'sss-dispatcher@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('06010000-0000-4000-a000-000000000002', 'sss-admin@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now());

-- accepted_at: app.is_staff()/is_admin() ignore unaccepted invites (20260901000001).
insert into public.staff (user_id, role, full_name, phone, lang, digest_email, avatar_path, active, accepted_at)
values
  ('06010000-0000-4000-a000-000000000001', 'dispatcher', 'Before', '+41 00', 'en', true, null, true, now()),
  ('06010000-0000-4000-a000-000000000002', 'admin', 'Admin Fixture', '+41 11', 'fr', true, 'avatars/admin.png', true, now());

create temporary table sss_admin_before as
select * from public.staff where user_id = '06010000-0000-4000-a000-000000000002';

-- Dispatcher at aal2: staff_self returns exactly their own row. --------------------------------
set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', '06010000-0000-4000-a000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'dispatcher'))::text,
  true);
select is((select count(*) from app.staff_self())::int, 1,
  'dispatcher at aal2 gets exactly one row from app.staff_self()');
select is(
  (select user_id from app.staff_self()),
  '06010000-0000-4000-a000-000000000001'::uuid,
  'dispatcher at aal2 staff_self row is their own'
);

select lives_ok(
  $$ select public.staff_update_self(
       'Ada Dispatcher',
       '+41 79 000 00 01',
       'de',
       false,
       'avatars/ada.png'
     ) $$,
  'dispatcher at aal2 can call staff_update_self'
);
reset role;

select is(
  (select jsonb_build_object(
     'full_name', s.full_name,
     'phone', s.phone,
     'lang', s.lang,
     'digest_email', s.digest_email,
     'avatar_path', s.avatar_path
   ) from public.staff s where s.user_id = '06010000-0000-4000-a000-000000000001'),
  jsonb_build_object(
    'full_name', 'Ada Dispatcher',
    'phone', '+41 79 000 00 01',
    'lang', 'de',
    'digest_email', false,
    'avatar_path', 'avatars/ada.png'
  ),
  'staff_update_self writes full_name/phone/lang/digest_email/avatar_path for the caller'
);

select is(
  (select to_jsonb(s) from public.staff s where s.user_id = '06010000-0000-4000-a000-000000000002'),
  (select to_jsonb(b) from sss_admin_before b),
  'second staff row is byte-identical after staff_update_self'
);

select is(
  (select s.role::text from public.staff s where s.user_id = '06010000-0000-4000-a000-000000000001'),
  'dispatcher',
  'staff_update_self cannot change role'
);
select is(
  (select s.active from public.staff s where s.user_id = '06010000-0000-4000-a000-000000000001'),
  true,
  'staff_update_self cannot change active'
);

select ok(
  (
    select p.prosrc
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'staff_update_self'
  ) !~* E'\\m(role|active)\\s*=',
  'staff_update_self source does not assign role or active in a SET list'
);

select is(
  (select a.actor_kind
     from public.audit_log a
    where a.table_name = 'staff'
      and a.record_id = '06010000-0000-4000-a000-000000000001'
      and a.action = 'update'
    order by a.created_at desc, a.id desc
    limit 1),
  'staff',
  'staff_update_self audit_log.actor_kind is staff'
);
select is(
  (select a.actor_id
     from public.audit_log a
    where a.table_name = 'staff'
      and a.record_id = '06010000-0000-4000-a000-000000000001'
      and a.action = 'update'
    order by a.created_at desc, a.id desc
    limit 1),
  '06010000-0000-4000-a000-000000000001'::uuid,
  'staff_update_self audit_log.actor_id is the caller uid'
);

-- staff_claim_invite stamps accepted_at once. ---------------------------------------------------
-- The fixture row was inserted accepted (so the self-service block above could run); put it back
-- to a pending invite so this block proves the stamp rather than an already-set value.
update public.staff set accepted_at = null where user_id = '06010000-0000-4000-a000-000000000001';
set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', '06010000-0000-4000-a000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'dispatcher'))::text,
  true);
select lives_ok(
  $$ select public.staff_claim_invite() $$,
  'dispatcher at aal2 can call staff_claim_invite'
);
reset role;

select ok(
  (select s.accepted_at is not null from public.staff s where s.user_id = '06010000-0000-4000-a000-000000000001'),
  'staff_claim_invite sets accepted_at'
);

create temporary table sss_first_accept as
select s.accepted_at from public.staff s where s.user_id = '06010000-0000-4000-a000-000000000001';

set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', '06010000-0000-4000-a000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'dispatcher'))::text,
  true);
select public.staff_claim_invite();
reset role;

select is(
  (select s.accepted_at from public.staff s where s.user_id = '06010000-0000-4000-a000-000000000001'),
  (select accepted_at from sss_first_accept),
  'second staff_claim_invite leaves accepted_at unchanged'
);

-- aal1 / missing claim: staff_self is empty; claim raises. --------------------------------------
set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', '06010000-0000-4000-a000-000000000001', 'role', 'authenticated', 'aal', 'aal1',
    'app_metadata', jsonb_build_object('vamos_role', 'dispatcher'))::text,
  true);
select is((select count(*) from app.staff_self())::int, 0,
  'dispatcher at aal1 gets zero rows from app.staff_self()');
select throws_ok(
  $$ select public.staff_claim_invite() $$,
  '42501', null,
  'staff_claim_invite at aal1 raises 42501'
);
reset role;

set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', '06010000-0000-4000-a000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text,
  true);
select is((select count(*) from app.staff_self())::int, 0,
  'aal2 with no vamos_role claim gets zero rows from app.staff_self()'
);
reset role;

select * from finish();
rollback;

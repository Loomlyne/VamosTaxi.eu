-- account_finish.test.sql
--
-- Phase 27.1 (27 D-37). public.account_finish_required: who must finish, who never does, and
-- which roles may ask. Synthetic auth users, rolled back.
begin;
select plan(14);

create temp table _af as select gen_random_uuid() as linkuser, gen_random_uuid() as olduser,
  gen_random_uuid() as staffuser, gen_random_uuid() as guestuser, gen_random_uuid() as signupuser;
grant select on _af to vamos_system;

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.email, x.created, now(), '{}'::jsonb, '{}'::jsonb
  from _af, lateral (values
    (_af.linkuser,   'Link.User@Example.TEST',   now() + interval '1 minute'),
    (_af.olduser,    'old.user@example.test',    now() - interval '400 days'),
    (_af.staffuser,  'staff.user@example.test',  now() + interval '1 minute'),
    (_af.guestuser,  'guest.user@example.test',  now() + interval '1 minute'),
    (_af.signupuser, 'signup.user@example.test', now() + interval '1 minute')
  ) as x(id, email, created);

insert into public.staff (user_id, role) select staffuser, 'dispatcher' from _af;

-- The column exists, is not null and the one settings row has a value.
select has_column('public', 'settings', 'account_finish_since', 'settings.account_finish_since exists');
select col_not_null('public', 'settings', 'account_finish_since', 'account_finish_since is not null');
select is((select count(*)::int from public.settings where id = 1 and account_finish_since is not null), 1, 'the settings row has a start time');

-- Definer, empty search_path, EXECUTE for vamos_system only.
select is((select count(*)::int from pg_proc p where p.oid = 'public.account_finish_required(uuid)'::regprocedure
            and p.prosecdef and p.proconfig = array['search_path=""']), 1, 'definer with empty search_path');
select is(has_function_privilege('vamos_system', 'public.account_finish_required(uuid)', 'execute'), true, 'system has EXECUTE');
select is((select count(*)::int from unnest(array['anon','authenticated','vamos_public','vamos_checkout','vamos_guest','vamos_staff']) r
            where exists (select 1 from pg_roles where rolname = r)
              and has_function_privilege(r, 'public.account_finish_required(uuid)', 'execute')), 0, 'no other role has EXECUTE');

set local role vamos_system;
select is(public.account_finish_required((select linkuser from _af)), true, 'new account without a record must finish');
select is(public.account_finish_required((select olduser from _af)), false, 'account made before the start time is never asked');
select is(public.account_finish_required((select staffuser from _af)), false, 'staff never finish');
select is(public.account_finish_required(gen_random_uuid()), false, 'unknown id answers false');
reset role;

-- A checkout guest (informed) row and a sign-up row both count as finished; case and spaces ignored.
insert into public.account_agreement_records (surface, email, choice, record_kind, text_version, locale)
values ('checkout', 'guest.user@example.test', 'guest', 'informed', '2026-09-29', 'en');
select public.record_account_agreement('sign-up', null, ' SIGNUP.user@example.test ', 'create', '2026-09-29', 'fr', null, null);
select public.record_account_agreement('sign-up', null, 'link.user@example.test', 'create', '2026-09-29', 'de', null, null);

set local role vamos_system;
select is(public.account_finish_required((select guestuser from _af)), false, 'checkout guest row counts');
select is(public.account_finish_required((select signupuser from _af)), false, 'sign-up row counts');
select is(public.account_finish_required((select linkuser from _af)), false, 'after the finish row the account is finished');
reset role;

set local role authenticated;
select throws_ok($$select public.account_finish_required(gen_random_uuid())$$, '42501', null, 'authenticated refused');
reset role;

select * from finish();
rollback;

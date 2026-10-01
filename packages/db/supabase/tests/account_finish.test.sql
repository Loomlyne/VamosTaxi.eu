-- account_finish.test.sql
--
-- Phase 27.1 (27 D-37). account_finish_mark / _required / _done: only an account the public sign-in
-- link just made is asked to finish; the answer is kept by user id; no role but vamos_system may call;
-- no role has a table grant. Synthetic auth users, rolled back.
begin;
select plan(20);

create temp table _af as select gen_random_uuid() as fresh, gen_random_uuid() as confirmed,
  gen_random_uuid() as old, gen_random_uuid() as other;
grant select on _af to vamos_system;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
select x.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', x.email, x.confirmed, x.created, now(), '{}'::jsonb, '{}'::jsonb
  from _af, lateral (values
    (_af.fresh,     'Fresh.Link@Example.TEST',   null::timestamptz, now()),
    (_af.confirmed, 'confirmed@example.test',    now(),             now()),
    (_af.old,       'old.unconfirmed@example.test', null::timestamptz, now() - interval '1 hour'),
    (_af.other,     'other@example.test',        null::timestamptz, now())
  ) as x(id, email, confirmed, created);

-- Shape and grants.
select has_table('public', 'account_finish_pending', 'account_finish_pending exists');
select is((select relrowsecurity from pg_class where oid = 'public.account_finish_pending'::regclass), true, 'RLS on');
select is((select count(*)::int from unnest(array['anon','authenticated','vamos_public','vamos_checkout','vamos_system']) r
            where exists (select 1 from pg_roles where rolname = r)
              and has_table_privilege(r, 'public.account_finish_pending', 'select,insert,update,delete')), 0, 'no role has a table privilege');
select is((select count(*)::int from pg_proc p
            where p.oid in ('public.account_finish_mark(text)'::regprocedure, 'public.account_finish_required(uuid)'::regprocedure, 'public.account_finish_done(uuid)'::regprocedure)
              and p.prosecdef and p.proconfig = array['search_path=""']), 3, 'three definers with empty search_path');
select is(has_function_privilege('vamos_system', 'public.account_finish_mark(text)', 'execute')
      and has_function_privilege('vamos_system', 'public.account_finish_required(uuid)', 'execute')
      and has_function_privilege('vamos_system', 'public.account_finish_done(uuid)', 'execute'), true, 'system has EXECUTE on all three');
select is((select count(*)::int from unnest(array['anon','authenticated','vamos_public','vamos_checkout','vamos_guest','vamos_staff']) r,
                 unnest(array['public.account_finish_mark(text)','public.account_finish_required(uuid)','public.account_finish_done(uuid)']) f
            where exists (select 1 from pg_roles where rolname = r) and has_function_privilege(r, f, 'execute')), 0, 'no other role has EXECUTE');

set local role vamos_system;
select lives_ok($$select public.account_finish_mark('  FRESH.link@example.test ')$$, 'mark the account the link just made');
select lives_ok($$select public.account_finish_mark('confirmed@example.test')$$, 'mark call for a confirmed account');
select lives_ok($$select public.account_finish_mark('old.unconfirmed@example.test')$$, 'mark call for an hour-old account');
select lives_ok($$select public.account_finish_mark('nobody@example.test')$$, 'mark call for an unknown address');
select is(public.account_finish_required((select fresh from _af)), true, 'the fresh link account must finish');
select is(public.account_finish_required((select confirmed from _af)), false, 'a confirmed account is never marked');
select is(public.account_finish_required((select old from _af)), false, 'an older account is never marked');
select is(public.account_finish_required((select other from _af)), false, 'an account nobody marked is never asked');
select is(public.account_finish_required(gen_random_uuid()), false, 'unknown id answers false');
select lives_ok($$select public.account_finish_mark('fresh.link@example.test')$$, 'a second mark is harmless');
select lives_ok($$select public.account_finish_done((select fresh from _af))$$, 'done');
select is(public.account_finish_required((select fresh from _af)), false, 'finished after done');
select throws_ok($$select * from public.account_finish_pending$$, '42501', null, 'table select refused for system');
reset role;

set local role authenticated;
select throws_ok($$select public.account_finish_required(gen_random_uuid())$$, '42501', null, 'authenticated refused');
reset role;

select * from finish();
rollback;

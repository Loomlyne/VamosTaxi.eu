begin;
select plan(15);

create temp table _cl as select count(*)::int as n from public.consent_log;
grant select on _cl to vamos_system;

select is(has_function_privilege('vamos_system', 'public.record_account_agreement(text,uuid,text,text,text,text,text,inet)', 'execute'), true, 'system has EXECUTE');
select is(has_function_privilege('vamos_checkout', 'public.record_account_agreement(text,uuid,text,text,text,text,text,inet)', 'execute'), true, 'checkout keeps EXECUTE');
select is((select count(*)::int from unnest(array['anon','authenticated','vamos_guest','vamos_staff']) r
            where exists (select 1 from pg_roles where rolname = r)
              and has_function_privilege(r, 'public.record_account_agreement(text,uuid,text,text,text,text,text,inet)', 'execute')), 0, 'no other role has EXECUTE');
select is((select count(*)::int from unnest(array['anon','authenticated','vamos_checkout','vamos_system']) r
            where has_table_privilege(r, 'public.account_agreement_records', 'select,insert,update,delete')), 0, 'no role has a table privilege');
select is((select count(*)::int from pg_proc p where p.oid = 'public.record_account_agreement(text,uuid,text,text,text,text,text,inet)'::regprocedure
            and p.prosecdef and p.proconfig = array['search_path=""']), 1, 'still definer with empty search_path');

set local role vamos_system;
select ok((select public.record_account_agreement('sign-up', null, '  Gap.Plan@Example.TEST ', 'create', '2026-09-29', 'de', 'ua-test', '203.0.113.0'::inet)) > 0, 'sign-up write returns an id');
select throws_ok($$select public.record_account_agreement('sign-up', gen_random_uuid(), 'a@example.test', 'create', '2026-09-29', 'de', null, null)$$, '22023', null, 'booking id refused');
select throws_ok($$select public.record_account_agreement('sign-up', null, 'a@example.test', 'guest', '2026-09-29', 'de', null, null)$$, '22023', null, 'guest choice refused');
select throws_ok($$select public.record_account_agreement('sign-up', null, null, 'create', '2026-09-29', 'de', null, null)$$, '22023', null, 'null e-mail refused');
select throws_ok($$select public.record_account_agreement('sign-up', null, 'a@example.test', 'create', '', 'de', null, null)$$, '22023', null, 'empty version refused');
select throws_ok($$select * from public.account_agreement_records$$, '42501', null, 'table select refused for system');
reset role;

select is((select record_kind || '/' || surface || '/' || coalesce(booking_id::text, 'none') || '/' || email || '/' || text_version || '/' || locale
             from public.account_agreement_records where email = 'gap.plan@example.test'),
          'consent/sign-up/none/gap.plan@example.test/2026-09-29/de', 'stored row reads as expected');
select is((select count(*)::int from public.consent_log), (select n from _cl), 'consent_log unchanged');

set local role anon;
select throws_ok($$select public.record_account_agreement('sign-up', null, 'b@example.test', 'create', '2026-09-29', 'de', null, null)$$, '42501', null, 'anon refused');
reset role;
set local role authenticated;
select throws_ok($$select public.record_account_agreement('sign-up', null, 'b@example.test', 'create', '2026-09-29', 'de', null, null)$$, '42501', null, 'authenticated refused');
reset role;

select * from finish();
rollback;

-- consent_write.test.sql
--
-- Proves D-32/T-02-11: consent is recorded only through public.record_consent(). anon cannot
-- INSERT into consent_log directly or SELECT it; the function refuses with no bound subject
-- (P0001); consent_subject_id and customer_id come from the GUC and app.uid(), never as
-- arguments, so a caller cannot forge either; ip_truncated is nullable (D-32/U10).
--
-- Run as `postgres` by `supabase test db`.
begin;
select plan(12);

-- Fixtures -----------------------------------------------------------------------------------
insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('c0000000-0000-0000-0000-000000000001', 'consent-fixture@vamostaxi.eu', 'authenticated',
        'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.customers (user_id, full_name, email)
values ('c0000000-0000-0000-0000-000000000001', 'Consent Fixture Customer', 'consent-fixture-customer@example.test');

-- (1) anon cannot INSERT into consent_log directly. -------------------------------------------
set local role anon;
select throws_ok(
  $$ insert into public.consent_log (consent_subject_id, policy_version, method, locale)
     values (gen_random_uuid(), '2026-08', 'accept_all', 'en') $$,
  '42501',
  null,
  '(1) anon cannot INSERT into consent_log directly'
);

-- (2) record_consent with no bound subject refuses -- no oracle, one generic error. -----------
select throws_ok(
  $$ select public.record_consent(true, false, false, false, 'banner', 'en', '2026-08') $$,
  'P0001',
  null,
  '(2) record_consent with no bound consent subject raises P0001'
);

-- (3)-(6): with the GUC bound, an anonymous call lives_ok and the row is exactly what the ------
-- subject/GUC dictate -- never what a caller could pass as an argument.
select set_config('request.vamos.consent_subject', 'd0000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$ select public.record_consent(true, true, false, false, 'accept_all', 'en', '2026-08') $$,
  '(3) record_consent lives_ok as anon with a bound subject'
);
reset role;

select is(
  (select consent_subject_id from public.consent_log where policy_version = '2026-08' and method = 'accept_all'),
  'd0000000-0000-0000-0000-000000000001'::uuid,
  '(4) consent_subject_id = the bound GUC value'
);
select ok(
  (select customer_id is null from public.consent_log where policy_version = '2026-08' and method = 'accept_all'),
  '(5) customer_id is null for an anonymous caller (app.uid() is null)'
);
select ok(
  (select ip_truncated is null from public.consent_log where policy_version = '2026-08' and method = 'accept_all'),
  '(6) ip_truncated is null when the caller supplies none'
);

-- (7)-(8): a signed-in caller -- customer_id comes from app.uid(), never an argument. ----------
set local role authenticated;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'c0000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
select set_config('request.vamos.consent_subject', 'e0000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$ select public.record_consent(true, false, true, false, 'settings_change', 'en', '2026-08') $$,
  '(7) record_consent lives_ok as authenticated with a bound sub and subject'
);
reset role;

select is(
  (select customer_id from public.consent_log where method = 'settings_change'),
  (select id from public.customers where user_id = 'c0000000-0000-0000-0000-000000000001'),
  '(8) customer_id resolves from app.uid() -- the caller never passed it'
);

-- (9)-(10): forging a customer_id is impossible -- there is no such parameter. -----------------
select function_privs_are(
  'public', 'record_consent',
  array['boolean','boolean','boolean','boolean','text','text','text','uuid','text','inet']::name[],
  'anon', array['EXECUTE']::name[],
  '(9) anon holds EXECUTE on record_consent(...)'
);
select throws_ok(
  $$ select public.record_consent(p_necessary => true, p_functional => false, p_analytics => false,
       p_marketing => false, p_method => 'banner', p_locale => 'en', p_policy_version => '2026-08',
       p_customer_id => gen_random_uuid()) $$,
  '42883',
  null,
  '(10) record_consent has no p_customer_id parameter -- passing one raises 42883 (no such function)'
);

-- (11) anon cannot read the ledger either. ------------------------------------------------------
set local role anon;
select throws_ok(
  $$ select count(*) from public.consent_log $$,
  '42501',
  null,
  '(11) anon cannot SELECT consent_log'
);
reset role;

-- (12) D-32/U10: ip_truncated ships nullable. ---------------------------------------------------
select col_is_null('public', 'consent_log', 'ip_truncated', '(12) consent_log.ip_truncated is nullable (D-32)');

select * from finish();
rollback;

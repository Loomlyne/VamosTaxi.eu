-- contact_forms.test.sql
-- SITE-04 / D-23: anon can call submit RPCs and cannot touch the tables.

begin;
select plan(21);

select has_table('public', 'contact_submissions', 'contact_submissions exists');
select hasnt_table('public', 'partner_applications', 'partner_applications dropped');
select hasnt_function('public', 'submit_partner_application', 'submit_partner_application dropped');

select has_index(
  'public', 'contact_submissions', 'contact_submissions_idempotency_key_key',
  'idempotency unique on contact_submissions'
);

select ok(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'contact_submissions'),
  'RLS enabled on contact_submissions'
);

select function_privs_are(
  'public', 'submit_contact_message',
  '{text,text,citext,text,text,text,text}'::text[],
  'public', '{}'::text[],
  'PUBLIC holds no EXECUTE on submit_contact_message'
);
select function_privs_are(
  'public', 'submit_contact_message',
  '{text,text,citext,text,text,text,text}'::text[],
  'anon', '{}'::text[],
  'anon holds no EXECUTE on submit_contact_message (Phase 20)'
);
select function_privs_are(
  'public', 'submit_contact_message',
  '{text,text,citext,text,text,text,text}'::text[],
  'authenticated', '{}'::text[],
  'authenticated holds no EXECUTE on submit_contact_message (Phase 20)'
);

select table_privs_are('public', 'contact_submissions', 'anon', '{}'::text[], 'anon no table priv contact');
select table_privs_are('public', 'contact_submissions', 'vamos_public', '{}'::text[], 'vamos_public no table priv contact');
select table_privs_are('public', 'contact_submissions', 'vamos_edge', '{}'::text[], 'vamos_edge no table priv contact');
select table_privs_are('public', 'contact_submissions', 'vamos_guest', '{}'::text[], 'vamos_guest no table priv contact');

set local role anon;
select throws_ok(
  $$ insert into public.contact_submissions (idempotency_key, name, email, message)
     values ('k-direct', 'A', 'a@example.test', 'hello') $$,
  '42501',
  null,
  'anon cannot INSERT contact_submissions'
);
select throws_ok(
  $$ select * from public.contact_submissions $$,
  '42501',
  null,
  'anon cannot SELECT contact_submissions'
);

-- Phase 20 (20260920000002): the publishable key can no longer skip Turnstile.
select throws_ok(
  $$ select * from public.submit_contact_message(
       'k-contact-1', 'Anna', 'anna@example.test', '', '', 'Need a quote', 'en') $$,
  '42501',
  null,
  'anon cannot call submit_contact_message (Phase 20)'
);
reset role;

-- The Worker submits as vamos_system (asSystem), after Turnstile + CSRF.
set local role vamos_system;
select lives_ok(
  $$ select * from public.submit_contact_message(
       'k-contact-1', 'Anna', 'anna@example.test', '', '', 'Need a quote', 'en') $$,
  'vamos_system can call submit_contact_message'
);
reset role;

select is(
  (select created from public.submit_contact_message(
     'k-contact-1', 'Anna', 'anna@example.test', '', '', 'Need a quote', 'en')),
  false,
  'repeat contact idempotency_key created=false'
);
select is(
  (select count(*)::int from public.contact_submissions where idempotency_key = 'k-contact-1'),
  1,
  'one contact row for the key'
);

select is(
  (select pg_get_function_result(
     'public.submit_contact_message(text,text,citext,text,text,text,text)'::regprocedure)),
  'TABLE(id uuid, created boolean)',
  'contact RPC returns only id, created'
);

select throws_ok(
  $$ insert into public.contact_submissions (idempotency_key, name, email, message)
     values ('k-long', 'A', 'a@example.test', repeat('x', 4001)) $$,
  '23514',
  null,
  'over-long message fails check'
);

select is(
  (select created from public.submit_contact_message(
     'k-contact-fresh', 'A', 'a2@example.test', '', '', 'Hi', 'de')),
  true,
  'fresh contact created=true'
);

select finish();
rollback;

-- support_tickets.test.sql
-- Phase 12: no support_tickets table; five statuses; unique reply_token; FORCE RLS; anon 42501.

begin;
select plan(20);

select hasnt_table('public', 'support_tickets', 'no support_tickets table');
select has_table('public', 'support_messages', 'support_messages exists');
select has_table('public', 'support_inbound_events', 'support_inbound_events exists');

select has_index(
  'public', 'contact_submissions', 'contact_submissions_reply_token_key',
  'unique reply_token'
);

select ok(
  (select c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'contact_submissions'),
  'FORCE RLS on contact_submissions'
);
select ok(
  (select c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'support_messages'),
  'FORCE RLS on support_messages'
);
select ok(
  (select c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'support_inbound_events'),
  'FORCE RLS on support_inbound_events'
);

select ok(
  (
    select pg_get_constraintdef(oid) like '%responded%'
      from pg_constraint
     where conname = 'contact_submissions_ticket_status_check'
       and conrelid = 'public.contact_submissions'::regclass
  ),
  'ticket_status CHECK includes responded'
);

select table_privs_are('public', 'support_messages', 'anon', '{}'::text[], 'anon no table priv support_messages');
select table_privs_are('public', 'support_inbound_events', 'anon', '{}'::text[], 'anon no table priv support_inbound_events');

set local role anon;
select throws_ok(
  $$ insert into public.contact_submissions (idempotency_key, name, email, message)
     values ('k-support-direct', 'A', 'a@example.test', 'hello') $$,
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
select throws_ok(
  $$ insert into public.support_messages (submission_id, direction, body_text)
     values ('00000000-0000-0000-0000-000000000001', 'inbound_form', 'x') $$,
  '42501',
  null,
  'anon cannot INSERT support_messages'
);
select throws_ok(
  $$ select * from public.support_messages $$,
  '42501',
  null,
  'anon cannot SELECT support_messages'
);
select throws_ok(
  $$ insert into public.support_inbound_events (email_id) values ('evt-anon') $$,
  '42501',
  null,
  'anon cannot INSERT support_inbound_events'
);
select throws_ok(
  $$ select * from public.support_inbound_events $$,
  '42501',
  null,
  'anon cannot SELECT support_inbound_events'
);
select lives_ok(
  $$ select * from public.submit_contact_message(
       'k-support-1', 'Anna', 'anna-support@example.test', '', '', 'Need a quote', 'en') $$,
  'anon can call submit_contact_message'
);
reset role;

select is(
  (select ticket_status from public.contact_submissions where idempotency_key = 'k-support-1'),
  'new',
  'submit_contact_message sets ticket_status new'
);
select is(
  (select count(*)::int
     from public.support_messages m
     join public.contact_submissions s on s.id = m.submission_id
    where s.idempotency_key = 'k-support-1'
      and m.direction = 'inbound_form'),
  1,
  'submit_contact_message seeds one inbound_form message'
);
select is(
  (select created from public.submit_contact_message(
     'k-support-1', 'Anna', 'anna-support@example.test', '', '', 'Need a quote', 'en')),
  false,
  'repeat support idempotency_key created=false'
);

select finish();
rollback;

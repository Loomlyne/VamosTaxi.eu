-- staff_quote_rate_book_execute.test.sql
--
-- Phase 26.2 (unit 10, finding A3). vamos_staff may execute quote_rate_book, so the
-- dashboard price preview works when no draft price book row exists. The grant adds
-- nothing for authenticated or vamos_system. Nothing is written.
begin;
select plan(4);

select function_privs_are(
  'public', 'quote_rate_book', '{bool}'::text[], 'vamos_staff', '{EXECUTE}'::text[],
  'quote_rate_book: vamos_staff holds EXECUTE'
);
select function_privs_are(
  'public', 'quote_rate_book', '{bool}'::text[], 'authenticated', '{}'::text[],
  'quote_rate_book: authenticated holds no EXECUTE'
);
select function_privs_are(
  'public', 'quote_rate_book', '{bool}'::text[], 'vamos_system', '{}'::text[],
  'quote_rate_book: vamos_system holds no EXECUTE'
);

set local role vamos_staff;
select lives_ok(
  $$ select public.quote_rate_book(true) $$,
  'quote_rate_book(true) runs as vamos_staff'
);
reset role;

select * from finish();
rollback;

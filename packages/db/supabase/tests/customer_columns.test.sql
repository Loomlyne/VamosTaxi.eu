-- customer_columns.test.sql
--
-- Proves the column-scoped grant/policy pair on customers (D-02): authenticated can select and
-- update only the customer-facing subset; `note`/`type`/`erased_at` are staff-eyes-only
-- regardless of row ownership (grant layer), and another customer's row is invisible/unwritable
-- regardless of column (policy layer).
begin;
select plan(10);

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('c0000000-0000-0000-0000-00000000000a', 'cc-a@example.test', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('c0000000-0000-0000-0000-00000000000b', 'cc-b@example.test', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now());

update public.customers
   set full_name = 'Customer A', email = 'cc-cust-a@example.test', phone = '+41 00 000 00 01', note = 'Invoiced monthly'
 where user_id = 'c0000000-0000-0000-0000-00000000000a';
update public.customers
   set full_name = 'Customer B', email = 'cc-cust-b@example.test', phone = '+41 00 000 00 02', note = 'Nothing special'
 where user_id = 'c0000000-0000-0000-0000-00000000000b';

create temporary table fx as
select (select id from public.customers where email = 'cc-cust-a@example.test') as cust_a,
       (select id from public.customers where email = 'cc-cust-b@example.test') as cust_b;
-- Temp tables default to owner-only privileges; the role switch below needs to read it too.
grant select on fx to public;

set local role authenticated;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'c0000000-0000-0000-0000-00000000000a', 'role', 'authenticated', 'aal', 'aal2')::text,
  true);

select is(
  (select full_name from public.customers),
  'Customer A',
  '(1) authenticated as A selects full_name and gets exactly A''s row'
);
select throws_ok(
  $$ select note from public.customers $$,
  '42501', null,
  '(2) authenticated cannot select customers.note (grant layer)'
);
select throws_ok(
  $$ select erased_at from public.customers $$,
  '42501', null,
  '(3) authenticated cannot select customers.erased_at (grant layer)'
);

select lives_ok(
  $$ update public.customers set phone = '+41 00 000 00 00' where user_id = (select app.uid()) $$,
  '(4) authenticated can update customers.phone on A''s own row'
);
select throws_ok(
  $$ update public.customers set type = 'corporate' where user_id = (select app.uid()) $$,
  '42501', null,
  '(5) authenticated cannot update customers.type (grant layer)'
);
select throws_ok(
  $$ update public.customers set erased_at = now() where user_id = (select app.uid()) $$,
  '42501', null,
  '(6) authenticated cannot update customers.erased_at (grant layer)'
);

-- A data-modifying CTE must be the top-level statement, not a scalar subquery -- materialize the
-- row count into a temp table first, then assert on that.
create temporary table upd_b_result as
with upd as (
  update public.customers set full_name = 'Hijacked' where id = (select cust_b from fx) returning 1
) select count(*) as n from upd;
select is(
  (select n from upd_b_result)::int,
  0,
  '(7) authenticated updating B''s row by id affects 0 rows (policy layer, not grant)'
);
reset role;

select is(
  (select phone from public.customers where id = (select cust_a from fx)),
  '+41 00 000 00 00',
  '(8) A''s phone update from (4) actually persisted'
);

-- customers' SELECT and UPDATE grants to authenticated are both COLUMN-scoped (D-02), and
-- has_table_privilege() -- what table_privs_are checks -- only reports a WHOLE-TABLE grant, so
-- the correct expectation here is zero table-level privileges. The column-scoped grant itself
-- is proved by (1)/(4) above and by column_privs_are below.
select table_privs_are(
  'public', 'customers', 'authenticated', array[]::text[],
  '(9) authenticated holds zero WHOLE-TABLE privileges on customers -- its SELECT/UPDATE are column-scoped'
);
select column_privs_are(
  'public', 'customers', 'note', 'authenticated', array[]::text[],
  '(10) authenticated holds zero privileges on customers.note'
);

select * from finish();
rollback;

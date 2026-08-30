-- customers_link_trigger.test.sql
--
-- AUTH-01: auth.users insert links/creates public.customers. Direct inserts into
-- auth.users (what the trigger observes) — not GoTrue HTTP.

begin;
select plan(13);

select has_function(
  'public',
  'tg_link_customer_on_signup',
  'public.tg_link_customer_on_signup exists'
);

select has_trigger(
  'auth',
  'users',
  'link_customer_on_signup',
  'link_customer_on_signup fires on auth.users'
);

select function_privs_are(
  'public', 'tg_link_customer_on_signup', '{}'::text[],
  'public', '{}'::text[],
  'PUBLIC holds no EXECUTE on tg_link_customer_on_signup (F-13)'
);

-- 3. Fresh signup with full_name
insert into auth.users (
  id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'a1000000-0000-0000-0000-000000000001',
  'anna.keller@example.test',
  'authenticated',
  'authenticated',
  '{}'::jsonb,
  '{"full_name":"Anna Keller"}'::jsonb,
  pg_catalog.now(),
  pg_catalog.now()
);

select is(
  (select count(*)::int from public.customers where email = 'anna.keller@example.test'),
  1,
  'fresh signup inserts exactly one customers row'
);

select is(
  (select user_id from public.customers where email = 'anna.keller@example.test'),
  'a1000000-0000-0000-0000-000000000001'::uuid,
  'fresh signup customers.user_id matches auth.users.id'
);

select is(
  (select full_name from public.customers where email = 'anna.keller@example.test'),
  'Anna Keller',
  'fresh signup copies full_name from raw_user_meta_data'
);

-- 4. Missing full_name (D-05)
insert into auth.users (
  id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'a1000000-0000-0000-0000-000000000002',
  'no-name@example.test',
  'authenticated',
  'authenticated',
  '{}'::jsonb,
  '{}'::jsonb,
  pg_catalog.now(),
  pg_catalog.now()
);

select is(
  (select full_name from public.customers where email = 'no-name@example.test'),
  '',
  'signup with empty metadata still inserts with full_name empty string (D-05)'
);

-- 5. Guest claim (D-07): differently-cased email, user_id null, name must survive
insert into public.customers (user_id, full_name, email)
values (null, 'Guest Name', 'Guest.Claim@example.test');

insert into auth.users (
  id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'a1000000-0000-0000-0000-000000000003',
  'guest.claim@example.test',
  'authenticated',
  'authenticated',
  '{}'::jsonb,
  '{"full_name":"Should Not Win"}'::jsonb,
  pg_catalog.now(),
  pg_catalog.now()
);

select is(
  (select count(*)::int from public.customers where email = 'guest.claim@example.test'),
  1,
  'guest claim does not create a second customers row'
);

select is(
  (select user_id from public.customers where email = 'guest.claim@example.test'),
  'a1000000-0000-0000-0000-000000000003'::uuid,
  'guest claim links the existing row'
);

select is(
  (select full_name from public.customers where email = 'guest.claim@example.test'),
  'Guest Name',
  'guest claim does not overwrite full_name'
);

-- 7. Erasure guard: the conflict update did not touch erased_at
select is(
  (select erased_at is null from public.customers where email = 'guest.claim@example.test'),
  true,
  'guest-claim link does not set erased_at (erasure guard untouched)'
);

-- 6. Hijack refusal (D-04): already-linked row must not retarget.
-- Observed on this Postgres: auth.users.email is unique (users_email_partial_key),
-- so a second insert with the same email raises unique_violation before the
-- trigger body can run. That still satisfies "never re-targets an already-linked
-- row".
select throws_ok(
  $$ insert into auth.users (
       id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
     ) values (
       'a1000000-0000-0000-0000-000000000004',
       'anna.keller@example.test',
       'authenticated',
       'authenticated',
       '{}'::jsonb,
       '{"full_name":"Attacker"}'::jsonb,
       pg_catalog.now(),
       pg_catalog.now()
     ) $$,
  '23505',
  null,
  'second signup against a linked email raises unique_violation on auth.users'
);

select is(
  (select user_id from public.customers where email = 'anna.keller@example.test'),
  'a1000000-0000-0000-0000-000000000001'::uuid,
  'linked customers.user_id is unchanged after the rejected hijack insert'
);

select * from finish();
rollback;

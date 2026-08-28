-- cross_claim.test.sql
--
-- Proves DATA-06's SQL half (D-19/F3): the §14a policy on public.bookings, as actually
-- committed in packages/db/supabase/migrations/20260823000021_rls_customer.sql --
--
--   create policy bookings_select_own on public.bookings
--     for select to authenticated
--     using ((select app.uid()) is not null
--            and customer_id in (select c.id from public.customers c where c.user_id = (select app.uid())));
--
-- -- keys off `customers.user_id = app.uid()`, never a direct comparison of bookings' own
-- `customer_id` foreign-key column against the claim. The JWT `sub` is the auth user
-- (auth.users.id / customers.user_id), not a bookings row id, and a claim for customer A must
-- never satisfy the predicate for B's bookings no matter how many rows either customer holds.
-- Three bookings per customer (not one) so a bug that returns "the first row" instead of "the
-- caller's own rows" has more than one row to fail to hide.
--
-- Also carries the D-32 enumerator (research U1): if Phase 2's managed-Supabase grant probe
-- had ever fired its `vamos_customer` fallback, every `to authenticated` in
-- ...21_rls_customer.sql would have become `to vamos_customer` -- and
-- packages/db/src/identity.ts's `PG_ROLE.customer` would need to follow. This file's own
-- literal 'authenticated' below IS `PG_ROLE.customer`'s committed value; a desync between the
-- two fails loudly here instead of silently serving the wrong role's rows.
begin;
select plan(5);

-- Fixtures ------------------------------------------------------------------------------------
insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('c0000000-0000-0000-0000-00000000000a', 'cc-a@example.test', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('c0000000-0000-0000-0000-00000000000b', 'cc-b@example.test', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now());

update public.customers
   set full_name = 'Cross Claim A', email = 'cc-cust-a@example.test'
 where user_id = 'c0000000-0000-0000-0000-00000000000a';
update public.customers
   set full_name = 'Cross Claim B', email = 'cc-cust-b@example.test'
 where user_id = 'c0000000-0000-0000-0000-00000000000b';

-- Three bookings each, disjoint VT-YY-#### references allocated by the real
-- public.next_booking_reference() (this file runs as `postgres`, which owns that function and
-- may call it via the column DEFAULT regardless of its EXECUTE grant). Every price column left
-- NULL -- D-21, Law 04: never invent a CHF figure to make a fixture look complete.
insert into public.bookings (contact_name, contact_email, customer_id)
select 'Cross Claim A1', 'cc-a1@example.test', c.id from public.customers c where c.email = 'cc-cust-a@example.test';
insert into public.bookings (contact_name, contact_email, customer_id)
select 'Cross Claim A2', 'cc-a2@example.test', c.id from public.customers c where c.email = 'cc-cust-a@example.test';
insert into public.bookings (contact_name, contact_email, customer_id)
select 'Cross Claim A3', 'cc-a3@example.test', c.id from public.customers c where c.email = 'cc-cust-a@example.test';
insert into public.bookings (contact_name, contact_email, customer_id)
select 'Cross Claim B1', 'cc-b1@example.test', c.id from public.customers c where c.email = 'cc-cust-b@example.test';
insert into public.bookings (contact_name, contact_email, customer_id)
select 'Cross Claim B2', 'cc-b2@example.test', c.id from public.customers c where c.email = 'cc-cust-b@example.test';
insert into public.bookings (contact_name, contact_email, customer_id)
select 'Cross Claim B3', 'cc-b3@example.test', c.id from public.customers c where c.email = 'cc-cust-b@example.test';

-- Capture each customer's ground-truth reference set as `postgres` (BYPASSRLS) so the
-- assertions below compare against a known set, not against whatever a role switch happens to
-- see -- that would make the test self-referential.
create temporary table refs as
select c.email as owner_email, b.reference
  from public.bookings b join public.customers c on c.id = b.customer_id
 where c.email in ('cc-cust-a@example.test', 'cc-cust-b@example.test');
-- Temp tables default to owner-only privileges; the role switches below need to read it too.
grant select on refs to public;

-- As authenticated with A's claims ----------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'c0000000-0000-0000-0000-00000000000a', 'role', 'authenticated', 'aal', 'aal2')::text,
  true);

select is(
  (select array_agg(reference order by reference) from public.bookings),
  (select array_agg(reference order by reference) from refs where owner_email = 'cc-cust-a@example.test'),
  '(1) authenticated as customer A sees exactly A''s 3 references, nothing else'
);
select is(
  (select count(*) from public.bookings
     where reference in (select reference from refs where owner_email = 'cc-cust-b@example.test'))::int,
  0,
  '(2) A sees zero of B''s 3 references -- keyed on customers.user_id, never bookings'' own FK column'
);
reset role;

-- As authenticated with B's claims, swapped ---------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'c0000000-0000-0000-0000-00000000000b', 'role', 'authenticated', 'aal', 'aal2')::text,
  true);

select is(
  (select array_agg(reference order by reference) from public.bookings),
  (select array_agg(reference order by reference) from refs where owner_email = 'cc-cust-b@example.test'),
  '(3) authenticated as customer B sees exactly B''s 3 references, nothing else'
);
select is(
  (select count(*) from public.bookings
     where reference in (select reference from refs where owner_email = 'cc-cust-a@example.test'))::int,
  0,
  '(4) B sees zero of A''s 3 references -- B''s claim never satisfies A''s row'
);
reset role;

-- D-32 enumerator: the two customer-identity policies on public.bookings are granted to
-- exactly the literal 'authenticated' below -- the same string identity.ts's PG_ROLE.customer
-- resolves to today. A rename that only touches one side of that pair fails here instead of
-- silently desyncing the wrapper from the policy.
select set_eq(
  $$ select distinct unnest(roles)::text from pg_policies
      where schemaname = 'public' and tablename = 'bookings'
        and policyname in ('bookings_select_own', 'bookings_require_identity') $$,
  $$ values ('authenticated') $$,
  '(5) D-32: bookings_select_own/bookings_require_identity are granted to exactly "authenticated" (PG_ROLE.customer)'
);

select * from finish();
rollback;

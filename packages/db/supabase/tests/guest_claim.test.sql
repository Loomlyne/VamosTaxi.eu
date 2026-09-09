-- guest_claim.test.sql
--
-- D-39: no new RPC. Guest checkout stores customers.user_id null.
-- Verified signup claims via AUTH-01 tg_link_customer_on_signup
-- (packages/db/supabase/migrations/20260828000001_customers_auth_link.sql).
-- Conflict branch sets user_id only when null. Hosted apply not required.

begin;
select plan(2);

select has_function(
  'public',
  'tg_link_customer_on_signup',
  'guest claim trigger exists (AUTH-01 / D-39)'
);

select has_trigger(
  'auth',
  'users',
  'link_customer_on_signup',
  'link_customer_on_signup fires on auth.users'
);

select * from finish();
rollback;

-- 20260828000001_customers_auth_link.sql
--
-- AUTH-01 / D-04 / D-05 / D-07.
--
-- Phase 2 left customers.user_id nullable and unique, with a partial unique
-- index on email where erased_at is null, and no link from auth.users. This
-- trigger is that link. It runs inside GoTrue's own insert transaction, so a
-- network disconnect after signUp() resolves cannot leave an auth.users row with no
-- customers row — every RLS policy that joins through customers.user_id would
-- otherwise be inert.
--
-- Additive only: one function, one trigger, one revoke. No index (the conflict
-- target already exists). No ALTER TABLE. No RLS change.

create or replace function public.tg_link_customer_on_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- new.email on auth.users is text; public.customers.email is extensions.citext.
  -- The implicit cast is what makes the conflict target match case-insensitively,
  -- which is the mechanism D-07 relies on to link a guest row created from a
  -- differently-cased checkout email.
  insert into public.customers (user_id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (email) where erased_at is null
  do update
    set user_id = excluded.user_id,
        updated_at = pg_catalog.now()
    where public.customers.user_id is null;
  return new;
end;
$$;

revoke all on function public.tg_link_customer_on_signup() from public;

create trigger link_customer_on_signup
  after insert on auth.users
  for each row
  execute function public.tg_link_customer_on_signup();

comment on function public.tg_link_customer_on_signup() is
  'AUTH-01 D-04/D-05/D-07: after insert on auth.users, upsert public.customers by email. Conflict branch sets user_id only when it is null — never re-targets an already-linked row. full_name coalesces to empty string so the not-null column never blocks signup.';

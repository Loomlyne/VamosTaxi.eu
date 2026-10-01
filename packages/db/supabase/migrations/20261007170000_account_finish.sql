-- 20261007170000_account_finish.sql
--
-- Phase 27.1 (27 D-37, owner answers 2026-10-01). The public sign-in link now makes the account for a
-- new address; after confirming, that account must "finish" (name, optional phone, the account tick)
-- before it is used. Only accounts the sign-in link made are ever asked, and the answer is kept by
-- user id in a table the customer cannot write, so a later e-mail change, a checkout account or a
-- sign-up account is never sent to the finish step.
--
-- Additive only: one new table, three SECURITY DEFINER functions for vamos_system. No existing row,
-- table or function is changed.

create table public.account_finish_pending (
  user_id      pg_catalog.uuid primary key references auth.users (id) on delete cascade,
  created_at   pg_catalog.timestamptz not null default pg_catalog.now(),
  finished_at  pg_catalog.timestamptz
);

alter table public.account_finish_pending enable row level security;
revoke all on table public.account_finish_pending from public, anon, authenticated;

comment on table public.account_finish_pending is
  'Phase 27.1: accounts the public sign-in link made for a new address. finished_at is set when the finish step stored the account tick. No role has a table grant; vamos_system reaches it only through the three definer functions.';

-- The sign-in link route calls this right after asking Supabase for the link, only when the address
-- had no account before. It marks a user that Supabase has just made (unconfirmed, made in the last
-- 10 minutes), never an older or confirmed one, so a race can never mark an existing customer.
create or replace function public.account_finish_mark(p_email pg_catalog.text)
returns void
language sql volatile security definer set search_path = ''
as $$
  insert into public.account_finish_pending (user_id)
  select u.id
    from auth.users as u
   where pg_catalog.lower(u.email::pg_catalog.text) = pg_catalog.lower(pg_catalog.btrim(p_email))
     and u.email_confirmed_at is null
     and u.created_at > pg_catalog.now() - interval '10 minutes'
  on conflict (user_id) do nothing
$$;

create or replace function public.account_finish_required(p_user_id pg_catalog.uuid)
returns pg_catalog.bool
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.account_finish_pending as p
     where p.user_id = p_user_id
       and p.finished_at is null
  )
$$;

create or replace function public.account_finish_done(p_user_id pg_catalog.uuid)
returns void
language sql volatile security definer set search_path = ''
as $$
  update public.account_finish_pending
     set finished_at = pg_catalog.now()
   where user_id = p_user_id
     and finished_at is null
$$;

revoke all on function public.account_finish_mark(pg_catalog.text) from public;
revoke all on function public.account_finish_required(pg_catalog.uuid) from public;
revoke all on function public.account_finish_done(pg_catalog.uuid) from public;
grant execute on function public.account_finish_mark(pg_catalog.text) to vamos_system;
grant execute on function public.account_finish_required(pg_catalog.uuid) to vamos_system;
grant execute on function public.account_finish_done(pg_catalog.uuid) to vamos_system;

comment on function public.account_finish_mark(pg_catalog.text) is
  'Phase 27.1: marks the unconfirmed account the public sign-in link just made (last 10 minutes) as having to finish. vamos_system only.';
comment on function public.account_finish_required(pg_catalog.uuid) is
  'Phase 27.1: true while an account the sign-in link made has not finished. Boolean only. vamos_system only.';
comment on function public.account_finish_done(pg_catalog.uuid) is
  'Phase 27.1: the finish step stored the account tick; the account is finished. vamos_system only.';

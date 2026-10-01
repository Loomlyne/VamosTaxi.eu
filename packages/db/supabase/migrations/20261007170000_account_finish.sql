-- 20261007170000_account_finish.sql
--
-- Phase 27.1 (27 D-37, owner answers 2026-10-01). The public sign-in link now makes the account for a
-- new address; after confirming, that account must "finish" (name, optional phone, the account tick)
-- before it is used. Only accounts the sign-in link made are ever asked, and the answer is kept by
-- user id in a table the customer cannot write, so a later e-mail change, a checkout account or a
-- sign-up account is never sent to the finish step.
--
-- Additive only: one new table and three SECURITY DEFINER functions for vamos_system. No existing
-- row, table or function is changed.

create table public.account_finish_pending (
  user_id      pg_catalog.uuid primary key references auth.users (id) on delete cascade,
  created_at   pg_catalog.timestamptz not null default pg_catalog.now(),
  finished_at  pg_catalog.timestamptz
);

alter table public.account_finish_pending enable row level security;
revoke all on table public.account_finish_pending from public, anon, authenticated;

comment on table public.account_finish_pending is
  'Phase 27.1: accounts the public sign-in link made for a new address. finished_at is set when the finish step stored the account tick. No role has a table grant; vamos_system reaches it only through the three definer functions.';

-- The sign-in link route calls this right after every successful public link request. It marks only a
-- user that Supabase has just made for that link: unconfirmed, made in the last 10 minutes, and with no
-- account agreement row for the address (a /sign-up or checkout account always has one). An older,
-- confirmed or agreed account is never marked.
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
     and not exists (
       select 1 from public.account_agreement_records as r
        where pg_catalog.lower(r.email) = pg_catalog.lower(u.email::pg_catalog.text)
     )
  on conflict (user_id) do nothing
$$;

create or replace function public.account_finish_required(p_user_id pg_catalog.uuid)
returns pg_catalog.bool
language sql stable security definer set search_path = ''
as $$
  -- An agreement row for the account's address counts as finished too (someone who ticked on /sign-up
  -- after asking for a link is never asked a second time).
  select exists (
    select 1 from public.account_finish_pending as p
      join auth.users as u on u.id = p.user_id
     where p.user_id = p_user_id
       and p.finished_at is null
       and not exists (select 1 from public.staff as st where st.user_id = p_user_id)
       and not exists (
         select 1 from public.account_agreement_records as r
          where pg_catalog.lower(r.email) = pg_catalog.lower(u.email::pg_catalog.text)
       )
  )
$$;

-- The finish step stored the tick: the account is finished, and the name and the optional mobile
-- number go onto the customer row (the dashboard's customer list and checkout's prefill read it).
-- An empty p_phone keeps the row's phone.
create or replace function public.account_finish_done(
  p_user_id   pg_catalog.uuid,
  p_full_name pg_catalog.text,
  p_phone     pg_catalog.text
)
returns void
language sql volatile security definer set search_path = ''
as $$
  update public.account_finish_pending
     set finished_at = pg_catalog.now()
   where user_id = p_user_id
     and finished_at is null;
  update public.customers
     set full_name = pg_catalog.left(pg_catalog.btrim(coalesce(p_full_name, '')), 161),
         phone = coalesce(nullif(pg_catalog.btrim(coalesce(p_phone, '')), ''), phone),
         updated_at = pg_catalog.now()
   where user_id = p_user_id
     and erased_at is null
     and pg_catalog.btrim(coalesce(p_full_name, '')) <> '';
$$;

revoke all on function public.account_finish_mark(pg_catalog.text) from public;
revoke all on function public.account_finish_required(pg_catalog.uuid) from public;
revoke all on function public.account_finish_done(pg_catalog.uuid, pg_catalog.text, pg_catalog.text) from public;
grant execute on function public.account_finish_mark(pg_catalog.text) to vamos_system;
grant execute on function public.account_finish_required(pg_catalog.uuid) to vamos_system;
grant execute on function public.account_finish_done(pg_catalog.uuid, pg_catalog.text, pg_catalog.text) to vamos_system;

comment on function public.account_finish_mark(pg_catalog.text) is
  'Phase 27.1: marks the unconfirmed account the public sign-in link just made (last 10 minutes) as having to finish. vamos_system only.';
comment on function public.account_finish_required(pg_catalog.uuid) is
  'Phase 27.1: true while an account the sign-in link made has not finished. Boolean only. vamos_system only.';
comment on function public.account_finish_done(pg_catalog.uuid, pg_catalog.text, pg_catalog.text) is
  'Phase 27.1: the finish step stored the account tick; the account is finished and its name and optional phone are copied onto public.customers. vamos_system only.';

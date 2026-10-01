-- 20261007170000_account_finish.sql
--
-- Phase 27.1 (27 D-37, owner answers 2026-10-01). The sign-in link now makes an account for a new
-- address; after confirming, that account must "finish" (name, optional phone, the account tick)
-- before it is used. Who must finish is decided here, from rows the customer cannot write.
--
-- Additive only: one column with a default, one SECURITY DEFINER reader. No row is changed and no
-- existing function body is touched.

-- ---------------------------------------------------------------------------
-- 1. When finishing starts
-- ---------------------------------------------------------------------------

alter table public.settings
  add column account_finish_since pg_catalog.timestamptz not null default pg_catalog.now();

comment on column public.settings.account_finish_since is
  'Phase 27.1: accounts made from this moment (the migration''s apply time) without an account agreement row must finish. Older accounts are never asked.';

-- ---------------------------------------------------------------------------
-- 2. Must this account finish?
-- ---------------------------------------------------------------------------

create or replace function public.account_finish_required(p_user_id pg_catalog.uuid)
returns pg_catalog.bool
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select u.created_at >= s.account_finish_since
           and not exists (select 1 from public.staff as st where st.user_id = u.id)
           and not exists (
             select 1 from public.account_agreement_records as r
              where pg_catalog.lower(r.email) = pg_catalog.lower(u.email::pg_catalog.text)
           )
      from auth.users as u
      cross join public.settings as s
     where u.id = p_user_id
       and s.id = 1
       and u.email is not null
  ), false)
$$;

revoke all on function public.account_finish_required(pg_catalog.uuid) from public;
grant execute on function public.account_finish_required(pg_catalog.uuid) to vamos_system;
comment on function public.account_finish_required(pg_catalog.uuid) is
  'Phase 27.1: true when the account was made after settings.account_finish_since, is not staff and its e-mail has no account_agreement_records row. Boolean only. vamos_system only.';

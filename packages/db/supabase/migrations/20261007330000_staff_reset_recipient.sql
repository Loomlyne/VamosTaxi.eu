-- 20261007330000_staff_reset_recipient.sql
--
-- 261005 sign-up safety (review, controller decision): forgot-password on the dashboard host
-- (dashboard.vamostaxi.site) asks for no check and mailed a reset link to ANY customer address.
-- The send-email hook now mails a recovery link that was asked for through the dashboard host only when
-- the address belongs to an active staff row. This is the one question it needs answered: a boolean for
-- an e-mail, nothing else (no user id, no role, no name).
--
-- Why a function: public.staff holds no e-mail (it is auth.users.email) and no Worker role may read
-- either table, so the join has to be a SECURITY DEFINER read, the same shape as
-- public.checkout_account_user_state (26.5). vamos_system only: the Worker calls it through asSystem;
-- anon, authenticated and PUBLIC hold nothing, so REST cannot ask who is staff. service_role (the
-- server key, Supabase's default grant) is left as it is.
--
-- "Active" is the same word as everywhere else: staff.active. An invitation that is not yet accepted
-- still counts (the person owns that address and only sets a password with the link; the claim step
-- and the aal2 rule still stand in front of every dashboard action).
--
-- Function only: no table, row, policy or other grant changes. No CHF amount.
-- One transaction: apply it verbatim as a whole (connector apply_migration).
begin;

create or replace function public.staff_active_for_email(p_email pg_catalog.text)
returns pg_catalog.bool
language sql stable security definer set search_path = ''
as $$
  select coalesce(pg_catalog.bool_or(s.active), false)
    from public.staff as s
    join auth.users as u on u.id = s.user_id
   where p_email is not null
     and pg_catalog.lower(u.email::pg_catalog.text) = pg_catalog.lower(pg_catalog.btrim(p_email))
$$;

revoke all on function public.staff_active_for_email(pg_catalog.text) from public, anon, authenticated;
grant execute on function public.staff_active_for_email(pg_catalog.text) to vamos_system;

comment on function public.staff_active_for_email(pg_catalog.text) is
  'True while an e-mail belongs to an ACTIVE staff row (auth.users joined to staff), false for every other address. Boolean only. vamos_system only. The send-email hook uses it to mail dashboard recovery links to staff only.';

commit;

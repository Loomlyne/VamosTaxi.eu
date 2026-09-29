-- 20260928180000_staff_aal2_when_enrolled.sql
--
-- INT-09 / D-16 / D-16a / audit S1. Supersedes the "MFA is paused" note in
-- 20260901000001: the second factor is optional, but once the caller has a
-- verified factor in auth.mfa_factors, every staff check requires aal2.
--
--   * No verified factor  -> aal1 (password or magic link) is accepted (D-16).
--   * Verified factor     -> only an aal2 session is staff (D-16a). A phished
--                            password alone no longer opens any staff RLS gate.
--   * Unverified factor   -> ignored, so a half-finished enrolment cannot lock
--                            the admin out (T-26.1-64).
--
-- Because every *_staff_gate policy is RESTRICTIVE and calls app.is_staff(),
-- the rule applies to every staff table read and write, on every request, not
-- only at sign-in. The app mirrors it in lib/ops/staff-gate.ts.

create or replace function app.is_staff() returns boolean
  language sql stable security definer set search_path = '' as $$
  select coalesce(app.jwt() -> 'app_metadata' ->> 'vamos_role', '') in ('dispatcher','admin')
     and exists (
       select 1
         from public.staff s
        where s.user_id = app.uid()
          and s.active
          and s.accepted_at is not null
     )
     and (
       coalesce(app.jwt() ->> 'aal', 'aal1') = 'aal2'
       or not exists (
         select 1
           from auth.mfa_factors f
          where f.user_id = app.uid()
            and f.status = 'verified'
       )
     )
$$;

create or replace function app.is_admin() returns boolean
  language sql stable security definer set search_path = '' as $$
  select coalesce(app.jwt() -> 'app_metadata' ->> 'vamos_role', '') = 'admin'
     and exists (
       select 1
         from public.staff s
        where s.user_id = app.uid()
          and s.active
          and s.accepted_at is not null
     )
     and (
       coalesce(app.jwt() ->> 'aal', 'aal1') = 'aal2'
       or not exists (
         select 1
           from auth.mfa_factors f
          where f.user_id = app.uid()
            and f.status = 'verified'
       )
     )
$$;

comment on function app.is_staff() is
  'D-05/D-16a: staff role claim + active accepted staff row + (aal2, or no verified factor in auth.mfa_factors).';
comment on function app.is_admin() is
  'D-05/D-16a: admin role claim + active accepted staff row + (aal2, or no verified factor in auth.mfa_factors).';

-- ---------------------------------------------------------------------------
-- staff.sign_in_method: the admin's chosen first-factor method (D-16a).
-- Stored server-side so the sign-in route can enforce it (26.1-22).
-- ---------------------------------------------------------------------------

alter table public.staff
  add column if not exists sign_in_method text not null default 'password';

alter table public.staff
  add constraint staff_sign_in_method_check
  check (sign_in_method in ('password', 'magic_link'));

comment on column public.staff.sign_in_method is
  'D-16a: how this staff member signs in — password or magic_link. Set by the admin for their own row via public.staff_set_sign_in_method.';

create or replace function public.staff_set_sign_in_method(p_method text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  -- Admin only (D-16), and app.is_admin() already requires aal2 once a factor
  -- is verified (D-16a), so a phished password cannot flip the method.
  if not coalesce(app.is_admin(), false) then
    raise exception 'staff_set_sign_in_method requires an admin session'
      using errcode = 'insufficient_privilege';
  end if;

  if p_method is null or p_method not in ('password', 'magic_link') then
    raise exception 'sign-in method must be password or magic_link'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.staff
     set sign_in_method = p_method
   where user_id = app.uid();

  if not found then
    raise exception 'staff row not found for caller'
      using errcode = 'no_data_found';
  end if;
end;
$$;

comment on function public.staff_set_sign_in_method(text) is
  'D-16a: the admin sets their own sign-in method (password or magic_link). Self-scoped: updates only the caller''s row.';

revoke all on function public.staff_set_sign_in_method(text) from public, anon, authenticated;
grant execute on function public.staff_set_sign_in_method(text) to vamos_staff;

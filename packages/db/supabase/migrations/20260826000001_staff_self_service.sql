-- 20260826000001_staff_self_service.sql
--
-- D-07 / D-05 / AUTH-05: a dispatcher session reads zero rows from public.staff.
-- 20260823000023_rls_staff.sql creates staff_admin_write as AS RESTRICTIVE FOR ALL
-- to vamos_staff using ((select app.is_admin())) — restrictive, and FOR ALL, so it
-- ANDs against SELECT too. Widening that policy would reopen the door Phase 2 closed
-- ("a dispatcher must not be able to write public.staff"). Service-role writes would
-- land in audit_log as actor_kind='system' because tg_audit_row derives the actor
-- from app.uid(), which is NULL under service_role.
--
-- public.staff has no FORCE ROW LEVEL SECURITY (only the nine append-only tables in
-- …19_append_only.sql do), so a security-definer function owned by the table owner
-- bypasses RLS. Every statement in this file therefore carries its own
-- `where user_id = app.uid()` scope rather than leaning on a policy. Called from
-- inside asStaff, request.jwt.claims stays set so app.uid() / app.is_staff() resolve
-- and the audit row is attributed to the caller.

-- ---------------------------------------------------------------------------
-- (a) app.staff_self — read the caller's own staff row
-- ---------------------------------------------------------------------------

create or replace function app.staff_self()
returns table (
  user_id uuid,
  role public.staff_role,
  full_name text,
  phone text,
  lang text,
  avatar_path text,
  mfa_enrolled boolean,
  digest_email boolean,
  active boolean,
  invited_at timestamptz,
  accepted_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.user_id,
         s.role,
         s.full_name,
         s.phone,
         s.lang,
         s.avatar_path,
         s.mfa_enrolled,
         s.digest_email,
         s.active,
         s.invited_at,
         s.accepted_at
    from public.staff s
   where s.user_id = app.uid()
     and app.is_staff();
$$;

comment on function app.staff_self() is
  'OPS-09: dispatcher/admin read of their own public.staff row. invited_by is omitted (another staff member''s uuid is not the caller''s own data). Zero rows unless app.is_staff().';

revoke all on function app.staff_self() from public;
grant execute on function app.staff_self() to vamos_staff;

-- ---------------------------------------------------------------------------
-- (b) public.staff_update_self — edit the caller's own profile fields
-- ---------------------------------------------------------------------------

create or replace function public.staff_update_self(
  p_full_name text,
  p_phone text,
  p_lang text,
  p_digest_email boolean,
  p_avatar_path text
) returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not coalesce(app.is_staff(), false) then
    raise exception 'staff_update_self requires an active aal2 staff session'
      using errcode = 'insufficient_privilege';
  end if;

  -- Same four-value list as public.staff.lang CHECK (en, de, fr, ar); the CHECK
  -- is the real gate.
  if p_lang not in ('en', 'de', 'fr', 'ar') then
    raise exception 'lang must be one of en, de, fr, ar'
      using errcode = 'check_violation';
  end if;

  -- Privilege boundary: role, active, mfa_enrolled, invited_by, invited_at and
  -- accepted_at are never named in the SET list.
  update public.staff
     set full_name    = p_full_name,
         phone        = p_phone,
         lang         = p_lang,
         digest_email = p_digest_email,
         avatar_path  = p_avatar_path
   where user_id = app.uid();

  if not found then
    raise exception 'staff row not found for caller'
      using errcode = 'no_data_found';
  end if;
end;
$$;

comment on function public.staff_update_self(text, text, text, boolean, text) is
  'OPS-09 / D-07: self-scoped profile write. SET list is full_name, phone, lang, digest_email, avatar_path only — role, active, mfa_enrolled, invited_by, invited_at, accepted_at are the privilege boundary and are never named there.';

revoke all on function public.staff_update_self(text, text, text, boolean, text) from public;
grant execute on function public.staff_update_self(text, text, text, boolean, text) to vamos_staff;

-- ---------------------------------------------------------------------------
-- (c) public.staff_claim_invite — stamp accepted_at once and mfa_enrolled
-- ---------------------------------------------------------------------------

create or replace function public.staff_claim_invite()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not coalesce(app.is_staff(), false) then
    raise exception 'staff_claim_invite requires an active aal2 staff session'
      using errcode = 'insufficient_privilege';
  end if;

  update public.staff
     set accepted_at  = coalesce(accepted_at, now()),
         mfa_enrolled = true
   where user_id = app.uid();
end;
$$;

comment on function public.staff_claim_invite() is
  'AUTH-05 / D-05: self-scoped invite claim. accepted_at = coalesce(accepted_at, now()) so a second call cannot rewrite the original acceptance timestamp. Inherits app.is_staff() (aal2 + active row + vamos_role claim).';

revoke all on function public.staff_claim_invite() from public;
grant execute on function public.staff_claim_invite() to vamos_staff;

-- These three functions are the ONLY sanctioned write path into a non-admin staff
-- member's own row. A service-role write is forbidden: tg_audit_row would land in
-- audit_log as actor_kind='system', actor_id=null.

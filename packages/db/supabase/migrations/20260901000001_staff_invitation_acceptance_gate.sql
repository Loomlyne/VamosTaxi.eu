-- 20260901000001_staff_invitation_acceptance_gate.sql
--
-- An invited row is not console authorization. A staff role is minted only after
-- the invitee has completed their own aal2 acceptance. The claim RPC deliberately
-- does not call app.is_staff(): before acceptance there is no staff claim yet.

create or replace function app.is_staff() returns boolean
  language sql stable security definer set search_path = '' as $$
  select coalesce(app.jwt() -> 'app_metadata' ->> 'vamos_role', '') in ('dispatcher','admin')
     and coalesce(app.jwt() ->> 'aal', 'aal1') = 'aal2'
     and exists (
       select 1
         from public.staff s
        where s.user_id = app.uid()
          and s.active
          and s.accepted_at is not null
     )
$$;

create or replace function app.is_admin() returns boolean
  language sql stable security definer set search_path = '' as $$
  select coalesce(app.jwt() -> 'app_metadata' ->> 'vamos_role', '') = 'admin'
     and coalesce(app.jwt() ->> 'aal', 'aal1') = 'aal2'
     and exists (
       select 1
         from public.staff s
        where s.user_id = app.uid()
          and s.active
          and s.accepted_at is not null
     )
$$;

-- The token hook is the console's first gate: an active but unaccepted row
-- receives no vamos_role, so dashboard middleware serves /login.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable set search_path = '' as $$
declare claims jsonb; v_role text;
begin
  select s.role::text into v_role
    from public.staff s
   where s.user_id = (event->>'user_id')::uuid
     and s.active
     and s.accepted_at is not null;

  claims := event->'claims';
  claims := jsonb_set(
    claims,
    '{app_metadata}',
    coalesce(claims -> 'app_metadata', '{}'::jsonb) - 'vamos_role'
  );

  if v_role is not null then
    claims := jsonb_set(claims, '{app_metadata,vamos_role}', to_jsonb(v_role));
  end if;

  return jsonb_set(event, '{claims}', claims);
end; $$;

-- This is the only pre-acceptance bridge. It can update only app.uid()'s own
-- active row, requires aal2 itself, and preserves the first acceptance time.
create or replace function public.staff_claim_invite()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if coalesce(app.jwt() ->> 'aal', 'aal1') <> 'aal2'
     or not exists (
       select 1
         from public.staff s
        where s.user_id = app.uid()
          and s.active
     ) then
    raise exception 'staff_claim_invite requires an active aal2 invited session'
      using errcode = 'insufficient_privilege';
  end if;

  update public.staff
     set accepted_at  = coalesce(accepted_at, now()),
         mfa_enrolled = true
   where user_id = app.uid()
     and active;
end;
$$;

comment on function public.staff_claim_invite() is
  'Self-only acceptance bridge: active aal2 invitees may stamp accepted_at once before the token hook grants a staff role.';

revoke all on function public.staff_claim_invite() from public;
grant execute on function public.staff_claim_invite() to authenticated, vamos_staff;

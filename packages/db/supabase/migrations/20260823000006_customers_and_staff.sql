-- 20260823000006_customers_and_staff.sql
--
-- AUTH-05's SQL half: customers with the D-19 erasure guard, staff as the authoritative role
-- source, app.is_staff()/app.is_admin() (D-05), and the Custom Access Token Hook (D-04) with
-- F-19's bidirectional-authoritative fix and the supabase_auth_admin read policy the review
-- pass added.

create table public.customers (
  id           uuid primary key default extensions.gen_random_uuid(),
  -- Nullable: a guest books without an account (PAY-03) and may claim it later (AUTH-06).
  user_id      uuid unique references auth.users(id) on delete set null,
  full_name    text not null,
  email        extensions.citext not null,   -- schema-qualified: never depends on search_path
  phone        text not null default '',
  type         customer_type not null default 'private',
  company      text not null default '',
  since        date not null default current_date,
  note         text not null default '',
  -- Redact-in-place erasure. The row is never deleted while any FK'd booking is still
  -- inside the Swiss CO Art. 958f 10-year window (D-19).
  erased_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.customers is 'D-19: customers, with or without an auth account. Erasure redacts identifiers in place via tg_customers_erasure_guard; the row survives for the accounting record. No FK to customers anywhere in this schema uses ON DELETE CASCADE.';

create unique index customers_email_unique on public.customers (email) where erased_at is null;
create index customers_user_id on public.customers (user_id) where user_id is not null;

/**
 * Staff. The authoritative role source read by the Custom Access Token Hook on every
 * token mint, so revoking a staff member takes effect on their next token. Never
 * user_metadata: that is writable by the user themselves.                     (AUTH-05, D-04)
 */
create table public.staff (
  -- The one cascade in this migration, and it is correct: a deleted auth user cannot remain
  -- staff — there is no independent staff identity to preserve.
  user_id       uuid primary key references auth.users(id) on delete cascade,
  role          staff_role not null,
  full_name     text not null default '',
  phone         text not null default '',
  lang          text not null default 'en' check (lang in ('en','de','fr','ar')),
  avatar_path   text,
  -- UX gate only; the aal2 check in app.is_staff()/app.is_admin() below is the security (D-05).
  mfa_enrolled  boolean not null default false,
  digest_email  boolean not null default true,
  active        boolean not null default true,
  invited_by    uuid references auth.users(id) on delete set null,
  invited_at    timestamptz not null default now(),
  accepted_at   timestamptz
);
comment on table public.staff is 'Invitation-only ops accounts. Source of the app_metadata.vamos_role claim; active=false revokes on next token mint.';

/**
 * Staff authorisation (D-05, AUTH-05). Three independent conditions, all required:
 *  1. the verified JWT carries a staff app_metadata role                    (D-04)
 *  2. the session passed a second factor — enforced in SQL, not only in
 *     middleware, so a forgotten route guard is not a bypass                (AUTH-05)
 *  3. the staff row is still active — a JWT lives up to an hour, so this
 *     makes revocation immediate.
 * SECURITY DEFINER so vamos_staff needs no grant on public.staff.
 * D-04: reads app_metadata.vamos_role only — never user_metadata (user-writable).
 */
create or replace function app.is_staff() returns boolean
  language sql stable security definer set search_path = '' as $$
  select coalesce(app.jwt() -> 'app_metadata' ->> 'vamos_role', '') in ('dispatcher','admin')
     and coalesce(app.jwt() ->> 'aal', 'aal1') = 'aal2'
     and exists (select 1 from public.staff s where s.user_id = app.uid() and s.active)
$$;

create or replace function app.is_admin() returns boolean
  language sql stable security definer set search_path = '' as $$
  select coalesce(app.jwt() -> 'app_metadata' ->> 'vamos_role', '') = 'admin'
     and coalesce(app.jwt() ->> 'aal', 'aal1') = 'aal2'
     and exists (select 1 from public.staff s where s.user_id = app.uid() and s.active)
$$;

revoke all on function app.is_staff(), app.is_admin() from public;
grant execute on function app.is_staff(), app.is_admin() to vamos_staff;
-- `authenticated` also needs app.is_staff(): the Realtime authorization policy on
-- realtime.messages (§14f) runs as `authenticated`, because Realtime connects with the
-- staff member's JWT and never SET ROLEs into vamos_staff. The function only ever reports
-- on the caller's own verified JWT, so granting it wider is not a widening of data access.
grant execute on function app.is_staff() to authenticated;

/** `erased_at` is an erasure fact, not a profile field. A customer must never be able to set it
    (it would drop them out of `customers_email_unique`, letting the same person create a second
    row and splitting a decade of Art. 958f history) and must never be able to clear it
    (un-erasing a row Phase 10 redacted). The column-scoped grant in the RLS phase is the first
    gate; this trigger is the one that also binds a compromised ops session. */
-- SECURITY DEFINER because app.is_admin() is granted to vamos_staff only; an `authenticated`
-- session must be able to trip this guard without holding EXECUTE on it.
create or replace function public.tg_customers_erasure_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.erased_at is distinct from old.erased_at
     and not coalesce(app.is_admin(), false) then
    raise exception 'erased_at is set by the erasure routine, not by an ordinary update'
      using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

create trigger customers_erasure_guard before update on public.customers
  for each row execute function public.tg_customers_erasure_guard();

-- F-13 regression found while writing this migration: unlike a table, a newly created
-- FUNCTION in this Postgres does not pick up the ...02_roles_and_helpers.sql default-privilege
-- REVOKE at CREATE time (confirmed empirically: a scratch function created after re-running
-- that exact ALTER DEFAULT PRIVILEGES statement still shows a NULL catalog ACL, which resolves
-- to the hard-coded "PUBLIC has EXECUTE" default for functions specifically — proven safe here
-- only because a `returns trigger` function errors if invoked outside trigger context, but the
-- catalog-level invariant the pgTAP suite checks would still fail without an explicit revoke).
-- Every later plan creating a `public`/`app` function must add its own explicit
-- `revoke ... from public` rather than rely on the schema-level default-privilege statements.
revoke all on function public.tg_customers_erasure_guard() from public;

-- `trips` in the mock is a derived count, not a stored column — read it from bookings.

-- The hook runs AS `supabase_auth_admin`, which is not a superuser and does not carry BYPASSRLS.
-- RLS is enabled on public.staff in a later migration, so the grant alone is not enough: without
-- an explicit policy for this role the hook's SELECT matches no policy, returns zero rows, and
-- every staff JWT is minted with no `vamos_role` — app.is_staff() then returns false for
-- everybody and the entire ops console reads zero rows on day one, with no error to diagnose it
-- by (T-02-12). Supabase's own Custom Access Token Hook documentation requires exactly this
-- policy for exactly this reason. The `create policy` line belongs to the RLS-enablement
-- migration chronologically (RLS is not yet enabled on this table), but it ships here alongside
-- the grant it completes — a policy may be created before RLS is enabled on its table, and it is
-- inert until then; keeping the two together is what stops a future reader deleting one of them.
grant usage  on schema public       to supabase_auth_admin;
grant select on table public.staff  to supabase_auth_admin;
create policy staff_auth_admin_read on public.staff
  as permissive for select to supabase_auth_admin using (true);

/**
 * Custom Access Token Hook (D-04, AUTH-05). `set search_path = ''` is mandatory on a hook
 * function (Supabase hardening guidance): the hook executes on the auth server's connection,
 * whose search_path is not ours. Every name is therefore schema-qualified.
 *
 * F-19: the hook is authoritative in BOTH directions, not only additive. The draft's original
 * body only ever ADDED the claim when an active staff row existed, which means an inbound
 * `app_metadata.vamos_role` that GoTrue merged in from `auth.users.raw_app_meta_data` (a
 * tampered or stale value) would survive untouched for a user with no active staff row. No
 * escalation exists today because app.is_staff()/app.is_admin() re-check the `staff` row on
 * every call — but a future consumer that trusts the claim alone (Next middleware, a log
 * enricher, a Realtime policy written from the claim rather than a re-check) would inherit the
 * hole. So this hook first strips any inbound `app_metadata.vamos_role` unconditionally, THEN
 * conditionally re-adds it from the active `staff` row. `app.is_staff()` re-checking `staff` is
 * the belt; this unconditional strip is the braces.
 *
 * Never write the top-level `role` claim — its schema is constrained to `anon | authenticated`
 * and it is the *Postgres* role, not the app role.
 *
 * D-33: enabling the hook so the auth server actually invokes it is a dashboard setting
 * (Authentication → Hooks) confirmed against the live dashboard in Plan 02-10 (hosted) and the
 * config.toml edit below (local). pgTAP in this migration's companion test file proves only the
 * function itself.
 */
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable set search_path = '' as $$
declare claims jsonb; v_role text;
begin
  select s.role::text into v_role from public.staff s
   where s.user_id = (event->>'user_id')::uuid and s.active;

  claims := event->'claims';

  -- F-19: unconditional strip first — a stale or tampered app_metadata.vamos_role never
  -- survives a mint, regardless of whether an active staff row exists below.
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

grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

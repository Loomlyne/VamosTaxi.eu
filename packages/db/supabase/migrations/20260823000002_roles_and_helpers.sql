-- 20260823000002_roles_and_helpers.sql
--
-- The security boundary is the GRANT, not the claim (D-02). `vamos_edge` — the role
-- Hyperdrive logs in as for every identity-scoped query — owns nothing and is granted
-- nothing on any table; a query issued without the identity-setting transaction wrapper
-- raises `42501 insufficient_privilege`, it does not return the previous request's rows.
-- That is DATA-06 made structural, not merely tested.
--
-- Role creation below is wrapped in idempotent DO blocks because Postgres roles are
-- CLUSTER-level objects: `supabase db reset` drops and recreates the DATABASE, but the four
-- roles created here survive that drop, and a bare, unconditional `CREATE ROLE` on the
-- second reset would fail with "role already exists". Guarding on `pg_roles` is what makes a second
-- `supabase db reset` succeed.
--
-- `vamos_edge` and `vamos_public` are created with NO password clause: the Supabase CLI does
-- not expand psql `:'var'` substitution inside a migration file, so a literal password would
-- either commit a secret or fail to resolve at apply time. A role created with no password
-- cannot authenticate by password at all — fail-closed — until `ALTER ROLE ... PASSWORD ...`
-- is run out-of-band, per environment, once Phase 3 wires each role into a Hyperdrive
-- connection string. See packages/db/README.md "Role passwords". No secret literal ever
-- lands in this repo.

create schema if not exists app;

do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'vamos_guest') then
    create role vamos_guest nologin;   -- holder of a valid manage token          (DATA-03)
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'vamos_staff') then
    create role vamos_staff nologin;   -- dispatcher / admin                      (DATA-04)
  end if;
end $$;
-- anon and authenticated already exist on every Supabase database.

do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'vamos_edge') then
    -- The login role for identity-scoped queries. Zero privileges until it SET ROLEs.
    create role vamos_edge login noinherit;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'vamos_public') then
    -- The login role for the cached Hyperdrive config: public content only, no memberships.
    create role vamos_public login noinherit;
  end if;
end $$;

-- BINDING NOTE (Plan 02-06, amended before its Task 1): `CREATE ROLE` above implicitly makes
-- the executing role (recorded as grantor `supabase_admin` on this image, whichever role
-- actually runs `supabase db reset`'s migrations) a member of each new role with
-- `admin_option=true` but `set_option=false` — unlike `postgres`'s pre-existing membership in
-- `anon`/`authenticated`, which already carries `set_option=true`. Without SET, `set local role
-- vamos_edge|vamos_public|vamos_guest|vamos_staff` is refused with "permission denied to set
-- role" for every pgTAP test in this and later plans that needs to impersonate an app role
-- (this plan's charge-gate fixtures, Wave 8's seven RLS proofs). GRANT re-issued by the same
-- grantor merges into the existing membership row (verified empirically: admin_option is
-- preserved, only the unspecified/changed options move), so this is safe to leave unguarded
-- and re-run on every migration replay. Confirmed with
-- `select roleid::regrole, set_option from pg_auth_members where member='postgres'::regrole`
-- showing `set_option=t` for all four below, and a `set local role vamos_staff; select
-- current_user;` smoke inside a rolled-back transaction.
grant vamos_edge   to postgres with inherit false, set true;
grant vamos_public to postgres with inherit false, set true;
grant vamos_guest  to postgres with inherit false, set true;
grant vamos_staff  to postgres with inherit false, set true;

-- Memberships. INHERIT FALSE means vamos_edge does not automatically pick up these roles'
-- privileges just by holding membership; SET TRUE means it can still `SET ROLE` into each one
-- explicitly, inside the transaction the identity GUCs are set in (D-01).
grant anon to vamos_edge with inherit false, set true;

-- D-25/U1 fallback: if the hosted `postgres` role refuses this statement, create
-- `vamos_customer nologin` mirroring `authenticated`'s grants and replace every
-- `to authenticated` in `...21_rls_customer.sql` with `to vamos_customer` — no other change
-- (D-25). Syntax confirmed locally on PG17 in a rolled-back transaction
-- (research/local-toolchain-probe.md, Probe 2e — U1 closed for the syntax half); the
-- managed-platform privilege half remains a staging SQL-editor check owned by Plan 02-10.
grant authenticated to vamos_edge with inherit false, set true;
grant vamos_guest to vamos_edge with inherit false, set true;
grant vamos_staff to vamos_edge with inherit false, set true;

-- F-21: `request.jwt.claims` is an unauthenticated GUC — any session holding the vamos_edge
-- password can `set_config('request.jwt.claims', ..., true)` to whatever JSON it likes — and
-- the four memberships above give vamos_edge `SET ROLE` into vamos_staff. So whoever holds
-- the vamos_edge password can mint an admin session against any active staff `sub`: staff
-- uuids are not secret, they appear in booking_events.actor_id and audit_log.actor_id. The
-- vamos_edge password therefore belongs in the same secrets tier as the service_role key
-- (docs/build/GSD-LAUNCH.md "Secrets / env matrix" carries the same line), and
-- app.is_staff()'s active-staff-row condition below is defence in depth, not the boundary.

grant usage on schema app to anon, authenticated, vamos_guest, vamos_staff;
revoke all on schema app from public;

-- Nothing new ever leaks a grant to ANY client-facing role by default.
-- `anon` and `authenticated` are in this list deliberately: a Supabase project ships with an
-- equivalent default-privilege rule already in place — new tables in schema public GRANT ALL
-- ON TABLES TO anon, authenticated, service_role — so without this line every table these
-- migrations create as `postgres` would carry full CRUD for a customer JWT and the "grant
-- first, policy second" boundary would exist only for the four roles we invented.
alter default privileges in schema public
  revoke all on tables    from vamos_edge, vamos_public, anon, authenticated;
alter default privileges in schema public
  revoke all on sequences from vamos_edge, vamos_public, anon, authenticated;
alter default privileges in schema public
  revoke all on functions from vamos_edge, vamos_public, anon, authenticated;

-- F-13: the three statements above do NOT establish the invariant their own comment claims,
-- for functions specifically. Postgres grants a brand-new function's EXECUTE to PUBLIC
-- unconditionally; revoking EXECUTE from a *named* role never removes the PUBLIC grant that
-- role still enjoys by its own membership in PUBLIC. So a future function in schema public
-- would remain callable by every client-facing role regardless of the three revokes above,
-- unless PUBLIC's own default is revoked directly:
alter default privileges in schema public revoke execute on functions from public;

-- F-13: schema app has USAGE granted to four client roles two statements above and no
-- default-privilege statement of its own at all until this point — so a future app.* object
-- would be callable/selectable by all four unless someone remembers a revoke by hand. These
-- two lines make "nothing in app is reachable by default" an invariant of the migration set,
-- not something a later author has to remember:
alter default privileges in schema app revoke execute on functions from public;
alter default privileges in schema app
  revoke all on tables from public, vamos_edge, vamos_public, anon, authenticated, vamos_guest, vamos_staff;

-- F-13: never revoked in the draft. On a project provisioned before the PG15 default change,
-- anon/authenticated hold ALL on schema public, which includes CREATE — a client-facing role
-- should never be able to create an object in the schema every RLS policy in this project
-- lives in. This is an invariant for later migrations, not a fix for a hole reachable through
-- this schema today.
revoke create on schema public from public, anon, authenticated, vamos_guest, vamos_staff, vamos_edge, vamos_public;

-- Never GRANT postgres TO vamos_edge — postgres owns these tables and bypasses every policy.

-- Identity helpers. Ours, in app.*, so policies do not depend on auth.* internals and pgTAP
-- can test them directly.
create or replace function app.jwt() returns jsonb
  language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

create or replace function app.uid() returns uuid
  language sql stable set search_path = '' as $$
  select nullif(app.jwt() ->> 'sub', '')::uuid
$$;

/** Hex-encoded sha256 of the manage token supplied on this request, or NULL.
    The raw token never reaches SQL — the Worker hashes it first, so it cannot appear in
    pg_stat_statements or a query log. */
create or replace function app.manage_token_hash() returns bytea
  language sql stable set search_path = '' as $$
  select decode(nullif(current_setting('request.vamos.manage_token_hash', true), ''), 'hex')
$$;

revoke all on function app.jwt(), app.uid(), app.manage_token_hash() from public;
grant execute on function app.jwt(), app.uid() to anon, authenticated, vamos_guest, vamos_staff;
grant execute on function app.manage_token_hash() to vamos_guest;

-- app.is_staff(), app.is_admin() and app.booking_has_manage_token(uuid) are NOT created
-- here. app.is_staff() and app.is_admin() are `language sql` bodies that read public.staff,
-- and `check_function_bodies` (on by default) validates a SQL-language body at CREATE time —
-- so neither can be created before public.staff exists. Both ship in
-- ...06_customers_and_staff.sql (Plan 02-03) next to that table. app.booking_has_manage_token(uuid)
-- reads public.booking_access_tokens for the same reason and ships in
-- ...12_booking_access_tokens.sql (Plan 02-05).

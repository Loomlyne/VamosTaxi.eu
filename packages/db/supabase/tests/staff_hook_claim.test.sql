-- staff_hook_claim.test.sql
--
-- Proves (02-SCHEMA-DRAFT.md §15): AUTH-05 — `custom_access_token_hook` returns claims
-- carrying `app_metadata.vamos_role` for an active staff row and no claim for `active=false`.
--
-- Extended for this plan's hardened scope:
--  - F-19/T-02-42: the hook strips any INBOUND `app_metadata.vamos_role` unconditionally
--    before conditionally re-adding it, for both the inactive-staff and no-staff-row-at-all
--    cases, while every other `app_metadata` key survives untouched (the strip is surgical).
--  - T-02-21: neither `authenticated` nor `anon` may execute the hook (42501).
--  - T-02-12: `supabase_auth_admin` holds EXECUTE on the hook and a SELECT policy on
--    `public.staff` (`staff_auth_admin_read`) — checked via catalog assertions, see below.
--  - D-05: `app.is_staff()`/`app.is_admin()` require `aal = 'aal2'` in SQL, not merely a role
--    claim; revocation (`active = false`) is immediate.
--  - D-04: `app.is_staff()` reads only `app_metadata.vamos_role`, never `user_metadata`.
--
-- Run as `postgres` by `supabase test db`. `postgres` on this Supabase Postgres image is NOT
-- a superuser (rolsuper=false) and is deliberately NOT a member of `supabase_auth_admin` —
-- `GRANT supabase_auth_admin TO postgres` itself fails with "role memberships are reserved,
-- only superusers can grant them", even inside a transaction that would otherwise roll back.
-- So this file cannot literally `set local role supabase_auth_admin` the way an in-place
-- impersonation test would. The functional (claim add/strip) assertions below instead run as
-- `postgres`, which — as the OWNER of both `custom_access_token_hook` and `staff` — reads and
-- executes exactly as any grantee with the same rows would (the function is SECURITY INVOKER
-- by design; ownership implies the underlying SELECT succeeds regardless of grants, and no RLS
-- is enabled on `staff` yet at this point in the migration sequence to complicate that read).
-- The `supabase_auth_admin`-specific EXECUTE grant and the `staff_auth_admin_read` policy are
-- proved directly against the catalog instead (function_privs_are / policy_roles_are /
-- policy_cmd_is), which needs no impersonation at all.
begin;
select plan(19);

-- Fixtures: three auth.users rows and three staff rows — one active accepted dispatcher,
-- one inactive, one active but not yet accepted (invited, never claimed).
insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('a0000000-0000-0000-0000-000000000001', 'active-dispatcher@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a0000000-0000-0000-0000-000000000002', 'inactive-dispatcher@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('a0000000-0000-0000-0000-000000000004', 'invited-dispatcher@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now());

-- 20260901000001: only an ACCEPTED active row mints vamos_role (invite gate).
insert into public.staff (user_id, role, active, accepted_at)
values
  ('a0000000-0000-0000-0000-000000000001', 'dispatcher', true, now()),
  ('a0000000-0000-0000-0000-000000000002', 'dispatcher', false, now()),
  ('a0000000-0000-0000-0000-000000000004', 'dispatcher', true, null);

-- Case 1: active staff row -> app_metadata.vamos_role is minted, top-level role claim
-- (schema-constrained to anon|authenticated, and the Postgres role, not the app role) is
-- never touched.
select is(
  ( public.custom_access_token_hook(
      jsonb_build_object(
        'user_id', 'a0000000-0000-0000-0000-000000000001',
        'claims', jsonb_build_object('sub', 'a0000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal1', 'app_metadata', '{}'::jsonb)
      )
    ) -> 'claims' -> 'app_metadata' ->> 'vamos_role' ),
  'dispatcher',
  'active staff row -> app_metadata.vamos_role = dispatcher'
);
select is(
  ( public.custom_access_token_hook(
      jsonb_build_object(
        'user_id', 'a0000000-0000-0000-0000-000000000001',
        'claims', jsonb_build_object('sub', 'a0000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal1', 'app_metadata', '{}'::jsonb)
      )
    ) -> 'claims' ->> 'role' ),
  'authenticated',
  'the top-level role claim is never touched by the hook'
);

-- Case 1b: active but not yet accepted (invited, never claimed) -> no vamos_role key.
select is(
  ( public.custom_access_token_hook(
      jsonb_build_object(
        'user_id', 'a0000000-0000-0000-0000-000000000004',
        'claims', jsonb_build_object('sub', 'a0000000-0000-0000-0000-000000000004', 'role', 'authenticated', 'aal', 'aal1', 'app_metadata', '{}'::jsonb)
      )
    ) -> 'claims' -> 'app_metadata' ? 'vamos_role' ),
  false,
  'active but unaccepted staff row -> no vamos_role key (invite gate)'
);

-- Case 2: inactive staff row -> no vamos_role key minted at all (key absence, not a null value).
select is(
  ( public.custom_access_token_hook(
      jsonb_build_object(
        'user_id', 'a0000000-0000-0000-0000-000000000002',
        'claims', jsonb_build_object('sub', 'a0000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal1', 'app_metadata', '{}'::jsonb)
      )
    ) -> 'claims' -> 'app_metadata' ? 'vamos_role' ),
  false,
  'inactive staff row -> no vamos_role key minted'
);

-- F-19 / T-02-42: an inbound app_metadata.vamos_role — the shape GoTrue produces by merging
-- auth.users.raw_app_meta_data into the claim — must be STRIPPED, not passed through, both
-- when the staff row exists but is inactive and when there is no staff row at all. Every other
-- app_metadata key the input carried (provider) must survive, proving the strip is surgical.
select is(
  ( public.custom_access_token_hook(
      jsonb_build_object(
        'user_id', 'a0000000-0000-0000-0000-000000000002',
        'claims', jsonb_build_object('sub', 'a0000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal1',
          'app_metadata', jsonb_build_object('vamos_role', 'admin', 'provider', 'email'))
      )
    ) -> 'claims' -> 'app_metadata' ? 'vamos_role' ),
  false,
  'F-19: inactive staff row with a tampered inbound vamos_role -> claim is stripped, not passed through'
);
select is(
  ( public.custom_access_token_hook(
      jsonb_build_object(
        'user_id', 'a0000000-0000-0000-0000-000000000002',
        'claims', jsonb_build_object('sub', 'a0000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal1',
          'app_metadata', jsonb_build_object('vamos_role', 'admin', 'provider', 'email'))
      )
    ) -> 'claims' -> 'app_metadata' ->> 'provider' ),
  'email',
  'F-19: the strip is surgical (inactive case) — other app_metadata keys survive'
);
select is(
  ( public.custom_access_token_hook(
      jsonb_build_object(
        'user_id', 'a0000000-0000-0000-0000-000000000099',  -- no staff row at all
        'claims', jsonb_build_object('sub', 'a0000000-0000-0000-0000-000000000099', 'role', 'authenticated', 'aal', 'aal1',
          'app_metadata', jsonb_build_object('vamos_role', 'admin', 'provider', 'email'))
      )
    ) -> 'claims' -> 'app_metadata' ? 'vamos_role' ),
  false,
  'F-19: user_id with no staff row at all -> claim is stripped, not passed through'
);
select is(
  ( public.custom_access_token_hook(
      jsonb_build_object(
        'user_id', 'a0000000-0000-0000-0000-000000000099',
        'claims', jsonb_build_object('sub', 'a0000000-0000-0000-0000-000000000099', 'role', 'authenticated', 'aal', 'aal1',
          'app_metadata', jsonb_build_object('vamos_role', 'admin', 'provider', 'email'))
      )
    ) -> 'claims' -> 'app_metadata' ->> 'provider' ),
  'email',
  'F-19: the strip is surgical (no-staff-row case) — other app_metadata keys survive'
);

-- T-02-21: the hook is minting-authority — neither `authenticated` nor `anon` may call it
-- themselves to grant themselves a role. `postgres` (this session) IS a member of both, so
-- SET ROLE to each works without needing supabase_auth_admin membership.
set local role authenticated;
select throws_ok(
  $$ select public.custom_access_token_hook('{}'::jsonb) $$,
  '42501',
  null,
  'authenticated raises 42501 calling custom_access_token_hook (not granted)'
);
reset role;

set local role anon;
select throws_ok(
  $$ select public.custom_access_token_hook('{}'::jsonb) $$,
  '42501',
  null,
  'anon raises 42501 calling custom_access_token_hook (not granted)'
);
reset role;

select function_privs_are(
  'public', 'custom_access_token_hook', array['jsonb']::name[],
  'supabase_auth_admin', array['EXECUTE']::name[],
  'supabase_auth_admin holds EXECUTE on custom_access_token_hook'
);
select function_privs_are(
  'public', 'custom_access_token_hook', array['jsonb']::name[],
  'authenticated', array[]::name[],
  'authenticated holds zero privileges on custom_access_token_hook'
);

-- T-02-12: the read policy the hook depends on exists and names supabase_auth_admin — without
-- it the hook's SELECT would match no policy once RLS is enabled and every staff JWT would
-- mint with no vamos_role. Checked at the catalog level (no impersonation required).
select policy_roles_are(
  'public', 'staff', 'staff_auth_admin_read', array['supabase_auth_admin'],
  'staff_auth_admin_read targets supabase_auth_admin only'
);
select policy_cmd_is(
  'public', 'staff', 'staff_auth_admin_read', 'SELECT',
  'staff_auth_admin_read is a SELECT-only policy'
);

-- D-05: app.is_staff()/app.is_admin() require aal2 + an active staff row — a dispatcher JWT
-- at aal1 is not staff, and revocation (active = false) is immediate.
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', 'a0000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal1',
    'app_metadata', jsonb_build_object('vamos_role', 'dispatcher'))::text,
  true
);
select is(app.is_staff(), false, 'D-05: active dispatcher at aal1 is not staff');

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', 'a0000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'dispatcher'))::text,
  true
);
select is(app.is_staff(), true, 'D-05: active dispatcher at aal2 is staff');
select is(app.is_admin(), false, 'a dispatcher (not admin) is never app.is_admin()');

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', 'a0000000-0000-0000-0000-000000000002', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'dispatcher'))::text,
  true
);
select is(app.is_staff(), false, 'D-05: inactive staff row at aal2 is not staff — revocation is immediate');

-- D-04: user_metadata is user-writable and must never be read as the role source.
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', 'a0000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
    'user_metadata', jsonb_build_object('vamos_role', 'admin'))::text,
  true
);
select is(app.is_staff(), false, 'D-04: user_metadata.vamos_role is never read — app_metadata absent means not staff');

select * from finish();
rollback;

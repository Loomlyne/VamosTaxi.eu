-- extensions.test.sql
--
-- Proves: pgcrypto, btree_gist, citext, pgtap all installed (runs first, because a missing
-- citext aborts every later migration — 02-SCHEMA-DRAFT.md §15); the app schema and the four
-- roles exist with the exact D-02/D-03 shape (vamos_edge/vamos_public LOGIN NOINHERIT no
-- password, vamos_guest/vamos_staff NOLOGIN); vamos_edge's four memberships are WITH INHERIT
-- FALSE, SET TRUE; every enum and the rappen domain exist, and F-17's non-negativity check is
-- proven by casting, not merely declared; F-13's default-privilege invariant actually holds
-- (no client-facing role has CREATE on schema public, no function in public/app is
-- PUBLIC-executable).
begin;
select plan(47);

-- Extensions (D-20, research/local-toolchain-probe.md — available but NOT installed by
-- default locally, so this migration's CREATE EXTENSION statements are load-bearing).
select has_extension('extensions', 'pgcrypto',   'pgcrypto is installed in schema extensions');
select has_extension('extensions', 'btree_gist', 'btree_gist is installed in schema extensions');
select has_extension('extensions', 'citext',     'citext is installed in schema extensions');
select has_extension('extensions', 'pgtap',      'pgtap is installed in schema extensions');

-- The app schema (D-02 identity-helper home).
select has_schema('app', 'Schema app exists');

-- The four roles exist (D-02, D-03).
select has_role('vamos_edge',   'Role vamos_edge exists');
select has_role('vamos_public', 'Role vamos_public exists');
select has_role('vamos_guest',  'Role vamos_guest exists');
select has_role('vamos_staff',  'Role vamos_staff exists');

-- vamos_edge: LOGIN, NOINHERIT, no password (D-02 — zero privileges until it SET ROLEs).
select ok(
  (select rolcanlogin from pg_roles where rolname = 'vamos_edge'),
  'vamos_edge is LOGIN'
);
select ok(
  not (select rolinherit from pg_roles where rolname = 'vamos_edge'),
  'vamos_edge is NOINHERIT'
);
select ok(
  (select rolpassword is null from pg_authid where rolname = 'vamos_edge'),
  'vamos_edge has no password (T-02-19)'
);

-- vamos_public: LOGIN, NOINHERIT, zero role memberships (D-03).
select ok(
  (select rolcanlogin from pg_roles where rolname = 'vamos_public'),
  'vamos_public is LOGIN'
);
select ok(
  not (select rolinherit from pg_roles where rolname = 'vamos_public'),
  'vamos_public is NOINHERIT'
);
select is(
  (select count(*) from pg_auth_members where member = 'vamos_public'::regrole)::int,
  0,
  'vamos_public holds no role memberships'
);

-- vamos_guest / vamos_staff: NOLOGIN (only ever reached via set_config('role', ..., true)).
select ok(
  not (select rolcanlogin from pg_roles where rolname = 'vamos_guest'),
  'vamos_guest is NOLOGIN'
);
select ok(
  not (select rolcanlogin from pg_roles where rolname = 'vamos_staff'),
  'vamos_staff is NOLOGIN'
);

-- vamos_edge holds exactly these four memberships (T-02-20 — never a fifth, never postgres).
select is_member_of('authenticated', 'vamos_edge', 'vamos_edge is a member of authenticated');
select is_member_of('anon',          'vamos_edge', 'vamos_edge is a member of anon');
select is_member_of('vamos_guest',   'vamos_edge', 'vamos_edge is a member of vamos_guest');
select is_member_of('vamos_staff',   'vamos_edge', 'vamos_edge is a member of vamos_staff');

-- Each membership is WITH INHERIT FALSE, SET TRUE (D-01/D-02 — vamos_edge does not
-- automatically inherit these roles' privileges; it must explicitly SET ROLE).
select ok(
  (select not inherit_option and set_option from pg_auth_members
    where member = 'vamos_edge'::regrole and roleid = 'authenticated'::regrole),
  'vamos_edge->authenticated is inherit false, set true'
);
select ok(
  (select not inherit_option and set_option from pg_auth_members
    where member = 'vamos_edge'::regrole and roleid = 'anon'::regrole),
  'vamos_edge->anon is inherit false, set true'
);
select ok(
  (select not inherit_option and set_option from pg_auth_members
    where member = 'vamos_edge'::regrole and roleid = 'vamos_guest'::regrole),
  'vamos_edge->vamos_guest is inherit false, set true'
);
select ok(
  (select not inherit_option and set_option from pg_auth_members
    where member = 'vamos_edge'::regrole and roleid = 'vamos_staff'::regrole),
  'vamos_edge->vamos_staff is inherit false, set true'
);

-- The rappen domain (D-06) exists over integer.
select has_domain('public', 'rappen', 'Domain rappen exists');
select domain_type_is('public', 'rappen', 'integer', 'rappen is based on integer');

-- F-17: the non-negativity check is proven by casting, not just declared — a negative value
-- raises 23514 (check_violation) and a zero value is legal.
select throws_ok(
  $$ select (-1)::public.rappen $$,
  '23514',
  null,
  'a negative rappen raises 23514 (F-17)'
);
select lives_ok(
  $$ select 0::public.rappen $$,
  'a zero rappen is legal'
);

-- Every enum type exists (D-20).
select has_enum('public', 'vehicle_status',      'Enum vehicle_status exists');
select has_enum('public', 'chauffeur_status',    'Enum chauffeur_status exists');
select has_enum('public', 'booking_status',      'Enum booking_status exists');
select has_enum('public', 'leg_direction',       'Enum leg_direction exists');
select has_enum('public', 'customer_type',       'Enum customer_type exists');
select has_enum('public', 'coupon_kind',         'Enum coupon_kind exists');
select has_enum('public', 'surcharge_kind',      'Enum surcharge_kind exists');
select has_enum('public', 'review_source',       'Enum review_source exists');
select has_enum('public', 'staff_role',          'Enum staff_role exists');
select has_enum('public', 'rate_version_status', 'Enum rate_version_status exists');
select has_enum('public', 'display_currency',    'Enum display_currency exists');

-- Label lists for the two enums this phase's later plans read most (matches …03_types.sql).
select enum_has_labels(
  'public', 'booking_status',
  array['quote','pending','paid','confirmed','assigned','completed','cancelled',
        'partially_cancelled','partially_completed','refunded','no_show'],
  'booking_status has the exact label set'
);
select enum_has_labels(
  'public', 'rate_version_status',
  array['draft','live','retired'],
  'rate_version_status has the exact label set'
);

-- D-28 local half: this Postgres is >= 17.
select ok(
  current_setting('server_version_num')::int >= 170000,
  'server_version_num >= 170000 (PG17, D-28 local half)'
);

-- F-13: the default-privilege invariant actually holds — no client-facing role can CREATE
-- in schema public, and no function in public/app is executable by PUBLIC.
select ok(
  not has_schema_privilege('authenticated', 'public', 'create'),
  'authenticated has no CREATE on schema public (F-13)'
);
select ok(
  not has_schema_privilege('anon', 'public', 'create'),
  'anon has no CREATE on schema public (F-13)'
);
select ok(
  not has_schema_privilege('vamos_staff', 'public', 'create'),
  'vamos_staff has no CREATE on schema public (F-13)'
);
select is_empty(
  $$
    select p.oid::regprocedure::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'app')
       and has_function_privilege('public', p.oid, 'execute')
  $$,
  'no function in schema public or app is executable by PUBLIC (F-13)'
);

select * from finish();
rollback;

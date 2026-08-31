-- checkout_roles.test.sql
--
-- Proves plan 07-01 Task 2: vamos_checkout and vamos_system exist as nologin roles,
-- are SET-able from vamos_edge (inherit false), hold zero table privileges on the
-- checkout write surface, and are not members of anon/authenticated/vamos_staff/
-- vamos_public. Run as postgres by supabase test db.
begin;
select plan(30);

select ok(
  exists (select 1 from pg_catalog.pg_roles where rolname = 'vamos_checkout'),
  'vamos_checkout exists'
);
select ok(
  exists (select 1 from pg_catalog.pg_roles where rolname = 'vamos_system'),
  'vamos_system exists'
);
select is(
  (select rolcanlogin from pg_catalog.pg_roles where rolname = 'vamos_checkout'),
  false,
  'vamos_checkout is nologin'
);
select is(
  (select rolcanlogin from pg_catalog.pg_roles where rolname = 'vamos_system'),
  false,
  'vamos_system is nologin'
);

select ok(
  (select not inherit_option and set_option from pg_catalog.pg_auth_members
    where member = 'vamos_edge'::regrole and roleid = 'vamos_checkout'::regrole),
  'vamos_edge->vamos_checkout is inherit false, set true'
);
select ok(
  (select not inherit_option and set_option from pg_catalog.pg_auth_members
    where member = 'vamos_edge'::regrole and roleid = 'vamos_system'::regrole),
  'vamos_edge->vamos_system is inherit false, set true'
);

select is(has_table_privilege('vamos_checkout', 'public.bookings', 'INSERT'), false,
  'vamos_checkout: no INSERT on public.bookings');
select is(has_table_privilege('vamos_checkout', 'public.booking_payments', 'INSERT'), false,
  'vamos_checkout: no INSERT on public.booking_payments');
select is(has_table_privilege('vamos_checkout', 'public.price_snapshots', 'INSERT'), false,
  'vamos_checkout: no INSERT on public.price_snapshots');
select is(has_table_privilege('vamos_checkout', 'public.stripe_events', 'INSERT'), false,
  'vamos_checkout: no INSERT on public.stripe_events');
select is(has_table_privilege('vamos_checkout', 'public.booking_notifications', 'INSERT'), false,
  'vamos_checkout: no INSERT on public.booking_notifications');
select is(has_table_privilege('vamos_checkout', 'public.booking_events', 'INSERT'), false,
  'vamos_checkout: no INSERT on public.booking_events');
select is(has_table_privilege('vamos_checkout', 'public.booking_access_tokens', 'INSERT'), false,
  'vamos_checkout: no INSERT on public.booking_access_tokens');

select is(has_table_privilege('vamos_system', 'public.bookings', 'INSERT'), false,
  'vamos_system: no INSERT on public.bookings');
select is(has_table_privilege('vamos_system', 'public.booking_payments', 'INSERT'), false,
  'vamos_system: no INSERT on public.booking_payments');
select is(has_table_privilege('vamos_system', 'public.price_snapshots', 'INSERT'), false,
  'vamos_system: no INSERT on public.price_snapshots');
select is(has_table_privilege('vamos_system', 'public.stripe_events', 'INSERT'), false,
  'vamos_system: no INSERT on public.stripe_events');
select is(has_table_privilege('vamos_system', 'public.booking_notifications', 'INSERT'), false,
  'vamos_system: no INSERT on public.booking_notifications');
select is(has_table_privilege('vamos_system', 'public.booking_events', 'INSERT'), false,
  'vamos_system: no INSERT on public.booking_events');
select is(has_table_privilege('vamos_system', 'public.booking_access_tokens', 'INSERT'), false,
  'vamos_system: no INSERT on public.booking_access_tokens');

set local role vamos_checkout;
select is(current_user::text, 'vamos_checkout', 'set local role vamos_checkout; current_user is vamos_checkout');
reset role;

set local role vamos_system;
select is(current_user::text, 'vamos_system', 'set local role vamos_system; current_user is vamos_system');
reset role;

select ok(
  not exists (
    select 1 from pg_catalog.pg_auth_members
     where member = 'vamos_checkout'::regrole and roleid = 'anon'::regrole
  ),
  'vamos_checkout is not a member of anon'
);
select ok(
  not exists (
    select 1 from pg_catalog.pg_auth_members
     where member = 'vamos_checkout'::regrole and roleid = 'authenticated'::regrole
  ),
  'vamos_checkout is not a member of authenticated'
);
select ok(
  not exists (
    select 1 from pg_catalog.pg_auth_members
     where member = 'vamos_checkout'::regrole and roleid = 'vamos_staff'::regrole
  ),
  'vamos_checkout is not a member of vamos_staff'
);
select ok(
  not exists (
    select 1 from pg_catalog.pg_auth_members
     where member = 'vamos_checkout'::regrole and roleid = 'vamos_public'::regrole
  ),
  'vamos_checkout is not a member of vamos_public'
);
select ok(
  not exists (
    select 1 from pg_catalog.pg_auth_members
     where member = 'vamos_system'::regrole and roleid = 'anon'::regrole
  ),
  'vamos_system is not a member of anon'
);
select ok(
  not exists (
    select 1 from pg_catalog.pg_auth_members
     where member = 'vamos_system'::regrole and roleid = 'authenticated'::regrole
  ),
  'vamos_system is not a member of authenticated'
);
select ok(
  not exists (
    select 1 from pg_catalog.pg_auth_members
     where member = 'vamos_system'::regrole and roleid = 'vamos_staff'::regrole
  ),
  'vamos_system is not a member of vamos_staff'
);
select ok(
  not exists (
    select 1 from pg_catalog.pg_auth_members
     where member = 'vamos_system'::regrole and roleid = 'vamos_public'::regrole
  ),
  'vamos_system is not a member of vamos_public'
);

select * from finish();
rollback;

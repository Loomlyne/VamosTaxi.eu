-- settings_public.test.sql
--
-- Proves D-03: the raw `settings` table stays locked to every public role; `settings_public`
-- (a definer-semantics view, deliberately NOT security_invoker) is what `anon`/`vamos_public`
-- actually read. Also proves the other three cacheable content tables filter to their public
-- subset (`reviews.published`, `vehicle_classes.active`).
begin;
select plan(10);

-- Fixture: the settings singleton (never seeded outside a test -- Plan 02-09 owns the real seed).
insert into public.settings (id, phone) values (1, '+41 44 000 00 00');

insert into public.reviews (external_ref, source, author_name, body, rating, published)
values ('sp-published', 'manual', 'Published Reviewer', 'Great ride', 5, true),
       ('sp-unpublished', 'manual', 'Unpublished Reviewer', 'Draft review', 4, false);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity, active)
values ('economy', 3, 3, true), ('first', 1, 1, false);

-- (1)-(2) anon reads settings_public, never raw settings. ----------------------------------------
set local role anon;
select is(
  (select phone from public.settings_public),
  '+41 44 000 00 00',
  '(1) anon selects phone from settings_public and gets the seeded row'
);
select throws_ok(
  $$ select * from public.settings $$,
  '42501', null,
  '(2) anon selecting raw public.settings raises 42501'
);
reset role;

-- (3)-(5) vamos_public: settings_public readable, raw settings and bookings both closed. ---------
set local role vamos_public;
select lives_ok(
  $$ select phone from public.settings_public $$,
  '(3) vamos_public can select settings_public'
);
select throws_ok(
  $$ select * from public.settings $$,
  '42501', null,
  '(4) vamos_public selecting raw public.settings raises 42501'
);
select throws_ok(
  $$ select count(*) from public.bookings $$,
  '42501', null,
  '(5) vamos_public selecting bookings raises 42501 -- the cache path never reaches booking data'
);
reset role;

-- (6) anon sees only published reviews. -----------------------------------------------------------
set local role anon;
select is(
  (select count(*) from public.reviews)::int, 1,
  '(6) anon selecting reviews returns only the published one'
);

-- (7) anon sees only active vehicle_classes. --------------------------------------------------------
select is(
  (select count(*) from public.vehicle_classes where slug in ('economy','first'))::int, 1,
  '(7) anon selecting vehicle_classes returns only the active one'
);
reset role;

-- (8)-(9) catalog assertions. ------------------------------------------------------------------------
select has_view('public', 'settings_public', '(8) public.settings_public exists as a view');
select table_privs_are(
  'public', 'settings_public', 'anon', array['SELECT'],
  '(9) anon holds exactly SELECT on settings_public'
);

-- (10) the view is NOT security_invoker -- definer semantics is the point (D-03). --------------------
select ok(
  (select reloptions from pg_class where relname = 'settings_public') is null
  or not (
    (select reloptions from pg_class where relname = 'settings_public')::text[] && array['security_invoker=true']
  ),
  '(10) settings_public is not security_invoker'
);

select * from finish();
rollback;

-- settings_public.test.sql
--
-- Proves D-03: the raw `settings` table stays locked to every public role; `settings_public`
-- (a definer-semantics view, deliberately NOT security_invoker) is what `anon`/`vamos_public`
-- actually read. Also proves the other three cacheable content tables filter to their public
-- subset (`reviews.published`, `vehicle_classes.active`).
begin;
select plan(10);

-- Fixture: the settings singleton. Plan 02-09's seed already inserts the id=1 row (phone ''),
-- so this test UPDATEs the seeded row's phone instead of inserting a colliding duplicate.
update public.settings set phone = '+41 44 000 00 00' where id = 1;

insert into public.reviews (external_ref, source, author_name, body, rating, published)
values ('sp-published', 'manual', 'Published Reviewer', 'Great ride', 5, true),
       ('sp-unpublished', 'manual', 'Unpublished Reviewer', 'Draft review', 4, false);

-- DEVIATION (Rule 1, bug fix -- Plan 02-09 seeds real vehicle_classes rows): the CHECK
-- constraint on vehicle_classes.slug only tolerates economy/business/first/van, and Plan
-- 02-09's seed now occupies economy/business/van (D-36) -- so `first` is the one slug this
-- fixture can still insert without colliding. The seeded `economy` row is itself already
-- active=true with capacity 3/3, so it stands in for this test's former "active" fixture row
-- without a duplicate insert; only the "inactive" row still needs inserting.
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity, active)
values ('first', 1, 1, false);

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
-- DEVIATION (Rule 1, bug fix -- Plan 02-09 seeds 5 real published reviews): a blanket
-- `count(*) from public.reviews` no longer isolates this test's own two fixtures from the
-- seeded rows. Scoping to this test's own author names (external_ref is not a public column, G2) keeps the assertion's original intent
-- (published-only filtering) without depending on the total row count staying zero.
set local role anon;
select is(
  (select count(*) from public.reviews where author_name in ('Published Reviewer', 'Unpublished Reviewer'))::int, 1,
  '(6) anon selecting this test''s own reviews returns only the published one'
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

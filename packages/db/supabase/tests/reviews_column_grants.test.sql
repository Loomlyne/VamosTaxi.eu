-- reviews_column_grants.test.sql
--
-- Phase 20 G2: public.reviews is readable by COLUMN, not as a whole table. Published rows stay
-- visible to anon / vamos_public / authenticated, but booking_id, rating_* and photo_path are
-- not selectable by the public roles. authenticated keeps booking_id only, because the account
-- list asks "has this booking a review" (app/api/account/bookings/route.ts) and the own-booking
-- policy reviews_customer_own_booking hides every foreign row.
--
-- Each reader below is the real column list of the real caller:
--   lib/public/reviews.ts (vamos_public)  lib/db/content.ts (vamos_public)
--   api/account/bookings/route.ts (authenticated).
begin;
select plan(24);

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('d0000000-0000-0000-0000-00000000000a', 'rcg-a@example.test', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('d0000000-0000-0000-0000-00000000000b', 'rcg-b@example.test', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now());

update public.customers set full_name = 'Customer A', email = 'rcg-cust-a@example.test'
 where user_id = 'd0000000-0000-0000-0000-00000000000a';
update public.customers set full_name = 'Customer B', email = 'rcg-cust-b@example.test'
 where user_id = 'd0000000-0000-0000-0000-00000000000b';

insert into public.bookings (contact_name, contact_email, customer_id, status)
select 'Booking A', 'rcg-booking-a@example.test', c.id, 'confirmed' from public.customers c where c.email = 'rcg-cust-a@example.test';
insert into public.bookings (contact_name, contact_email, customer_id, status)
select 'Booking B', 'rcg-booking-b@example.test', c.id, 'confirmed' from public.customers c where c.email = 'rcg-cust-b@example.test';
insert into public.bookings (contact_name, contact_email, status)
values ('Booking P', 'rcg-booking-p@example.test', 'confirmed');

-- A: unpublished own review. B: unpublished foreign review. P: published review with private columns.
insert into public.reviews (external_ref, author_name, body, rating, published, booking_id, rating_chauffeur, rating_company, rating_overall, photo_path)
select 'rcg-a', 'Author A', 'a', 5, false, b.id, 4, 4, 4, 'photos/a.jpg' from public.bookings b where b.contact_email = 'rcg-booking-a@example.test';
insert into public.reviews (external_ref, author_name, body, rating, published, booking_id, rating_chauffeur, rating_company, rating_overall, photo_path)
select 'rcg-b', 'Author B', 'b', 5, false, b.id, 3, 3, 3, 'photos/b.jpg' from public.bookings b where b.contact_email = 'rcg-booking-b@example.test';
insert into public.reviews (external_ref, author_name, body, rating, published, booking_id, rating_chauffeur, rating_company, rating_overall, photo_path)
select 'rcg-p', 'Author P', 'p', 5, true, b.id, 5, 5, 5, 'photos/p.jpg' from public.bookings b where b.contact_email = 'rcg-booking-p@example.test';

create temporary table fx as
select (select id from public.bookings where contact_email = 'rcg-booking-a@example.test') as booking_a,
       (select id from public.bookings where contact_email = 'rcg-booking-b@example.test') as booking_b;
grant select on fx to public;

-- Public readers: anon and vamos_public --------------------------------------------------
set local role vamos_public;
select lives_ok(
  $$ select r.id, r.source, r.author_name, r.author_role, r.body, r.rating, r.route_label,
            vc.slug as vehicle_class_slug, r.avatar_path, r.source_url, r.verified, r.published, r.sort_order
       from public.reviews r
       left join public.vehicle_classes vc on vc.id = r.vehicle_class_id
      where r.published = true
      order by r.sort_order asc, r.created_at desc $$,
  '(1) vamos_public: the lib/public/reviews.ts column list works'
);
select lives_ok(
  $$ select id, author_name, author_role, body, rating, route_label, source_url, verified
       from public.reviews where published order by sort_order, created_at desc limit 5 $$,
  '(2) vamos_public: the lib/db/content.ts column list works'
);
select is(
  (select count(*) from public.reviews where author_name like 'Author %')::int, 1,
  '(3) vamos_public sees only the published fixture row'
);
select throws_ok($$ select booking_id from public.reviews $$, '42501', null, '(4) vamos_public cannot select booking_id');
select throws_ok($$ select rating_chauffeur from public.reviews $$, '42501', null, '(5) vamos_public cannot select rating_chauffeur');
select throws_ok($$ select photo_path from public.reviews $$, '42501', null, '(6) vamos_public cannot select photo_path');
select throws_ok($$ select * from public.reviews $$, '42501', null, '(7) vamos_public select * is refused');
reset role;

set local role anon;
select lives_ok(
  $$ select r.id, r.source, r.author_name, r.author_role, r.body, r.rating, r.route_label,
            vc.slug as vehicle_class_slug, r.avatar_path, r.source_url, r.verified, r.published, r.sort_order
       from public.reviews r
       left join public.vehicle_classes vc on vc.id = r.vehicle_class_id
      where r.published = true
      order by r.sort_order asc, r.created_at desc $$,
  '(8) anon: the public reader column list works'
);
select is(
  (select count(*) from public.reviews where published = false)::int, 0,
  '(9) anon: unpublished rows are invisible'
);
select throws_ok($$ select booking_id from public.reviews $$, '42501', null, '(10) anon cannot select booking_id');
select throws_ok($$ select rating_chauffeur from public.reviews $$, '42501', null, '(11) anon cannot select rating_chauffeur');
select throws_ok($$ select photo_path from public.reviews $$, '42501', null, '(12) anon cannot select photo_path');
select throws_ok($$ select * from public.reviews $$, '42501', null, '(13) anon select * is refused');
reset role;

-- authenticated: customer A -----------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'd0000000-0000-0000-0000-00000000000a', 'role', 'authenticated', 'aal', 'aal2',
                     'email', 'rcg-cust-a@example.test')::text,
  true);

select lives_ok(
  $$ select r.id, r.author_name, r.body, r.rating, r.published, r.sort_order, r.created_at
       from public.reviews r where r.published = true order by r.sort_order, r.created_at desc $$,
  '(14) authenticated: the public column list works'
);
select is(
  (select exists (select 1 from public.reviews r where r.booking_id = (select booking_a from fx))),
  true,
  '(15) authenticated A: the own-review reader sees A''s unpublished review by booking_id'
);
select is(
  (select exists (select 1 from public.reviews r where r.booking_id = (select booking_b from fx))),
  false,
  '(16) authenticated A: B''s unpublished review is invisible'
);
select lives_ok(
  $$ select b.reference,
            exists (select 1 from public.reviews r where r.booking_id = b.id) as has_review
       from public.bookings b $$,
  '(17) authenticated: the account list has_review subquery runs'
);
select is(
  (select count(*) from public.reviews where published = false)::int, 1,
  '(18) authenticated A: exactly one unpublished review (own) is visible'
);
select throws_ok($$ select rating_chauffeur from public.reviews $$, '42501', null, '(19) authenticated cannot select rating_chauffeur');
select throws_ok($$ select rating_company from public.reviews $$, '42501', null, '(20) authenticated cannot select rating_company');
select throws_ok($$ select rating_overall from public.reviews $$, '42501', null, '(21) authenticated cannot select rating_overall');
select throws_ok($$ select photo_path from public.reviews $$, '42501', null, '(22) authenticated cannot select photo_path');
select throws_ok($$ select * from public.reviews $$, '42501', null, '(23) authenticated select * is refused');
reset role;

-- vamos_staff keeps whole-table read (ops reviews screen).
select ok(has_table_privilege('vamos_staff', 'public.reviews', 'select'), '(24) vamos_staff keeps table-wide SELECT');

select * from finish();
rollback;

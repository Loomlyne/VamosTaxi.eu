-- 20261005120000_reviews_column_grants.sql
--
-- Phase 20 G2: public.reviews was granted to anon, authenticated and vamos_public as a WHOLE
-- table (20260823000024_rls_public.sql). The policy reviews_public_read limits ROWS to
-- published ones, but every column of a published row was readable, including booking_id (a
-- booking's internal id), rating_chauffeur / rating_company / rating_overall and photo_path.
-- Now each role reads only the columns a real reader selects. Grants only: no policy, no data,
-- no other role changes (vamos_staff, vamos_system, vamos_guest, vamos_edge, service_role
-- untouched; vamos_guest and vamos_edge already have no access).
--
-- A column that is used anywhere in the query (select list, where, order by, join) needs its
-- privilege, so the list below includes the filter and sort columns too.
--
-- anon + vamos_public readers:
--   apps/web/lib/public/reviews.ts  : id, source, author_name, author_role, body, rating,
--                                     route_label, vehicle_class_id (join), avatar_path,
--                                     source_url, verified, published, sort_order, created_at
--   apps/web/lib/db/content.ts      : id, author_name, author_role, body, rating, route_label,
--                                     source_url, verified, published, sort_order, created_at
--
-- authenticated: the same public columns (reviews_public_read applies to it too), plus
--   booking_id for apps/web/app/api/account/bookings/route.ts, which asks
--   `exists (select 1 from public.reviews r where r.booking_id = b.id)` as the customer. The
--   policy reviews_customer_own_booking limits those rows to the customer's own bookings, but a
--   signed-in customer can still see booking_id on published rows; hiding it there needs a
--   definer reader or a policy change and is out of scope here.

begin;

revoke select on public.reviews from anon, authenticated, vamos_public;

grant select (
  id, source, author_name, author_role, body, rating, route_label, vehicle_class_id,
  avatar_path, source_url, verified, published, sort_order, created_at
) on public.reviews to anon, vamos_public;

grant select (
  id, source, author_name, author_role, body, rating, route_label, vehicle_class_id,
  avatar_path, source_url, verified, published, sort_order, created_at,
  booking_id
) on public.reviews to authenticated;

commit;

-- 26.1-verify-pricing.sql
--
-- Read-only. Owner runs after 20260928130000_canton_city_zones.sql and 26.1-zone-cleanup.sql,
-- and again after his own fill call. Paste the output back.
--
-- Plan 26.1-14. It is one SELECT statement, so the Supabase SQL editor shows its whole result
-- as one table: copy every row and paste it back. It changes nothing.
--
-- It reads the system catalog (a check constraint, a function signature) and the pricing
-- tables only: service_zones, rate_versions, vehicle_classes, distance_rates, fixed_routes.
-- It reads no booking, payment, customer, name, email or card data.
--
-- Rows, in order:
--   10  zone_type check     the service_zones_zone_type_check definition (must list 'canton')
--   20  canton zones        count of active zones with zone_type 'canton' (expected 26)
--   30  audit slugs         active flag of the three zones 26.1-zone-cleanup.sql deactivates
--                           (expected false; 'absent' where the slug does not exist)
--   40  fill function       ops_fill_canton_pairs args, return type, security definer
--   50  rate versions       every live and draft version: id, status, label
--                           (the live one keeps its "placeholder, not owner-approved" label)
--   60  draft x class       for each draft and each of the three public class slugs:
--                             distance_rate  yes/no - the fill only covers a class with a
--                                            distance_rates row in that draft
--                             canton_pairs   draft fixed_routes rows whose origin and
--                                            destination are both canton zones
--                                            (325 per class once filled)
--                             prices         the distinct price_rappen values among them
--
-- The expected output (local database, before and after a local-only fill with a synthetic
-- value) is in .planning/phases/26.1-payment-pricing-integrity/26.1-14-verify-pricing.expected.txt.
--
-- The fill itself is not in this file. The owner types it in the SQL editor, with the draft id
-- from rows 50 and his own amount in rappen:
--   select public.ops_fill_canton_pairs(<draft id>, <amount in rappen>);

with expected_class(sort, slug) as (
  values
    (1, 'saden'),
    (2, 'mercedes-benz-v-class'),
    (3, 'van-luxury')
),
audit_slug(sort, slug) as (
  values
    (1, 'zurich-airport-the-circle-16-flughafen-ch-8302-k'),
    (2, 'st-moritz-the-grisons-switzerland'),
    (3, 'swiss-national-museum-museumstrasse-2-8001-zu-ri')
),
fill_fn as (
  select p.oid, p.prosecdef
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'ops_fill_canton_pairs'
),
drafts as (
  select rv.id
    from public.rate_versions rv
   where rv.status = 'draft'
),
class_draft as (
  select ec.sort, ec.slug, vc.id as class_id, d.id as draft_id
    from expected_class ec
    left join public.vehicle_classes vc on vc.slug = ec.slug
    left join drafts d on true
),
pairs as (
  select cd.sort, cd.slug, cd.class_id, cd.draft_id,
         exists (
           select 1
             from public.distance_rates dr
            where dr.rate_version_id = cd.draft_id
              and dr.vehicle_class_id = cd.class_id
         ) as has_rate,
         (select pg_catalog.count(*)
            from public.fixed_routes f
            join public.service_zones o on o.id = f.origin_zone_id and o.zone_type = 'canton'
            join public.service_zones z on z.id = f.dest_zone_id and z.zone_type = 'canton'
           where f.rate_version_id = cd.draft_id
             and f.vehicle_class_id = cd.class_id) as pair_count,
         (select pg_catalog.string_agg(distinct f.price_rappen::text, ',')
            from public.fixed_routes f
            join public.service_zones o on o.id = f.origin_zone_id and o.zone_type = 'canton'
            join public.service_zones z on z.id = f.dest_zone_id and z.zone_type = 'canton'
           where f.rate_version_id = cd.draft_id
             and f.vehicle_class_id = cd.class_id) as price_list
    from class_draft cd
),
out(sort, sub, check_name, item, value) as (
  select 10, 0, 'zone_type check', 'service_zones_zone_type_check',
         coalesce((select pg_catalog.pg_get_constraintdef(c.oid)
                     from pg_catalog.pg_constraint c
                    where c.conrelid = 'public.service_zones'::pg_catalog.regclass
                      and c.conname = 'service_zones_zone_type_check'), 'MISSING')
  union all
  select 20, 0, 'canton zones', 'active',
         (select pg_catalog.count(*)::text
            from public.service_zones z
           where z.zone_type = 'canton'
             and z.active)
  union all
  select 30, a.sort, 'audit slug active', a.slug,
         coalesce((select z.active::text from public.service_zones z where z.slug = a.slug), 'absent')
    from audit_slug a
  union all
  select 40, 1, 'fill function', 'args',
         coalesce((select pg_catalog.pg_get_function_identity_arguments(oid) from fill_fn), 'MISSING')
  union all
  select 40, 2, 'fill function', 'returns',
         coalesce((select pg_catalog.pg_get_function_result(oid) from fill_fn), 'MISSING')
  union all
  select 40, 3, 'fill function', 'security_definer',
         coalesce((select prosecdef::text from fill_fn), 'MISSING')
  union all
  select 50, rv.id::int, 'rate version', 'id ' || rv.id::text,
         rv.status::text || ' | ' || rv.label
    from public.rate_versions rv
   where rv.status in ('live', 'draft')
  union all
  select 50, 0, 'rate version', 'draft', 'none'
   where not exists (select 1 from drafts)
  union all
  select 60, p.sort * 10 + 1, 'draft x class',
         coalesce('draft ' || p.draft_id::text, 'no draft') || ' / ' || p.slug, 'distance_rate ' ||
         case when p.class_id is null then 'class missing'
              when p.draft_id is null then 'no draft'
              when p.has_rate then 'yes'
              else 'no' end
    from pairs p
  union all
  select 60, p.sort * 10 + 2, 'draft x class',
         coalesce('draft ' || p.draft_id::text, 'no draft') || ' / ' || p.slug,
         'canton_pairs ' || p.pair_count::text
    from pairs p
  union all
  select 60, p.sort * 10 + 3, 'draft x class',
         coalesce('draft ' || p.draft_id::text, 'no draft') || ' / ' || p.slug,
         'prices ' || coalesce(p.price_list, '(none)')
    from pairs p
)
select check_name, item, value
  from out
 order by sort, item, sub;

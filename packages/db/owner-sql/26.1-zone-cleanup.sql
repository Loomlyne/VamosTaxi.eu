-- 26.1-zone-cleanup.sql
--
-- Owner applies in the SQL editor after the migrations. Data only. Does not touch frozen fixed_routes.
--
-- 26.1-10 (D-10, audit §6 Mapbox checks). Not a migration: it names rows that exist on the
-- hosted project, not in a fresh local database. Safe to run twice.
--
--   1. Deactivates (never deletes) the two duplicate zones and the point-of-interest zone the
--      audit found:
--        zurich-airport-the-circle-16-flughafen-ch-8302-k   duplicate of zrh-airport
--        st-moritz-the-grisons-switzerland                   duplicate of st-moritz
--        swiss-national-museum-museumstrasse-2-8001-zu-ri    point of interest, not an area
--   2. Re-points DRAFT fixed_routes rows from each duplicate to its canonical zone, only where
--      the canonical pair (either direction, same class, same draft) does not already exist.
--      Rows on live or retired versions are frozen by tg_pricing_row_frozen and are not
--      selected here at all.
--   3. Lists what is left for the owner to eyeball: every active zone with its zone_type, and
--      any draft route still pointing at a deactivated zone.
--
-- No amounts are read or written.

begin;

-- 1. Deactivate --------------------------------------------------------------------------------
update public.service_zones
   set active = false
 where slug in (
   'zurich-airport-the-circle-16-flughafen-ch-8302-k',
   'st-moritz-the-grisons-switzerland',
   'swiss-national-museum-museumstrasse-2-8001-zu-ri'
 )
   and active;

-- 2. Re-point draft rows, origin side then destination side --------------------------------------
with dup_map as (
  select dup.id as dup_id, can.id as can_id
    from (values
      ('zurich-airport-the-circle-16-flughafen-ch-8302-k', 'zrh-airport'),
      ('st-moritz-the-grisons-switzerland',                'st-moritz')
    ) as m(dup_slug, can_slug)
    join public.service_zones dup on dup.slug = m.dup_slug
    join public.service_zones can on can.slug = m.can_slug
)
update public.fixed_routes f
   set origin_zone_id = dm.can_id
  from dup_map dm, public.rate_versions rv
 where f.origin_zone_id = dm.dup_id
   and rv.id = f.rate_version_id
   and rv.status = 'draft'
   and f.dest_zone_id <> dm.can_id
   and not exists (
     select 1 from public.fixed_routes g
      where g.rate_version_id = f.rate_version_id
        and g.vehicle_class_id = f.vehicle_class_id
        and (   (g.origin_zone_id = dm.can_id and g.dest_zone_id = f.dest_zone_id)
             or (g.origin_zone_id = f.dest_zone_id and g.dest_zone_id = dm.can_id))
   );

with dup_map as (
  select dup.id as dup_id, can.id as can_id
    from (values
      ('zurich-airport-the-circle-16-flughafen-ch-8302-k', 'zrh-airport'),
      ('st-moritz-the-grisons-switzerland',                'st-moritz')
    ) as m(dup_slug, can_slug)
    join public.service_zones dup on dup.slug = m.dup_slug
    join public.service_zones can on can.slug = m.can_slug
)
update public.fixed_routes f
   set dest_zone_id = dm.can_id
  from dup_map dm, public.rate_versions rv
 where f.dest_zone_id = dm.dup_id
   and rv.id = f.rate_version_id
   and rv.status = 'draft'
   and f.origin_zone_id <> dm.can_id
   and not exists (
     select 1 from public.fixed_routes g
      where g.rate_version_id = f.rate_version_id
        and g.vehicle_class_id = f.vehicle_class_id
        and (   (g.origin_zone_id = f.origin_zone_id and g.dest_zone_id = dm.can_id)
             or (g.origin_zone_id = dm.can_id and g.dest_zone_id = f.origin_zone_id))
   );

commit;

-- 3. Review ----------------------------------------------------------------------------------------
select z.slug, z.zone_type, z.iata, z.tags
  from public.service_zones z
 where z.active
 order by z.zone_type, z.slug;

select rv.slug as rate_version, rv.status, o.slug as origin, d.slug as dest, vc.slug as class
  from public.fixed_routes f
  join public.rate_versions rv on rv.id = f.rate_version_id
  join public.service_zones o on o.id = f.origin_zone_id
  join public.service_zones d on d.id = f.dest_zone_id
  join public.vehicle_classes vc on vc.id = f.vehicle_class_id
 where rv.status = 'draft'
   and (not o.active or not d.active)
 order by rv.slug, o.slug, d.slug, vc.slug;

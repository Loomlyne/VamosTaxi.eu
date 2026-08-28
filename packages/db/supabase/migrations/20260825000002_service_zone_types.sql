-- 20260825000002_service_zone_types.sql
--
-- D-10: the five surcharge-predicate discriminators need columns Phase 2's service_zones does
-- not have. zone_type answers pickup_zone_type; tags answers dest_zone_tag. Inferring
-- "airport" from an airport code column is the engine-code hole D-09 exists to close — values
-- arrive from the seed, explicitly, per zone. This file does not backfill from airport codes.
--
-- Negative space: this file adds no polygon (plan 04-05 adds settings_versions.service_area_geojson)
-- and invents no airport/ski predicate on surcharges (U38).
--
-- No GIN index on tags: eight seeded rows fit a sequential scan; revisit if the zone table
-- grows past a page.
--
-- D-46: no CHF amount enters this file.

alter table public.service_zones
  add column zone_type text not null default 'other'
    check (zone_type in ('airport','city','ski','other')),
  add column tags text[] not null default '{}'::text[];

comment on column public.service_zones.zone_type is
  'Explicit zone class for pickup_zone_type predicates (D-10). Never inferred from airport codes.';

comment on column public.service_zones.tags is
  'Tag set for dest_zone_tag predicates (D-10). zone_type and tags are independent: a future non-ski zone can still carry the ski surcharge via tags without zone_type=ski.';

-- 20260928130000_canton_city_zones.sql
--
-- 26.1-10 (D-10, D-10a, D-13): real areas for the pricing engine to match.
--
-- (1) zone_type gains 'canton'. City zones keep 'city' and are keyed by the Mapbox place id
--     tag `mapbox_place:<id>` (written by the ops rate-book route, 26.1-10 Task 2).
-- (2) The 26 Swiss cantons exist as service_zones: slug canton-<code>, tag canton:<CODE> —
--     the two shapes cantonOfZone() (apps/web/lib/pricing/lines.ts) already reads. Display
--     names are each canton's official proper name, non-translatable, in content_strings.
-- (3) public.ops_fill_canton_pairs(version, price): fills every unordered canton -> different
--     canton pair, once, for every class with a distance_rates row in a DRAFT version. The
--     price is an argument the owner types; this file stores no amount (D-10a, D-13, D-46).
--     It publishes nothing and never touches a live or retired version.
--
-- Idempotent: the zone and string inserts are ON CONFLICT DO NOTHING.

-- ---------------------------------------------------------------------------
-- (1) zone_type vocabulary
-- ---------------------------------------------------------------------------

alter table public.service_zones drop constraint if exists service_zones_zone_type_check;
alter table public.service_zones
  add constraint service_zones_zone_type_check
    check (zone_type in ('airport','city','canton','ski','other'));

comment on column public.service_zones.zone_type is
  'Explicit zone class (D-10). airport, city (Mapbox place, tag mapbox_place:<id>), canton (tag canton:<CODE>), ski, other. Never inferred from airport codes.';

-- ---------------------------------------------------------------------------
-- (2) the 26 cantons
-- ---------------------------------------------------------------------------

with cantons(code, name) as (
  values
    ('AG', 'Aargau'),
    ('AI', 'Appenzell Innerrhoden'),
    ('AR', 'Appenzell Ausserrhoden'),
    ('BE', 'Bern'),
    ('BL', 'Basel-Landschaft'),
    ('BS', 'Basel-Stadt'),
    ('FR', 'Fribourg'),
    ('GE', 'Genève'),
    ('GL', 'Glarus'),
    ('GR', 'Graubünden'),
    ('JU', 'Jura'),
    ('LU', 'Luzern'),
    ('NE', 'Neuchâtel'),
    ('NW', 'Nidwalden'),
    ('OW', 'Obwalden'),
    ('SG', 'St. Gallen'),
    ('SH', 'Schaffhausen'),
    ('SO', 'Solothurn'),
    ('SZ', 'Schwyz'),
    ('TG', 'Thurgau'),
    ('TI', 'Ticino'),
    ('UR', 'Uri'),
    ('VD', 'Vaud'),
    ('VS', 'Valais'),
    ('ZG', 'Zug'),
    ('ZH', 'Zürich')
),
zones as (
  insert into public.service_zones (slug, iata, active, zone_type, tags)
  select 'canton-' || lower(c.code), null, true, 'canton', array['canton:' || c.code]
    from cantons c
  on conflict (slug) do nothing
  returning slug
)
insert into public.content_strings (key, en, de, fr, ar, non_translatable)
select 'zone.canton-' || lower(c.code), c.name, c.name, c.name, c.name, true
  from cantons c
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- (3) draft-only canton pair filler
-- ---------------------------------------------------------------------------

/**
 * Fills a DRAFT rate version with every unordered canton -> different canton pair (26 choose 2
 * = 325) for every vehicle class that has a distance_rates row in that version, at one price.
 * One row per pair, origin code < destination code: the kernel matches a pair in both
 * directions (D-09), so the reverse row is never written. A pair already present in either
 * direction is skipped. Returns the number of rows inserted (0 on a second run).
 *
 * Caller: the owner in the SQL editor (postgres, no role switch) or an admin through the
 * Worker (vamos_staff + app.is_admin()). A live or retired version raises restrict_violation
 * and inserts nothing; the frozen triggers on fixed_routes stay in force behind this check.
 */
create or replace function public.ops_fill_canton_pairs(
  p_rate_version_id pg_catalog.int8,
  p_price_rappen public.rappen
)
returns pg_catalog.int4
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.rate_version_status;
  v_count pg_catalog.int4;
begin
  if p_price_rappen is null then
    raise exception 'ops_fill_canton_pairs: price is required'
      using errcode = 'null_value_not_allowed';
  end if;

  -- SECURITY DEFINER sets current_user to the owner; the `role` setting still names the role
  -- the session switched to. No switch (the owner's SQL editor session) or an admin only.
  if not (
       (pg_catalog.current_setting('role') = 'none' and session_user = 'postgres')
    or app.is_admin()
  ) then
    raise exception 'ops_fill_canton_pairs: admin only'
      using errcode = 'insufficient_privilege';
  end if;

  select rv.status into v_status
    from public.rate_versions rv
   where rv.id = p_rate_version_id
   for update;

  if not found then
    raise exception 'ops_fill_canton_pairs: rate_version % not found', p_rate_version_id
      using errcode = 'no_data_found';
  end if;

  if v_status is distinct from 'draft' then
    raise exception 'ops_fill_canton_pairs: rate_version % is %, pairs are filled on a draft only',
      p_rate_version_id, v_status
      using errcode = 'restrict_violation',
            hint = 'Fork a draft from the live version, fill it, and let the owner publish.';
  end if;

  insert into public.fixed_routes (
    rate_version_id, origin_zone_id, dest_zone_id, vehicle_class_id, price_rappen, live
  )
  select p_rate_version_id, o.id, d.id, k.vehicle_class_id, p_price_rappen, true
    from public.service_zones o
    join public.service_zones d
      on d.zone_type = 'canton'
     and d.active
     and d.slug ~ '^canton-[a-z]{2}$'
     and o.slug < d.slug
    cross join (
      select distinct dr.vehicle_class_id
        from public.distance_rates dr
       where dr.rate_version_id = p_rate_version_id
    ) k
   where o.zone_type = 'canton'
     and o.active
     and o.slug ~ '^canton-[a-z]{2}$'
     and not exists (
       select 1
         from public.fixed_routes f
        where f.rate_version_id = p_rate_version_id
          and f.vehicle_class_id = k.vehicle_class_id
          and (   (f.origin_zone_id = o.id and f.dest_zone_id = d.id)
               or (f.origin_zone_id = d.id and f.dest_zone_id = o.id))
     )
  on conflict (rate_version_id, origin_zone_id, dest_zone_id, vehicle_class_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.ops_fill_canton_pairs(pg_catalog.int8, public.rappen)
  from public, anon, authenticated;

grant execute on function public.ops_fill_canton_pairs(pg_catalog.int8, public.rappen)
  to vamos_staff;

comment on function public.ops_fill_canton_pairs(pg_catalog.int8, public.rappen) is
  '26.1-10 D-10a: fills every unordered canton -> different canton pair (325) per class with a distance_rates row, on a DRAFT version only, at the owner-given price argument. Skips pairs present in either direction; returns rows inserted. Caller: postgres (no role switch) or app.is_admin(). EXECUTE: vamos_staff (+ owner).';

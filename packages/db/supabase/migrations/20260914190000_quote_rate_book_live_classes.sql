-- 20260914190000_quote_rate_book_live_classes.sql
--
-- Phase 18 restart D-29 / T-18-01. quote_rate_book.classes must only include
-- vehicle_classes rows that this selected rate version rates (distance_rates
-- or fixed_routes for v_id). Do not jsonb_agg the global four-class catalog.
--
-- Hosted apply is owner-gated (18-07). Agent never apply_migration, never
-- supabase db push, never restore onto yaumjzvylngfjhtuffqs. Never default
-- public_chf true. Do not add pricing_live on rate_versions. Do not SET
-- public_chf = true.

create or replace function public.quote_rate_book(p_prefer_draft boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id bigint;
  v_slug text;
  v_status public.rate_version_status;
  v_public_chf boolean;
  v_vat_rate_bps integer;
  v_version_vat_rate_bps integer;
  v_quote_lock_minutes integer;
  v_service_area_geojson jsonb;
  v_free_wait_minutes integer;
  v_max_extra_stops integer;
begin
  select s.public_chf, s.vat_rate_bps
    into v_public_chf, v_vat_rate_bps
    from public.settings as s
   where s.id = 1;

  v_public_chf := coalesce(v_public_chf, false);
  v_vat_rate_bps := coalesce(v_vat_rate_bps, 81);

  select rv.id, rv.slug, rv.status,
         rv.vat_rate_bps, rv.quote_lock_minutes, rv.service_area_geojson,
         rv.free_wait_minutes, rv.max_extra_stops
    into v_id, v_slug, v_status,
         v_version_vat_rate_bps, v_quote_lock_minutes, v_service_area_geojson,
         v_free_wait_minutes, v_max_extra_stops
    from public.rate_versions as rv
   where rv.status = 'live'
   order by rv.id desc
   limit 1;

  if v_id is null and p_prefer_draft then
    select rv.id, rv.slug, rv.status,
           rv.vat_rate_bps, rv.quote_lock_minutes, rv.service_area_geojson,
           rv.free_wait_minutes, rv.max_extra_stops
      into v_id, v_slug, v_status,
           v_version_vat_rate_bps, v_quote_lock_minutes, v_service_area_geojson,
           v_free_wait_minutes, v_max_extra_stops
      from public.rate_versions as rv
     where rv.status = 'draft'
     order by rv.created_at desc, rv.id desc
     limit 1;
  end if;

  if v_id is null then
    return jsonb_build_object(
      'rate_version', null,
      'classes', '[]'::jsonb,
      'distance_rates', '[]'::jsonb,
      'distance_bands', '[]'::jsonb,
      'region_premiums', '[]'::jsonb,
      'fixed_routes', '[]'::jsonb,
      'surcharges', '[]'::jsonb,
      'coupons', '[]'::jsonb,
      'zones', '[]'::jsonb,
      'public_chf', v_public_chf,
      'vat_rate_bps', v_vat_rate_bps
    );
  end if;

  return jsonb_build_object(
    'rate_version', jsonb_build_object(
      'id', v_id,
      'slug', v_slug,
      'status', v_status,
      'vat_rate_bps', v_version_vat_rate_bps,
      'quote_lock_minutes', v_quote_lock_minutes,
      'service_area_geojson', v_service_area_geojson,
      'free_wait_minutes', v_free_wait_minutes,
      'max_extra_stops', v_max_extra_stops
    ),
    'classes', (
      select coalesce(jsonb_agg(to_jsonb(c) order by c.sort_order, c.slug), '[]'::jsonb)
        from public.vehicle_classes as c
       where exists (
               select 1
                 from public.distance_rates as d
                where d.rate_version_id = v_id
                  and d.vehicle_class_id = c.id
             )
          or exists (
               select 1
                 from public.fixed_routes as f
                where f.rate_version_id = v_id
                  and f.vehicle_class_id = c.id
             )
    ),
    'distance_rates', (
      select coalesce(jsonb_agg(to_jsonb(d) order by d.vehicle_class_id), '[]'::jsonb)
        from public.distance_rates as d
       where d.rate_version_id = v_id
    ),
    'distance_bands', (
      select coalesce(jsonb_agg(to_jsonb(b) order by b.vehicle_class_id, b.from_km), '[]'::jsonb)
        from public.distance_bands as b
       where b.rate_version_id = v_id
    ),
    'region_premiums', (
      select coalesce(jsonb_agg(to_jsonb(p) order by p.zone_id), '[]'::jsonb)
        from public.region_premiums as p
       where p.rate_version_id = v_id
    ),
    'fixed_routes', (
      select coalesce(
               jsonb_agg(to_jsonb(f) order by f.origin_zone_id, f.dest_zone_id, f.vehicle_class_id),
               '[]'::jsonb
             )
        from public.fixed_routes as f
       where f.rate_version_id = v_id
    ),
    'surcharges', (
      select coalesce(jsonb_agg(to_jsonb(s) order by s.code), '[]'::jsonb)
        from public.surcharges as s
       where s.rate_version_id = v_id
    ),
    'coupons', (
      select coalesce(jsonb_agg(to_jsonb(cp) order by cp.code), '[]'::jsonb)
        from public.coupons as cp
       where cp.rate_version_id = v_id
    ),
    'zones', (
      select coalesce(jsonb_agg(to_jsonb(z) order by z.slug), '[]'::jsonb)
        from public.service_zones as z
    ),
    'public_chf', v_public_chf,
    'vat_rate_bps', v_vat_rate_bps
  );
end;
$$;

revoke all on function public.quote_rate_book(boolean) from public;
grant execute on function public.quote_rate_book(boolean) to anon, authenticated;

comment on function public.quote_rate_book(boolean) is
  'Frozen book for the live version, or newest draft when p_prefer_draft (staff/staging only). classes are only rows rated on that version (D-29). Returns settings.public_chf for the Worker AND. Never flips that flag.';

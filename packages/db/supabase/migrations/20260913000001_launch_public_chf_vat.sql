-- 20260913000001_launch_public_chf_vat.sql
--
-- Phase 11 D-18/D-19/D-22. Additive public_chf + vat_rate_bps on settings.
-- Hosted apply is owner-gated (11-11). Do not invent CHF.
-- Agent never apply_migration, never supabase db push, never restore onto
-- yaumjzvylngfjhtuffqs. Do not GRANT SELECT on public.settings to anon/public/
-- vamos_public. Do not put public_chf on settings_public. Do not add
-- pricing_live on rate_versions.

alter table public.settings
  add column if not exists public_chf boolean not null default false,
  add column if not exists vat_rate_bps integer not null default 81
    check (vat_rate_bps >= 0);

comment on column public.settings.public_chf is
  'D-18/D-19: public CHF display + checkout pricing_live AND. False until OPS Publish-as-flip. Independent of rate_versions.status.';
comment on column public.settings.vat_rate_bps is
  'D-22: Swiss VAT on top of net, hundredths of a percent. Default 81 = existing CH_VAT_RATE_BPS. Not an invented rate.';

-- Quote identity cannot SELECT public.settings (42501). Extend quote_rate_book
-- JSON (existing asQuote + definer RPC path) with the two flags from id = 1.
-- Copy the latest body from 20260906000001_distance_bands.sql — do not regress bands.

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
begin
  select s.public_chf, s.vat_rate_bps
    into v_public_chf, v_vat_rate_bps
    from public.settings as s
   where s.id = 1;

  v_public_chf := coalesce(v_public_chf, false);
  v_vat_rate_bps := coalesce(v_vat_rate_bps, 81);

  select rv.id, rv.slug, rv.status
    into v_id, v_slug, v_status
    from public.rate_versions as rv
   where rv.status = 'live'
   order by rv.id desc
   limit 1;

  if v_id is null and p_prefer_draft then
    select rv.id, rv.slug, rv.status
      into v_id, v_slug, v_status
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
      'zones', '[]'::jsonb,
      'public_chf', v_public_chf,
      'vat_rate_bps', v_vat_rate_bps
    );
  end if;

  return jsonb_build_object(
    'rate_version', jsonb_build_object(
      'id', v_id,
      'slug', v_slug,
      'status', v_status
    ),
    'classes', (
      select coalesce(jsonb_agg(to_jsonb(c) order by c.sort_order, c.slug), '[]'::jsonb)
        from public.vehicle_classes as c
    ),
    'distance_rates', (
      select coalesce(jsonb_agg(to_jsonb(d) order by d.vehicle_class_id), '[]'::jsonb)
        from public.distance_rates as d
       where d.rate_version_id = v_id
    ),
    'distance_bands', (
      select coalesce(jsonb_agg(to_jsonb(b) order by b.from_km), '[]'::jsonb)
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

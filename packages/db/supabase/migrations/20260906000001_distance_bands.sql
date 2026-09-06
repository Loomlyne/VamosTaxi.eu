-- 20260906000001_distance_bands.sql
--
-- 04.3: blended km bands + region % on a rate version.
-- Amounts are not seeded live. Owner numbers enter via OPS draft, then Publish.

alter table public.distance_rates
  alter column base_fare_rappen drop not null,
  alter column per_km_rappen drop not null;

create table public.distance_bands (
  id              bigint generated always as identity primary key,
  rate_version_id bigint not null references public.rate_versions(id) on delete restrict,
  from_km         integer not null check (from_km >= 0),
  to_km           integer check (to_km is null or to_km > from_km),
  per_km_rappen   rappen not null check (per_km_rappen >= 0),
  unique (rate_version_id, from_km)
);
comment on table public.distance_bands is
  'Blended per-km bands after the class floor. from_km exclusive start; to_km inclusive end, null = open.';

create table public.region_premiums (
  id              bigint generated always as identity primary key,
  rate_version_id bigint not null references public.rate_versions(id) on delete restrict,
  zone_id         uuid not null references public.service_zones(id) on delete restrict,
  percent         numeric(5,2) not null check (percent >= 0 and percent <= 100),
  unique (rate_version_id, zone_id)
);
comment on table public.region_premiums is
  'Percent on the fare line when pickup or dropoff is this zone. Kernel takes the max match, never stacks.';

alter table public.distance_bands enable row level security;
alter table public.region_premiums enable row level security;

revoke all on public.distance_bands from public, anon, authenticated, vamos_edge, vamos_public, vamos_guest;
revoke all on public.region_premiums from public, anon, authenticated, vamos_edge, vamos_public, vamos_guest;
grant select, insert, update, delete on public.distance_bands to vamos_staff;
grant select, insert, update, delete on public.region_premiums to vamos_staff;
grant usage, select on sequence public.distance_bands_id_seq to vamos_staff;
grant usage, select on sequence public.region_premiums_id_seq to vamos_staff;

create policy distance_bands_staff_all on public.distance_bands
  as restrictive for all to vamos_staff
  using ((select app.is_staff())) with check ((select app.is_staff()));
create policy region_premiums_staff_all on public.region_premiums
  as restrictive for all to vamos_staff
  using ((select app.is_staff())) with check ((select app.is_staff()));

create policy distance_bands_admin_insert on public.distance_bands
  as restrictive for insert to vamos_staff
  with check ((select app.is_admin()));
create policy distance_bands_admin_delete on public.distance_bands
  as restrictive for delete to vamos_staff
  using ((select app.is_admin()));
create policy distance_bands_admin_update on public.distance_bands
  as restrictive for update to vamos_staff
  using ((select app.is_admin()) or app.rate_version_published(distance_bands.rate_version_id))
  with check ((select app.is_admin()) or app.rate_version_published(distance_bands.rate_version_id));

create policy region_premiums_admin_insert on public.region_premiums
  as restrictive for insert to vamos_staff
  with check ((select app.is_admin()));
create policy region_premiums_admin_delete on public.region_premiums
  as restrictive for delete to vamos_staff
  using ((select app.is_admin()));
create policy region_premiums_admin_update on public.region_premiums
  as restrictive for update to vamos_staff
  using ((select app.is_admin()) or app.rate_version_published(region_premiums.rate_version_id))
  with check ((select app.is_admin()) or app.rate_version_published(region_premiums.rate_version_id));

create trigger distance_bands_frozen before update or delete on public.distance_bands
  for each row execute function public.tg_pricing_row_frozen();
create trigger region_premiums_frozen before update or delete on public.region_premiums
  for each row execute function public.tg_pricing_row_frozen();
create trigger distance_bands_frozen_ins before insert on public.distance_bands
  for each row execute function public.tg_pricing_row_frozen();
create trigger region_premiums_frozen_ins before insert on public.region_premiums
  for each row execute function public.tg_pricing_row_frozen();

create or replace function public.tg_rate_version_transition() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_missing integer;
begin
  if new.status is distinct from old.status then
    if not ((old.status = 'draft' and new.status = 'live')
         or (old.status = 'live'  and new.status = 'retired')) then
      raise exception 'illegal rate_version transition % -> %', old.status, new.status
        using errcode = 'restrict_violation',
              hint = 'Only draft->live and live->retired are legal. Publish a new version instead.';
    end if;
  end if;

  if new.status = 'live' and old.status = 'draft' then
    select count(*) into v_missing from public.distance_rates r
     where r.rate_version_id = new.id and r.available
       and (
         r.min_fare_rappen is null
         or (
           (r.base_fare_rappen is null or r.per_km_rappen is null)
           and not exists (
             select 1 from public.distance_bands b
              where b.rate_version_id = new.id
           )
         )
       );
    if v_missing > 0 then
      raise exception 'rate_version % has % unpriced distance_rates rows', new.id, v_missing
        using errcode = 'restrict_violation';
    end if;

    select count(*) into v_missing from public.surcharges s
     where s.rate_version_id = new.id and s.active and s.kind <> 'included'
       and coalesce(s.amount_rappen, (s.percent * 100)::integer) is null;
    if v_missing > 0 then
      raise exception 'rate_version % has % unpriced surcharges', new.id, v_missing
        using errcode = 'restrict_violation';
    end if;

    select count(*) into v_missing from public.fixed_routes f
     where f.rate_version_id = new.id and f.live and f.price_rappen is null;
    if v_missing > 0 then
      raise exception 'rate_version % has % unpriced live fixed_routes', new.id, v_missing
        using errcode = 'restrict_violation';
    end if;

    select count(*) into v_missing from public.surcharges s
     where s.rate_version_id = new.id and s.active
       and s.predicate = '{}'::jsonb;
    if v_missing > 0 then
      raise exception 'rate_version % has % active surcharges with empty predicate', new.id, v_missing
        using errcode = 'restrict_violation',
              hint = 'An empty predicate is an unanswered rule (U38). Confirm airport-zone and ski-tag rules with the owner before publishing — do not default them.';
    end if;

    new.published_at := now();
    new.published_by := app.uid();
  end if;
  return new;
end $$;

revoke all on function public.tg_rate_version_transition() from public;

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
begin
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
      'zones', '[]'::jsonb
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
    )
  );
end;
$$;

revoke all on function public.quote_rate_book(boolean) from public;
grant execute on function public.quote_rate_book(boolean) to anon, authenticated;


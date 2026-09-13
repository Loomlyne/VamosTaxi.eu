-- 20260913180000_ops_pricing_source.sql
--
-- Phase 18 D-08 / D-14 / D-19 / D-20 / D-22 / D-34 / D-40. Additive fare-book
-- schema so Publish completeness, per-class bands, versioned coupons, and lock
-- expiry match the OPS Pricing source of truth.
-- Hosted apply is owner-gated (18-02 Task 3). Do not invent CHF.
-- Agent never apply_migration, never supabase db push, never restore onto
-- yaumjzvylngfjhtuffqs. Do not GRANT SELECT on public.settings to anon/public/
-- vamos_public. Do not put public_chf on settings_public. Do not add
-- pricing_live on rate_versions. Do not default or flip public_chf. Do not
-- insert a live rate_versions row. Do not seed fare amounts. Do not drop
-- min_fare_rappen (the column lingers unused). Live id 5 is not the flip (D-40).

-- ---------------------------------------------------------------------------
-- (1) D-14: distance_bands are per class. Backfill copies existing unclassed
-- band rows onto every vehicle_class_id that already has a distance_rates row
-- on the same rate_version_id (same from_km, to_km, per_km_rappen). That
-- duplicates current amounts per class; it does not invent CHF.
-- ---------------------------------------------------------------------------

alter table public.distance_bands
  add column if not exists vehicle_class_id uuid references public.vehicle_classes(id) on delete restrict;

comment on column public.distance_bands.vehicle_class_id is
  'D-14: km bands are a separate table per class. Band CHF is on top of class per-km.';

alter table public.distance_bands
  drop constraint if exists distance_bands_rate_version_id_from_km_key;

-- Freeze triggers refuse INSERT/DELETE on non-draft versions (hosted live id 5).
-- Disable them only for this copy; amounts are unchanged.
alter table public.distance_bands disable trigger distance_bands_frozen;
alter table public.distance_bands disable trigger distance_bands_frozen_ins;

insert into public.distance_bands (rate_version_id, vehicle_class_id, from_km, to_km, per_km_rappen)
select b.rate_version_id, dr.vehicle_class_id, b.from_km, b.to_km, b.per_km_rappen
  from public.distance_bands as b
  inner join public.distance_rates as dr
    on dr.rate_version_id = b.rate_version_id
 where b.vehicle_class_id is null
   and not exists (
     select 1
       from public.distance_bands as x
      where x.rate_version_id = b.rate_version_id
        and x.vehicle_class_id = dr.vehicle_class_id
        and x.from_km = b.from_km
   );

delete from public.distance_bands as b
 where b.vehicle_class_id is null
   and exists (
     select 1
       from public.distance_bands as x
      where x.rate_version_id = b.rate_version_id
        and x.from_km = b.from_km
        and x.vehicle_class_id is not null
   );

alter table public.distance_bands enable trigger distance_bands_frozen;
alter table public.distance_bands enable trigger distance_bands_frozen_ins;

create unique index if not exists distance_bands_version_class_from
  on public.distance_bands (rate_version_id, vehicle_class_id, from_km)
  where vehicle_class_id is not null;

create index if not exists distance_bands_version_class
  on public.distance_bands (rate_version_id, vehicle_class_id);

-- ---------------------------------------------------------------------------
-- (2) D-08: recreate tg_rate_version_transition. live-from-draft requires
-- available distance_rates to have non-null base_fare_rappen, per_km_rappen,
-- max_pax, and a vehicle_classes slug (the class name key). Drop the floor
-- column from that check. Empty added surcharge/fixed_route rows with null
-- amounts still block. Empty predicates still block (04-04). Bands remain
-- optional if none exist.
-- create or replace keeps rate_versions_transition bound. Re-issue the revoke.
-- ---------------------------------------------------------------------------

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
    -- D-08: name/slug, start, per-km, max pax. Not a first-X-km floor.
    -- Bands are not required when no band row was added.
    select count(*) into v_missing
      from public.distance_rates as r
      left join public.vehicle_classes as vc on vc.id = r.vehicle_class_id
     where r.rate_version_id = new.id and r.available
       and (
            r.base_fare_rappen is null
         or r.per_km_rappen is null
         or r.max_pax is null
         or vc.id is null
         or nullif(btrim(vc.slug), '') is null
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

-- ---------------------------------------------------------------------------
-- (3) D-34: coupons wait for Publish. Attach existing rows to the current live
-- version id if one exists; otherwise they stay null and unusable on public.
-- ---------------------------------------------------------------------------

alter table public.coupons
  add column if not exists rate_version_id bigint references public.rate_versions(id) on delete restrict;

comment on column public.coupons.rate_version_id is
  'D-34: public cannot use a new coupon until Publish. Null = unusable on the public book.';

update public.coupons as c
   set rate_version_id = (
     select rv.id
       from public.rate_versions as rv
      where rv.status = 'live'
      order by rv.id desc
      limit 1
   )
 where c.rate_version_id is null
   and exists (
     select 1 from public.rate_versions as rv where rv.status = 'live'
   );

create index if not exists coupons_rate_version
  on public.coupons (rate_version_id)
  where rate_version_id is not null;

-- ---------------------------------------------------------------------------
-- (4) Draft VAT / lock / service area / free wait / extra stops live on the
-- version so Publish is one asStaff tx (D-03 / D-20 / D-30 / D-39). Nullable.
-- UI hours convert at the staff boundary. No CHF literals.
-- ---------------------------------------------------------------------------

alter table public.rate_versions
  add column if not exists vat_rate_bps integer check (vat_rate_bps >= 0),
  add column if not exists quote_lock_minutes integer check (quote_lock_minutes is null or quote_lock_minutes > 0),
  add column if not exists service_area_geojson jsonb,
  add column if not exists free_wait_minutes integer check (free_wait_minutes is null or free_wait_minutes >= 0),
  add column if not exists max_extra_stops integer check (max_extra_stops is null or max_extra_stops >= 0);

comment on column public.rate_versions.vat_rate_bps is
  'D-03: VAT hundredths of a percent. Applied to settings only in the Publish tx. Null until the admin sets it on the draft.';
comment on column public.rate_versions.quote_lock_minutes is
  'D-20: quote lock length stored as minutes. UI is hours; convert at the staff boundary.';
comment on column public.rate_versions.service_area_geojson is
  'D-39: Mapbox service area on this book. Quote only when pickup and dropoff are both inside.';
comment on column public.rate_versions.free_wait_minutes is
  'D-38: free airport wait on this book. Extra wait after this is CHF 0 at pay.';
comment on column public.rate_versions.max_extra_stops is
  'D-37: max extra stops on this book.';

-- ---------------------------------------------------------------------------
-- (5) D-19: a class can be hidden from public while ops can still assign it.
-- ---------------------------------------------------------------------------

alter table public.distance_rates
  add column if not exists hide_from_public boolean not null default false;

comment on column public.distance_rates.hide_from_public is
  'D-19: hidden from public (listed, Select off) while ops can still assign. Waits for Publish.';

-- ---------------------------------------------------------------------------
-- (6) D-33: preview test unpaid is marked on the booking. Default false.
-- ---------------------------------------------------------------------------

alter table public.bookings
  add column if not exists is_test boolean not null default false;

comment on column public.bookings.is_test is
  'D-33: admin preview test unpaid. No Stripe, no mail. Ops board marked test. Pay off.';

-- ---------------------------------------------------------------------------
-- (7) D-30: rule rows the admin adds; surcharge rows pick one.
-- ---------------------------------------------------------------------------

create table if not exists public.rate_version_rules (
  id              bigint generated always as identity primary key,
  rate_version_id bigint not null references public.rate_versions(id) on delete restrict,
  kind            text not null check (kind <> ''),
  payload         jsonb not null default '{}'::jsonb
);

comment on table public.rate_version_rules is
  'D-30: night/weekend/holiday/waiting/lock/free-wait/extra-stops/service-area rules for one rate version. Surcharge rows pick a rule.';

alter table public.rate_version_rules enable row level security;

revoke all on public.rate_version_rules from public, anon, authenticated, vamos_edge, vamos_public, vamos_guest;
grant select, insert, update, delete on public.rate_version_rules to vamos_staff;
grant usage, select on sequence public.rate_version_rules_id_seq to vamos_staff;

drop policy if exists rate_version_rules_staff_all on public.rate_version_rules;
create policy rate_version_rules_staff_all on public.rate_version_rules
  as restrictive for all to vamos_staff
  using ((select app.is_staff())) with check ((select app.is_staff()));

drop policy if exists rate_version_rules_admin_insert on public.rate_version_rules;
create policy rate_version_rules_admin_insert on public.rate_version_rules
  as restrictive for insert to vamos_staff
  with check ((select app.is_admin()));

drop policy if exists rate_version_rules_admin_delete on public.rate_version_rules;
create policy rate_version_rules_admin_delete on public.rate_version_rules
  as restrictive for delete to vamos_staff
  using ((select app.is_admin()));

drop policy if exists rate_version_rules_admin_update on public.rate_version_rules;
create policy rate_version_rules_admin_update on public.rate_version_rules
  as restrictive for update to vamos_staff
  using ((select app.is_admin()) or app.rate_version_published(rate_version_rules.rate_version_id))
  with check ((select app.is_admin()) or app.rate_version_published(rate_version_rules.rate_version_id));

drop trigger if exists rate_version_rules_frozen on public.rate_version_rules;
create trigger rate_version_rules_frozen before update or delete on public.rate_version_rules
  for each row execute function public.tg_pricing_row_frozen();

drop trigger if exists rate_version_rules_frozen_ins on public.rate_version_rules;
create trigger rate_version_rules_frozen_ins before insert on public.rate_version_rules
  for each row execute function public.tg_pricing_row_frozen();

alter table public.surcharges
  add column if not exists rule_id bigint references public.rate_version_rules(id) on delete restrict;

comment on column public.surcharges.rule_id is
  'D-30: surcharge row picks one rule from rate_version_rules. Null until attached.';

-- ---------------------------------------------------------------------------
-- (8) D-22: unpaid pending bookings expire on the locked snapshot deadline,
-- not created_at + 24 hours and not the new book's hours.
-- ---------------------------------------------------------------------------

create or replace function public.checkout_expire_unpaid()
returns table (booking_id uuid, reference text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.bookings%rowtype;
  v_cut integer;
begin
  for v in
    select b.*
      from public.bookings as b
      inner join public.price_snapshots as ps on ps.id = b.price_snapshot_id
     where b.status = 'pending'
       and ps.quote_lock_expires_at <= now()
     order by ps.quote_lock_expires_at, b.created_at
     for update of b skip locked
  loop
    update public.booking_legs bl
       set status = 'cancelled'
     where bl.booking_id = v.id
       and bl.status not in ('completed', 'no_show', 'cancelled');
    get diagnostics v_cut = row_count;
    if v_cut = 0 then
      continue;
    end if;

    update public.bookings
       set status = 'cancelled'
     where id = v.id;

    insert into public.booking_events (
      booking_id, booking_leg_id, kind, actor_kind, actor_label,
      from_status, to_status, payload
    ) values (
      v.id, null, 'booking.status_changed', 'cron', 'unpaid lock',
      v.status, 'cancelled',
      jsonb_build_object('via', 'expire_unpaid')
    );

    booking_id := v.id;
    reference := v.reference;
    return next;
  end loop;
end
$$;

revoke all on function public.checkout_expire_unpaid() from public;
grant execute on function public.checkout_expire_unpaid() to vamos_system;

-- ---------------------------------------------------------------------------
-- (9) Extend quote_rate_book: hide_from_public (via distance_rates row JSON),
-- per-class bands, version vat/lock/service_area, coupons for that version.
-- Public path still returns settings.public_chf for the Worker AND.
-- prefer_draft remains staff-only at the Worker (asQuote never passes true on
-- the public host). This RPC still honours p_prefer_draft for the D-33
-- staging branch and pgTAP. Do not add pricing_live on rate_versions.
-- ---------------------------------------------------------------------------

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
  'Frozen book for the live version, or newest draft when p_prefer_draft (staff/staging only). Returns settings.public_chf for the Worker AND. Never flips that flag.';

-- ---------------------------------------------------------------------------
-- (10) D-38: ops marks arrival; extra-wait clock starts then.
-- ---------------------------------------------------------------------------

alter table public.booking_legs
  add column if not exists arrived_at timestamptz;

comment on column public.booking_legs.arrived_at is
  'D-38: ops clock. Extra wait after free wait starts when ops marks arrival.';

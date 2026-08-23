-- 20260823000008_rate_versions.sql
--
-- DATA-01: the versioned pricing batches — rate_versions, service_zones, distance_rates,
-- fixed_routes, surcharges — plus the two triggers that make QUOTE-10's "cannot go live
-- half-priced" a database guarantee instead of a checklist item (D-09).
--
-- D-34: every priced column here is nullable `rappen`/`numeric` and seeds/defaults to
-- nothing — no numeric CHF literal appears anywhere in this file. The owner's CHF matrix is
-- still open; Plan 02-09's seed inserts rows with every amount NULL and no `status='live'`
-- row, so `pricing_live` (D-09) stays false until the owner approves real numbers.
--
-- Supersedes GSD-LAUNCH's single `bookings.price_chf numeric` line (Q1, D-07): a booking's
-- charged price is not a mutable column, it is this versioned batch plus an insert-only
-- `price_snapshots` row (Plan 02-05) that cites the exact rate_version/distance_rates/
-- fixed_routes/surcharges rows it was computed from.

create table public.rate_versions (
  id           bigint generated always as identity primary key,
  -- The natural key the seed and the child pricing tables conflict on. An identity id is a
  -- fresh value on every push, so without a slug `insert ... on conflict` has no target and
  -- each deploy appends another draft version with a full duplicate matrix under it.
  slug         text not null unique,
  label        text not null,
  status       rate_version_status not null default 'draft',
  note         text not null default '',
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  constraint rate_versions_published_stamp
    check (status = 'draft' or published_at is not null)
);
comment on table public.rate_versions is 'Immutable pricing batches. Exactly one live row = pricing_live. Publishing is the launch trigger (QUOTE-10).';

-- D-09: pricing_live is not a column anywhere in this schema. No settings.pricing_live
-- boolean exists to flip by accident and record nothing — "live" is "exactly one
-- rate_versions row carries status='live'", enforced structurally by this partial unique
-- index. Before the owner's CHF matrix is approved, no row is live, so no snapshot is
-- chargeable, so the payment trigger (Plan 02-05) refuses every charge (QUOTE-10).
create unique index rate_versions_one_live on public.rate_versions ((true)) where status = 'live';

/**
 * Publishing is the launch trigger, so it is the most guarded statement in the schema. Three
 * things this trigger enforces that nothing else can:
 *
 *  1. LEGAL TRANSITIONS ONLY — draft->live and live->retired. A live version can never return
 *     to 'draft': if it could, tg_pricing_row_frozen would stop raising and the distance_rates
 *     / surcharges rows that immutable price_snapshots cite as `source_row` would become
 *     editable, so a snapshot's provenance would start pointing at mutated rows. That is the
 *     exact failure price_snapshots exists to prevent. 'retired' is terminal.
 *  2. COMPLETENESS — a version may not go live half-priced. Publishing with `surcharges.night`
 *     still NULL would let a 23:10 pickup be quoted and charged with the night surcharge
 *     silently omitted, recorded in an immutable snapshot as if that were correct.
 *  3. ATTRIBUTION — published_at / published_by are stamped here, not trusted from the caller.
 *
 * F-20: this function declares an empty search_path — every name below is schema-qualified.
 */
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
       and (r.base_fare_rappen is null or r.per_km_rappen is null or r.min_fare_rappen is null);
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

    new.published_at := now();
    new.published_by := app.uid();
  end if;
  return new;
end $$;

create trigger rate_versions_transition before update on public.rate_versions
  for each row execute function public.tg_rate_version_transition();

-- Every function created in schema public/app needs its own explicit revoke: the schema-
-- level ALTER DEFAULT PRIVILEGES REVOKE from 20260823000002_roles_and_helpers.sql does not
-- apply at CREATE FUNCTION time on this Postgres image (see 02-03's SUMMARY deviations) —
-- without this line, extensions.test.sql's catalog-wide F-13 sweep fails on this function.
revoke all on function public.tg_rate_version_transition() from public;

/**
 * F-04 / T-02-43: tg_rate_version_transition is BEFORE UPDATE only. Without this second
 * trigger, a single INSERT bypasses every guarantee above: the rate_versions_published_stamp
 * CHECK (`status = 'draft' or published_at is not null`) is satisfied by simply supplying a
 * `published_at` value in the INSERT itself, and rate_versions_one_live only bites once a
 * live row already exists — which, before launch, is exactly when none does. So
 * `insert into rate_versions (slug, label, status, published_at, published_by)
 *  values ('x','x','live', now(), <attacker-controlled uuid>)` would make pricing_live true
 * with attacker-supplied attribution and zero completeness checking. This trigger forces
 * every INSERT to be born 'draft' with no attribution, so publishing is an UPDATE, always.
 */
create or replace function public.tg_rate_version_insert_draft() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status <> 'draft' then
    raise exception 'a rate_version is created draft and published by UPDATE, never inserted live'
      using errcode = 'restrict_violation',
            hint = 'Insert with status=''draft'', then UPDATE to ''live'' once the matrix is complete.';
  end if;
  new.published_at := null;
  new.published_by := null;
  return new;
end $$;

create trigger rate_versions_insert_draft before insert on public.rate_versions
  for each row execute function public.tg_rate_version_insert_draft();

revoke all on function public.tg_rate_version_insert_draft() from public;

-- Service zones for fixed routes. Seeded from the mock's LOCATIONS list.
create table public.service_zones (
  id     uuid primary key default extensions.gen_random_uuid(),
  slug   text not null unique,       -- 'zrh-airport','gva-airport','zurich-city','zermatt'...
  iata   text,                       -- 'ZRH' where it applies; .vt-dir-keep in Arabic
  active boolean not null default true
);
comment on table public.service_zones is 'Named pickup/dropoff zones for fixed routes. Display names live in content_strings (zone.<slug>).';

-- VamosOps `rates`: per class per km. One CHF amount, ADR-004.
create table public.distance_rates (
  id               bigint generated always as identity primary key,
  rate_version_id  bigint not null references public.rate_versions(id) on delete restrict,
  vehicle_class_id uuid   not null references public.vehicle_classes(id) on delete restrict,
  base_fare_rappen rappen check (base_fare_rappen >= 0),  -- NULL until the matrix lands
  -- D-30 / U8: integer rappen truncates a fractional-rappen per-km figure. Read the matrix
  -- when it lands; if it quotes a fraction, switch this column to per_km_millirappen. The
  -- line AMOUNT computed from it stays integer rappen regardless — only the rate itself
  -- would gain precision. Safe to defer; recorded here so it isn't invented later.
  per_km_rappen    rappen check (per_km_rappen    >= 0),
  min_fare_rappen  rappen check (min_fare_rappen  >= 0),
  max_pax          smallint not null check (max_pax between 1 and 16),
  available        boolean not null default true,
  unique (rate_version_id, vehicle_class_id)
);
comment on table public.distance_rates is 'Per-class distance pricing for one rate version. All amounts NULL until the owner CHF matrix lands (D-34).';

-- VamosOps `routes`: fixed point-to-point prices, one CHF amount per class.
create table public.fixed_routes (
  id               bigint generated always as identity primary key,
  rate_version_id  bigint not null references public.rate_versions(id) on delete restrict,
  origin_zone_id   uuid   not null references public.service_zones(id) on delete restrict,
  dest_zone_id     uuid   not null references public.service_zones(id) on delete restrict,
  vehicle_class_id uuid   not null references public.vehicle_classes(id) on delete restrict,
  price_rappen     rappen check (price_rappen >= 0),   -- NULL until the matrix lands
  live             boolean not null default false,
  unique (rate_version_id, origin_zone_id, dest_zone_id, vehicle_class_id),
  constraint fixed_routes_distinct_zones check (origin_zone_id <> dest_zone_id)
);
comment on table public.fixed_routes is 'Fixed-price routes for one rate version. The mock stored four currencies per class; ADR-004 collapses that to one CHF amount.';

create table public.surcharges (
  id              bigint generated always as identity primary key,
  rate_version_id bigint not null references public.rate_versions(id) on delete restrict,
  -- Stable identity and i18n key stem: 'airport_pickup','night','waiting_airport',
  -- 'waiting_city','extra_stop','child_seat','meet_greet','ski_rack'.
  -- The mock's English `label` and `rule` strings do NOT port here — they live in
  -- apps/web/i18n/messages as price.surcharge.<code>.label / .rule in en/de/fr/ar
  -- (Law 03, D-08). A stored English string frozen into an immutable price_snapshot would
  -- mean every German confirmation email quotes an English line.
  code            text not null,
  kind            surcharge_kind not null default 'amount',
  amount_rappen   rappen       check (amount_rappen >= 0),
  percent         numeric(5,2) check (percent between 0 and 100),
  applies_to      text not null default 'leg' check (applies_to in ('leg','booking')),
  active          boolean not null default true,
  unique (rate_version_id, code),
  constraint surcharges_kind_field check (
       (kind = 'amount'   and percent is null)
    or (kind = 'percent'  and amount_rappen is null)
    or (kind = 'included' and amount_rappen is null and percent is null)
  )
);
comment on table public.surcharges is 'Night, airport, child-seat and similar rules for one rate version. Labels are i18n keys, never stored prose (D-08).';

-- The night-window predicate itself (20:00-06:00 Europe/Zurich, D-35 / ADR-014 §5) is not a
-- column here — it is a seeded settings_versions fact (night_window_start/end/tz, already
-- nullable on settings_versions per Plan 02-03, populated by Plan 02-09's seed). This table
-- only records THAT a night surcharge exists for the version and what it costs; WHEN it
-- applies is the quote engine reading settings_versions — the snapshot's `basis.why` fact
-- with `tz`.

/**
 * A pricing row's AMOUNTS are immutable once its version leaves draft, so every snapshot FK
 * stays honest. Its OFFER AVAILABILITY is not: `fixed_routes.live` and
 * `distance_rates.available` are live ops controls, not pricing data —
 * `app/ops/OpsPricing.dc.html:279` renders a per-route switch hinted "Off keeps the route on
 * file but hides it from the booking flow", and :311 an `Available` switch per class.
 * Freezing those two columns would mean taking Zermatt off sale for a weekend requires
 * publishing a whole new rate version, which would also rewrite the provenance of every
 * snapshot that follows. So the freeze is column-scoped: everything except the availability
 * flag is immutable, and toggling the flag is an ordinary audited UPDATE (tg_audit_row,
 * Plan 02-06's `...17_audit_log.sql`).
 *
 * F-12 / T-02-44: without an INSERT-time half, an admin can
 * `insert into fixed_routes (..., price_rappen, live) select ... from rate_versions where
 * status = 'live'` and the new route is immediately sellable at a price that never passed the
 * completeness gate, with no new version and no published_by. `unique (rate_version_id,
 * vehicle_class_id)` bounds only the distance_rates case; fixed_routes and surcharges are
 * unbounded. This function already resolves the version via
 * `coalesce(new.rate_version_id, old.rate_version_id)` and its availability carve-out is
 * guarded by `tg_op = 'UPDATE'`, so attaching it to BEFORE INSERT as well needs no change to
 * the body: an INSERT against a non-draft version falls straight through to the raise, which
 * is the wanted behaviour.
 *
 * F-20: this function also declares an empty search_path.
 */
create or replace function public.tg_pricing_row_frozen()
returns trigger language plpgsql set search_path = '' as $$
declare v_status public.rate_version_status; v_old jsonb; v_new jsonb;
begin
  select status into v_status from public.rate_versions
   where id = coalesce(new.rate_version_id, old.rate_version_id);

  if v_status is distinct from 'draft' then
    if tg_op = 'UPDATE' then
      -- Compare every column except the availability flag for this table.
      v_old := to_jsonb(old) - 'live' - 'available';
      v_new := to_jsonb(new) - 'live' - 'available';
      if v_old = v_new then
        return new;   -- availability-only change: allowed, and audited by tg_audit_row
      end if;
    end if;
    raise exception 'pricing rows are immutable once their rate_version leaves draft (%.% id=%)',
      tg_table_schema, tg_table_name, coalesce(new.id, old.id)
      using errcode = 'restrict_violation',
            hint = 'Publish a new rate_version instead of editing a live one. Only `live` / `available` may still be toggled.';
  end if;
  return coalesce(new, old);
end $$;

create trigger distance_rates_frozen before update or delete on public.distance_rates
  for each row execute function public.tg_pricing_row_frozen();
create trigger surcharges_frozen before update or delete on public.surcharges
  for each row execute function public.tg_pricing_row_frozen();
create trigger fixed_routes_frozen before update or delete on public.fixed_routes
  for each row execute function public.tg_pricing_row_frozen();

-- F-12 / T-02-44: the missing INSERT-time half, reusing the same function on all three
-- tables — a priced row cannot be inserted straight into a non-draft version.
create trigger distance_rates_frozen_ins before insert on public.distance_rates
  for each row execute function public.tg_pricing_row_frozen();
create trigger fixed_routes_frozen_ins before insert on public.fixed_routes
  for each row execute function public.tg_pricing_row_frozen();
create trigger surcharges_frozen_ins before insert on public.surcharges
  for each row execute function public.tg_pricing_row_frozen();

revoke all on function public.tg_pricing_row_frozen() from public;

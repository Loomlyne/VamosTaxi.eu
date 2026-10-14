-- 20261012250000_pricing_lock_check.sql
--
-- Part A of the PR #81 re-scope. Owner decisions .planning/decisions/2026-10-13-p30-ship-p31-lines-rls-fix.md
-- items 10 and 12; pictures signed 2026-10-14 (.planning/quick/261013-pricing-staff-policies/SIGNED.md).
-- Replaces the withdrawn 20261012250000_pricing_staff_policies.sql (never applied on live; item 10
-- withdraws item 5).
--
-- (1) Lock check (item 12): public.tg_pricing_row_frozen() also refuses an UPDATE that moves a row
--     (distance_rates, fixed_routes, surcharges, and until Part B the three band/premium/rule tables)
--     OUT of a live or retired rate_version. Moving a row INTO a published book, and any in-place
--     change on a published row, were already refused and still are; the availability-only toggle
--     (available / live / active) on a published row still works. The trigger binds every role,
--     the table owner included. Body otherwise 20261007250000 verbatim (live md5 of
--     pg_get_functiondef 39df856a4f7f191c1eacdfcd09b3b38a); still not security definer.
-- (2) public.quote_rate_book() no longer returns distance_bands and region_premiums (item 10). Body
--     otherwise 20261007310000 byte for byte; create or replace keeps its grants and comment (the
--     comment names no bands).
--
-- Applied by the controller BEFORE the deploy. The currently live code keeps working: the engine's
-- mapList tolerates the missing keys (apps/web/lib/pricing/rateBook.ts), the dashboard reads the
-- tables directly until Part B, and no code updates rate_version_id (fork and clone only insert).
-- No data change, no policy change, no amounts. Part B (20261012300000) drops the three tables after
-- docs/runbook/pricing-remove-bands-premiums.sql has run on live.

-- ---------------------------------------------------------------------------
-- (1) Lock check: no row leaves a live or retired book.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_pricing_row_frozen()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_status public.rate_version_status; v_old jsonb; v_new jsonb;
  v_old_status public.rate_version_status;
begin
  -- 20261012250000 (decision 2026-10-13 item 12): a row never leaves a live or retired book. Until
  -- now the check below read only the NEW book (coalesce(new.rate_version_id, ...)), so an UPDATE
  -- that moved a row from a live or retired book into the draft passed and the frozen book lost a
  -- row. The OLD book is read as the caller: a book the caller cannot see reads as null and is
  -- refused too.
  if tg_op = 'UPDATE' and new.rate_version_id is distinct from old.rate_version_id then
    select status into v_old_status from public.rate_versions
     where id = old.rate_version_id;
    if v_old_status is distinct from 'draft' then
      raise exception 'pricing rows cannot leave a published rate_version (%.% id=%)',
        tg_table_schema, tg_table_name, old.id
        using errcode = 'restrict_violation',
              hint = 'Copy the row into the draft instead; a live or retired book never loses a row.';
    end if;
  end if;

  select status into v_status from public.rate_versions
   where id = coalesce(new.rate_version_id, old.rate_version_id);

  if v_status is distinct from 'draft' then
    if tg_op = 'UPDATE' then
      -- Compare every column except the availability flag for this table. The three tables
      -- share this function but spell their flag differently — 'available' (distance_rates),
      -- 'live' (fixed_routes), 'active' (surcharges) — so all three are excluded on every
      -- call; subtracting a jsonb key a given table doesn't have is a harmless no-op.
      v_old := to_jsonb(old) - 'live' - 'available' - 'active';
      v_new := to_jsonb(new) - 'live' - 'available' - 'active';
      if v_old = v_new then
        return new;   -- availability-only change: allowed, and audited by tg_audit_row
      end if;
    end if;
    raise exception 'pricing rows are immutable once their rate_version leaves draft (%.% id=%)',
      tg_table_schema, tg_table_name, coalesce(new.id, old.id)
      using errcode = 'restrict_violation',
            hint = 'Publish a new rate_version instead of editing a live one. Only `live` / `available` / `active` may still be toggled.';
  end if;
  return coalesce(new, old);
end $function$;

-- ---------------------------------------------------------------------------
-- (2) quote_rate_book without distance_bands and region_premiums.
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
  -- 20261007310000 (S6): coupon codes and staff notes go to staff only.
  v_staff boolean := coalesce(app.is_staff(), false);
begin
  -- 20261012250000: km bands and region % removed (decision 2026-10-13 item 10); body otherwise
  -- 20261007310000.
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
    -- 20261007310000 (S6): a caller who is not staff gets each coupon without its code and note. The
    -- quote engine matches the voucher the traveller typed by the coupon_id evaluate_coupon returns
    -- (apps/web/lib/quote/engine.ts couponOnBook), so it needs no code from the book.
    'coupons', (
      select coalesce(
               jsonb_agg(
                 case when v_staff then to_jsonb(cp) else to_jsonb(cp) - 'code' - 'note' end
                 order by cp.code
               ),
               '[]'::jsonb
             )
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

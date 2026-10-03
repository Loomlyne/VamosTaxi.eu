-- LOCAL LAB COPY ONLY. NEVER LIVE. Every amount below is a stand-in, not a price.
--
-- Turns the local seed's draft price book into one you can book on, so a browser run can go
-- home -> /checkout -> PAY against the lab stack. Run by scripts/test-lab/lab.sh through
-- `docker exec -i supabase_db_vamos-lab-<name> psql` on a lab stack (never `db push`, never a
-- hosted project). Safe to run twice: every statement is guarded or conflicts on a natural key. A live
-- rate version is immutable, so a change to its numbers here reaches a lab only through `lab.sh reseed`.
--
-- What it leaves:
--   * three classes, Economy / Business / Van luxury, seats 3 / 3 / 12 (Van luxury 12 job, quick
--     261001); luggage stays as the seed has it (3 / 3 / 8)
--   * one rate version, slug lab-live, status live, every class priced at 1-3 rappen (fare, airport start, city),
--     labelled "lab stand-in, not a price"; its surcharges are copied from the seed and inactive
--   * settings.public_chf = true, and a policy version (lab-policy) like the e2e fixture's
--   * two coupons: LABFIX (amount off) and LABPCT (percent off), active, lab rows
begin;

-- Classes: display names and the 12-seat van.
update public.vehicle_classes set name = 'Economy',    passenger_capacity = 3,  active = true where slug = 'economy';
update public.vehicle_classes set name = 'Business',   passenger_capacity = 3,  active = true where slug = 'business';
update public.vehicle_classes set name = 'Van luxury', passenger_capacity = 12, active = true where slug = 'van';

-- The lab price book. A live version is immutable, so its children are written while it is a draft,
-- and only when the version is new.
do $lab$
declare
  v_id bigint;
  v_new boolean := false;
begin
  select id into v_id from public.rate_versions where slug = 'lab-live';
  if v_id is null then
    insert into public.rate_versions (slug, label, status, note)
    values ('lab-live', 'lab stand-in, not a price', 'draft', 'Local lab copy only. Amounts are stand-ins (1-3 rappen), never a Vamos price.')
    returning id into v_id;
    v_new := true;

    -- airport_start_rappen is needed: an airport pickup without it makes a null line and the quote answers
    -- partially_priced_class (apps/web/lib/pricing/lines.ts, buildAirportFeeLine).
    insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax, base_fare_rappen, per_km_rappen, min_fare_rappen,
                                       airport_start_rappen, city_price_rappen, available)
    select v_id, vc.id, case vc.slug when 'van' then 12 else 3 end,
           case vc.slug when 'economy' then 1 when 'business' then 2 else 3 end,
           case vc.slug when 'economy' then 1 when 'business' then 2 else 3 end,
           case vc.slug when 'economy' then 1 when 'business' then 2 else 3 end,
           case vc.slug when 'economy' then 1 when 'business' then 2 else 3 end,
           case vc.slug when 'economy' then 1 when 'business' then 2 else 3 end,
           true
      from public.vehicle_classes vc
     where vc.slug in ('economy', 'business', 'van');

    -- Same surcharge rows as the seed's draft, all switched off and unpriced.
    insert into public.surcharges (rate_version_id, code, kind, amount_rappen, percent, applies_to, active, predicate, quantity_source)
    select v_id, s.code, s.kind, null, null, s.applies_to, false, s.predicate, s.quantity_source
      from public.surcharges s
      join public.rate_versions r on r.id = s.rate_version_id and r.slug = 'seed-placeholder';
  end if;

  if v_new then
    -- One live version at a time: a lab copy that already went live some other way is retired first.
    update public.rate_versions set status = 'retired' where status = 'live' and slug <> 'lab-live';
    update public.rate_versions set status = 'live' where id = v_id and status = 'draft';
  end if;
end
$lab$;

update public.settings set public_chf = true where id = 1;

-- A policy version the checkout accepts (modification deadline set), same values as the e2e fixture.
insert into public.settings_versions
  (slug, label, free_cancel_hours, modification_deadline_hours, min_advance_minutes, airport_waiting_minutes,
   city_waiting_minutes, manage_link_validity_days, quote_lock_minutes, checkout_window_minutes, cancellation_tiers, policy_doc_slug)
select 'lab-policy', 'lab stand-in policy', 24, 24, 180, 60, 15, 30, 1440, 1440, cancellation_tiers, policy_doc_slug
  from public.settings_versions b
 where b.slug = 'launch-baseline'
   and not exists (select 1 from public.settings_versions x where x.slug = 'lab-policy');

-- Voucher checks, scoped to the lab price book. Stand-in values, lab rows.
insert into public.coupons (rate_version_id, code, kind, percent, amount_rappen, active, note)
select r.id, c.code, c.kind::public.coupon_kind, c.percent, c.amount_rappen, true, c.note
  from public.rate_versions r,
       (values ('LABFIX', 'amount',  null::numeric, 10,           'lab stand-in, not a price (fixed voucher)'),
               ('LABPCT', 'percent', 20::numeric,   null::integer, 'lab stand-in, not a price (percent voucher)')) as c(code, kind, percent, amount_rappen, note)
 where r.slug = 'lab-live'
   and not exists (select 1 from public.coupons x where x.rate_version_id = r.id and x.code = c.code);

update public.coupons set active = true
 where code in ('LABFIX', 'LABPCT') and rate_version_id = (select id from public.rate_versions where slug = 'lab-live');

commit;

-- p30-remove-test-classes.sql
--
-- OWNER RUNS THIS. Agents never run it.
-- Phase 30, CLS-13 (decision 6, 6a): remove the five test classes business, economy, first, van, mahaha
-- and the five test reviews rv-1..rv-5, with every child row, in ONE transaction. Every row is copied into
-- schema backup_p30_20261012 first. Run it in the Supabase SQL editor (role postgres).
-- Steps and expected output: docs/runbook/p30-remove-test-classes.md
--
-- It runs on TODAY's live schema, BEFORE any Phase 30 database change (decision 1, signed 2026-10-12).
-- The classes are picked by slug only. Nothing from Phase 30 is used.
--
-- ============================================================================================
-- STEP 0 - PREVIEW. Run ONLY this block first (it changes nothing). Expected: five class rows
-- (all active = false, rows only in retired price books, nothing in the "must be 0" columns) and
-- five review rows.
-- ============================================================================================
/*
select c.slug,
       c.active,
       (select count(*) from public.distance_rates r where r.vehicle_class_id = c.id)  as distance_rates,
       (select count(*) from public.fixed_routes  f where f.vehicle_class_id = c.id)   as fixed_routes,
       (select count(*) from public.distance_bands b where b.vehicle_class_id = c.id)  as distance_bands,
       (select count(*) from public.rate_version_rules x
         where x.kind = 'city_pair' and x.payload ->> 'vehicleClassId' = c.id::text)   as city_pair_rules,
       (select count(*) from public.booking_legs l where l.vehicle_class_id = c.id)    as must_be_0_booking_legs,
       (select count(*) from public.price_snapshots s where s.vehicle_class_id = c.id) as must_be_0_price_snapshots,
       (select count(*) from public.vehicles v where v.vehicle_class_id = c.id)        as must_be_0_vehicles,
       (select count(*) from public.chauffeurs h where h.vehicle_class_id = c.id)      as must_be_0_chauffeurs
  from public.vehicle_classes c
 where c.slug in ('business', 'economy', 'first', 'van', 'mahaha')
 order by c.slug;

select external_ref, source, published, rating, author_name
  from public.reviews
 where external_ref in ('rv-1', 'rv-2', 'rv-3', 'rv-4', 'rv-5')
 order by external_ref;

-- For the hand-over: published reviews that are NOT rv-1..rv-5 (they stay and set the site score).
select count(*) as other_published_reviews
  from public.reviews
 where published = true
   and (external_ref is null or external_ref not in ('rv-1', 'rv-2', 'rv-3', 'rv-4', 'rv-5'));
*/
-- ============================================================================================
-- STEP 1 - THE SCRIPT. Select everything from "begin;" to "commit;" and run it once.
-- Edit nothing. If the live counts differ from the two numbers on the "create temporary table
-- p30_params" line, the script stops and changes nothing.
-- ============================================================================================
begin;

create temporary table p30_params on commit drop as
select 5::int as expected_classes,
       5::int as expected_reviews,
       array['business', 'economy', 'first', 'van', 'mahaha']::text[] as slugs,
       array['rv-1', 'rv-2', 'rv-3', 'rv-4', 'rv-5']::text[]          as refs;

create temporary table p30_class_ids on commit drop as
select c.id, c.slug
  from public.vehicle_classes c, p30_params p
 where c.slug = any (p.slugs);

create temporary table p30_review_refs on commit drop as
select r.external_ref
  from public.reviews r, p30_params p
 where r.external_ref = any (p.refs);

-- Guards: counts, references, surcharges. Each aborts and changes nothing. --------------------
do $$
declare
  v_classes int := (select count(*) from p30_class_ids);
  v_reviews int := (select count(*) from p30_review_refs);
  v_exp_classes int := (select expected_classes from p30_params);
  v_exp_reviews int := (select expected_reviews from p30_params);
  v_ref int;
begin
  if v_classes <> v_exp_classes then
    raise exception 'P30 abort: % of the test classes found, expected %. Nothing was changed.', v_classes, v_exp_classes;
  end if;
  if v_reviews <> v_exp_reviews then
    raise exception 'P30 abort: % of the test reviews (rv-1..rv-5) found, expected %. Nothing was changed.', v_reviews, v_exp_reviews;
  end if;

  select (select count(*) from public.booking_legs   where vehicle_class_id in (select id from p30_class_ids))
       + (select count(*) from public.price_snapshots where vehicle_class_id in (select id from p30_class_ids))
       + (select count(*) from public.vehicles        where vehicle_class_id in (select id from p30_class_ids))
       + (select count(*) from public.chauffeurs      where vehicle_class_id in (select id from p30_class_ids))
    into v_ref;
  if v_ref <> 0 then
    raise exception 'P30 abort: % booking leg, price snapshot, vehicle or chauffeur row(s) still point at these classes. Nothing was changed.', v_ref;
  end if;

  -- Another review (not rv-1..rv-5) naming one of these classes would be silently changed
  -- by the foreign key (on delete set null). Refuse instead.
  select count(*) into v_ref
    from public.reviews
   where vehicle_class_id in (select id from p30_class_ids)
     and (external_ref is null or external_ref not in (select external_ref from p30_review_refs));
  if v_ref <> 0 then
    raise exception 'P30 abort: % other review(s) name one of these classes. Nothing was changed.', v_ref;
  end if;

  -- A price rule of another kind that names one of these classes is not understood by this script.
  select count(*) into v_ref
    from public.rate_version_rules r
   where r.kind <> 'city_pair'
     and exists (select 1 from p30_class_ids i where r.payload::text like '%' || i.id::text || '%');
  if v_ref <> 0 then
    raise exception 'P30 abort: % price rule(s) that are not city-to-city rules name one of these classes. Nothing was changed.', v_ref;
  end if;

  -- surcharges.rule_id references rate_version_rules(id) on delete restrict. This script never
  -- edits surcharges (they sit in frozen price books), so it refuses instead.
  select count(*) into v_ref
    from public.surcharges s
   where s.rule_id in (
           select r.id
             from public.rate_version_rules r
            where r.kind = 'city_pair'
              and (r.payload ->> 'vehicleClassId') in (select id::text from p30_class_ids));
  if v_ref <> 0 then
    raise exception 'P30 abort: a surcharge is attached to a price rule of these classes (% surcharge(s)). Nothing was changed.', v_ref;
  end if;

  if exists (select 1 from pg_namespace where nspname = 'backup_p30_20261012') then
    raise exception 'P30 abort: schema backup_p30_20261012 already exists (the script ran before). Nothing was changed.';
  end if;

  raise notice 'P30: % classes and % reviews selected (match expected); no references; no surcharge attached', v_classes, v_reviews;
end $$;

-- Foreign-key self-check: every table that points at vehicle_classes must be in this list. An
-- unlisted table means the schema grew since this script was written, so it aborts rather than
-- half-deleting.
do $$
declare
  v_listed text[] := array[
    'vehicles', 'reviews', 'distance_rates', 'fixed_routes', 'booking_legs',
    'price_snapshots', 'distance_bands', 'chauffeurs'
  ];
  v_unlisted text;
begin
  select string_agg(distinct c.conrelid::regclass::text, ', ')
    into v_unlisted
    from pg_constraint c
   where c.contype = 'f'
     and c.confrelid = 'public.vehicle_classes'::regclass
     and c.conrelid not in (select ('public.' || t)::regclass::oid from unnest(v_listed) t);
  if v_unlisted is not null then
    raise exception 'P30 abort: unlisted table(s) reference vehicle_classes: %. Nothing was changed.', v_unlisted;
  end if;
  raise notice 'P30: foreign-key list is complete';
end $$;

-- Backup copy (before any delete) -------------------------------------------------------------
create schema backup_p30_20261012;

create table backup_p30_20261012.vehicle_classes as
  select * from public.vehicle_classes where id in (select id from p30_class_ids);
create table backup_p30_20261012.distance_rates as
  select * from public.distance_rates where vehicle_class_id in (select id from p30_class_ids);
create table backup_p30_20261012.fixed_routes as
  select * from public.fixed_routes where vehicle_class_id in (select id from p30_class_ids);
create table backup_p30_20261012.distance_bands as
  select * from public.distance_bands where vehicle_class_id in (select id from p30_class_ids);
create table backup_p30_20261012.rate_version_rules as
  select * from public.rate_version_rules
   where kind = 'city_pair' and (payload ->> 'vehicleClassId') in (select id::text from p30_class_ids);
create table backup_p30_20261012.reviews as
  select * from public.reviews where external_ref in (select external_ref from p30_review_refs);

-- Delete --------------------------------------------------------------------------------------
-- Only the four "frozen price row" triggers (update or delete) on the tables we delete from are
-- switched off, by name, and they are switched back on below, inside this same transaction.
alter table public.distance_rates     disable trigger distance_rates_frozen;
alter table public.fixed_routes       disable trigger fixed_routes_frozen;
alter table public.distance_bands     disable trigger distance_bands_frozen;
alter table public.rate_version_rules disable trigger rate_version_rules_frozen;

delete from public.reviews          where external_ref in (select external_ref from p30_review_refs);
delete from public.distance_bands   where vehicle_class_id in (select id from p30_class_ids);
delete from public.fixed_routes     where vehicle_class_id in (select id from p30_class_ids);
delete from public.distance_rates   where vehicle_class_id in (select id from p30_class_ids);
delete from public.rate_version_rules
 where kind = 'city_pair' and (payload ->> 'vehicleClassId') in (select id::text from p30_class_ids);
delete from public.vehicle_classes  where id in (select id from p30_class_ids);

alter table public.distance_rates     enable trigger distance_rates_frozen;
alter table public.fixed_routes       enable trigger fixed_routes_frozen;
alter table public.distance_bands     enable trigger distance_bands_frozen;
alter table public.rate_version_rules enable trigger rate_version_rules_frozen;

-- Asserts: backups match what was deleted, nothing is left, triggers are back on ------------------
do $$
declare
  v_classes int := (select count(*) from p30_class_ids);
  v_reviews int := (select count(*) from p30_review_refs);
  v_bk_classes int := (select count(*) from backup_p30_20261012.vehicle_classes);
  v_bk_reviews int := (select count(*) from backup_p30_20261012.reviews);
  v_bk_rates int := (select count(*) from backup_p30_20261012.distance_rates);
  v_bk_routes int := (select count(*) from backup_p30_20261012.fixed_routes);
  v_bk_bands int := (select count(*) from backup_p30_20261012.distance_bands);
  v_bk_rules int := (select count(*) from backup_p30_20261012.rate_version_rules);
  v_left int;
  v_off text;
begin
  if v_bk_classes <> v_classes then
    raise exception 'P30 abort: backup holds % classes, expected %. Rolled back.', v_bk_classes, v_classes;
  end if;
  if v_bk_reviews <> v_reviews then
    raise exception 'P30 abort: backup holds % reviews, expected %. Rolled back.', v_bk_reviews, v_reviews;
  end if;

  select (select count(*) from public.vehicle_classes where id in (select id from p30_class_ids))
       + (select count(*) from public.reviews where external_ref in (select external_ref from p30_review_refs))
       + (select count(*) from public.distance_rates where vehicle_class_id in (select id from p30_class_ids))
       + (select count(*) from public.fixed_routes where vehicle_class_id in (select id from p30_class_ids))
       + (select count(*) from public.distance_bands where vehicle_class_id in (select id from p30_class_ids))
       + (select count(*) from public.rate_version_rules
           where kind = 'city_pair' and (payload ->> 'vehicleClassId') in (select id::text from p30_class_ids))
    into v_left;
  if v_left <> 0 then raise exception 'P30 abort: % rows still present. Rolled back.', v_left; end if;

  select string_agg(tgname, ', ') into v_off
    from pg_trigger
   where tgname in ('distance_rates_frozen', 'fixed_routes_frozen', 'distance_bands_frozen', 'rate_version_rules_frozen')
     and tgenabled = 'D';
  if v_off is not null then raise exception 'P30 abort: trigger(s) still disabled: %. Rolled back.', v_off; end if;

  raise notice 'P30 done: % classes, % reviews removed (% rates, % routes, % bands, % city rules); backup in backup_p30_20261012; 0 rows left; triggers re-enabled',
    v_bk_classes, v_bk_reviews, v_bk_rates, v_bk_routes, v_bk_bands, v_bk_rules;
end $$;

commit;

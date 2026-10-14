-- pricing-remove-bands-premiums.sql
--
-- CONTROLLER RUNS THIS on the owner's word (memory: controller has Supabase control); never an agent in
-- a work session. Owner decisions .planning/decisions/2026-10-13-p30-ship-p31-lines-rls-fix.md items 10
-- and 13: km bands (public.distance_bands), region % (public.region_premiums) and the Rules list
-- (public.rate_version_rules) go. This script empties them, in ONE transaction, after copying every row
-- into schema backup_pricing_20261014. It drops nothing: Part B
-- (packages/db/supabase/migrations/20261012300000_pricing_drop_bands_premiums_rules.sql) drops the tables
-- and surcharges.rule_id afterwards.
-- Steps, order and expected output: docs/runbook/pricing-remove-bands-premiums.md
--
-- It runs AFTER Part A (20261012250000_pricing_lock_check.sql) and AFTER the new Workers are live (they
-- no longer read the three tables), and BEFORE Part B. Role postgres. No amounts are written.
--
-- ============================================================================================
-- STEP 0 - PREVIEW. Run ONLY this block first (it changes nothing). Expected (read 2026-10-13):
-- 20 distance_bands and 5 region_premiums, all in retired books 1-5; 0 rate_version_rules;
-- 0 surcharges with rule_id; the last query (rows in a draft or live book) returns no row.
-- ============================================================================================
/*
select 'distance_bands' as tbl, count(*) as n from public.distance_bands
union all select 'region_premiums', count(*) from public.region_premiums
union all select 'rate_version_rules', count(*) from public.rate_version_rules
union all select 'surcharges_with_rule_id', count(*) from public.surcharges where rule_id is not null;

select t.tbl, rv.id as book, rv.status, count(*) as n
  from (select 'distance_bands' as tbl, rate_version_id from public.distance_bands
        union all select 'region_premiums', rate_version_id from public.region_premiums
        union all select 'rate_version_rules', rate_version_id from public.rate_version_rules) t
  join public.rate_versions rv on rv.id = t.rate_version_id
 group by t.tbl, rv.id, rv.status
 order by t.tbl, rv.id;

-- Must return no row: a band, premium or rule in a draft or live book.
select t.tbl, rv.id as book, rv.status, count(*) as n
  from (select 'distance_bands' as tbl, rate_version_id from public.distance_bands
        union all select 'region_premiums', rate_version_id from public.region_premiums
        union all select 'rate_version_rules', rate_version_id from public.rate_version_rules) t
  join public.rate_versions rv on rv.id = t.rate_version_id
 where rv.status in ('draft', 'live')
 group by t.tbl, rv.id, rv.status;
*/
-- ============================================================================================
-- STEP 1 - THE SCRIPT. Select everything from "begin;" to "commit;" and run it once.
-- Edit nothing. If the live counts differ from the four numbers on the "create temporary table
-- pricing_params" line, or the script ran before, or Part B is already applied, it stops and
-- changes nothing.
-- ============================================================================================
begin;

create temporary table pricing_params on commit drop as
select 20::int as expected_bands,
       5::int  as expected_premiums,
       0::int  as expected_rules,
       0::int  as expected_rule_links;

-- Guards. Each aborts and changes nothing. ---------------------------------------------------------
do $$
declare
  p pricing_params%rowtype;
  v_bands int;
  v_premiums int;
  v_rules int;
  v_links int;
begin
  select * into p from pricing_params;

  if to_regclass('public.distance_bands') is null
     or to_regclass('public.region_premiums') is null
     or to_regclass('public.rate_version_rules') is null
     or not exists (select 1 from pg_attribute
                     where attrelid = 'public.surcharges'::regclass and attname = 'rule_id'
                       and attnum > 0 and not attisdropped) then
    raise exception 'PRICING abort: a table or surcharges.rule_id is missing (Part B already applied?). Nothing was changed.';
  end if;

  if exists (select 1 from pg_namespace where nspname = 'backup_pricing_20261014') then
    raise exception 'PRICING abort: schema backup_pricing_20261014 already exists (the script ran before). Nothing was changed.';
  end if;

  execute 'select count(*) from public.distance_bands' into v_bands;
  execute 'select count(*) from public.region_premiums' into v_premiums;
  execute 'select count(*) from public.rate_version_rules' into v_rules;
  execute 'select count(*) from public.surcharges where rule_id is not null' into v_links;

  if v_bands <> p.expected_bands then
    raise exception 'PRICING abort: % distance_bands rows found, expected %. Nothing was changed.', v_bands, p.expected_bands;
  end if;
  if v_premiums <> p.expected_premiums then
    raise exception 'PRICING abort: % region_premiums rows found, expected %. Nothing was changed.', v_premiums, p.expected_premiums;
  end if;
  if v_rules <> p.expected_rules then
    raise exception 'PRICING abort: % rate_version_rules rows found, expected %. Nothing was changed.', v_rules, p.expected_rules;
  end if;
  if v_links <> p.expected_rule_links then
    raise exception 'PRICING abort: % surcharges carry a rule_id, expected %. Nothing was changed.', v_links, p.expected_rule_links;
  end if;

  raise notice 'PRICING: % bands, % premiums, % rules, % rule links found (match expected)', v_bands, v_premiums, v_rules, v_links;
end $$;

-- Backup copy (before any delete) ------------------------------------------------------------------
create schema backup_pricing_20261014;

create table backup_pricing_20261014.distance_bands as select * from public.distance_bands;
create table backup_pricing_20261014.region_premiums as select * from public.region_premiums;
create table backup_pricing_20261014.rate_version_rules as select * from public.rate_version_rules;
create table backup_pricing_20261014.surcharges_rule_links as
  select id, rule_id from public.surcharges where rule_id is not null;

-- Delete -------------------------------------------------------------------------------------------
-- The rows sit in retired books, so the "frozen price row" triggers (update or delete) would refuse
-- the delete. Only those triggers are switched off, by name, and switched back on below inside this
-- same transaction. rate_version_rules_frozen is touched only when rules are expected (0 today).
alter table public.distance_bands  disable trigger distance_bands_frozen;
alter table public.region_premiums disable trigger region_premiums_frozen;
do $$
begin
  if (select expected_rules from pricing_params) > 0 then
    execute 'alter table public.rate_version_rules disable trigger rate_version_rules_frozen';
  end if;
end $$;

delete from public.distance_bands;
delete from public.region_premiums;
do $$
begin
  if (select expected_rules from pricing_params) > 0 then
    execute 'delete from public.rate_version_rules';
  end if;
end $$;

alter table public.distance_bands  enable trigger distance_bands_frozen;
alter table public.region_premiums enable trigger region_premiums_frozen;
do $$
begin
  if (select expected_rules from pricing_params) > 0 then
    execute 'alter table public.rate_version_rules enable trigger rate_version_rules_frozen';
  end if;
end $$;

-- Asserts: backups match the expected counts, the tables are empty, the triggers are back on ---------
do $$
declare
  p pricing_params%rowtype;
  v_bk_bands int := (select count(*) from backup_pricing_20261014.distance_bands);
  v_bk_premiums int := (select count(*) from backup_pricing_20261014.region_premiums);
  v_bk_rules int := (select count(*) from backup_pricing_20261014.rate_version_rules);
  v_bk_links int := (select count(*) from backup_pricing_20261014.surcharges_rule_links);
  v_left int;
  v_off text;
begin
  select * into p from pricing_params;

  if v_bk_bands <> p.expected_bands or v_bk_premiums <> p.expected_premiums
     or v_bk_rules <> p.expected_rules or v_bk_links <> p.expected_rule_links then
    raise exception 'PRICING abort: backup holds %/%/%/% (bands/premiums/rules/links), expected %/%/%/%. Rolled back.',
      v_bk_bands, v_bk_premiums, v_bk_rules, v_bk_links,
      p.expected_bands, p.expected_premiums, p.expected_rules, p.expected_rule_links;
  end if;

  select (select count(*) from public.distance_bands)
       + (select count(*) from public.region_premiums)
       + (select count(*) from public.rate_version_rules)
       + (select count(*) from public.surcharges where rule_id is not null)
    into v_left;
  if v_left <> 0 then raise exception 'PRICING abort: % rows or links still present. Rolled back.', v_left; end if;

  select string_agg(tgname, ', ') into v_off
    from pg_trigger
   where tgname in ('distance_bands_frozen', 'region_premiums_frozen', 'rate_version_rules_frozen')
     and tgenabled <> 'O';
  if v_off is not null then raise exception 'PRICING abort: trigger(s) not enabled: %. Rolled back.', v_off; end if;

  raise notice 'PRICING done: % bands, % premiums, % rules removed, % rule links; backup in backup_pricing_20261014; 0 rows left; triggers enabled',
    v_bk_bands, v_bk_premiums, v_bk_rules, v_bk_links;
end $$;

commit;

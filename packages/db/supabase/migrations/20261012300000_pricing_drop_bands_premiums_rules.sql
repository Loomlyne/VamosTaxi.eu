-- 20261012300000_pricing_drop_bands_premiums_rules.sql
--
-- Part B of the PR #81 re-scope. Owner decisions .planning/decisions/2026-10-13-p30-ship-p31-lines-rls-fix.md
-- items 10 and 13: km bands (public.distance_bands), region % (public.region_premiums) and the Rules
-- list (public.rate_version_rules, plus public.surcharges.rule_id) go completely. They are blocked on
-- live and have priced no customer since 2026-09-14; the owner replaced them with city/canton extras.
--
-- Applied by the controller AFTER the new Workers are live and AFTER
-- docs/runbook/pricing-remove-bands-premiums.sql ran on live; one transaction, verbatim, never
-- `supabase db push`. The first statement aborts the apply, with nothing applied, while any band,
-- premium or rule row or any surcharges.rule_id link still exists.
--
-- Function bodies still referencing the three tables (latest create or replace per function, git grep
-- 2026-10-14): ops_vehicle_class_set_status (20261012200000) and ops_vehicle_class_delete_or_hide
-- (20260928160000). plpgsql is not checked at drop time, so both are recreated here without those
-- statements; same signature, language, security and search_path; create or replace keeps their grants
-- and comments. quote_rate_book lost the two keys in Part A (20261012250000). tg_rate_version_transition
-- (20260913180000) names bands only in a comment. app.rate_version_published and
-- public.tg_pricing_row_frozen stay (distance_rates, fixed_routes, surcharges still use them).
-- No CASCADE anywhere: a surprise dependency must abort the apply. No amounts.

-- ---------------------------------------------------------------------------
-- (1) Guard: the delete script must have run. Works whether or not the tables still exist.
-- ---------------------------------------------------------------------------
create or replace function app.pricing_assert_bands_premiums_rules_gone()
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_name pg_catalog.text;
  v_hit  boolean;
begin
  foreach v_name in array array['public.distance_bands', 'public.region_premiums', 'public.rate_version_rules']
  loop
    if pg_catalog.to_regclass(v_name) is not null then
      execute pg_catalog.format('select exists (select 1 from %s)', v_name) into v_hit;
      if v_hit then
        raise exception 'pricing-bands-premiums-rules-present: % — run docs/runbook/pricing-remove-bands-premiums.sql first; nothing was applied', v_name
          using errcode = 'P0001';
      end if;
    end if;
  end loop;

  if exists (
    select 1
      from pg_catalog.pg_attribute a
     where a.attrelid = 'public.surcharges'::pg_catalog.regclass
       and a.attname = 'rule_id'
       and a.attnum > 0
       and not a.attisdropped
  ) then
    execute 'select exists (select 1 from public.surcharges where rule_id is not null)' into v_hit;
    if v_hit then
      raise exception 'pricing-bands-premiums-rules-present: % — run docs/runbook/pricing-remove-bands-premiums.sql first; nothing was applied', 'surcharges.rule_id'
        using errcode = 'P0001';
    end if;
  end if;
end;
$$;

revoke all on function app.pricing_assert_bands_premiums_rules_gone() from public;

comment on function app.pricing_assert_bands_premiums_rules_gone() is
  'Decision 2026-10-13 items 10 and 13: no distance_bands, region_premiums or rate_version_rules row and no surcharges.rule_id link may exist before 20261012300000 drops them; kept so pgTAP can prove it; EXECUTE: owner only.';

select app.pricing_assert_bands_premiums_rules_gone();

-- ---------------------------------------------------------------------------
-- (2) ops_vehicle_class_set_status: body 20261012200000 verbatim minus the distance_bands delete, the
--     surcharges.rule_id detach and the rate_version_rules delete.
-- ---------------------------------------------------------------------------
create or replace function public.ops_vehicle_class_set_status(
  p_id pg_catalog.uuid,
  p_to pg_catalog.text,
  p_reason pg_catalog.text
)
returns pg_catalog.text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class   public.vehicle_classes%rowtype;
  v_from    pg_catalog.text;
  v_reason  pg_catalog.text;
  v_missing pg_catalog.text;
  v_draft   pg_catalog.int8;
begin
  if not app.is_admin() then
    raise exception 'admin-only' using errcode = '42501';
  end if;

  select * into v_class from public.vehicle_classes c where c.id = p_id for update;
  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  if p_to is null or p_to not in ('draft', 'live', 'retired') then
    raise exception 'bad-status' using errcode = '22023';
  end if;

  v_from := case when v_class.hidden_at is not null then 'retired'
                 when v_class.active then 'live'
                 else 'draft' end;

  if v_from = 'draft' and p_to = 'live' then
    v_missing := public.ops_vehicle_class_missing(p_id);
    if v_missing <> '' then
      raise exception 'incomplete' using errcode = 'P0001', detail = v_missing;
    end if;
    update public.vehicle_classes c
       set active = true, hidden_at = null, hidden_reason = null
     where c.id = p_id;

  elsif v_from in ('live', 'draft') and p_to = 'retired' then
    v_reason := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
    if v_reason is not null and pg_catalog.char_length(v_reason) > 140 then
      raise exception 'reason-too-long' using errcode = '22001';
    end if;

    update public.vehicle_classes c
       set hidden_at = now(), active = false, hidden_reason = v_reason
     where c.id = p_id;

    -- Decision 2: the class leaves every open draft price book. Frozen books keep their rows.
    delete from public.fixed_routes x
     using public.rate_versions rv
     where rv.id = x.rate_version_id and rv.status = 'draft' and x.vehicle_class_id = p_id;
    delete from public.distance_rates x
     using public.rate_versions rv
     where rv.id = x.rate_version_id and rv.status = 'draft' and x.vehicle_class_id = p_id;

  elsif v_from = 'retired' and p_to = 'draft' then
    update public.vehicle_classes c
       set hidden_at = null, hidden_reason = null, active = false
     where c.id = p_id;

    -- Decision 5: the class needs a new price before Go live. Its empty draft row is parked
    -- (available = false) so it never blocks Publish of the other classes.
    select rv.id into v_draft
      from public.rate_versions rv
     where rv.status = 'draft'
     order by rv.id desc
     limit 1;
    if v_draft is not null then
      insert into public.distance_rates (rate_version_id, vehicle_class_id, max_pax, available, hide_from_public)
      select v_draft, p_id, v_class.passenger_capacity, false, false
       where not exists (
         select 1 from public.distance_rates x
          where x.rate_version_id = v_draft and x.vehicle_class_id = p_id
       );
    end if;

  else
    raise exception 'bad-transition' using errcode = 'P0001';
  end if;

  return p_to;
end;
$$;

-- The old comment named the surcharges.rule_id detach; same text without it.
comment on function public.ops_vehicle_class_set_status(pg_catalog.uuid, pg_catalog.text, pg_catalog.text) is
  'Phase 30 CLS-04/05/06/14: moves a class draft->live (refused with incomplete + DETAIL missing list unless ops_vehicle_class_missing is empty), live|draft->retired (reason <= 140, class leaves open draft price books) or retired->draft (reason cleared, inactive, parked draft price row). Errors: admin-only 42501, not-found P0002, bad-status 22023, bad-transition P0001, incomplete P0001, reason-too-long 22001. Never publishes. Returns the new state. EXECUTE: vamos_staff.';

-- ---------------------------------------------------------------------------
-- (3) ops_vehicle_class_delete_or_hide: body 20260928160000 verbatim minus the distance_bands in-use
--     check and the distance_bands draft delete. No Worker caller since Phase 30 (30-04); kept with its
--     grant to vamos_staff.
-- ---------------------------------------------------------------------------
create or replace function public.ops_vehicle_class_delete_or_hide(
  p_id pg_catalog.uuid,
  p_reason pg_catalog.text
)
returns pg_catalog.text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason pg_catalog.text;
  v_in_use boolean;
begin
  if not app.is_admin() then
    raise exception 'admin-only' using errcode = '42501';
  end if;

  perform 1 from public.vehicle_classes c where c.id = p_id for update;
  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  v_reason := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  if v_reason is not null and pg_catalog.char_length(v_reason) > 140 then
    raise exception 'reason-too-long' using errcode = '22001';
  end if;

  v_in_use :=
       exists (select 1 from public.booking_legs x where x.vehicle_class_id = p_id)
    or exists (select 1 from public.price_snapshots x where x.vehicle_class_id = p_id)
    or exists (select 1 from public.vehicles x where x.vehicle_class_id = p_id)
    or exists (select 1 from public.chauffeurs x where x.vehicle_class_id = p_id)
    or exists (select 1 from public.reviews x where x.vehicle_class_id = p_id)
    or exists (
      select 1 from public.distance_rates x
        join public.rate_versions rv on rv.id = x.rate_version_id
       where x.vehicle_class_id = p_id and rv.status <> 'draft')
    or exists (
      select 1 from public.fixed_routes x
        join public.rate_versions rv on rv.id = x.rate_version_id
       where x.vehicle_class_id = p_id and rv.status <> 'draft');

  if not v_in_use then
    delete from public.fixed_routes x
     using public.rate_versions rv
     where rv.id = x.rate_version_id and rv.status = 'draft' and x.vehicle_class_id = p_id;
    delete from public.distance_rates x
     using public.rate_versions rv
     where rv.id = x.rate_version_id and rv.status = 'draft' and x.vehicle_class_id = p_id;
    delete from public.vehicle_classes c where c.id = p_id;
    return 'deleted';
  end if;

  if v_reason is null then
    return 'in-use';
  end if;

  update public.vehicle_classes c
     set hidden_at = coalesce(c.hidden_at, pg_catalog.now()),
         hidden_reason = v_reason,
         active = false
   where c.id = p_id;

  update public.distance_rates x
     set hide_from_public = true
    from public.rate_versions rv
   where rv.id = x.rate_version_id and rv.status = 'draft'
     and x.vehicle_class_id = p_id
     and x.hide_from_public is distinct from true;

  return 'hidden';
end;
$$;

-- ---------------------------------------------------------------------------
-- (4) surcharges.rule_id goes (its foreign key to rate_version_rules goes with it; not CASCADE).
-- ---------------------------------------------------------------------------
alter table public.surcharges drop column rule_id;

-- ---------------------------------------------------------------------------
-- (5) The three tables go. Their policies, triggers, grants and identity sequences go with them.
-- ---------------------------------------------------------------------------
drop table public.distance_bands;
drop table public.region_premiums;
drop table public.rate_version_rules;

-- 20261012200000_class_lifecycle.sql
--
-- Phase 30 (vehicle class lifecycle), CLS-02 / CLS-04 / CLS-05 / CLS-06 / CLS-14.
-- Owner decisions 1 and 6 signed 2026-10-12. Applied by the controller verbatim after Ship and
-- after Koss's removal script for the five test classes; never `supabase db push`.
--
-- State is derived, there is no new column:
--   Draft   = active = false and hidden_at is null
--   Live    = active = true  and hidden_at is null
--   Retired = hidden_at is not null (active = false; reason in hidden_reason, <= 140 characters)
--
-- This file changes no vehicle_classes row (decision 1: the removal script runs first). It only
-- checks that the script ran, adds two admin/staff functions and makes seats and bags optional
-- until a class goes live (decision 6). No CHF amounts anywhere.

-- 1. The five test classes must be gone before anything else in this file runs. First statement
--    after the function so the controller's one-transaction apply aborts with nothing applied.
create or replace function app.p30_assert_test_classes_gone()
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.vehicle_classes
     where slug in ('business','economy','first','van','mahaha')
  ) then
    raise exception 'p30-test-classes-present: run docs/runbook/p30-remove-test-classes.sql first; nothing was applied'
      using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function app.p30_assert_test_classes_gone() from public;

comment on function app.p30_assert_test_classes_gone() is
  'Phase 30 decision 1: the five test classes must be gone before this migration; kept so pgTAP can prove it; EXECUTE: owner only.';

select app.p30_assert_test_classes_gone();

-- 2. Decision 6: a class can be saved with seats and bags empty only while it is not Live.
alter table public.vehicle_classes
  alter column passenger_capacity drop not null,
  alter column luggage_capacity drop not null,
  add constraint vehicle_classes_live_has_seats_bags
    check (not active or (passenger_capacity is not null and luggage_capacity is not null));

alter table public.distance_rates
  alter column max_pax drop not null;

comment on constraint vehicle_classes_live_has_seats_bags on public.vehicle_classes is
  'Phase 30 decision 6: only a class that is not Live (Draft, or Retired without ever going live) may have empty seats or bags. The existing range checks (1-16 seats, 0-16 bags) still apply to a value that is set.';

-- 3. What is missing before Go live. One definition for the guard and for the dashboard.
create or replace function public.ops_vehicle_class_missing(p_id pg_catalog.uuid)
returns pg_catalog.text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_class public.vehicle_classes%rowtype;
  v_back  pg_catalog.int8;
  v_out   pg_catalog.text[] := '{}';
begin
  select * into v_class from public.vehicle_classes c where c.id = p_id;
  if not found then
    return null;
  end if;

  if v_class.photo_path is null or pg_catalog.btrim(v_class.photo_path) = '' then
    v_out := pg_catalog.array_append(v_out, 'photo');
  end if;
  if v_class.passenger_capacity is null then
    v_out := pg_catalog.array_append(v_out, 'seats');
  end if;
  if v_class.luggage_capacity is null then
    v_out := pg_catalog.array_append(v_out, 'bags');
  end if;

  -- Latest Bring back of this class (R3, decision 4). audit_log ids are monotonic, also inside
  -- one transaction; null when the class was never brought back.
  v_back := (
    select max(a.id) from public.audit_log a
     where a.table_name = 'vehicle_classes'
       and a.record_id = p_id::pg_catalog.text
       and a.action = 'update'
       and a.before_value ->> 'hidden_at' is not null
       and a.after_value ->> 'hidden_at' is null
  );

  -- A price is a start fare and per-km row of the class in the live book: available (priced rows
  -- only reach live), not hidden from public (R8, decision 9: customers cannot book it), and for a
  -- class that was brought back, in a book published after the latest Bring back (decision 4).
  -- Fixed routes do not count (decision 9).
  if not exists (
    select 1
      from public.distance_rates d
      join public.rate_versions rv on rv.id = d.rate_version_id
     where rv.status = 'live'
       and d.vehicle_class_id = p_id
       and d.available
       and not d.hide_from_public
       and (
         v_back is null
         or coalesce((
              select max(p.id) from public.audit_log p
               where p.table_name = 'rate_versions'
                 and p.record_id = rv.id::pg_catalog.text
                 and p.action = 'update'
                 and p.before_value ->> 'status' = 'draft'
                 and p.after_value ->> 'status' = 'live'
            ), 0) > v_back
       )
  ) then
    v_out := pg_catalog.array_append(v_out, 'price');
  end if;

  return pg_catalog.array_to_string(v_out, ',');
end;
$$;

revoke all on function public.ops_vehicle_class_missing(pg_catalog.uuid) from public;
revoke all on function public.ops_vehicle_class_missing(pg_catalog.uuid) from anon, authenticated;
grant execute on function public.ops_vehicle_class_missing(pg_catalog.uuid) to vamos_staff;

comment on function public.ops_vehicle_class_missing(pg_catalog.uuid) is
  'Phase 30 CLS-02: comma list, fixed order photo,seats,bags,price, of what a class still lacks before Go live; empty string when nothing; null for an unknown class. Price = an available, not-hidden distance_rates row in the live book (published after the latest Bring back, if any). The Go live guard in ops_vehicle_class_set_status calls this same function. EXECUTE: vamos_staff.';

-- 4. The one state RPC.
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
    delete from public.distance_bands x
     using public.rate_versions rv
     where rv.id = x.rate_version_id and rv.status = 'draft' and x.vehicle_class_id = p_id;
    delete from public.fixed_routes x
     using public.rate_versions rv
     where rv.id = x.rate_version_id and rv.status = 'draft' and x.vehicle_class_id = p_id;
    delete from public.distance_rates x
     using public.rate_versions rv
     where rv.id = x.rate_version_id and rv.status = 'draft' and x.vehicle_class_id = p_id;

    -- A surcharge may point at the class's city_pair rule (surcharges.rule_id, on delete
    -- restrict). Detach it, never delete it: the engine never reads rule_id, and an extra the
    -- owner added must survive into the next book.
    update public.surcharges s
       set rule_id = null
      from public.rate_versions rv
     where s.rate_version_id = rv.id and rv.status = 'draft'
       and s.rule_id in (
         select r.id
           from public.rate_version_rules r
           join public.rate_versions rv2 on rv2.id = r.rate_version_id
          where rv2.status = 'draft'
            and r.kind = 'city_pair'
            and r.payload ->> 'vehicleClassId' = p_id::pg_catalog.text
       );
    delete from public.rate_version_rules r
     using public.rate_versions rv
     where rv.id = r.rate_version_id and rv.status = 'draft'
       and r.kind = 'city_pair'
       and r.payload ->> 'vehicleClassId' = p_id::pg_catalog.text
       and not exists (select 1 from public.surcharges x where x.rule_id = r.id);

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

revoke all on function public.ops_vehicle_class_set_status(pg_catalog.uuid, pg_catalog.text, pg_catalog.text) from public;
revoke all on function public.ops_vehicle_class_set_status(pg_catalog.uuid, pg_catalog.text, pg_catalog.text) from anon, authenticated;
grant execute on function public.ops_vehicle_class_set_status(pg_catalog.uuid, pg_catalog.text, pg_catalog.text) to vamos_staff;

comment on function public.ops_vehicle_class_set_status(pg_catalog.uuid, pg_catalog.text, pg_catalog.text) is
  'Phase 30 CLS-04/05/06/14: moves a class draft->live (refused with incomplete + DETAIL missing list unless ops_vehicle_class_missing is empty), live|draft->retired (reason <= 140, class leaves open draft price books, surcharges detached from its city_pair rules) or retired->draft (reason cleared, inactive, parked draft price row). Errors: admin-only 42501, not-found P0002, bad-status 22023, bad-transition P0001, incomplete P0001, reason-too-long 22001. Never publishes. Returns the new state. EXECUTE: vamos_staff.';

-- 20260928160000_vehicle_class_delete_or_hide.sql
--
-- 26.1-19 D-15: "Deleted must never mean still visible." Delete in the dashboard is a
-- hard delete when nothing but draft rate rows references the class; otherwise the admin
-- gives a reason and the class is hidden everywhere.
--
-- Every FK to vehicle_classes(id) is checked (pg_constraint, 2026-09-28):
--   booking_legs, price_snapshots, vehicles        on delete restrict
--   chauffeurs, reviews                             on delete set null (still a reference:
--                                                   a hard delete would silently erase history)
--   distance_rates, fixed_routes, distance_bands    on delete restrict; only non-draft rows
--                                                   count (they are frozen); draft rows are
--                                                   deleted with the class.
-- No CHF amounts. No data change to existing rows.

alter table public.vehicle_classes
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_reason text;

alter table public.vehicle_classes
  drop constraint if exists vehicle_classes_hidden_reason_len;
alter table public.vehicle_classes
  add constraint vehicle_classes_hidden_reason_len
  check (hidden_reason is null or char_length(hidden_reason) <= 140);

comment on column public.vehicle_classes.hidden_at is
  '26.1-19 D-15: set when an admin deleted a class that is still referenced. A hidden class is inactive and never reaches a public board.';
comment on column public.vehicle_classes.hidden_reason is
  '26.1-19 D-15: the admin''s reason (<= 140 characters), shown under the Hidden from public chip in ops.';

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
       where x.vehicle_class_id = p_id and rv.status <> 'draft')
    or exists (
      select 1 from public.distance_bands x
        join public.rate_versions rv on rv.id = x.rate_version_id
       where x.vehicle_class_id = p_id and rv.status <> 'draft');

  if not v_in_use then
    delete from public.distance_bands x
     using public.rate_versions rv
     where rv.id = x.rate_version_id and rv.status = 'draft' and x.vehicle_class_id = p_id;
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

revoke all on function public.ops_vehicle_class_delete_or_hide(pg_catalog.uuid, pg_catalog.text) from public;
revoke all on function public.ops_vehicle_class_delete_or_hide(pg_catalog.uuid, pg_catalog.text) from anon, authenticated;
grant execute on function public.ops_vehicle_class_delete_or_hide(pg_catalog.uuid, pg_catalog.text) to vamos_staff;

comment on function public.ops_vehicle_class_delete_or_hide(pg_catalog.uuid, pg_catalog.text) is
  '26.1-19 D-15: returns deleted (nothing but draft rate rows referenced it; those go too), in-use (referenced, no reason: nothing changes) or hidden (referenced, reason <= 140 chars: hidden_at, hidden_reason, active=false, draft distance_rates hide_from_public). Requires app.is_admin() (42501). EXECUTE: vamos_staff.';

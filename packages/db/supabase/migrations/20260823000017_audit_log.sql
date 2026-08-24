-- 20260823000017_audit_log.sql
--
-- D-17/D-18: the trigger-written half of the audit split. `audit_log` is generic and
-- trigger-written -- unlike `booking_events`, which is application-written and has no trigger
-- at all -- because these 15 tables are plain CRUD with no semantic "why" beyond the diff, and
-- a trigger fires even if a future ops screen forgets to call an audit helper by hand.

create table public.audit_log (
  id           bigint generated always as identity primary key,
  table_name   text not null,
  record_id    text not null,
  action       text not null check (action in ('insert','update','delete')),
  actor_kind   text not null check (actor_kind in ('staff','system')),
  actor_id     uuid references auth.users(id) on delete set null,
  before_value jsonb,
  after_value  jsonb,
  created_at   timestamptz not null default now()
);
comment on table public.audit_log is 'Trigger-written before/after diffs for operational tables: settings, coupons, fleet, rates, routes, surcharges, content strings, reviews, staff, service zones, customers.';

create index audit_log_record on public.audit_log (table_name, record_id, created_at desc);

/**
 * ADJUSTMENT vs the schema draft: the draft's `coalesce(new.id::text, old.id::text)` assumes
 * every attached table's primary key column is named `id`. `public.staff`'s PK is `user_id`
 * (...06_customers_and_staff.sql), so a bare `new.id`/`old.id` reference against a `staff` row
 * would fail to compile (record has no field "id") the moment this trigger attaches to that
 * table. Reading both candidate keys out of the whole-row JSON instead of the typed record
 * makes the same function body work unmodified across every attached table regardless of which
 * column is its PK.
 */
create or replace function public.tg_audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- DEVIATION (Rule 1, bug fix): the schema draft's own `case when tg_op in ('update','delete')
  -- ...` / `case when tg_op in ('insert','update') ...` guards compare TG_OP to LOWERCASE
  -- literals. Postgres's plpgsql TG_OP is always uppercase ('INSERT'/'UPDATE'/'DELETE') --
  -- confirmed against this same draft's own tg_append_only (`if tg_op = 'UPDATE' and ...`), so
  -- the lowercase comparison here is an inconsistency within the draft itself, not a
  -- deliberate choice. Left as written, before_value/after_value would be NULL on every row
  -- unconditionally, defeating the entire point of a diff log and the D-19 redaction-evidence
  -- claim this trigger exists to satisfy. Fixed by comparing to TG_OP's actual uppercase form.
  insert into public.audit_log (table_name, record_id, action, actor_kind, actor_id,
                                before_value, after_value)
  values (tg_table_name,
          coalesce(to_jsonb(new) ->> 'id', to_jsonb(new) ->> 'user_id',
                    to_jsonb(old) ->> 'id', to_jsonb(old) ->> 'user_id'),
          lower(tg_op),
          case when app.uid() is null then 'system' else 'staff' end,
          app.uid(),
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

-- Binding note (Wave 6/7): explicit revoke + narrow grant after every function, even though
-- ...02_roles_and_helpers.sql already runs a schema-level `alter default privileges ... revoke
-- execute on functions from public` -- that default-privilege statement does not retroactively
-- apply to a function created after it ran. A trigger function needs no EXECUTE grant at all
-- (it runs on the firing statement's behalf, independent of the invoking role's privileges), so
-- the revoke-with-no-grant here is deliberate, not an oversight.
revoke all on function public.tg_audit_row() from public;

-- Attached to: settings, settings_versions, coupons, chauffeurs, vehicles, vehicle_classes,
-- distance_rates, fixed_routes, surcharges, rate_versions, content_strings, reviews, staff,
-- service_zones, and **customers** -- the last one because a signed-in customer can edit their
-- own profile columns (Plan 02-08), and a self-service edit to a row ops also curates has to be
-- attributable. `before_value`/`after_value` on customers are the redaction evidence Phase 10
-- needs (D-19) -- see ...19_append_only.sql's F-10 comment for what is and is not fixed there.
do $$
declare t text;
begin
  foreach t in array array[
    'settings','settings_versions','coupons','chauffeurs','vehicles','vehicle_classes',
    'distance_rates','fixed_routes','surcharges','rate_versions','content_strings','reviews',
    'staff','service_zones','customers'
  ] loop
    execute format(
      'create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.tg_audit_row()',
      t, t);
  end loop;
end $$;

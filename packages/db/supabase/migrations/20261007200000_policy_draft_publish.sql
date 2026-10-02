-- 20261007200000_policy_draft_publish.sql
--
-- Owner decision 2026-10-02: the four policy values on the dashboard Settings page get a
-- draft and a Publish, the same two-step as the price book.
-- See .planning/decisions/2026-10-02-policy-values-draft-then-publish.md
--
-- This reverses D-27 ("publishing a new policy version is a migration, not a console action")
-- for these four values only:
--     min_advance_minutes, free_cancel_hours, airport_waiting_minutes, city_waiting_minutes
-- Every other column of settings_versions stays migration-only: cancellation_tiers, the night
-- window, the policy document slug and version, the service area.
--
-- settings_versions itself does not change. It stays append-only (tg_append_only,
-- 20260823000019): Publish INSERTs a superseding row, nothing is updated or deleted, and a
-- sold booking's policy provenance stays where it was.
--
-- Why this exists at all: live row 15 grants city waiting 15 minutes while /terms section 08 --
-- the owner-approved legal text -- promises 30 for every non-airport pickup. The owner went to
-- change it, and the box did nothing.

-- ---------------------------------------------------------------------------
-- The draft. One row, never more.
-- ---------------------------------------------------------------------------

create table public.settings_policy_draft (
  id                       pg_catalog.int2 primary key default 1 check (id = 1),
  min_advance_minutes      pg_catalog.int4 check (min_advance_minutes between 0 and 10080),
  free_cancel_hours        pg_catalog.int4 check (free_cancel_hours between 0 and 720),
  airport_waiting_minutes  pg_catalog.int4 check (airport_waiting_minutes between 0 and 1440),
  city_waiting_minutes     pg_catalog.int4 check (city_waiting_minutes between 0 and 1440),
  updated_at               pg_catalog.timestamptz not null default pg_catalog.now(),
  updated_by               pg_catalog.uuid
);

comment on table public.settings_policy_draft is
  'The unpublished draft of the four editable policy values (owner, 2026-10-02). One row. Publish copies it into a new settings_versions row; this table never reaches a customer.';

-- Opens showing live, so the page never starts on a blank or a zero.
insert into public.settings_policy_draft (
  id, min_advance_minutes, free_cancel_hours, airport_waiting_minutes, city_waiting_minutes
)
select 1, sv.min_advance_minutes, sv.free_cancel_hours, sv.airport_waiting_minutes, sv.city_waiting_minutes
  from public.settings_versions as sv
 where sv.effective_from <= pg_catalog.now()
 order by sv.effective_from desc, sv.id desc
 limit 1
on conflict (id) do nothing;

-- On a database built from zero the migrations run before the seed, so the select above
-- matches nothing and would leave no draft row at all. Then PATCH would update zero rows
-- and Save would look like it worked and keep nothing -- which is the exact fault this
-- migration exists to remove. The row is made unconditionally.
insert into public.settings_policy_draft (id) values (1) on conflict (id) do nothing;

alter table public.settings_policy_draft enable row level security;
revoke all on table public.settings_policy_draft from public, anon, authenticated;
revoke all on table public.settings_policy_draft from vamos_edge, vamos_public;
-- Insert is granted alongside update so Save is an upsert and the row heals itself if it
-- is ever missing; the id = 1 CHECK is what keeps the table a singleton, not the grant.
-- Delete is not granted: there is no way to take the draft away.
grant select, insert, update on table public.settings_policy_draft to vamos_staff;

create policy settings_policy_draft_staff_read on public.settings_policy_draft
  for select to vamos_staff using (true);
create policy settings_policy_draft_staff_write on public.settings_policy_draft
  for update to vamos_staff using (true) with check (true);
create policy settings_policy_draft_staff_make on public.settings_policy_draft
  for insert to vamos_staff with check (id = 1);

-- ---------------------------------------------------------------------------
-- Publish: one superseding settings_versions row, carrying everything else forward.
-- ---------------------------------------------------------------------------

create or replace function public.policy_publish_draft(p_actor pg_catalog.uuid)
returns pg_catalog.int8
language plpgsql security definer set search_path = ''
as $$
declare
  v_live   public.settings_versions%rowtype;
  v_draft  public.settings_policy_draft%rowtype;
  v_new_id pg_catalog.int8;
begin
  -- Two admins pressing Publish take turns, so the second one supersedes the first
  -- instead of racing it.
  perform pg_catalog.pg_advisory_xact_lock(2610020);

  select * into v_draft from public.settings_policy_draft where id = 1;
  if not found then
    raise exception 'policy_publish_draft: no draft row' using errcode = '22023';
  end if;

  -- id desc is the tie-break, not decoration: from today this table has two writers (the
  -- price-book Publish and this one), so two rows can carry the same effective_from second
  -- and "the newest" would otherwise be whichever the planner happened to return.
  select * into v_live
    from public.settings_versions as sv
   where sv.effective_from <= pg_catalog.now()
   order by sv.effective_from desc, sv.id desc
   limit 1;
  if not found then
    raise exception 'policy_publish_draft: no live policy version' using errcode = '22023';
  end if;

  -- A value the draft has never held is the live value, exactly as the page shows it.
  -- Publishing must never turn an untouched box into a null on a customer-facing row.
  v_draft.min_advance_minutes := coalesce(v_draft.min_advance_minutes, v_live.min_advance_minutes);
  v_draft.free_cancel_hours := coalesce(v_draft.free_cancel_hours, v_live.free_cancel_hours);
  v_draft.airport_waiting_minutes := coalesce(v_draft.airport_waiting_minutes, v_live.airport_waiting_minutes);
  v_draft.city_waiting_minutes := coalesce(v_draft.city_waiting_minutes, v_live.city_waiting_minutes);

  -- Nothing to publish is a refusal, not a silent new row: history stays readable.
  if v_live.min_advance_minutes is not distinct from v_draft.min_advance_minutes
     and v_live.free_cancel_hours is not distinct from v_draft.free_cancel_hours
     and v_live.airport_waiting_minutes is not distinct from v_draft.airport_waiting_minutes
     and v_live.city_waiting_minutes is not distinct from v_draft.city_waiting_minutes then
    raise exception 'policy_publish_draft: the draft is the same as what is live'
      using errcode = '22023';
  end if;

  insert into public.settings_versions (
    slug, label, created_by, effective_from,
    free_cancel_hours, modification_deadline_hours, min_advance_minutes,
    airport_waiting_minutes, city_waiting_minutes, manage_link_validity_days,
    round_trip_discount_percent, night_window_start, night_window_end, night_window_tz,
    quote_lock_minutes, checkout_window_minutes, cancellation_tiers,
    policy_doc_slug, policy_doc_version, service_area_geojson
  ) values (
    -- id is GENERATED ALWAYS, so the slug cannot carry it. The clock to the millisecond is
    -- unique (slug has a UNIQUE index) and reads as what it is: when it was published.
    'policy-publish-' || pg_catalog.to_char(
      pg_catalog.clock_timestamp() at time zone 'UTC', 'YYYYMMDD"T"HH24MISSMS'
    ),
    v_live.label,
    p_actor,
    pg_catalog.now(),
    v_draft.free_cancel_hours,
    v_live.modification_deadline_hours,
    v_draft.min_advance_minutes,
    v_draft.airport_waiting_minutes,
    v_draft.city_waiting_minutes,
    v_live.manage_link_validity_days,
    v_live.round_trip_discount_percent,
    v_live.night_window_start,
    v_live.night_window_end,
    v_live.night_window_tz,
    v_live.quote_lock_minutes,
    v_live.checkout_window_minutes,
    v_live.cancellation_tiers,
    v_live.policy_doc_slug,
    v_live.policy_doc_version,
    v_live.service_area_geojson
  )
  returning id into v_new_id;

  update public.settings_policy_draft
     set updated_at = pg_catalog.now(), updated_by = p_actor
   where id = 1;

  return v_new_id;
end
$$;

revoke all on function public.policy_publish_draft(pg_catalog.uuid) from public;
grant execute on function public.policy_publish_draft(pg_catalog.uuid) to vamos_staff;
comment on function public.policy_publish_draft(pg_catalog.uuid) is
  'Owner 2026-10-02: copies the four drafted policy values into a new settings_versions row, carrying every other column forward. Refuses an empty value and a draft equal to live. settings_versions stays append-only.';

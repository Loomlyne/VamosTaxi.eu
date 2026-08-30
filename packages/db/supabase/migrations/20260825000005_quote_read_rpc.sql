-- 20260825000005_quote_read_rpc.sql
--
-- D-34: the anonymous quote identity reads the rate book, the settings version and the lock
-- deadline through THREE SECURITY DEFINER RPCs and no table grant.
--
-- Discovery that motivates this file: asQuote resolves to anon
-- (packages/db/src/identity.ts's QUOTE_PG_ROLE), and ...24_rls_public.sql grants anon SELECT
-- on exactly content_strings, reviews, vehicle_classes, service_zones and the
-- settings_public view. Nothing in the pricing schema is readable by that role — so
-- 04-RESEARCH.md §1's rate-book table, which reads as though a direct select were available,
-- describes a query that returns 42501 today. These three functions are the grant surface;
-- no table grant is added by this file, and that is the point. The view-is-the-grant-surface
-- pattern from settings_public applies here to pricing.
--
-- All three run as the owner with an empty search path, every identifier and every type
-- schema-qualified, revoke all from public, grant execute to anon, authenticated, and no
-- other grant.
--
-- D-46: no CHF amount enters this file.

-- ---------------------------------------------------------------------------
-- quote_rate_book — frozen book for the live version, or newest draft on request
-- ---------------------------------------------------------------------------
-- stable: the book does not call now(); the planner may reuse the result within one
-- statement. quote_lock_deadline is the clock function and is marked volatile instead —
-- mismarking a clock function stable would be a correctness bug, not a performance one.
--
-- D-26/D-33: this function's draft branch cannot make a charge possible.
-- rate_version_is_live is written by tg_snapshot_rate_version_flag from the table
-- (plan 04-05) and the charge gate re-reads rate_versions.status itself.
--
-- Threat T5: every array carries an explicit order by. Postgres gives no order without
-- one, and the engine's seq numbering would otherwise be a function of the plan chosen
-- that morning. Classes by sort_order, slug; distance_rates by vehicle_class_id;
-- fixed_routes by (origin_zone_id, dest_zone_id, vehicle_class_id); surcharges by code;
-- zones by slug.
--
-- to_jsonb on the row is the projection: surcharges.percent and distance_rates.*_rappen
-- keep their numeric/domain types. Never cast numeric to a float — to_jsonb(numeric)
-- preserves the exact decimal and postgres.js hands it to the Worker as a string, which
-- is exactly what percentToHundredths expects (D-07).
--
-- Include surcharges.predicate / quantity_source and service_zones.zone_type / tags
-- (plan 04-04) so the engine can evaluate a predicate it was sent.

create function public.quote_rate_book(p_prefer_draft boolean default false)
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
begin
  select rv.id, rv.slug, rv.status
    into v_id, v_slug, v_status
    from public.rate_versions as rv
   where rv.status = 'live'
   order by rv.id desc
   limit 1;

  -- Live wins. Only when no live row exists AND p_prefer_draft, take the newest draft.
  if v_id is null and p_prefer_draft then
    select rv.id, rv.slug, rv.status
      into v_id, v_slug, v_status
      from public.rate_versions as rv
     where rv.status = 'draft'
     order by rv.created_at desc, rv.id desc
     limit 1;
  end if;

  -- QUOTE-10 launch state: no live row, and either no draft or draft not requested.
  -- rate_version null with five empty arrays is legal, never an exception.
  if v_id is null then
    return jsonb_build_object(
      'rate_version', null,
      'classes', '[]'::jsonb,
      'distance_rates', '[]'::jsonb,
      'fixed_routes', '[]'::jsonb,
      'surcharges', '[]'::jsonb,
      'zones', '[]'::jsonb
    );
  end if;

  return jsonb_build_object(
    'rate_version', jsonb_build_object(
      'id', v_id,
      'slug', v_slug,
      'status', v_status
    ),
    'classes', (
      select coalesce(jsonb_agg(to_jsonb(c) order by c.sort_order, c.slug), '[]'::jsonb)
        from public.vehicle_classes as c
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
    'zones', (
      select coalesce(jsonb_agg(to_jsonb(z) order by z.slug), '[]'::jsonb)
        from public.service_zones as z
    )
  );
end;
$$;

revoke all on function public.quote_rate_book(boolean) from public;
grant execute on function public.quote_rate_book(boolean) to anon, authenticated;

comment on function public.quote_rate_book(boolean) is
  'D-34: anonymous quote identity''s rate-book door. Tables stay revoked; this function is the grant surface. Draft preview cannot charge (D-26/D-33).';

-- ---------------------------------------------------------------------------
-- quote_settings_version — the policy row current at p_as_of
-- ---------------------------------------------------------------------------
-- stable: the caller supplies p_as_of; this function never reads the clock.
-- Never falls back to "the newest row regardless of date": a booking is sold under the
-- policy version current at its quote time, and picking a future version would silently
-- rewrite that. Returns every column (to_jsonb of the row), including
-- service_area_geojson (plan 04-05), quote_lock_minutes, checkout_window_minutes,
-- night_window_start/end/tz and round_trip_discount_percent. SQL null when none matches.

create function public.quote_settings_version(p_as_of timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(sv)
    from public.settings_versions as sv
   where sv.effective_from <= p_as_of
   order by sv.effective_from desc, sv.id desc
   limit 1;
$$;

revoke all on function public.quote_settings_version(timestamptz) from public;
grant execute on function public.quote_settings_version(timestamptz) to anon, authenticated;

comment on function public.quote_settings_version(timestamptz) is
  'D-34: anonymous quote identity''s settings-version door. Greatest effective_from <= p_as_of, id desc. Null when none; the caller maps that to 500 no_settings_version.';

-- ---------------------------------------------------------------------------
-- quote_lock_deadline — Postgres authors exp; the Worker never does (D-24)
-- ---------------------------------------------------------------------------
-- volatile: it reads now(). A stable marking is what lets the planner reuse the result
-- within one statement; mismarking this clock function would be a correctness bug, not a
-- performance one.
--
-- D-24: exp is authored by Postgres, never Date.now(); a null lock length is an
-- unanswered policy number and must raise rather than default to 30, because a silent 30
-- here would be an invented promise the customer was never sold.
--
-- timestamptz + interval is STABLE, not IMMUTABLE — harmless in a function body, and the
-- reason this arithmetic must never move into a generated column or an index expression
-- (the Phase 2 booking_legs.scheduled_range lesson, recorded in that migration's own
-- comment). Missing row or null quote_lock_minutes → restrict_violation.

create function public.quote_lock_deadline(p_settings_version_id bigint)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_minutes integer;
begin
  select sv.quote_lock_minutes
    into v_minutes
    from public.settings_versions as sv
   where sv.id = p_settings_version_id;

  if not found or v_minutes is null then
    raise exception
      'quote_lock_minutes is unanswered on settings_version %',
      p_settings_version_id
      using errcode = 'restrict_violation',
            hint = 'D-24: exp is authored by Postgres, never Date.now(); a null lock length must raise rather than default to 30.';
  end if;

  return now() + (v_minutes * interval '1 minute');
end;
$$;

revoke all on function public.quote_lock_deadline(bigint) from public;
grant execute on function public.quote_lock_deadline(bigint) to anon, authenticated;

comment on function public.quote_lock_deadline(bigint) is
  'D-24: the ONLY author of a lock exp. now() + quote_lock_minutes. Raises restrict_violation when the row is missing or quote_lock_minutes is null.';

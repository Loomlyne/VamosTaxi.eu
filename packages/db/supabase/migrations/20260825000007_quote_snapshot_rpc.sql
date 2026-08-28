-- 20260825000007_quote_snapshot_rpc.sql
--
-- D-44a / D-21 / D-25: open the write door Phase 3 reserved and could not build.
--
-- packages/db/src/identity.ts carries the seam: QUOTE_PG_ROLE resolves to anon,
-- Phase 2 grants INSERT on price_snapshots to nobody, and "Phase 4's first
-- migration must add exactly one of: (a) public.create_quote_snapshot(...)
-- as a definer function… or (b) a vamos_quote nologin role". This file
-- takes path (a). A definer RPC keeps the grant surface one function wide;
-- path (b) would be a Phase 2 role-set addition (D-31) and would move
-- QUOTE_PG_ROLE. QUOTE_PG_ROLE stays "anon". Nothing in Phase 3's frozen
-- contract moves.
--
-- Negative space — this file:
--   - adds NO table grant (a direct insert as anon still raises 42501)
--   - accepts NO rate_version_is_live argument (D-33: tg_snapshot_rate_version_flag
--     overwrites the column from rate_versions; a caller-supplied flag would let
--     EXECUTE make a draft chargeable)
--   - derives expires_at from settings_versions.checkout_window_minutes rather
--     than accepting it (D-43: a caller-supplied payment window is a
--     caller-extended payment window)
--   - writes no booking (booking_id stays the default NULL unless the caller
--     supplies one; /api/quote never calls this function)
--
-- D-21: /api/quote never calls this. The first real caller is Phase 7's
-- checkout transaction. This plan ships the shape and the refusals.
--
-- D-46: no CHF amount enters this file.

create function public.create_quote_snapshot(
  p_quote_id pg_catalog.uuid,
  p_vehicle_class_id pg_catalog.uuid,
  p_rate_version_id pg_catalog.int8,
  p_settings_version_id pg_catalog.int8,
  p_engine_version pg_catalog.text,
  p_lock_exp pg_catalog.timestamptz,
  p_pax pg_catalog.int2,
  p_bags pg_catalog.int2,
  p_lines pg_catalog.jsonb,
  p_policy pg_catalog.jsonb,
  p_shown_alternatives pg_catalog.jsonb,
  p_legs pg_catalog.jsonb,
  p_display_currency public.display_currency default 'CHF'::public.display_currency,
  p_source pg_catalog.text default 'web',
  p_subtotal_rappen public.rappen default null,
  p_surcharges_rappen public.rappen default null,
  p_discount_rappen public.rappen default null,
  p_total_rappen public.rappen default null,
  p_distance_km pg_catalog.numeric default null,
  p_duration_min pg_catalog.int4 default null,
  p_coupon_id pg_catalog.int8 default null,
  p_coupon_code pg_catalog.text default null,
  p_booking_id pg_catalog.uuid default null
)
returns pg_catalog.int8
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_checkout_window pg_catalog.int4;
  v_snapshot_id pg_catalog.int8;
begin
  -- D-25: this is the AUTHORITATIVE expiry check, evaluated by Postgres inside
  -- the write transaction; the Worker-side one and the UI countdown are
  -- decorative, and a curl of a held, expired token dies here whether or not
  -- any handler remembered to look.
  if p_lock_exp is null or p_lock_exp <= pg_catalog.now() then
    raise exception
      'quote lock expired: p_lock_exp=% now()=%',
      p_lock_exp, pg_catalog.now()
      using errcode = 'restrict_violation';
  end if;

  select sv.checkout_window_minutes
    into v_checkout_window
    from public.settings_versions as sv
   where sv.id = p_settings_version_id;

  -- A null payment window is an unanswered policy number and must raise rather
  -- than default — the same discipline quote_lock_deadline() applies to the
  -- lock length (plan 04-06). Read checkout_window_minutes; never re-add it.
  if not found or v_checkout_window is null then
    raise exception
      'checkout_window_minutes is unanswered on settings_version %',
      p_settings_version_id
      using errcode = 'restrict_violation';
  end if;

  -- rate_version_is_live is a placeholder the BEFORE INSERT trigger overwrites
  -- from rate_versions (D-33). Both clocks are computed inside this transaction
  -- from Postgres now(), never from an expires_at argument, which is what makes
  -- them un-extendable by a caller (D-23 / D-43). quote_lock_expires_at is the
  -- verified lock's exp; expires_at is now() + checkout_window_minutes.
  insert into public.price_snapshots (
    quote_id,
    vehicle_class_id,
    rate_version_id,
    rate_version_is_live,
    settings_version_id,
    engine_version,
    source,
    display_currency,
    subtotal_rappen,
    surcharges_rappen,
    discount_rappen,
    total_rappen,
    distance_km,
    duration_min,
    pax,
    bags,
    coupon_id,
    coupon_code,
    lines,
    policy,
    shown_alternatives,
    quote_lock_expires_at,
    expires_at,
    booking_id
  ) values (
    p_quote_id,
    p_vehicle_class_id,
    p_rate_version_id,
    false,
    p_settings_version_id,
    p_engine_version,
    p_source,
    p_display_currency,
    p_subtotal_rappen,
    p_surcharges_rappen,
    p_discount_rappen,
    p_total_rappen,
    p_distance_km,
    p_duration_min,
    p_pax,
    p_bags,
    p_coupon_id,
    p_coupon_code,
    p_lines,
    p_policy,
    p_shown_alternatives,
    p_lock_exp,
    pg_catalog.now() + (v_checkout_window * interval '1 minute'),
    p_booking_id
  )
  returning id into v_snapshot_id;

  -- Do not catch or re-raise the constraint violations the table already
  -- enforces — let price_snapshots_all_or_nothing, price_snapshots_policy_shape,
  -- price_snapshots_lines_array, price_snapshots_coupon_pair and plan 04-05's
  -- tg_snapshot_lines_reconcile surface their own SQLSTATEs unmodified, so a
  -- call site can still branch on err.code. Swallowing them into a friendlier
  -- message is the tempting change a later contributor will make.

  if p_legs is null
     or pg_catalog.jsonb_typeof(p_legs) is distinct from 'array'
     or pg_catalog.jsonb_array_length(p_legs) = 0 then
    raise exception
      'create_quote_snapshot requires a non-empty jsonb array of legs (ADR-006)'
      using errcode = 'restrict_violation';
  end if;

  insert into public.price_snapshot_legs (
    snapshot_id,
    leg_seq,
    booking_leg_id,
    distance_km,
    duration_min,
    leg_subtotal_rappen
  )
  select
    v_snapshot_id,
    (elem ->> 'leg_seq')::pg_catalog.int2,
    nullif(elem ->> 'booking_leg_id', '')::pg_catalog.uuid,
    (elem ->> 'distance_km')::pg_catalog.numeric,
    (elem ->> 'duration_min')::pg_catalog.int4,
    (elem ->> 'leg_subtotal_rappen')::public.rappen
  from pg_catalog.jsonb_array_elements(p_legs) as elem;

  return v_snapshot_id;
end;
$$;

revoke all on function public.create_quote_snapshot(
  pg_catalog.uuid,
  pg_catalog.uuid,
  pg_catalog.int8,
  pg_catalog.int8,
  pg_catalog.text,
  pg_catalog.timestamptz,
  pg_catalog.int2,
  pg_catalog.int2,
  pg_catalog.jsonb,
  pg_catalog.jsonb,
  pg_catalog.jsonb,
  pg_catalog.jsonb,
  public.display_currency,
  pg_catalog.text,
  public.rappen,
  public.rappen,
  public.rappen,
  public.rappen,
  pg_catalog.numeric,
  pg_catalog.int4,
  pg_catalog.int8,
  pg_catalog.text,
  pg_catalog.uuid
) from public;

grant execute on function public.create_quote_snapshot(
  pg_catalog.uuid,
  pg_catalog.uuid,
  pg_catalog.int8,
  pg_catalog.int8,
  pg_catalog.text,
  pg_catalog.timestamptz,
  pg_catalog.int2,
  pg_catalog.int2,
  pg_catalog.jsonb,
  pg_catalog.jsonb,
  pg_catalog.jsonb,
  pg_catalog.jsonb,
  public.display_currency,
  pg_catalog.text,
  public.rappen,
  public.rappen,
  public.rappen,
  public.rappen,
  pg_catalog.numeric,
  pg_catalog.int4,
  pg_catalog.int8,
  pg_catalog.text,
  pg_catalog.uuid
) to anon, authenticated;

comment on function public.create_quote_snapshot(
  pg_catalog.uuid,
  pg_catalog.uuid,
  pg_catalog.int8,
  pg_catalog.int8,
  pg_catalog.text,
  pg_catalog.timestamptz,
  pg_catalog.int2,
  pg_catalog.int2,
  pg_catalog.jsonb,
  pg_catalog.jsonb,
  pg_catalog.jsonb,
  pg_catalog.jsonb,
  public.display_currency,
  pg_catalog.text,
  public.rappen,
  public.rappen,
  public.rappen,
  public.rappen,
  pg_catalog.numeric,
  pg_catalog.int4,
  pg_catalog.int8,
  pg_catalog.text,
  pg_catalog.uuid
) is
  'D-44a: the quote path''s only write door. packages/db/supabase/tests/quote_identity.test.sql is the executable half of the seam.';

-- 20260825000004_quote_gates.sql
--
-- D-25 / D-26 / D-32 / D-17: harden the charge gate, flip the rate-version flag to
-- "was published", and add the nullable service-area polygon column.
--
-- What this file deliberately does NOT do:
--   - it re-adds NEITHER quote_lock_minutes NOR checkout_window_minutes. Both landed in
--     Phase 2 ...004_settings.sql on settings_versions. 04-CONTEXT.md's <specifics> text
--     describing them on the mutable settings singleton is superseded by what shipped;
--     04-PATTERNS.md Caveat 1 is the record. This file only READs quote_lock_expires_at
--     (added by ...003) inside the gate.
--   - it adds no polygon DATA and invents no GeoJSON.
--   - it has no environment switch of any kind. PRICING_PREVIEW has no database
--     representation (D-33) — that is precisely what makes a staging preview unable to charge.
--
-- D-46: no CHF amount enters this file.

-- ---------------------------------------------------------------------------
-- tg_payment_matches_snapshot — definer + IF NOT FOUND + quote lock (D-25, D-32)
-- ---------------------------------------------------------------------------
-- create or replace keeps booking_payments_match_snapshot bound — do not drop the trigger.
-- create or replace restores PUBLIC EXECUTE by default; revoke is re-issued below.
--
-- Three changes around the landed five checks (which stay verbatim):
--   1. security definer set search_path = '' — as invoker, an RLS-filtered miss on the
--      snapshot SELECT leaves the %rowtype all-NULL and every subsequent IF skips. The amount
--      check happening to raise via IS DISTINCT FROM NULL is a coincidence, not a gate.
--   2. IF NOT FOUND immediately after the snapshot SELECT (D-32) — the check the definer
--      change exists to make meaningful.
--   3. After expires_at and before the amount check: refuse when quote_lock_expires_at <= now()
--      even if the payment window is still open (D-25). A handler that forgets the if still
--      dies; a direct INSERT INTO booking_payments against a snapshot minted from an expired
--      token still dies.

create or replace function public.tg_payment_matches_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.price_snapshots%rowtype;
  v_status public.rate_version_status;
begin
  select * into s from public.price_snapshots where id = new.snapshot_id;

  if not found then
    raise exception 'snapshot % does not exist', new.snapshot_id
      using errcode = 'restrict_violation';
  end if;

  if not s.is_chargeable then
    raise exception 'snapshot % is not chargeable (total=%, rate_version_is_live=%)',
      s.id, s.total_rappen, s.rate_version_is_live
      using errcode = 'restrict_violation',
            hint = 'QUOTE-10: no rate_version is live, or this class has no priced matrix row.';
  end if;
  -- Re-read the version at charge time, not only the flag copied at quote time. A quote priced
  -- under a version that has since been RETIRED is still honoured (the customer was shown that
  -- price minutes ago and the version's rows are frozen); a version that never left DRAFT can
  -- never be charged against, whatever any copied flag says.
  select status into v_status from public.rate_versions where id = s.rate_version_id;
  if v_status = 'draft' then
    raise exception 'snapshot % cites rate_version % which is still draft', s.id, s.rate_version_id
      using errcode = 'restrict_violation';
  end if;
  -- QUOTE-04: an expired quote is refused when the customer commits to pay, by the server, not
  -- merely hidden in the UI. Payment window (expires_at) first.
  if s.expires_at <= now() then
    raise exception 'quote % expired at %', s.id, s.expires_at using errcode = 'restrict_violation';
  end if;
  -- D-25: second clock. A handler that forgets the if still dies; a direct
  -- INSERT INTO booking_payments against a snapshot minted from an expired token still dies —
  -- even when the payment window (expires_at) is still open.
  if s.quote_lock_expires_at <= now() then
    raise exception
      'quote lock on snapshot % expired at % (payment window open until %)',
      s.id, s.quote_lock_expires_at, s.expires_at
      using errcode = 'restrict_violation';
  end if;
  if new.charged_rappen is distinct from s.total_rappen then
    raise exception 'charge % does not match snapshot % total %',
      new.charged_rappen, s.id, s.total_rappen using errcode = 'restrict_violation';
  end if;
  if s.booking_id is null or new.booking_id is distinct from s.booking_id then
    raise exception 'snapshot % belongs to booking %, not %', s.id, s.booking_id, new.booking_id
      using errcode = 'restrict_violation';
  end if;
  -- F-06 / T-02-46: the check above only proves the snapshot's OWN booking_id points back at
  -- this booking -- and `price_snapshots_quote_class` gives one row per (quote_id,
  -- vehicle_class_id) because the quote endpoint prices EVERY eligible class in one call. Every
  -- one of those sibling rows can legitimately carry the same booking_id once the customer's
  -- pick sets it (a re-price/modification can also leave more than one bound snapshot in
  -- history, by design -- see ...013's comment on why no one-per-booking index exists). Without
  -- this second check, a stale Worker deploy, an ops SQL session, or a Queue consumer replaying
  -- an old request could bind the booking's payment to the Economy row of a quote whose legs
  -- ended up a Van, and every check above would still pass -- the Economy total is a real,
  -- chargeable, correctly-priced amount, just for the wrong class. `bookings.price_snapshot_id`
  -- is the one column that names the snapshot the customer actually chose; a payment must cite
  -- exactly that row, not merely a row that happens to share its booking_id.
  if new.snapshot_id is distinct from (select b.price_snapshot_id from public.bookings b where b.id = new.booking_id) then
    raise exception 'payment cites snapshot %, but booking % is bound to %',
      new.snapshot_id, new.booking_id, (select b.price_snapshot_id from public.bookings b where b.id = new.booking_id)
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.tg_payment_matches_snapshot() from public;

-- ---------------------------------------------------------------------------
-- tg_snapshot_rate_version_flag — was-published (D-26)
-- ---------------------------------------------------------------------------
-- D-26: rate_version_is_live = (status in ('live','retired')) — "was published", not "is live
-- this instant". A mid-lock publish (A live→retired, B draft→live) previously made the flag
-- false, is_chargeable false, and forced the customer onto the new matrix — fail-closed, but
-- QUOTE-04 does not hold. draft is still refused by the charge gate's own status re-read,
-- which this plan leaves untouched.

create or replace function public.tg_snapshot_rate_version_flag()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select (status in ('live','retired')) into new.rate_version_is_live
    from public.rate_versions where id = new.rate_version_id;
  if new.rate_version_is_live is null then
    raise exception 'rate_version % does not exist', new.rate_version_id
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.tg_snapshot_rate_version_flag() from public;

-- ---------------------------------------------------------------------------
-- settings_versions.service_area_geojson (D-17)
-- ---------------------------------------------------------------------------
-- Nullable, no default — matches sibling nullable-until-confirmed columns
-- (airport_waiting_minutes, min_advance_minutes, …).
--
-- D-17 asymmetry (the two NULLs mean opposite things):
--   NULL service_area_geojson  → fails CLOSED in application code (422 service_area_undefined,
--     labelled TBC gap, plan 04-10). A NOT NULL constraint here would be wrong: it would make
--     the seed unrunnable and replace a labelled gap with an invented polygon.
--   NULL min_advance_minutes   → SKIPS the advance threshold.
--
-- CHECK is typeof-only. PostGIS is not installed (Phase 2 extensions: pgcrypto, btree_gist,
-- citext, pgtap) and will not be added for one boolean; point-in-polygon runs in the Worker.

alter table public.settings_versions
  add column service_area_geojson jsonb;

alter table public.settings_versions
  add constraint settings_versions_service_area_geojson_object
  check (
    service_area_geojson is null
    or jsonb_typeof(service_area_geojson) = 'object'
  );

comment on column public.settings_versions.service_area_geojson is
  'D-17: optional service-area polygon (GeoJSON object). NULL fails closed in the Worker (422 service_area_undefined), never via NOT NULL. Opposite of min_advance_minutes NULL (which skips). No PostGIS — point-in-polygon is application-side.';

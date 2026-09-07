-- 20260907000001_quote_lock_24h.sql
--
-- Phase 7 remainder D-31: one 24-hour quote lock / checkout window.
-- settings_versions is append-only — never UPDATE launch-baseline.
-- Clone the current policy row (greatest effective_from <= now()) with
-- quote_lock_minutes = 1440 and checkout_window_minutes = 1440.
--
-- Fresh `db reset`: this INSERT matches zero rows (seed has not run yet).
-- Seed then writes launch-baseline at 1440 (generate-seed.mjs).
-- Hosted: this INSERT becomes current via effective_from = now().
--
-- No fares. No invented CHF.

insert into public.settings_versions (
  slug,
  label,
  effective_from,
  free_cancel_hours,
  modification_deadline_hours,
  min_advance_minutes,
  airport_waiting_minutes,
  city_waiting_minutes,
  manage_link_validity_days,
  round_trip_discount_percent,
  night_window_start,
  night_window_end,
  night_window_tz,
  quote_lock_minutes,
  checkout_window_minutes,
  cancellation_tiers,
  policy_doc_slug,
  policy_doc_version,
  service_area_geojson
)
select
  'checkout-lock-24h',
  'Checkout lock 24h — Phase 7 remainder D-31',
  now(),
  sv.free_cancel_hours,
  sv.modification_deadline_hours,
  sv.min_advance_minutes,
  sv.airport_waiting_minutes,
  sv.city_waiting_minutes,
  sv.manage_link_validity_days,
  sv.round_trip_discount_percent,
  sv.night_window_start,
  sv.night_window_end,
  sv.night_window_tz,
  1440,
  1440,
  sv.cancellation_tiers,
  sv.policy_doc_slug,
  sv.policy_doc_version,
  sv.service_area_geojson
from public.settings_versions as sv
where sv.id = (
  select sv2.id
    from public.settings_versions as sv2
   where sv2.effective_from <= now()
   order by sv2.effective_from desc, sv2.id desc
   limit 1
)
  and not exists (
    select 1
      from public.settings_versions as existing
     where existing.slug = 'checkout-lock-24h'
  );

comment on column public.settings_versions.quote_lock_minutes is
  'D-31 remainder: how long a locked quote holds its CHF total. 1440 minutes (24h) on checkout-lock-24h / launch-baseline seed. Postgres quote_lock_deadline() is the only author of exp. Null raises restrict_violation — never default.';

comment on column public.settings_versions.checkout_window_minutes is
  'D-31 remainder: payment window, same 24h clock as quote_lock_minutes. Distinct column (ADR-014 §5).';

-- 20260930200000_reminder_24h_read.sql
--
-- Quick 260929-pga. The hourly 24 h reminder (apps/web/lib/lifecycle/reminder.ts, since 2026-09-12)
-- selected booking_legs, bookings, chauffeurs and vehicles straight through asSystem, i.e. login
-- vamos_edge then SET ROLE vamos_system. vamos_system has never had table SELECT on those tables
-- (the job role is definer-only), so live logged "permission denied for table booking_legs" every
-- hour and no reminder was ever selected. Same class as 26.3-01's notify.ts read.
--
-- No table grant is added to any role. This narrow SECURITY DEFINER read returns only what the
-- reminder mail already uses, for a one-hour window the caller names, and skips erased,
-- cancelled, completed and no-show bookings. EXECUTE: vamos_system only.

create or replace function public.reminder_24h_candidates(
  p_from pg_catalog.timestamptz,
  p_to pg_catalog.timestamptz
)
returns table (
  booking_id pg_catalog.uuid,
  booking_leg_id pg_catalog.uuid,
  reference pg_catalog.text,
  locale pg_catalog.text,
  contact_email pg_catalog.text,
  pickup_text pg_catalog.text,
  dropoff_text pg_catalog.text,
  scheduled_local pg_catalog.text,
  assigned_chauffeur_id pg_catalog.uuid,
  chauffeur_name pg_catalog.text,
  vehicle pg_catalog.text,
  plate pg_catalog.text
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id,
         l.id,
         b.reference,
         b.locale,
         b.contact_email::pg_catalog.text,
         l.pickup_text,
         l.dropoff_text,
         l.scheduled_local,
         l.assigned_chauffeur_id,
         ch.full_name,
         v.model,
         v.plate
    from public.booking_legs as l
    join public.bookings as b on b.id = l.booking_id
    left join public.chauffeurs as ch on ch.id = l.assigned_chauffeur_id
    left join public.vehicles as v on v.id = l.assigned_vehicle_id
   where l.original_scheduled_at >= p_from
     and l.original_scheduled_at < p_to
     and b.erased_at is null
     and b.status::pg_catalog.text not in ('cancelled', 'completed', 'no_show')
   order by l.original_scheduled_at, l.id
$$;

revoke all on function public.reminder_24h_candidates(pg_catalog.timestamptz, pg_catalog.timestamptz) from public;
revoke all on function public.reminder_24h_candidates(pg_catalog.timestamptz, pg_catalog.timestamptz) from anon;
revoke all on function public.reminder_24h_candidates(pg_catalog.timestamptz, pg_catalog.timestamptz) from authenticated;
grant execute on function public.reminder_24h_candidates(pg_catalog.timestamptz, pg_catalog.timestamptz) to vamos_system;

comment on function public.reminder_24h_candidates(pg_catalog.timestamptz, pg_catalog.timestamptz) is
  '24 h reminder read: legs whose original pickup is in [p_from, p_to) on bookings that are not erased, cancelled, completed or no-show, with the contact e-mail and assigned driver and vehicle the reminder mail names. Replaces raw table reads by vamos_system. EXECUTE: vamos_system only.';

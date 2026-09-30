-- 20261001120000_reminder_24h_paid_only.sql
--
-- Phase 26.5 plan 11, D-18. Owner decision (control board 2026-09-30): the 24 h reminder goes to
-- PAID bookings only. Until now it returned every booking that was not cancelled, completed or
-- no-show, so an unpaid (pending) booking inside the window got a reminder for a trip nobody paid for.
--
-- Replaces the body of 20260930200000; signature, return type, window, erased filter, order and
-- grants are unchanged. Only the status filter changes: confirmed or assigned (a successful payment
-- moves pending -> paid -> confirmed inside one settle call, so paid is transient).

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
     and b.status::pg_catalog.text in ('confirmed', 'assigned')
   order by l.original_scheduled_at, l.id
$$;

revoke all on function public.reminder_24h_candidates(pg_catalog.timestamptz, pg_catalog.timestamptz) from public;
revoke all on function public.reminder_24h_candidates(pg_catalog.timestamptz, pg_catalog.timestamptz) from anon;
revoke all on function public.reminder_24h_candidates(pg_catalog.timestamptz, pg_catalog.timestamptz) from authenticated;
grant execute on function public.reminder_24h_candidates(pg_catalog.timestamptz, pg_catalog.timestamptz) to vamos_system;

comment on function public.reminder_24h_candidates(pg_catalog.timestamptz, pg_catalog.timestamptz) is
  '24 h reminder read: legs whose original pickup is in [p_from, p_to) on PAID bookings only (status confirmed or assigned; D-18, 2026-09-30) that are not erased, with the contact e-mail and assigned driver and vehicle the reminder mail names. EXECUTE: vamos_system only.';

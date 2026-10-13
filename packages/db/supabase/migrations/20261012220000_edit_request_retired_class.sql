-- 20261012220000_edit_request_retired_class.sql
--
-- Phase 30 (vehicle class lifecycle), plan 30-03, owner decision 8 (Accept on a customer edit request
-- for a trip in a retired class is refused until the class is brought back).
-- Applied by the controller verbatim after Ship; never `supabase db push`. No CHF amounts, no data change.
--
--   1. public.booking_edit_request_class_retired(uuid): true when the request's booking has a leg whose
--      class is retired (hidden_at is not null), or when the request payload's vehicle_class_slug names
--      a retired class; false otherwise, and false for an unknown request id. acceptPaidEdit
--      (apps/web/lib/ops/edit-request.ts) read this with a raw SELECT on booking_edit_requests,
--      booking_legs and vehicle_classes inside asSystem; vamos_system is definer-only (no table grants),
--      so that SELECT raised 42501 on live and broke Accept for every paid edit request. Same logic,
--      now behind SECURITY DEFINER. EXECUTE: vamos_system only.

create or replace function public.booking_edit_request_class_retired(p_request_id pg_catalog.uuid)
returns pg_catalog.bool
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
           select 1
             from public.booking_edit_requests as r
             join public.booking_legs as l on l.booking_id = r.booking_id
             join public.vehicle_classes as vc on vc.id = l.vehicle_class_id
            where r.id = p_request_id
              and vc.hidden_at is not null
         )
      or exists (
           select 1
             from public.booking_edit_requests as r
             join public.vehicle_classes as vc on vc.slug = r.payload ->> 'vehicle_class_slug'
            where r.id = p_request_id
              and vc.hidden_at is not null
         )
$$;

revoke all on function public.booking_edit_request_class_retired(pg_catalog.uuid) from public;
revoke all on function public.booking_edit_request_class_retired(pg_catalog.uuid) from anon;
revoke all on function public.booking_edit_request_class_retired(pg_catalog.uuid) from authenticated;
grant execute on function public.booking_edit_request_class_retired(pg_catalog.uuid) to vamos_system;

comment on function public.booking_edit_request_class_retired(pg_catalog.uuid) is
  'Phase 30 decision 8: true when the edit request''s booking has a leg in a retired class (hidden_at is not null) or the request payload''s vehicle_class_slug names a retired class; false otherwise and for an unknown request. Accept is refused while it is true. EXECUTE: vamos_system only.';

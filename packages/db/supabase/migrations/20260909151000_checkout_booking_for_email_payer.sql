-- Confirmation mail needs the company payer without a table SELECT.

drop function if exists public.checkout_booking_for_email(pg_catalog.uuid);

create function public.checkout_booking_for_email(p_booking_id pg_catalog.uuid)
returns table (
  reference pg_catalog.text,
  locale pg_catalog.text,
  contact_name pg_catalog.text,
  contact_email pg_catalog.text,
  payer_email pg_catalog.text,
  price_total_rappen pg_catalog.int8,
  pickup_text pg_catalog.text,
  dropoff_text pg_catalog.text,
  scheduled_local pg_catalog.text,
  flight_no pg_catalog.text,
  pax pg_catalog.int4,
  bags pg_catalog.int4,
  vehicle_class_slug pg_catalog.text
)
language sql
security definer
set search_path = ''
as $$
  select
    b.reference,
    b.locale,
    b.contact_name,
    b.contact_email::pg_catalog.text,
    b.payer_email::pg_catalog.text,
    b.price_total_rappen,
    l.pickup_text,
    l.dropoff_text,
    l.scheduled_local,
    l.flight_no,
    l.pax,
    l.bags,
    vc.slug
  from public.bookings as b
  join public.booking_legs as l
    on l.booking_id = b.id
   and l.leg_seq = 1
  left join public.vehicle_classes as vc
    on vc.id = l.vehicle_class_id
  where b.id = p_booking_id
$$;

revoke all on function public.checkout_booking_for_email(pg_catalog.uuid) from public;
grant execute on function public.checkout_booking_for_email(pg_catalog.uuid) to vamos_system;

comment on function public.checkout_booking_for_email(pg_catalog.uuid) is
  'Guest-readable booking + first-leg fields for confirmation mail, including payer_email. vamos_system EXECUTE only.';

-- 20260930160000_confirmation_payload_presentment.sql
--
-- 26.3 gap G3 (D-21, D-29): confirmation_payload also returns
--   payment.presentment_amount_minor, payment.presentment_currency,
--   legs[].vehicle_class_name (vehicle_classes.name, the dashboard display name).
-- Every existing field is unchanged. guest_confirmation_read and customer_confirmation_read
-- call this function unchanged. Grants are re-asserted exactly as
-- 20260928170000_confirmation_refund_facts.sql set them. No CHF amounts.

create or replace function public.confirmation_payload(p_booking_id pg_catalog.uuid)
returns pg_catalog.jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'booking', pg_catalog.jsonb_build_object(
      'reference', b.reference,
      'status', b.status,
      'contact_name', b.contact_name,
      'contact_email', b.contact_email,
      'contact_phone', b.contact_phone,
      'price_total_rappen', b.price_total_rappen,
      'refund_status', b.refund_status,
      'refund_owed_rappen', b.refund_owed_rappen,
      'refunded_rappen', b.refunded_rappen
    ),
    'legs', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'pickup_text', l.pickup_text,
          'dropoff_text', l.dropoff_text,
          'scheduled_local', l.scheduled_local,
          'vehicle_class_id', l.vehicle_class_id,
          'vehicle_class_name', vc.name,
          'pax', l.pax,
          'bags', l.bags,
          'flight_no', l.flight_no
        )
        order by l.leg_seq
      )
      from public.booking_legs as l
      left join public.vehicle_classes as vc on vc.id = l.vehicle_class_id
      where l.booking_id = b.id
    ), '[]'::pg_catalog.jsonb),
    'snapshot', (
      select pg_catalog.jsonb_build_object(
        'policy', ps.policy,
        'lines', ps.lines,
        'subtotal_rappen', ps.subtotal_rappen,
        'discount_rappen', ps.discount_rappen,
        'total_rappen', ps.total_rappen,
        'coupon_code', ps.coupon_code,
        'duration_min', ps.duration_min,
        'distance_km', ps.distance_km
      )
      from public.price_snapshots as ps
      where ps.booking_id = b.id
      order by ps.computed_at desc nulls last
      limit 1
    ),
    'payment', (
      select pg_catalog.jsonb_build_object(
        'status', bp.status,
        'captured_at', bp.captured_at,
        'charged_rappen', bp.charged_rappen,
        'presentment_amount_minor', bp.presentment_amount_minor,
        'presentment_currency', bp.presentment_currency
      )
      from public.booking_payments as bp
      where bp.booking_id = b.id
      order by bp.captured_at desc nulls last, bp.created_at desc
      limit 1
    )
  )
  from public.bookings as b
  where b.id = p_booking_id
$$;

revoke all on function public.confirmation_payload(pg_catalog.uuid) from public;
revoke all on function public.confirmation_payload(pg_catalog.uuid) from anon;
revoke all on function public.confirmation_payload(pg_catalog.uuid) from authenticated;
revoke all on function public.confirmation_payload(pg_catalog.uuid) from vamos_guest;
revoke all on function public.confirmation_payload(pg_catalog.uuid) from vamos_checkout;
revoke all on function public.confirmation_payload(pg_catalog.uuid) from vamos_system;

-- vamos_guest and authenticated have no SELECT on bookings.
-- Confirmation reads go through definers. A missing token or a foreign
-- customer id returns null. The page stays hidden. It must not throw 42501.

create or replace function public.guest_confirmation_read(
  p_reference pg_catalog.text,
  p_token_hash pg_catalog.bytea
)
returns pg_catalog.jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id pg_catalog.uuid;
begin
  if p_token_hash is null or pg_catalog.octet_length(p_token_hash) = 0 then
    return null;
  end if;

  select b.id
    into v_id
    from public.bookings as b
    join public.booking_access_tokens as t on t.booking_id = b.id
   where b.reference = p_reference
     and t.token_hash = p_token_hash
     and t.revoked_at is null
     and t.expires_at > pg_catalog.now()
   limit 1;

  if v_id is null then
    return null;
  end if;

  return public.confirmation_payload(v_id);
end;
$$;

create or replace function public.customer_confirmation_read(
  p_reference pg_catalog.text,
  p_customer_id pg_catalog.uuid
)
returns pg_catalog.jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id pg_catalog.uuid;
begin
  if p_customer_id is null then
    return null;
  end if;

  select b.id
    into v_id
    from public.bookings as b
   where b.reference = p_reference
     and b.customer_id = p_customer_id
   limit 1;

  if v_id is null then
    return null;
  end if;

  return public.confirmation_payload(v_id);
end;
$$;

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
      'price_total_rappen', b.price_total_rappen
    ),
    'legs', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'pickup_text', l.pickup_text,
          'dropoff_text', l.dropoff_text,
          'scheduled_local', l.scheduled_local,
          'vehicle_class_id', l.vehicle_class_id,
          'pax', l.pax,
          'bags', l.bags,
          'flight_no', l.flight_no
        )
        order by l.leg_seq
      )
      from public.booking_legs as l
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
        'charged_rappen', bp.charged_rappen
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

revoke all on function public.guest_confirmation_read(pg_catalog.text, pg_catalog.bytea) from public;
revoke all on function public.guest_confirmation_read(pg_catalog.text, pg_catalog.bytea) from anon;
revoke all on function public.guest_confirmation_read(pg_catalog.text, pg_catalog.bytea) from authenticated;
grant execute on function public.guest_confirmation_read(pg_catalog.text, pg_catalog.bytea) to vamos_guest;

revoke all on function public.customer_confirmation_read(pg_catalog.text, pg_catalog.uuid) from public;
revoke all on function public.customer_confirmation_read(pg_catalog.text, pg_catalog.uuid) from anon;
revoke all on function public.customer_confirmation_read(pg_catalog.text, pg_catalog.uuid) from vamos_guest;
grant execute on function public.customer_confirmation_read(pg_catalog.text, pg_catalog.uuid) to authenticated;

comment on function public.guest_confirmation_read(pg_catalog.text, pg_catalog.bytea) is
  'Confirmation page for a manage-token cookie. vamos_guest EXECUTE only.';
comment on function public.customer_confirmation_read(pg_catalog.text, pg_catalog.uuid) is
  'Confirmation page for the signed-in customer who owns the booking. authenticated EXECUTE only.';

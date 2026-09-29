-- 20260930130000_checkout_booking_details.sql
--
-- Plan 26.3-07 Task 2 (D-15, D-24, D-25, T-26.3-07-05): checkout stores company receipt fields,
-- a driver note and the trip query (so the trip can be reopened) on its own pending booking,
-- and lists every Stripe Checkout Session of a booking so a purge can verify each is expired.

alter table public.bookings
  add column if not exists checkout_trip_query text not null default '';
alter table public.bookings
  add constraint bookings_checkout_trip_query_len check (length(checkout_trip_query) <= 2000);

comment on column public.bookings.checkout_trip_query is
  'D-24: the checkout trip as a query string (addresses, Mapbox ids, when, pax, bags, flight). No contact data.';

create or replace function public.checkout_set_booking_details(
  p_booking_id uuid,
  p_company_name text,
  p_company_address text,
  p_company_vat text,
  p_driver_note text,
  p_trip_query text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_company_name, ''));
  v_addr text := btrim(coalesce(p_company_address, ''));
  v_vat text := btrim(coalesce(p_company_vat, ''));
  v_note text := btrim(coalesce(p_driver_note, ''));
  v_query text := btrim(coalesce(p_trip_query, ''));
  v_status public.booking_status;
begin
  if length(v_name) > 200 or length(v_addr) > 400 or length(v_vat) > 40
     or length(v_note) > 500 or length(v_query) > 2000 then
    raise exception 'checkout_set_booking_details: a field is too long' using errcode = '22001';
  end if;

  select b.status into v_status from public.bookings b where b.id = p_booking_id for update;
  if not found then
    raise exception 'checkout_set_booking_details: booking not found' using errcode = 'P0002';
  end if;
  if v_status <> 'pending' then
    raise exception 'checkout_set_booking_details: booking is not pending' using errcode = '55000';
  end if;

  update public.bookings
     set billing_kind = case when v_name <> '' then 'company' else 'individual' end,
         company_name = v_name,
         company_address = v_addr,
         company_vat = v_vat,
         note = v_note,
         checkout_trip_query = v_query
   where id = p_booking_id;
end
$$;

revoke all on function public.checkout_set_booking_details(uuid, text, text, text, text, text) from public;
grant execute on function public.checkout_set_booking_details(uuid, text, text, text, text, text) to vamos_checkout;

comment on function public.checkout_set_booking_details(uuid, text, text, text, text, text) is
  'D-15/D-24: stores company receipt fields, driver note (bookings.note) and trip query on a PENDING booking. Trims; caps 200/400/40/500/2000. EXECUTE: vamos_checkout.';

create or replace function public.checkout_booking_session_ids(p_booking_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(bp.stripe_checkout_session_id order by bp.id), array[]::text[])
    from public.booking_payments bp
   where bp.booking_id = p_booking_id
     and bp.stripe_checkout_session_id is not null
$$;

revoke all on function public.checkout_booking_session_ids(uuid) from public;
grant execute on function public.checkout_booking_session_ids(uuid) to vamos_system, vamos_checkout;

comment on function public.checkout_booking_session_ids(uuid) is
  'D-25: every non-null Stripe Checkout Session id of a booking, so a supersede or purge can verify each is expired first. EXECUTE: vamos_system, vamos_checkout.';

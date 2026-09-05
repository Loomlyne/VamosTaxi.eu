-- 20260827000005_confirmation_mail.sql
--
-- vamos_system has EXECUTE on settlement RPCs only — no table grants on
-- bookings, booking_legs, or booking_access_tokens (plan 07-07). The Queue
-- consumer must not SELECT/INSERT those tables as the role. Two definers:
-- assemble guest-readable booking fields for the confirmation email, and
-- insert a second purpose='manage' token (hashes are one-way; the intent
-- route cannot recover the raw value stored at checkout).

create function public.checkout_booking_for_email(p_booking_id pg_catalog.uuid)
returns table (
  reference pg_catalog.text,
  locale pg_catalog.text,
  contact_name pg_catalog.text,
  contact_email pg_catalog.text,
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
    b.contact_email,
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
  'Plan 07-07: guest-readable booking + first-leg fields for confirmation mail. vamos_system EXECUTE only.';

create function public.checkout_issue_manage_token(
  p_booking_id pg_catalog.uuid,
  p_token_hash pg_catalog.bytea,
  p_expires_at pg_catalog.timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.booking_access_tokens (
    booking_id,
    purpose,
    token_hash,
    expires_at
  ) values (
    p_booking_id,
    'manage',
    p_token_hash,
    p_expires_at
  );
end;
$$;

revoke all on function public.checkout_issue_manage_token(
  pg_catalog.uuid,
  pg_catalog.bytea,
  pg_catalog.timestamptz
) from public;

grant execute on function public.checkout_issue_manage_token(
  pg_catalog.uuid,
  pg_catalog.bytea,
  pg_catalog.timestamptz
) to vamos_system;

comment on function public.checkout_issue_manage_token(
  pg_catalog.uuid,
  pg_catalog.bytea,
  pg_catalog.timestamptz
) is
  'Plan 07-07: second purpose=manage token for the confirmation email. Hashes are one-way; the checkout RPC does not return the raw value.';

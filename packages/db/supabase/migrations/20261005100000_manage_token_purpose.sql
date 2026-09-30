-- 20261005100000_manage_token_purpose.sql
--
-- Phase 20 plan 20-07, finding F1. A pay-link token (booking_access_tokens.purpose = 'pay',
-- issued to staff pay links only) was accepted by every guest "manage" lookup, because those
-- functions checked only token_hash, revoked_at and expires_at. A pay-link holder could read the
-- traveller's data and the driver's phone, cancel the booking and post a review.
--
-- Every guest manage/confirmation/resume/review lookup now also requires purpose = 'manage'.
-- Bodies are the newest definitions, unchanged except for that one predicate. Signatures,
-- SECURITY DEFINER, search_path, volatility, grants and comments are unchanged.
-- Not touched on purpose: checkout_pay_link_by_hash / _lines / _state (they require 'pay'),
-- checkout_set_pay_link, checkout_create_booking, checkout_issue_manage_token,
-- ops_mark_booking_outcome (issues 'manage'), purge_unpaid_booking.
-- The pay token is NOT revoked at settle: checkout_pay_link_state answers 'expired' for a revoked
-- token, and the pay page reads that state after payment to show "paid".

begin;

create or replace function app.booking_has_manage_token(p_booking uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.booking_access_tokens t
     where t.booking_id  = p_booking
       and t.token_hash  = app.manage_token_hash()
       and t.purpose = 'manage'
       and t.revoked_at is null
       and t.expires_at  > now()
  )
$$;
revoke all on function app.booking_has_manage_token(uuid) from public;
grant execute on function app.booking_has_manage_token(uuid) to vamos_guest;

create or replace function public.manage_booking_cancel(
  p_token_hash bytea,
  p_leg_seq smallint default null
)
returns table (
  booking_id pg_catalog.uuid,
  refund_mode pg_catalog.text,
  refund_rappen public.rappen,
  basis_rappen public.rappen,
  hours_before pg_catalog.numeric,
  stripe_payment_intent_id pg_catalog.text,
  refund_percent pg_catalog.numeric
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v public.bookings%rowtype;
begin
  select b.*
    into v
    from public.bookings as b
    join public.booking_access_tokens as t on t.booking_id = b.id
   where t.token_hash = p_token_hash
     and t.purpose = 'manage'
     and t.revoked_at is null
     and t.expires_at > pg_catalog.now()
   for update of b;

  if v.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return query
    select *
      from app.apply_customer_cancel(
        v.id,
        p_leg_seq,
        'guest',
        'manage link',
        'manage_link'
      );

  update public.booking_access_tokens
     set last_used_at = pg_catalog.now(),
         use_count = use_count + 1
   where token_hash = p_token_hash;
end;
$$;

revoke all on function public.manage_booking_cancel(bytea, smallint) from public;
grant execute on function public.manage_booking_cancel(bytea, smallint) to vamos_guest;

comment on function public.manage_booking_cancel(bytea, smallint) is
  '09-02 D-02: guest cancel. After pickup allowed. Completed/no_show not_cancellable. Returns PI; never INSERT booking_refunds. auto_full refund_status stays none until Worker processing.';

create or replace function public.manage_booking_read(p_token_hash bytea)
returns table (
  booking_id pg_catalog.uuid,
  reference pg_catalog.text,
  status public.booking_status,
  locale pg_catalog.text,
  contact_name pg_catalog.text,
  contact_email pg_catalog.text,
  contact_phone pg_catalog.text,
  pickup_text pg_catalog.text,
  dropoff_text pg_catalog.text,
  scheduled_at pg_catalog.timestamptz,
  scheduled_local pg_catalog.text,
  original_scheduled_at pg_catalog.timestamptz,
  flight_no pg_catalog.text,
  pax pg_catalog.int2,
  bags pg_catalog.int2,
  refund_status pg_catalog.text,
  refund_owed_rappen public.rappen,
  refunded_rappen public.rappen,
  payout_country pg_catalog.text,
  available_on pg_catalog.timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v public.bookings%rowtype;
  v_leg public.booking_legs%rowtype;
  v_country pg_catalog.text;
  v_available pg_catalog.timestamptz;
begin
  select b.*
    into v
    from public.bookings as b
    join public.booking_access_tokens as t on t.booking_id = b.id
   where t.token_hash = p_token_hash
     and t.purpose = 'manage'
     and t.revoked_at is null
     and t.expires_at > pg_catalog.now();

  if v.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select l.*
    into v_leg
    from public.booking_legs as l
   where l.booking_id = v.id
   order by l.leg_seq
   limit 1;

  select r.payout_country, r.available_on
    into v_country, v_available
    from public.booking_refunds as r
   where r.booking_id = v.id
   order by r.decided_at desc
   limit 1;

  booking_id := v.id;
  reference := v.reference;
  status := v.status;
  locale := v.locale;
  contact_name := v.contact_name;
  contact_email := v.contact_email::pg_catalog.text;
  contact_phone := v.contact_phone;
  pickup_text := v_leg.pickup_text;
  dropoff_text := v_leg.dropoff_text;
  scheduled_at := v_leg.scheduled_at;
  scheduled_local := v_leg.scheduled_local;
  original_scheduled_at := v_leg.original_scheduled_at;
  flight_no := v_leg.flight_no;
  pax := v_leg.pax;
  bags := v_leg.bags;
  refund_status := v.refund_status;
  refund_owed_rappen := v.refund_owed_rappen;
  refunded_rappen := v.refunded_rappen;
  payout_country := v_country;
  available_on := v_available;
  return next;
end;
$$;

revoke all on function public.manage_booking_read(bytea) from public;
grant execute on function public.manage_booking_read(bytea) to vamos_guest;

comment on function public.manage_booking_read(bytea) is
  '09-02 D-06/D-07: guest ticket + refund line (payout_country, available_on). P0002 not_found. EXECUTE vamos_guest.';

create or replace function public.manage_booking_extras(p_token_hash pg_catalog.bytea)
returns pg_catalog.jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id pg_catalog.uuid;
begin
  select t.booking_id
    into v_id
    from public.booking_access_tokens as t
   where t.token_hash = p_token_hash
     and t.purpose = 'manage'
     and t.revoked_at is null
     and t.expires_at > pg_catalog.now()
   limit 1;
  if v_id is null then
    return null;
  end if;
  return pg_catalog.jsonb_build_object(
    'money', public.manage_money_for(v_id),
    'driver', public.manage_driver_for(v_id)
  );
end;
$$;

revoke all on function public.manage_booking_extras(pg_catalog.bytea) from public;
revoke all on function public.manage_booking_extras(pg_catalog.bytea) from anon;
revoke all on function public.manage_booking_extras(pg_catalog.bytea) from authenticated;
grant execute on function public.manage_booking_extras(pg_catalog.bytea) to vamos_guest;
comment on function public.manage_booking_extras(pg_catalog.bytea) is
  'Manage page: saved snapshot lines, payment method and the assigned driver (first name, phone, model, plate) for the booking a valid manage token points to. vamos_guest EXECUTE only.';

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
     and t.purpose = 'manage'
     and t.revoked_at is null
     and t.expires_at > pg_catalog.now()
   limit 1;

  if v_id is null then
    return null;
  end if;

  return public.confirmation_payload(v_id);
end;
$$;
revoke all on function public.guest_confirmation_read(pg_catalog.text, pg_catalog.bytea) from public;
revoke all on function public.guest_confirmation_read(pg_catalog.text, pg_catalog.bytea) from anon;
revoke all on function public.guest_confirmation_read(pg_catalog.text, pg_catalog.bytea) from authenticated;
grant execute on function public.guest_confirmation_read(pg_catalog.text, pg_catalog.bytea) to vamos_guest;

create or replace function public.checkout_resume_read(p_quote_id uuid, p_manage_hash bytea)
returns table (
  booking_id uuid,
  quote_id uuid,
  reference text,
  status public.booking_status,
  contact_name text,
  contact_email text,
  contact_phone text,
  company_name text,
  company_address text,
  company_vat text,
  note text,
  class_slug text,
  extra_codes text[],
  coupon_code text,
  charged_rappen integer,
  pay_link_sent boolean,
  latest_session_id text,
  checkout_trip_query text
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id,
         b.quote_id,
         b.reference,
         b.status,
         b.contact_name,
         b.contact_email::text,
         b.contact_phone,
         b.company_name,
         b.company_address,
         b.company_vat,
         b.note,
         vc.slug,
         coalesce(
           (select array_agg(distinct l.value ->> 'code')
              from jsonb_array_elements(ps.lines) as l(value)
             where l.value ->> 'kind' = 'surcharge' and l.value ->> 'code' is not null),
           array[]::text[]),
         ps.coupon_code,
         coalesce(b.price_total_rappen::integer, ps.total_rappen::integer, 0),
         b.pay_link_sent_at is not null,
         (select bp.stripe_checkout_session_id
            from public.booking_payments bp
           where bp.booking_id = b.id and bp.stripe_checkout_session_id is not null
           order by bp.id desc limit 1),
         b.checkout_trip_query
    from public.bookings b
    left join public.price_snapshots ps on ps.id = b.price_snapshot_id
    left join public.vehicle_classes vc on vc.id = ps.vehicle_class_id
   where b.quote_id = p_quote_id
     and p_manage_hash is not null
     and octet_length(p_manage_hash) = 32
     and exists (
       select 1 from public.booking_access_tokens t
        where t.booking_id = b.id
          and t.token_hash = p_manage_hash
          and t.purpose = 'manage'
          and t.revoked_at is null
          and t.expires_at > now())
$$;

revoke all on function public.checkout_resume_read(uuid, bytea) from public;
grant execute on function public.checkout_resume_read(uuid, bytea) to vamos_checkout;

comment on function public.checkout_resume_read(uuid, bytea) is
  'D-24/D-25: the checkout of quote p_quote_id, only when p_manage_hash matches an active manage token of that booking. Zero rows otherwise. EXECUTE: vamos_checkout.';

create or replace function public.submit_review(
  p_token_hash bytea,
  p_company smallint,
  p_chauffeur smallint,
  p_overall smallint,
  p_comment text,
  p_photo_path text
) returns table (
  review_id pg_catalog.uuid,
  booking_id pg_catalog.uuid
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v public.bookings%rowtype;
  v_review_id pg_catalog.uuid;
begin
  select b.*
    into v
    from public.bookings as b
    join public.booking_access_tokens as t on t.booking_id = b.id
   where t.token_hash = p_token_hash
     and t.purpose = 'manage'
     and t.revoked_at is null
   for update of b;

  if v.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  v_review_id := app.insert_customer_review(
    v.id,
    p_company,
    p_chauffeur,
    p_overall,
    p_comment,
    p_photo_path,
    'guest',
    'manage link'
  );

  update public.booking_access_tokens
     set last_used_at = pg_catalog.now(),
         use_count = use_count + 1
   where token_hash = p_token_hash
     and revoked_at is null;

  review_id := v_review_id;
  booking_id := v.id;
  return next;
end;
$$;

revoke all on function public.submit_review(bytea, smallint, smallint, smallint, text, text) from public;
revoke all on function public.submit_review(bytea, smallint, smallint, smallint, text, text) from anon, authenticated;
grant execute on function public.submit_review(bytea, smallint, smallint, smallint, text, text) to vamos_guest;

comment on function public.submit_review(bytea, smallint, smallint, smallint, text, text) is
  '09-03 D-18/D-19/D-21: guest review submit. Forever token (no expires_at). Unique booking_id. published false. EXECUTE vamos_guest.';

commit;

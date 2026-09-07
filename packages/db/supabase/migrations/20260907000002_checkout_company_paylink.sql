-- 20260907000002_checkout_company_paylink.sql
--
-- Phase 7 remainder D-34…D-38. Additive billing + pay-link. Charge gate unchanged.
-- Hosted apply is owner-gated. Do not invent CHF.

alter table public.bookings
  add column if not exists billing_kind text not null default 'individual',
  add column if not exists company_name text not null default '',
  add column if not exists company_address text not null default '',
  add column if not exists company_vat text not null default '',
  add column if not exists payer_email extensions.citext,
  add column if not exists pay_link_sent_at timestamptz;

alter table public.bookings
  drop constraint if exists bookings_billing_kind_check;

alter table public.bookings
  add constraint bookings_billing_kind_check
  check (billing_kind in ('individual', 'company'));

alter table public.booking_access_tokens
  drop constraint if exists booking_access_tokens_purpose_check;

alter table public.booking_access_tokens
  add constraint booking_access_tokens_purpose_check
  check (purpose in ('manage', 'pay'));

create or replace function public.checkout_set_pay_link(
  p_booking_id pg_catalog.uuid,
  p_billing_kind pg_catalog.text,
  p_company_name pg_catalog.text,
  p_company_address pg_catalog.text,
  p_company_vat pg_catalog.text,
  p_payer_email pg_catalog.text,
  p_token_hash pg_catalog.bytea,
  p_token_expires_at pg_catalog.timestamptz
)
returns pg_catalog.timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sent pg_catalog.timestamptz;
  v_status public.booking_status;
begin
  if p_billing_kind not in ('individual', 'company') then
    raise exception 'invalid_request' using errcode = 'check_violation';
  end if;
  if p_billing_kind = 'company'
     and (
       coalesce(btrim(p_company_name), '') = ''
       or coalesce(btrim(p_company_address), '') = ''
       or coalesce(btrim(p_company_vat), '') = ''
     ) then
    raise exception 'invalid_request' using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_payer_email), '') = '' then
    raise exception 'invalid_request' using errcode = 'check_violation';
  end if;

  select b.status, b.pay_link_sent_at
    into v_status, v_sent
    from public.bookings as b
   where b.id = p_booking_id
   for update;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v_status not in ('pending', 'quote') then
    raise exception 'quote_already_booked' using errcode = 'restrict_violation';
  end if;

  -- D-37: resend allowed; 24h clock does not restart.
  v_sent := coalesce(v_sent, now());

  update public.bookings
     set billing_kind = p_billing_kind,
         company_name = coalesce(p_company_name, ''),
         company_address = coalesce(p_company_address, ''),
         company_vat = coalesce(p_company_vat, ''),
         payer_email = p_payer_email::extensions.citext,
         pay_link_sent_at = v_sent,
         updated_at = now()
   where id = p_booking_id;

  insert into public.booking_access_tokens (
    booking_id, purpose, token_hash, expires_at
  ) values (
    p_booking_id, 'pay', p_token_hash, p_token_expires_at
  )
  on conflict (token_hash) do nothing;

  return v_sent;
end;
$$;

revoke all on function public.checkout_set_pay_link(
  pg_catalog.uuid,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.bytea,
  pg_catalog.timestamptz
) from public;

grant execute on function public.checkout_set_pay_link(
  pg_catalog.uuid,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.bytea,
  pg_catalog.timestamptz
) to vamos_checkout;

create or replace function public.checkout_attach_payment(
  p_quote_id pg_catalog.uuid,
  p_stripe_payment_intent_id pg_catalog.text,
  p_stripe_checkout_session_id pg_catalog.text,
  p_charged_rappen public.rappen
)
returns table (
  booking_id pg_catalog.uuid,
  reference pg_catalog.text,
  snapshot_id pg_catalog.int8,
  payment_id pg_catalog.int8
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_payment_id pg_catalog.int8;
begin
  select b.*
    into v_booking
    from public.bookings as b
   where b.quote_id = p_quote_id
   for update;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v_booking.status not in ('pending', 'quote') then
    raise exception 'quote_already_booked' using errcode = 'restrict_violation';
  end if;

  if exists (
    select 1
      from public.booking_payments as bp
     where bp.booking_id = v_booking.id
       and bp.status = 'succeeded'
  ) then
    raise exception 'quote_already_booked' using errcode = 'restrict_violation';
  end if;

  -- Charge gate (tg_payment_matches_snapshot) still runs on this INSERT. Unchanged.
  insert into public.booking_payments (
    booking_id,
    snapshot_id,
    stripe_payment_intent_id,
    stripe_checkout_session_id,
    charged_rappen,
    charged_currency,
    status
  ) values (
    v_booking.id,
    v_booking.price_snapshot_id,
    p_stripe_payment_intent_id,
    p_stripe_checkout_session_id,
    p_charged_rappen,
    'CHF',
    'requires_payment'
  )
  returning id into v_payment_id;

  return query
    select v_booking.id, v_booking.reference, v_booking.price_snapshot_id, v_payment_id;
end;
$$;

revoke all on function public.checkout_attach_payment(
  pg_catalog.uuid,
  pg_catalog.text,
  pg_catalog.text,
  public.rappen
) from public;

grant execute on function public.checkout_attach_payment(
  pg_catalog.uuid,
  pg_catalog.text,
  pg_catalog.text,
  public.rappen
) to vamos_checkout;

create or replace function public.checkout_pay_link_by_hash(
  p_token_hash pg_catalog.bytea
)
returns table (
  booking_id pg_catalog.uuid,
  quote_id pg_catalog.uuid,
  reference pg_catalog.text,
  status public.booking_status,
  locale pg_catalog.text,
  contact_email extensions.citext,
  payer_email extensions.citext,
  snapshot_expires_at pg_catalog.timestamptz,
  charged_rappen public.rappen,
  pickup_text pg_catalog.text,
  dropoff_text pg_catalog.text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
    select b.id,
           b.quote_id,
           b.reference,
           b.status,
           b.locale,
           b.contact_email,
           b.payer_email,
           s.expires_at,
           s.total_rappen,
           l.pickup_text,
           l.dropoff_text
      from public.booking_access_tokens as t
      join public.bookings as b on b.id = t.booking_id
      join public.price_snapshots as s on s.id = b.price_snapshot_id
      join public.booking_legs as l
        on l.booking_id = b.id and l.leg_seq = 1
     where t.token_hash = p_token_hash
       and t.purpose = 'pay'
       and t.revoked_at is null
       and t.expires_at > now()
       and s.expires_at > now()
       and b.status in ('pending', 'quote');

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.checkout_pay_link_by_hash(pg_catalog.bytea) from public;
grant execute on function public.checkout_pay_link_by_hash(pg_catalog.bytea) to vamos_checkout;

comment on column public.bookings.payer_email is
  'D-37 extra payer. Pay-link email. Not an invoice.';
comment on column public.bookings.pay_link_sent_at is
  'D-37 first send. Resend does not restart the 24h lock.';

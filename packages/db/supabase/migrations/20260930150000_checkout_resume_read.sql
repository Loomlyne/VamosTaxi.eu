-- 20260930150000_checkout_resume_read.sql
--
-- Plan 26.3-11 Task 2 (D-24, D-25, T-26.3-11-01, T-26.3-11-05): read back the checkout a
-- traveller left at Stripe so the one-page checkout can refill itself. The caller proves it
-- owns the booking with the SHA-256 of its vt_manage cookie; a wrong hash returns zero rows,
-- never an error and never another traveller's data.

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
          and t.revoked_at is null
          and t.expires_at > now())
$$;

revoke all on function public.checkout_resume_read(uuid, bytea) from public;
grant execute on function public.checkout_resume_read(uuid, bytea) to vamos_checkout;

comment on function public.checkout_resume_read(uuid, bytea) is
  'D-24/D-25: the checkout of quote p_quote_id, only when p_manage_hash matches an active manage token of that booking. Zero rows otherwise. EXECUTE: vamos_checkout.';

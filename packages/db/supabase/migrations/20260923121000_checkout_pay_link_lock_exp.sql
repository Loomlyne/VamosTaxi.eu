-- 20260923121000_checkout_pay_link_lock_exp.sql
--
-- checkout_pay_link_by_hash also returns token_expires_at (t.expires_at).
-- CREATE OR REPLACE cannot change the return type, so drop and recreate.
-- Same body, same WHERE, vamos_checkout EXECUTE only.
-- Owner applies this file in the SQL editor. Do not wipe yaumjzvylngfjhtuffqs.

drop function if exists public.checkout_pay_link_by_hash(pg_catalog.bytea);

create function public.checkout_pay_link_by_hash(
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
  dropoff_text pg_catalog.text,
  token_expires_at pg_catalog.timestamptz
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
           l.dropoff_text,
           t.expires_at
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
revoke all on function public.checkout_pay_link_by_hash(pg_catalog.bytea) from anon;
revoke all on function public.checkout_pay_link_by_hash(pg_catalog.bytea) from authenticated;

grant execute on function public.checkout_pay_link_by_hash(pg_catalog.bytea) to vamos_checkout;

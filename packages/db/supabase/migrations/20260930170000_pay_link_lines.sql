-- 20260930170000_pay_link_lines.sql
--
-- 26.3 gap G9: the pay-link page lists the ticked extras. checkout_pay_link_by_hash
-- returns no snapshot lines, so this adds a narrow read of the saved fare lines for the
-- booking a valid pay token points to. Same validity filter as checkout_pay_link_by_hash
-- (20260928140000). Only kind, code, the four locale names, the VAT rate and the amount
-- leave the function. Unknown, revoked or expired token: no rows. No CHF amount is
-- written here; amounts are whatever the booking's snapshot saved.

create or replace function public.checkout_pay_link_lines(
  p_token_hash pg_catalog.bytea
)
returns table (
  seq pg_catalog.int4,
  kind pg_catalog.text,
  code pg_catalog.text,
  names pg_catalog.jsonb,
  vat_rate_bps pg_catalog.int4,
  amount_rappen pg_catalog.int8
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.ord::pg_catalog.int4,
         e.line ->> 'kind',
         e.line ->> 'code',
         case
           when pg_catalog.jsonb_typeof(e.line -> 'params' -> 'names') = 'object'
           then pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
                  'en', e.line -> 'params' -> 'names' ->> 'en',
                  'de', e.line -> 'params' -> 'names' ->> 'de',
                  'fr', e.line -> 'params' -> 'names' ->> 'fr',
                  'ar', e.line -> 'params' -> 'names' ->> 'ar'))
           else null
         end,
         case
           when (e.line -> 'params' ->> 'vatRateBps') ~ '^[0-9]{1,5}$'
           then (e.line -> 'params' ->> 'vatRateBps')::pg_catalog.int4
           else null
         end,
         (e.line ->> 'amount_rappen')::pg_catalog.int8
    from public.booking_access_tokens as t
    join public.bookings as b on b.id = t.booking_id
    join public.price_snapshots as s on s.id = b.price_snapshot_id
    cross join lateral pg_catalog.jsonb_array_elements(s.lines)
      with ordinality as e(line, ord)
   where t.token_hash = p_token_hash
     and t.purpose = 'pay'
     and t.revoked_at is null
     and t.expires_at > now()
     and greatest(s.expires_at, coalesce(b.hold_until, s.expires_at)) > now()
     and b.status in ('pending', 'quote')
     and pg_catalog.jsonb_typeof(s.lines) = 'array'
   order by e.ord
$$;

revoke all on function public.checkout_pay_link_lines(pg_catalog.bytea) from public;
revoke all on function public.checkout_pay_link_lines(pg_catalog.bytea) from anon;
revoke all on function public.checkout_pay_link_lines(pg_catalog.bytea) from authenticated;

grant execute on function public.checkout_pay_link_lines(pg_catalog.bytea) to vamos_checkout;

-- 20261007230000_fare_line_reads.sql
--
-- 261003 fare lines. The airport pickup fee and the route extra are now saved as their own fare
-- lines (distance_fare, airport_fee, fixed_route), and a coupon is saved the way checkout writes
-- it: the fare and extra lines keep their pre-coupon figure in params.list_rappen, the coupon line
-- has amount_rappen null and params.discount_rappen. The pay-link page, Manage booking and
-- My bookings read the saved lines through two read-only functions that drop params except the
-- extra names and the VAT rate. So without this change they could not show the town names on the
-- route line, and a voucher booking showed a reduced Fare and "Voucher -CHF 0".
--
--   (1) checkout_pay_link_lines  also returns list_rappen, discount_rappen and, for the fixed_route
--       line only, origin and destination. The result is a table with new columns, so the function
--       is dropped and created again, in one transaction, with the same grants.
--   (2) manage_money_for         each line also carries the same four keys. It returns jsonb, so
--       create or replace only gains keys. Body of 20261007150000 (the newest definition).
--
-- Both stay read-only: no table is written, no column added. Signatures of every other function,
-- SECURITY DEFINER, search_path = '' and the grants are unchanged. Old saved prices have none of
-- the four params, so their new columns / keys are null and they read exactly as before. No CHF
-- amount here.

begin;

-- ---------------------------------------------------------------------------
-- (1) checkout_pay_link_lines -- body of 20261005130000, plus four columns.
-- ---------------------------------------------------------------------------
drop function public.checkout_pay_link_lines(pg_catalog.bytea);

create function public.checkout_pay_link_lines(
  p_token_hash pg_catalog.bytea
)
returns table (
  seq pg_catalog.int4,
  kind pg_catalog.text,
  code pg_catalog.text,
  names pg_catalog.jsonb,
  vat_rate_bps pg_catalog.int4,
  amount_rappen pg_catalog.int8,
  list_rappen pg_catalog.int8,
  discount_rappen pg_catalog.int8,
  origin pg_catalog.text,
  destination pg_catalog.text
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
         (e.line ->> 'amount_rappen')::pg_catalog.int8,
         case
           when (e.line -> 'params' ->> 'list_rappen') ~ '^[0-9]{1,10}$'
           then (e.line -> 'params' ->> 'list_rappen')::pg_catalog.int8
           else null
         end,
         case
           when (e.line -> 'params' ->> 'discount_rappen') ~ '^[0-9]{1,10}$'
           then (e.line -> 'params' ->> 'discount_rappen')::pg_catalog.int8
           else null
         end,
         case
           when (e.line ->> 'code') = 'fixed_route'
            and pg_catalog.jsonb_typeof(e.line -> 'params' -> 'origin') = 'string'
            and pg_catalog.jsonb_typeof(e.line -> 'params' -> 'destination') = 'string'
           then pg_catalog.left(e.line -> 'params' ->> 'origin', 120)
           else null
         end,
         case
           when (e.line ->> 'code') = 'fixed_route'
            and pg_catalog.jsonb_typeof(e.line -> 'params' -> 'origin') = 'string'
            and pg_catalog.jsonb_typeof(e.line -> 'params' -> 'destination') = 'string'
           then pg_catalog.left(e.line -> 'params' ->> 'destination', 120)
           else null
         end
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
     and b.erased_at is null
     and pg_catalog.jsonb_typeof(s.lines) = 'array'
   order by e.ord
$$;

revoke all on function public.checkout_pay_link_lines(pg_catalog.bytea) from public;
revoke all on function public.checkout_pay_link_lines(pg_catalog.bytea) from anon;
revoke all on function public.checkout_pay_link_lines(pg_catalog.bytea) from authenticated;

grant execute on function public.checkout_pay_link_lines(pg_catalog.bytea) to vamos_checkout;

-- ---------------------------------------------------------------------------
-- (2) manage_money_for -- body of 20261007150000, plus four keys on every line.
-- ---------------------------------------------------------------------------
create or replace function public.manage_money_for(p_booking_id pg_catalog.uuid)
returns pg_catalog.jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'charged_rappen', bp.charged_rappen,
    'payment_method_type', bp.payment_method_type,
    'presentment_amount_minor', bp.presentment_amount_minor,
    'presentment_currency', bp.presentment_currency,
    'vehicle_class_name', (
      select vc.name
        from public.booking_legs as l
        join public.vehicle_classes as vc on vc.id = l.vehicle_class_id
       where l.booking_id = b.id
       order by l.leg_seq
       limit 1
    ),
    'lines', coalesce((
      select pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object(
                 'kind', e.line ->> 'kind',
                 'code', e.line ->> 'code',
                 'names', case
                   when pg_catalog.jsonb_typeof(e.line -> 'params' -> 'names') = 'object'
                   then pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
                          'en', e.line -> 'params' -> 'names' ->> 'en',
                          'de', e.line -> 'params' -> 'names' ->> 'de',
                          'fr', e.line -> 'params' -> 'names' ->> 'fr',
                          'ar', e.line -> 'params' -> 'names' ->> 'ar'))
                   else null
                 end,
                 'vat_rate_bps', case
                   when (e.line -> 'params' ->> 'vatRateBps') ~ '^[0-9]{1,5}$'
                   then (e.line -> 'params' ->> 'vatRateBps')::pg_catalog.int4
                   else null
                 end,
                 'amount_rappen', (e.line ->> 'amount_rappen')::pg_catalog.int8,
                 'list_rappen', case
                   when (e.line -> 'params' ->> 'list_rappen') ~ '^[0-9]{1,10}$'
                   then (e.line -> 'params' ->> 'list_rappen')::pg_catalog.int8
                   else null
                 end,
                 'discount_rappen', case
                   when (e.line -> 'params' ->> 'discount_rappen') ~ '^[0-9]{1,10}$'
                   then (e.line -> 'params' ->> 'discount_rappen')::pg_catalog.int8
                   else null
                 end,
                 'origin', case
                   when (e.line ->> 'code') = 'fixed_route'
                    and pg_catalog.jsonb_typeof(e.line -> 'params' -> 'origin') = 'string'
                    and pg_catalog.jsonb_typeof(e.line -> 'params' -> 'destination') = 'string'
                   then pg_catalog.left(e.line -> 'params' ->> 'origin', 120)
                   else null
                 end,
                 'destination', case
                   when (e.line ->> 'code') = 'fixed_route'
                    and pg_catalog.jsonb_typeof(e.line -> 'params' -> 'origin') = 'string'
                    and pg_catalog.jsonb_typeof(e.line -> 'params' -> 'destination') = 'string'
                   then pg_catalog.left(e.line -> 'params' ->> 'destination', 120)
                   else null
                 end
               )
               order by e.ord)
        from public.price_snapshots as s
        cross join lateral pg_catalog.jsonb_array_elements(s.lines)
          with ordinality as e(line, ord)
       where s.id = b.price_snapshot_id
         and pg_catalog.jsonb_typeof(s.lines) = 'array'
    ), '[]'::pg_catalog.jsonb),
    -- 26.2 P6: the change that was applied last. 'class' when it changed the class only (P1's
    -- approved refund line names the class), 'trip' for any other change (D15), null when none.
    'last_change', (
      select case
               when pg_catalog.jsonb_typeof(r.payload) = 'object'
                and r.payload ? 'vehicle_class_slug'
                and not exists (
                  select 1 from pg_catalog.jsonb_object_keys(r.payload) as k(key)
                   where k.key <> 'vehicle_class_slug'
                ) then 'class'
               else 'trip'
             end
        from public.booking_edit_requests as r
       where r.booking_id = b.id
         and r.status = 'accepted'
       order by r.accepted_at desc nulls last, r.created_at desc
       limit 1
    )
  )
    from public.bookings as b
    join lateral (
      select p.*
        from public.booking_payments as p
       where p.booking_id = b.id
         and p.status = 'succeeded'
       order by p.captured_at desc nulls last, p.created_at desc
       limit 1
    ) as bp on true
   where b.id = p_booking_id
$$;

revoke all on function public.manage_money_for(pg_catalog.uuid) from public;
revoke all on function public.manage_money_for(pg_catalog.uuid) from anon;
revoke all on function public.manage_money_for(pg_catalog.uuid) from authenticated;

commit;

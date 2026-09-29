-- 20260930190000_manage_booking_money_driver.sql
--
-- Owner comment 3 (26.3): the manage-booking page shows what was paid, how, the extras and the
-- driver.
--   (a) booking_payments.payment_method_type: what Stripe recorded ('card', 'twint',
--       'apple_pay', 'google_pay', 'link', ...). Write-once, allowed on a succeeded row (like
--       stripe_fee_rappen) because the method is read from Stripe after settlement. Old rows stay
--       null; the page then says the booking was paid online.
--   (b) checkout_payment_method_record: the one write path (vamos_system).
--   (c) manage_booking_extras(token_hash) for the e-mail link and customer_booking_extras(reference)
--       for the signed-in owner. Each returns one jsonb: `money` (the saved snapshot lines, class
--       name, charged rappen, method, presentment) and `driver` (first name, phone, vehicle model,
--       plate and nothing else; null until a chauffeur is assigned). No table grant on chauffeurs or
--       vehicles changes. No CHF amount is written here.

alter table public.booking_payments
  add column if not exists payment_method_type pg_catalog.text;

alter table public.booking_payments
  add constraint booking_payments_method_type_format
  check (payment_method_type is null or payment_method_type ~ '^[a-z0-9_]{1,40}$');

comment on column public.booking_payments.payment_method_type is
  'Stripe payment method the customer used (card, twint, apple_pay, google_pay, link, ...). Written once after settlement by checkout_payment_method_record. Null on payments settled before 20260930190000.';

-- The terminal-row guard and the write-once rules, recreated from 20260930100000 with the new
-- column added next to stripe_fee_rappen.
create or replace function public.tg_payment_update_whitelist()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_new jsonb;
  v_old jsonb;
begin
  if old.status = 'succeeded' then
    if to_jsonb(new) - 'stripe_fee_rappen' - 'payment_method_type'
       is distinct from to_jsonb(old) - 'stripe_fee_rappen' - 'payment_method_type' then
      raise exception 'booking_payments: a succeeded row is terminal'
        using errcode = 'restrict_violation',
              hint = 'A corrected settlement is a new row plus a compensating booking_event.';
    end if;
    if old.stripe_fee_rappen is not null
       and new.stripe_fee_rappen is distinct from old.stripe_fee_rappen then
      raise exception 'booking_payments: stripe_fee_rappen is write-once'
        using errcode = 'restrict_violation',
              hint = 'A corrected settlement is a new row plus a compensating booking_event.';
    end if;
    if old.payment_method_type is not null
       and new.payment_method_type is distinct from old.payment_method_type then
      raise exception 'booking_payments: payment_method_type is write-once'
        using errcode = 'restrict_violation',
              hint = 'A corrected settlement is a new row plus a compensating booking_event.';
    end if;
    return new;
  end if;

  v_new := to_jsonb(new) - 'status' - 'captured_at' - 'charged_currency'
               - 'fx_rate' - 'fx_source' - 'fx_quoted_at' - 'presentment_amount_minor' - 'presentment_currency'
               - 'stripe_fee_rappen' - 'payment_method_type';
  v_old := to_jsonb(old) - 'status' - 'captured_at' - 'charged_currency'
               - 'fx_rate' - 'fx_source' - 'fx_quoted_at' - 'presentment_amount_minor' - 'presentment_currency'
               - 'stripe_fee_rappen' - 'payment_method_type';

  -- 26.1-02 D-05: the one legal correction to stripe_payment_intent_id on a
  -- non-succeeded row is the settlement write-back, cs_... -> pi_.... Any
  -- other change to this column (including pi_... -> anything) stays refused.
  if old.stripe_payment_intent_id like 'cs\_%' escape '\'
     and new.stripe_payment_intent_id like 'pi\_%' escape '\' then
    v_new := v_new - 'stripe_payment_intent_id';
    v_old := v_old - 'stripe_payment_intent_id';
  end if;

  if v_new is distinct from v_old then
    raise exception 'booking_payments: only status, captured_at, settlement columns, and stripe_fee_rappen may be updated'
      using errcode = 'restrict_violation',
            hint = 'A corrected settlement is a new row plus a compensating booking_event.';
  end if;

  if old.fx_rate is not null and new.fx_rate is distinct from old.fx_rate then
    raise exception 'booking_payments: fx_rate is write-once'
      using errcode = 'restrict_violation',
            hint = 'A corrected settlement is a new row plus a compensating booking_event.';
  end if;
  if old.fx_source is not null and new.fx_source is distinct from old.fx_source then
    raise exception 'booking_payments: fx_source is write-once'
      using errcode = 'restrict_violation',
            hint = 'A corrected settlement is a new row plus a compensating booking_event.';
  end if;
  if old.fx_quoted_at is not null and new.fx_quoted_at is distinct from old.fx_quoted_at then
    raise exception 'booking_payments: fx_quoted_at is write-once'
      using errcode = 'restrict_violation',
            hint = 'A corrected settlement is a new row plus a compensating booking_event.';
  end if;
  if old.presentment_amount_minor is not null
     and new.presentment_amount_minor is distinct from old.presentment_amount_minor then
    raise exception 'booking_payments: presentment_amount_minor is write-once'
      using errcode = 'restrict_violation',
            hint = 'A corrected settlement is a new row plus a compensating booking_event.';
  end if;
  if old.presentment_currency is not null
     and new.presentment_currency is distinct from old.presentment_currency then
    raise exception 'booking_payments: presentment_currency is write-once'
      using errcode = 'restrict_violation',
            hint = 'A corrected settlement is a new row plus a compensating booking_event.';
  end if;
  if old.stripe_fee_rappen is not null
     and new.stripe_fee_rappen is distinct from old.stripe_fee_rappen then
    raise exception 'booking_payments: stripe_fee_rappen is write-once'
      using errcode = 'restrict_violation',
            hint = 'A corrected settlement is a new row plus a compensating booking_event.';
  end if;
  if old.payment_method_type is not null
     and new.payment_method_type is distinct from old.payment_method_type then
    raise exception 'booking_payments: payment_method_type is write-once'
      using errcode = 'restrict_violation',
            hint = 'A corrected settlement is a new row plus a compensating booking_event.';
  end if;
  if new.charged_currency is distinct from old.charged_currency
     and old.charged_currency is distinct from 'CHF' then
    raise exception 'booking_payments: charged_currency may change only while it is CHF'
      using errcode = 'restrict_violation',
            hint = 'A corrected settlement is a new row plus a compensating booking_event.';
  end if;

  return new;
end $$;

-- ---------------------------------------------------------------------------
-- (b) the write path. Only a succeeded row, only while the column is empty.
-- ---------------------------------------------------------------------------
create or replace function public.checkout_payment_method_record(
  p_payment_intent_id pg_catalog.text,
  p_method pg_catalog.text
)
returns pg_catalog.bool
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows pg_catalog.int4;
begin
  if p_method is null or p_method !~ '^[a-z0-9_]{1,40}$' then
    return false;
  end if;
  update public.booking_payments
     set payment_method_type = p_method
   where stripe_payment_intent_id = p_payment_intent_id
     and status = 'succeeded'
     and payment_method_type is null;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function public.checkout_payment_method_record(pg_catalog.text, pg_catalog.text) from public;
revoke all on function public.checkout_payment_method_record(pg_catalog.text, pg_catalog.text) from anon;
revoke all on function public.checkout_payment_method_record(pg_catalog.text, pg_catalog.text) from authenticated;
grant execute on function public.checkout_payment_method_record(pg_catalog.text, pg_catalog.text) to vamos_system;

-- ---------------------------------------------------------------------------
-- (c) helpers keyed by booking id. Reached only through the two wrappers below.
-- ---------------------------------------------------------------------------
create or replace function public.manage_driver_for(p_booking_id pg_catalog.uuid)
returns pg_catalog.jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
           'first_name', pg_catalog.split_part(pg_catalog.btrim(ch.full_name), ' ', 1),
           'phone', ch.phone,
           'vehicle_model', v.model,
           'plate', v.plate
         )
    from public.booking_legs as l
    join public.chauffeurs as ch on ch.id = l.assigned_chauffeur_id
    left join public.vehicles as v on v.id = coalesce(l.assigned_vehicle_id, ch.default_vehicle_id)
   where l.booking_id = p_booking_id
   order by l.leg_seq
   limit 1
$$;

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
                 'amount_rappen', (e.line ->> 'amount_rappen')::pg_catalog.int8
               )
               order by e.ord)
        from public.price_snapshots as s
        cross join lateral pg_catalog.jsonb_array_elements(s.lines)
          with ordinality as e(line, ord)
       where s.id = b.price_snapshot_id
         and pg_catalog.jsonb_typeof(s.lines) = 'array'
    ), '[]'::pg_catalog.jsonb)
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

revoke all on function public.manage_driver_for(pg_catalog.uuid) from public;
revoke all on function public.manage_driver_for(pg_catalog.uuid) from anon;
revoke all on function public.manage_driver_for(pg_catalog.uuid) from authenticated;
revoke all on function public.manage_money_for(pg_catalog.uuid) from public;
revoke all on function public.manage_money_for(pg_catalog.uuid) from anon;
revoke all on function public.manage_money_for(pg_catalog.uuid) from authenticated;

-- ---------------------------------------------------------------------------
-- Wrappers. Same validity filter as manage_booking_read (20260911234758).
-- ---------------------------------------------------------------------------
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

-- The signed-in owner: the JWT e-mail owns the booking (the rule the account list uses).
create or replace function public.customer_booking_extras(p_reference pg_catalog.text)
returns pg_catalog.jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id pg_catalog.uuid;
  v_email pg_catalog.text := pg_catalog.lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if v_email = '' then
    return null;
  end if;
  select b.id
    into v_id
    from public.bookings as b
   where b.reference = p_reference
     and pg_catalog.lower(b.contact_email::pg_catalog.text) = v_email
     and b.status::pg_catalog.text not in ('quote', 'pending')
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

revoke all on function public.customer_booking_extras(pg_catalog.text) from public;
revoke all on function public.customer_booking_extras(pg_catalog.text) from anon;
revoke all on function public.customer_booking_extras(pg_catalog.text) from vamos_guest;
grant execute on function public.customer_booking_extras(pg_catalog.text) to authenticated;

comment on function public.manage_booking_extras(pg_catalog.bytea) is
  'Manage page: saved snapshot lines, payment method and the assigned driver (first name, phone, model, plate) for the booking a valid manage token points to. vamos_guest EXECUTE only.';
comment on function public.customer_booking_extras(pg_catalog.text) is
  'Same payload for a signed-in owner (JWT e-mail owns the booking). authenticated EXECUTE only.';

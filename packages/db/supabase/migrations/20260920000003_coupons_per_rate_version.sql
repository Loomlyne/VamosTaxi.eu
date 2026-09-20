-- Coupons are per rate book. unique(code) blocked clone onto the next draft
-- (ON CONFLICT DO NOTHING dropped every code that still existed on a retired
-- version), so /pricing Coupons stayed empty and checkout could not apply a
-- dashboard code after Publish.

alter table public.coupons
  drop constraint if exists coupons_code_key;

alter table public.coupons
  add constraint coupons_rate_version_id_code_key
  unique (rate_version_id, code);

create or replace function public.evaluate_coupon(
  p_code text,
  p_customer_id uuid default null,
  p_contact_email extensions.citext default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.coupons%rowtype;
  v_global_count integer;
  v_user_count integer;
  v_live_id bigint;
begin
  select rv.id into v_live_id
    from public.rate_versions rv
   where rv.status = 'live'
   order by rv.id desc
   limit 1;

  select * into c
    from public.coupons
   where code = upper(p_code)
     and (
       rate_version_id is null
       or rate_version_id = v_live_id
     )
   order by (rate_version_id is null), id desc
   limit 1;

  -- 1. no row for upper(p_code) on the live book
  if not found then
    return jsonb_build_object(
      'ok', false,
      'i18n_key', 'quote.coupon.error.not_found',
      'coupon_id', null,
      'kind', null,
      'percent', null,
      'amount_rappen', null,
      'code', null
    );
  end if;

  -- 2. not active
  if not c.active then
    return jsonb_build_object(
      'ok', false,
      'i18n_key', 'quote.coupon.error.inactive',
      'coupon_id', null,
      'kind', null,
      'percent', null,
      'amount_rappen', null,
      'code', null
    );
  end if;

  -- 3. now() < valid_from
  if c.valid_from is not null and now() < c.valid_from then
    return jsonb_build_object(
      'ok', false,
      'i18n_key', 'quote.coupon.error.not_yet_valid',
      'coupon_id', null,
      'kind', null,
      'percent', null,
      'amount_rappen', null,
      'code', null
    );
  end if;

  -- 4. now() >= valid_until
  if c.valid_until is not null and now() >= c.valid_until then
    return jsonb_build_object(
      'ok', false,
      'i18n_key', 'quote.coupon.error.expired',
      'coupon_id', null,
      'kind', null,
      'percent', null,
      'amount_rappen', null,
      'code', null
    );
  end if;

  -- 5. percent and amount_rappen both null
  if c.percent is null and c.amount_rappen is null then
    return jsonb_build_object(
      'ok', false,
      'i18n_key', 'quote.coupon.error.unpriced',
      'coupon_id', null,
      'kind', null,
      'percent', null,
      'amount_rappen', null,
      'code', null
    );
  end if;

  -- 6. count(unreleased) >= global_limit
  if c.global_limit is not null then
    select count(*) into v_global_count
      from public.coupon_redemptions as r
     where r.coupon_id = c.id
       and r.released_at is null;
    if v_global_count >= c.global_limit then
      return jsonb_build_object(
        'ok', false,
        'i18n_key', 'quote.coupon.error.usage_cap',
        'coupon_id', null,
        'kind', null,
        'percent', null,
        'amount_rappen', null,
        'code', null
      );
    end if;
  end if;

  -- 7. per-user cap, skipped when the caller has no identity
  if c.per_user_limit is not null and (p_customer_id is not null or p_contact_email is not null) then
    if p_customer_id is not null then
      select count(*) into v_user_count
        from public.coupon_redemptions as r
       where r.coupon_id = c.id
         and r.customer_id = p_customer_id
         and r.released_at is null;
    else
      select count(*) into v_user_count
        from public.coupon_redemptions as r
        join public.bookings as b on b.id = r.booking_id
       where r.coupon_id = c.id
         and r.released_at is null
         and b.contact_email = p_contact_email;
    end if;
    if v_user_count >= c.per_user_limit then
      return jsonb_build_object(
        'ok', false,
        'i18n_key', 'quote.coupon.error.per_user_cap',
        'coupon_id', null,
        'kind', null,
        'percent', null,
        'amount_rappen', null,
        'code', null
      );
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'i18n_key', null,
    'coupon_id', c.id,
    'kind', c.kind,
    'percent', c.percent::text,
    'amount_rappen', c.amount_rappen,
    'code', c.code
  );
end;
$$;

comment on function public.evaluate_coupon(text, uuid, extensions.citext) is
  'Live-book coupon lookup (or legacy null rate_version_id). unique(rate_version_id, code). Unreleased redemptions only.';

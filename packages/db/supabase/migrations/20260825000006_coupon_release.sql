-- 20260825000006_coupon_release.sql
--
-- D-30 / D-31 / D-55: seven named coupon refusals, a release column so a consumed use can
-- stop counting without disappearing, and no abandon sweep.
--
-- Correction, plainly: 04-RESEARCH.md §6 names a booking_payments_reserve_coupon trigger,
-- chosen for a name that sorts AFTER booking_payments_match_snapshot. Phase 2 landed the
-- equivalent gate as coupon_redemptions_caps on coupon_redemptions instead — a different,
-- and better, table for it, because the redemption row IS the consumption record. No second
-- trigger is added. The ordering guarantee research wanted from the trigger name becomes an
-- application-ordering requirement on Phase 7's transaction (insert booking_payments before
-- coupon_redemptions, so an unchargeable or expired snapshot fails first with zero coupon
-- side effect); this plan asserts it as a pgTAP case rather than leaving it as prose.
--
-- Negative space: this file builds no abandon sweep. checkout_abandon_release_minutes does
-- not exist (U42/D-55), and inventing a wait would be worse than not sweeping — released_at
-- ships so Phase 7 and Phase 9 have somewhere to write, and the sweep waits for the number.
--
-- D-46: no CHF amount enters this file.

-- ---------------------------------------------------------------------------
-- coupon_redemptions.released_at / released_reason (D-31)
-- ---------------------------------------------------------------------------
-- An abandon or a Phase 9 full refund SETs them, never DELETEs, so the unique
-- (coupon_id, booking_id) and the row that says this booking consumed the code both
-- survive. A PARTIAL refund does not release.

alter table public.coupon_redemptions
  add column released_at timestamptz,
  add column released_reason text;

alter table public.coupon_redemptions
  add constraint coupon_redemptions_released_pair
  check ((released_at is null) = (released_reason is null));

comment on column public.coupon_redemptions.released_at is
  'D-31: SET on abandon or a Phase 9 full refund, never DELETE. Unreleased rows (this column null) are the only ones that count against global_limit / per_user_limit. A partial refund does not release.';

comment on column public.coupon_redemptions.released_reason is
  'Paired with released_at (both null or both set). Names why the use was given back; the evidence row stays.';

-- ---------------------------------------------------------------------------
-- tg_coupon_redemption_caps — landed body plus released_at is null on both counts
-- ---------------------------------------------------------------------------
-- FOR UPDATE, the active check, the window check and the two restrict_violation raises
-- stay exactly as they landed in ...015. create or replace restores the default PUBLIC
-- EXECUTE that ...015 revoked; the revoke is re-issued below.

create or replace function public.tg_coupon_redemption_caps() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c public.coupons%rowtype; v_global_count integer; v_user_count integer;
begin
  select * into c from public.coupons where id = new.coupon_id for update;

  if c.id is null or not c.active then
    raise exception 'coupon unavailable' using errcode = 'restrict_violation';
  end if;

  if (c.valid_from is not null and now() < c.valid_from)
     or (c.valid_until is not null and now() >= c.valid_until) then
    raise exception 'coupon outside its window' using errcode = 'restrict_violation';
  end if;

  if c.global_limit is not null then
    select count(*) into v_global_count
      from public.coupon_redemptions where coupon_id = new.coupon_id and released_at is null;
    if v_global_count >= c.global_limit then
      raise exception 'coupon global limit reached' using errcode = 'restrict_violation';
    end if;
  end if;

  if c.per_user_limit is not null and new.customer_id is not null then
    select count(*) into v_user_count
      from public.coupon_redemptions
     where coupon_id = new.coupon_id and customer_id = new.customer_id and released_at is null;
    if v_user_count >= c.per_user_limit then
      raise exception 'coupon per-user limit reached' using errcode = 'restrict_violation';
    end if;
  end if;

  return new;
end $$;

revoke all on function public.tg_coupon_redemption_caps() from public;

-- ---------------------------------------------------------------------------
-- evaluate_coupon — seven ordered refusals, i18n keys, no SQLSTATE (D-30)
-- ---------------------------------------------------------------------------
-- Definer because rule 7 joins public.bookings for contact_email, a table the quote
-- identity must never be granted (quote_identity.test.sql asserts anon selecting
-- public.bookings is 42501 and that assertion must keep passing after this plan).
--
-- Lookup is upper(p_code). The returned code is coupons.code AS STORED, so the caller
-- keeps the customer's typed casing separately on price_snapshots.coupon_code (Phase 2's
-- column comment): overwriting the typed value loses the dispute packet, while comparing
-- on upper is what makes the lookup work.
--
-- Rule 5 refuses an unpriced coupon rather than treating it as zero — the same discipline
-- the engine applies to a NULL rate, and the reason the key is .unpriced and not .not_found.
-- Rules 6 and 7 count only released_at is null rows. Rule 7 matches on p_customer_id when
-- supplied, otherwise on p_contact_email joined through public.bookings.contact_email; when
-- neither is supplied the per-user rule is SKIPPED, not failed — an anonymous reprice cannot
-- know who the customer is and must not refuse on that basis (the real cap is enforced at
-- redemption by tg_coupon_redemption_caps).
--
-- percent is returned as text (numeric(5,2)::text) so the exact decimal reaches
-- percentToHundredths intact.

create function public.evaluate_coupon(
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
begin
  select * into c from public.coupons where code = upper(p_code);

  -- 1. no row for upper(p_code)
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

revoke all on function public.evaluate_coupon(text, uuid, extensions.citext) from public;
grant execute on function public.evaluate_coupon(text, uuid, extensions.citext) to anon, authenticated;

comment on function public.evaluate_coupon(text, uuid, extensions.citext) is
  'D-30: seven ordered coupon refusals as i18n keys. Lookup upper(p_code); returned code is stored casing. Counts only unreleased redemptions (D-31).';

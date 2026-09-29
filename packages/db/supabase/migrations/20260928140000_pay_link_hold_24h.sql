-- 20260928140000_pay_link_hold_24h.sql
--
-- Plan 26.1-15 (D-20, D-20a, D-21, D-22). A sent pay link holds the booking
-- and its price for 24 hours from the moment it is sent. Until now the pay
-- token expired at the quote lock's exp and the cron cancelled on
-- price_snapshots.quote_lock_expires_at, so a link sent 20 hours after the
-- quote lived 4 hours. One clock now: bookings.hold_until, set only by
-- checkout_set_pay_link and read by
--   * checkout_pay_link_by_hash (filter + snapshot_expires_at),
--   * tg_payment_matches_snapshot (the charge gate's two expiry checks),
--   * checkout_expire_unpaid (the hourly cron),
--   * checkout_booking_hold_until (the traveller's own checkout, 26.1-29).
-- Every read uses greatest(snapshot clock, coalesce(hold_until, snapshot
-- clock)), so a booking with no pay link (hold_until null) behaves exactly
-- as before.
--
-- New: checkout_pay_link_state(token_hash, session_id) tells the recipient
-- page why a link is no longer payable -- paid (D-21), refunded_duplicate
-- (D-22) or expired. Unknown, revoked, expired or cancelled links answer
-- expired with no reference (no oracle).
--
-- Owner applies in the SQL editor. Backward compatible with the live
-- Worker: hold_until is nullable; checkout_set_pay_link,
-- checkout_pay_link_by_hash, tg_payment_matches_snapshot and
-- checkout_expire_unpaid keep their signatures and return types (26.1-06's
-- three-column cron return stays). Same fallback rule as 26.1-02: the file
-- is one transaction; if a partial apply is suspected, rerun the whole file
-- -- every statement is `add column if not exists` or `create or replace`.
--
-- No CHF amount enters this file (D-13).

begin;

-- ---------------------------------------------------------------------------
-- (1) bookings.hold_until
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists hold_until timestamptz;

comment on column public.bookings.hold_until is
  'Plan 26.1-15 (D-20/D-20a): end of the 24-hour pay-link hold, from the first send. Set only by checkout_set_pay_link; null = no pay link sent. The link lookup, charge gate and unpaid cron honour greatest(snapshot clock, hold_until).';

-- ---------------------------------------------------------------------------
-- (2) checkout_set_pay_link -- same signature. The hold is the token expiry
-- the sender gives (Postgres now + 24 h), capped at first send + 24 h so a
-- resend never restarts the clock (D-37) and no caller can hold longer
-- (T-26.1-47). The token is stored on the same clock.
-- ---------------------------------------------------------------------------
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
  v_hold pg_catalog.timestamptz;
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

  -- D-20/D-20a: one 24-hour hold from the first send.
  v_hold := least(p_token_expires_at, v_sent + interval '24 hours');

  update public.bookings
     set billing_kind = p_billing_kind,
         company_name = coalesce(p_company_name, ''),
         company_address = coalesce(p_company_address, ''),
         company_vat = coalesce(p_company_vat, ''),
         payer_email = p_payer_email::extensions.citext,
         pay_link_sent_at = v_sent,
         hold_until = v_hold,
         updated_at = now()
   where id = p_booking_id;

  insert into public.booking_access_tokens (
    booking_id, purpose, token_hash, expires_at
  ) values (
    p_booking_id, 'pay', p_token_hash, v_hold
  )
  on conflict (token_hash) do nothing;

  return v_sent;
end;
$$;

revoke all on function public.checkout_set_pay_link(
  pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.text,
  pg_catalog.text, pg_catalog.text, pg_catalog.bytea, pg_catalog.timestamptz
) from public, anon, authenticated;

grant execute on function public.checkout_set_pay_link(
  pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.text,
  pg_catalog.text, pg_catalog.text, pg_catalog.bytea, pg_catalog.timestamptz
) to vamos_checkout;

-- ---------------------------------------------------------------------------
-- (3) checkout_pay_link_by_hash -- same signature and return type
-- (20260923121000), so create or replace keeps its grants. Only the snapshot
-- expiry expression changes: the pay-link hold carries the booking past a
-- quote lock that ran out after the link was sent.
-- ---------------------------------------------------------------------------
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
           greatest(s.expires_at, coalesce(b.hold_until, s.expires_at)),
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
       and greatest(s.expires_at, coalesce(b.hold_until, s.expires_at)) > now()
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

-- ---------------------------------------------------------------------------
-- (4) tg_payment_matches_snapshot -- same body as 20260825000004 except the
-- two expiry checks honour the payment's booking hold (T-26.1-49). create or
-- replace keeps booking_payments_match_snapshot bound; the revoke is
-- re-issued because create or replace restores PUBLIC EXECUTE by default.
-- ---------------------------------------------------------------------------
create or replace function public.tg_payment_matches_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.price_snapshots%rowtype;
  v_status public.rate_version_status;
  v_hold timestamptz;
begin
  select * into s from public.price_snapshots where id = new.snapshot_id;

  if not found then
    raise exception 'snapshot % does not exist', new.snapshot_id
      using errcode = 'restrict_violation';
  end if;

  if not s.is_chargeable then
    raise exception 'snapshot % is not chargeable (total=%, rate_version_is_live=%)',
      s.id, s.total_rappen, s.rate_version_is_live
      using errcode = 'restrict_violation',
            hint = 'QUOTE-10: no rate_version is live, or this class has no priced matrix row.';
  end if;
  -- Re-read the version at charge time, not only the flag copied at quote time. A quote priced
  -- under a version that has since been RETIRED is still honoured (the customer was shown that
  -- price minutes ago and the version's rows are frozen); a version that never left DRAFT can
  -- never be charged against, whatever any copied flag says.
  select status into v_status from public.rate_versions where id = s.rate_version_id;
  if v_status = 'draft' then
    raise exception 'snapshot % cites rate_version % which is still draft', s.id, s.rate_version_id
      using errcode = 'restrict_violation';
  end if;
  -- 26.1-15 (D-20): a sent pay link holds the booking and its price until hold_until.
  -- Null (no pay link) leaves both clocks exactly as before.
  select b.hold_until into v_hold from public.bookings b where b.id = new.booking_id;
  -- QUOTE-04: an expired quote is refused when the customer commits to pay, by the server, not
  -- merely hidden in the UI. Payment window (expires_at) first.
  if greatest(s.expires_at, coalesce(v_hold, s.expires_at)) <= now() then
    raise exception 'quote % expired at %', s.id, s.expires_at using errcode = 'restrict_violation';
  end if;
  -- D-25: second clock. A handler that forgets the if still dies; a direct
  -- INSERT INTO booking_payments against a snapshot minted from an expired token still dies --
  -- even when the payment window (expires_at) is still open.
  if greatest(s.quote_lock_expires_at, coalesce(v_hold, s.quote_lock_expires_at)) <= now() then
    raise exception
      'quote lock on snapshot % expired at % (payment window open until %)',
      s.id, s.quote_lock_expires_at, s.expires_at
      using errcode = 'restrict_violation';
  end if;
  if new.charged_rappen is distinct from s.total_rappen then
    raise exception 'charge % does not match snapshot % total %',
      new.charged_rappen, s.id, s.total_rappen using errcode = 'restrict_violation';
  end if;
  if s.booking_id is null or new.booking_id is distinct from s.booking_id then
    raise exception 'snapshot % belongs to booking %, not %', s.id, s.booking_id, new.booking_id
      using errcode = 'restrict_violation';
  end if;
  -- F-06 / T-02-46: a payment must cite exactly the snapshot bookings.price_snapshot_id names,
  -- not merely a sibling row that shares its booking_id (see 20260825000004 for the full note).
  if new.snapshot_id is distinct from (select b.price_snapshot_id from public.bookings b where b.id = new.booking_id) then
    raise exception 'payment cites snapshot %, but booking % is bound to %',
      new.snapshot_id, new.booking_id, (select b.price_snapshot_id from public.bookings b where b.id = new.booking_id)
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

revoke all on function public.tg_payment_matches_snapshot() from public;

-- ---------------------------------------------------------------------------
-- (5) checkout_expire_unpaid -- 26.1-06 body and three-column return, same
-- grant. Only the cut-off honours the pay-link hold: a booking whose link
-- is still inside its 24 hours is not cancelled; unpaid 24 hours after the
-- send it is, and its open sessions come back to be expired (D-20, D-04).
-- ---------------------------------------------------------------------------
create or replace function public.checkout_expire_unpaid()
returns table (booking_id uuid, reference text, stripe_checkout_session_ids text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.bookings%rowtype;
  v_cut integer;
  v_sessions text[];
begin
  for v in
    select b.*
      from public.bookings as b
      inner join public.price_snapshots as ps on ps.id = b.price_snapshot_id
     where b.status = 'pending'
       and greatest(ps.quote_lock_expires_at, coalesce(b.hold_until, ps.quote_lock_expires_at)) <= now()
     order by greatest(ps.quote_lock_expires_at, coalesce(b.hold_until, ps.quote_lock_expires_at)), b.created_at
     for update of b skip locked
  loop
    update public.booking_legs bl
       set status = 'cancelled'
     where bl.booking_id = v.id
       and bl.status not in ('completed', 'no_show', 'cancelled');
    get diagnostics v_cut = row_count;
    if v_cut = 0 then
      continue;
    end if;

    update public.bookings
       set status = 'cancelled'
     where id = v.id;

    select coalesce(array_agg(bp.stripe_checkout_session_id), array[]::text[])
      into v_sessions
      from public.booking_payments bp
     where bp.booking_id = v.id
       and bp.status = 'requires_payment'
       and bp.stripe_checkout_session_id is not null;

    perform app.release_unpaid_coupon(v.id, 'unpaid_cancelled');

    insert into public.booking_events (
      booking_id, booking_leg_id, kind, actor_kind, actor_label,
      from_status, to_status, payload
    ) values (
      v.id, null, 'booking.status_changed', 'cron', 'unpaid lock',
      v.status, 'cancelled',
      jsonb_build_object('via', 'expire_unpaid')
    );

    booking_id := v.id;
    reference := v.reference;
    stripe_checkout_session_ids := v_sessions;
    return next;
  end loop;
end
$$;

revoke all on function public.checkout_expire_unpaid() from public;
grant execute on function public.checkout_expire_unpaid() to vamos_system;

comment on function public.checkout_expire_unpaid() is
  'Hourly cron: cancel every pending booking whose quote lock -- or, when a pay link was sent, its 24-hour hold (bookings.hold_until, 26.1-15 D-20) -- is past. Returns each cancelled booking''s open Stripe Checkout Session ids to expire and releases its unreleased coupon redemption (26.1-06 D-04/D-11a). EXECUTE: vamos_system only.';

-- ---------------------------------------------------------------------------
-- (6) checkout_pay_link_state -- why a pay link is or is not payable.
--   refunded_duplicate: p_session_id is a 'duplicate' payment of the token's
--     own booking with a duplicate_charge refund recorded (D-22). A session
--     of another booking never matches.
--   paid: the token's booking is paid or confirmed (D-21).
--   payable: pending/quote, token live, snapshot clock or hold live.
--   expired: everything else -- unknown, revoked, expired or cancelled --
--     with no reference, so an unknown token learns nothing (T-26.1-48).
-- ---------------------------------------------------------------------------
create or replace function public.checkout_pay_link_state(
  p_token_hash pg_catalog.bytea,
  p_session_id pg_catalog.text default null
)
returns table (state pg_catalog.text, reference pg_catalog.text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_booking_id pg_catalog.uuid;
  v_reference pg_catalog.text;
  v_status public.booking_status;
  v_token_expires pg_catalog.timestamptz;
  v_revoked pg_catalog.timestamptz;
  v_hold pg_catalog.timestamptz;
  v_snapshot_expires pg_catalog.timestamptz;
begin
  select b.id, b.reference, b.status, t.expires_at, t.revoked_at, b.hold_until, s.expires_at
    into v_booking_id, v_reference, v_status, v_token_expires, v_revoked, v_hold, v_snapshot_expires
    from public.booking_access_tokens as t
    join public.bookings as b on b.id = t.booking_id
    left join public.price_snapshots as s on s.id = b.price_snapshot_id
   where t.token_hash = p_token_hash
     and t.purpose = 'pay';

  if not found or v_revoked is not null then
    state := 'expired';
    reference := null;
    return next;
    return;
  end if;

  if p_session_id is not null and exists (
    select 1
      from public.booking_payments as bp
      join public.booking_refunds as r
        on r.payment_id = bp.id and r.reason = 'duplicate_charge'
     where bp.booking_id = v_booking_id
       and bp.stripe_checkout_session_id = p_session_id
       and bp.status = 'duplicate'
  ) then
    state := 'refunded_duplicate';
    reference := v_reference;
    return next;
    return;
  end if;

  if v_status in ('paid', 'confirmed', 'assigned', 'completed', 'partially_completed') then
    state := 'paid';
    reference := v_reference;
    return next;
    return;
  end if;

  if v_status in ('pending', 'quote')
     and v_token_expires > now()
     and greatest(v_snapshot_expires, coalesce(v_hold, v_snapshot_expires)) > now() then
    state := 'payable';
    reference := v_reference;
    return next;
    return;
  end if;

  state := 'expired';
  reference := null;
  return next;
end;
$$;

revoke all on function public.checkout_pay_link_state(pg_catalog.bytea, pg_catalog.text)
  from public, anon, authenticated;
grant execute on function public.checkout_pay_link_state(pg_catalog.bytea, pg_catalog.text)
  to vamos_checkout;

comment on function public.checkout_pay_link_state(pg_catalog.bytea, pg_catalog.text) is
  'Plan 26.1-15 (D-21/D-22): payable | paid | refunded_duplicate | expired for a pay token, with the booking reference except for expired. EXECUTE: vamos_checkout only.';

-- ---------------------------------------------------------------------------
-- (7) checkout_booking_hold_until -- the traveller's own checkout reads the
-- pay-link hold for its quote (consumer: 26.1-29). Null = no link sent.
-- ---------------------------------------------------------------------------
create or replace function public.checkout_booking_hold_until(
  p_quote_id pg_catalog.uuid
)
returns pg_catalog.timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select b.hold_until
    from public.bookings as b
   where b.quote_id = p_quote_id
   limit 1
$$;

revoke all on function public.checkout_booking_hold_until(pg_catalog.uuid)
  from public, anon, authenticated;
grant execute on function public.checkout_booking_hold_until(pg_catalog.uuid)
  to vamos_checkout;

comment on function public.checkout_booking_hold_until(pg_catalog.uuid) is
  'Plan 26.1-15 (D-20): bookings.hold_until for this quote, null when no pay link was sent or no booking exists. EXECUTE: vamos_checkout only.';

commit;

-- 20261007310000_settle_processed_checkout_grants.sql
--
-- 261005 money hardening (.planning/audits/2026-10-05-repo-investigation.md, U15, U26 and S6 step 1).
--
-- (1) U15. Every paid checkout is settled twice: by the Stripe webhook (queue) and by the return route
--     (event id `return_<cs_id>`), whichever comes first. The second call reaches the already-settled
--     branch of checkout_payment_settle, which returned without stamping its own stripe_events row, so
--     that row stayed unprocessed forever (9 live pairs on 2026-10-05: 7 webhook rows, 2 return rows).
--     The branch now sets processed_at on p_event_id, like every other branch. checkout_extra_payment_settle
--     already does this (20261007280000) and is not changed.
--     Body: 20261005130000_pay_link_erased_booking.sql, byte for byte (md5 of prosrc on live and in that
--     file: f1d7d186d3daa26167fcba8c48ace644, read 2026-10-05), plus the three statement lines marked
--     20261007310000. Same signature, SECURITY DEFINER, search_path, owner and comment. No lock or
--     statement timeout is added: the function never had one, and a timeout here would change how the
--     main settle path fails. Lock order is unchanged (payment row, then booking row, then the event row,
--     as in every other branch). Revoke and grant are restated as 20261005130000 has them.
--
-- (2) U26. settings.vat_rate_bps and rate_versions.vat_rate_bps hold tenths of a percent (81 = 8.1 %),
--     not hundredths as their column comments said. Comments only: no value, type or check changes.
--
-- (3) S6, step 1 of 2 (expand). Eight SECURITY DEFINER functions are executable by anon (and some by
--     authenticated), so anyone can call them through Supabase REST with the public key, past the Worker's
--     rate limits: quote_rate_book returned every coupon of the live book with its code, evaluate_coupon
--     allowed unlimited voucher guessing, record_consent took unthrottled writes. The Worker (same branch)
--     now calls all eight as vamos_checkout (asCheckout, no claims), a role REST can never become. This
--     step only ADDS EXECUTE for vamos_checkout, so the Worker live today (asQuote/asAnon = anon) and the
--     new one both work while it is in place. 20261007320000 (step 2) revokes anon, authenticated and
--     PUBLIC and must be applied only AFTER the new Worker is live.
--     quote_rate_book also stops returning a coupon's code and note unless app.is_staff() (the dashboard
--     preview via asStaff); the quote engine matches a voucher by coupon_id, so old and new Workers both
--     price vouchers as before. Body: 20260914190000, byte for byte (md5 of prosrc on live and in that
--     file: 7295d6c3fcea67258eaf5f735e7e0083, read 2026-10-05), plus the lines marked 20261007310000.
--     Same signature, STABLE, SECURITY DEFINER, search_path, owner, comment; grants as before plus
--     vamos_checkout. No timeout added: a read-only function that never had one.
--
-- Order of apply and deploy: this file, then the Worker of fix/money-db-hardening, then 20261007320000.
-- No table, row or other function changes. No CHF amount.
-- One transaction: apply it verbatim as a whole (connector apply_migration).
begin;

-- ---------------------------------------------------------------------------
-- (1) checkout_payment_settle: body of 20261005130000, already-settled branch stamps its event.
-- ---------------------------------------------------------------------------
create or replace function public.checkout_payment_settle(
  p_event_id pg_catalog.text,
  p_session_id pg_catalog.text,
  p_payment_intent_id pg_catalog.text,
  p_outcome pg_catalog.text,
  p_charged_currency pg_catalog.text,
  p_fx_rate pg_catalog.numeric,
  p_fx_source pg_catalog.text,
  p_fx_quoted_at pg_catalog.timestamptz,
  p_presentment_amount_minor pg_catalog.int8,
  p_presentment_currency pg_catalog.text default null
)
returns table (
  booking_id pg_catalog.uuid,
  reference pg_catalog.text,
  locale pg_catalog.text,
  contact_email pg_catalog.text,
  already_settled pg_catalog.bool,
  revived pg_catalog.bool,
  duplicate pg_catalog.bool,
  refund_required pg_catalog.bool,
  refund_reason pg_catalog.text,
  payment_id pg_catalog.int8,
  charged_rappen pg_catalog.int4,
  snapshot_id pg_catalog.int8,
  other_open_session_ids pg_catalog.text[]
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_pay public.booking_payments%rowtype;
  v_booking public.bookings%rowtype;
  v_pi_writeback pg_catalog.text;
  v_other_sessions pg_catalog.text[];
  v_dup_exists pg_catalog.bool;
  v_last_cancel_via pg_catalog.text;
  v_min_scheduled pg_catalog.timestamptz;
  v_pickup_ahead pg_catalog.bool;
  v_from_status public.booking_status;
begin
  if p_outcome is distinct from 'succeeded'
     and p_outcome is distinct from 'failed'
     and p_outcome is distinct from 'canceled' then
    raise exception 'invalid_outcome'
      using errcode = 'check_violation';
  end if;

  if p_session_id is not null then
    select bp.*
      into v_pay
      from public.booking_payments as bp
     where bp.stripe_checkout_session_id = p_session_id
       for update;
  end if;

  if v_pay.id is null and p_payment_intent_id is not null then
    select bp.*
      into v_pay
      from public.booking_payments as bp
     where bp.stripe_payment_intent_id = p_payment_intent_id
       for update;
  end if;

  if v_pay.id is null then
    raise exception 'payment_not_found'
      using errcode = 'P0002';
  end if;

  select b.*
    into v_booking
    from public.bookings as b
   where b.id = v_pay.booking_id
     for update;

  -- Already-settled: this exact row already reached succeeded. Unchanged.
  if v_pay.status = 'succeeded' and p_outcome = 'succeeded' then
    -- 20261007310000 (U15): the second delivery of this payment (the Stripe webhook after the return
    -- route, or the other way round) marks its own stripe_events row processed too, as every other
    -- branch does. Nothing else is written: no payment, booking or booking_events row.
    update public.stripe_events
       set processed_at = pg_catalog.now()
     where id = p_event_id;

    return query
      select v_booking.id, v_booking.reference, v_booking.locale,
             v_booking.contact_email::pg_catalog.text,
             true, false, false, false, null::pg_catalog.text,
             v_pay.id, v_pay.charged_rappen::pg_catalog.int4, v_pay.snapshot_id,
             array[]::pg_catalog.text[];
    return;
  end if;

  -- Non-succeeded outcome: unchanged failure path, extended return shape only.
  if p_outcome is distinct from 'succeeded' then
    update public.booking_payments
       set status = p_outcome,
           charged_currency = coalesce(p_charged_currency, charged_currency),
           fx_rate = case when p_charged_currency is not null then p_fx_rate else fx_rate end,
           fx_source = case when p_charged_currency is not null then p_fx_source else fx_source end,
           fx_quoted_at = case when p_charged_currency is not null then p_fx_quoted_at else fx_quoted_at end,
           presentment_amount_minor = case
                                        when p_charged_currency is not null
                                        then p_presentment_amount_minor
                                        else presentment_amount_minor
                                      end,
         presentment_currency = coalesce(pg_catalog.upper(p_presentment_currency), presentment_currency)
     where id = v_pay.id;

    insert into public.booking_events (
      booking_id, kind, actor_kind, actor_label, payment_id
    ) values (
      v_booking.id, 'payment.failed', 'stripe', 'Stripe webhook', v_pay.id
    );

    update public.stripe_events
       set processed_at = pg_catalog.now()
     where id = p_event_id;

    return query
      select v_booking.id, v_booking.reference, v_booking.locale,
             v_booking.contact_email::pg_catalog.text,
             false, false, false, false, null::pg_catalog.text,
             v_pay.id, v_pay.charged_rappen::pg_catalog.int4, v_pay.snapshot_id,
             array[]::pg_catalog.text[];
    return;
  end if;

  -- p_outcome = 'succeeded' from here on.

  -- The pi_ write-back value for this UPDATE, only when it is the one legal
  -- correction the whitelist trigger allows (D-05).
  v_pi_writeback := case
    when p_payment_intent_id like 'pi\_%' escape '\'
     and v_pay.stripe_payment_intent_id like 'cs\_%' escape '\'
    then p_payment_intent_id
    else null
  end;

  -- D-21/D-22: every succeeded branch reports the booking's other open
  -- Checkout Session ids so the consumer can expire them. Computed once,
  -- before any UPDATE below changes v_pay's own status.
  select coalesce(pg_catalog.array_agg(bp3.stripe_checkout_session_id), array[]::pg_catalog.text[])
    into v_other_sessions
    from public.booking_payments as bp3
   where bp3.booking_id = v_booking.id
     and bp3.status = 'requires_payment'
     and bp3.id is distinct from v_pay.id
     and bp3.stripe_checkout_session_id is not null;

  -- Duplicate detection (D-22): another row on the same snapshot already
  -- succeeded. Flag duplicate; never attempt a second confirm or a second
  -- revive.
  select exists (
    select 1
      from public.booking_payments as bp2
     where bp2.snapshot_id = v_pay.snapshot_id
       and bp2.status = 'succeeded'
       and bp2.id is distinct from v_pay.id
  ) into v_dup_exists;

  if v_dup_exists then
    update public.booking_payments
       set status = 'duplicate',
           captured_at = pg_catalog.now(),
           stripe_payment_intent_id = coalesce(v_pi_writeback, stripe_payment_intent_id),
           charged_currency = coalesce(p_charged_currency, charged_currency),
           fx_rate = case when p_charged_currency is not null then p_fx_rate else fx_rate end,
           fx_source = case when p_charged_currency is not null then p_fx_source else fx_source end,
           fx_quoted_at = case when p_charged_currency is not null then p_fx_quoted_at else fx_quoted_at end,
           presentment_amount_minor = case
                                        when p_charged_currency is not null
                                        then p_presentment_amount_minor
                                        else presentment_amount_minor
                                      end,
         presentment_currency = coalesce(pg_catalog.upper(p_presentment_currency), presentment_currency)
     where id = v_pay.id;

    insert into public.booking_events (
      booking_id, kind, actor_kind, actor_label, payment_id
    ) values (
      v_booking.id, 'payment.duplicate', 'stripe', 'Stripe webhook', v_pay.id
    );

    update public.stripe_events
       set processed_at = pg_catalog.now()
     where id = p_event_id;

    -- already_settled = true so the Worker live today (which only reads that
    -- column) never sends a second confirmation email.
    return query
      select v_booking.id, v_booking.reference, v_booking.locale,
             v_booking.contact_email::pg_catalog.text,
             true, false, true, true, 'duplicate_charge'::pg_catalog.text,
             v_pay.id, v_pay.charged_rappen::pg_catalog.int4, v_pay.snapshot_id,
             v_other_sessions;
    return;
  end if;

  -- An erased booking never takes a payment. Same outcome as a missing booking: the
  -- P0002 the Worker turns into an automatic full refund. Nothing is written (the
  -- raise rolls the transaction back), so no payment is recorded as succeeded.
  if v_booking.erased_at is not null then
    raise exception 'payment_not_found'
      using errcode = 'P0002';
  end if;

  -- is_test booking: capture the money, never touch booking status.
  if v_booking.is_test then
    update public.booking_payments
       set status = 'succeeded',
           captured_at = pg_catalog.now(),
           stripe_payment_intent_id = coalesce(v_pi_writeback, stripe_payment_intent_id),
           charged_currency = coalesce(p_charged_currency, charged_currency),
           fx_rate = case when p_charged_currency is not null then p_fx_rate else fx_rate end,
           fx_source = case when p_charged_currency is not null then p_fx_source else fx_source end,
           fx_quoted_at = case when p_charged_currency is not null then p_fx_quoted_at else fx_quoted_at end,
           presentment_amount_minor = case
                                        when p_charged_currency is not null
                                        then p_presentment_amount_minor
                                        else presentment_amount_minor
                                      end,
         presentment_currency = coalesce(pg_catalog.upper(p_presentment_currency), presentment_currency)
     where id = v_pay.id;

    insert into public.booking_events (
      booking_id, kind, actor_kind, actor_label, payment_id
    ) values (
      v_booking.id, 'payment.succeeded', 'stripe', 'Stripe webhook', v_pay.id
    );

    update public.stripe_events
       set processed_at = pg_catalog.now()
     where id = p_event_id;

    return query
      select v_booking.id, v_booking.reference, v_booking.locale,
             v_booking.contact_email::pg_catalog.text,
             false, false, false, true, 'test_booking'::pg_catalog.text,
             v_pay.id, v_pay.charged_rappen::pg_catalog.int4, v_pay.snapshot_id,
             v_other_sessions;
    return;
  end if;

  -- Cancelled (or pending whose quote lock has already expired): decide
  -- revive (D-03/D-03a) vs refund-only (D-03b requote, or pickup already
  -- passed).
  if v_booking.status = 'cancelled'::public.booking_status
     or (
       v_booking.status = 'pending'::public.booking_status
       and exists (
         select 1
           from public.price_snapshots as ps
          where ps.id = v_booking.price_snapshot_id
            and ps.quote_lock_expires_at <= pg_catalog.now()
       )
     ) then

    select pg_catalog.min(bl.original_scheduled_at)
      into v_min_scheduled
      from public.booking_legs as bl
     where bl.booking_id = v_booking.id;

    select e.payload ->> 'via'
      into v_last_cancel_via
      from public.booking_events as e
     where e.booking_id = v_booking.id
       and e.kind = 'booking.status_changed'
       and e.to_status = 'cancelled'::public.booking_status
     order by e.at desc
     limit 1;

    v_pickup_ahead := v_min_scheduled is not null and v_min_scheduled > pg_catalog.now();
    v_from_status := v_booking.status;

    if v_booking.status = 'cancelled'::public.booking_status
       and v_last_cancel_via = 'requote_cancel' then
      -- D-03b: the requote created a successor booking. Reviving this one
      -- would double-book -- refund instead.
      update public.booking_payments
         set status = 'succeeded',
             captured_at = pg_catalog.now(),
             stripe_payment_intent_id = coalesce(v_pi_writeback, stripe_payment_intent_id),
             charged_currency = coalesce(p_charged_currency, charged_currency),
             fx_rate = case when p_charged_currency is not null then p_fx_rate else fx_rate end,
             fx_source = case when p_charged_currency is not null then p_fx_source else fx_source end,
             fx_quoted_at = case when p_charged_currency is not null then p_fx_quoted_at else fx_quoted_at end,
             presentment_amount_minor = case
                                          when p_charged_currency is not null
                                          then p_presentment_amount_minor
                                          else presentment_amount_minor
                                        end,
           presentment_currency = coalesce(pg_catalog.upper(p_presentment_currency), presentment_currency)
       where id = v_pay.id;

      insert into public.booking_events (
        booking_id, kind, actor_kind, actor_label, payment_id
      ) values (
        v_booking.id, 'payment.succeeded', 'stripe', 'Stripe webhook', v_pay.id
      );

      update public.stripe_events
         set processed_at = pg_catalog.now()
       where id = p_event_id;

      return query
        select v_booking.id, v_booking.reference, v_booking.locale,
               v_booking.contact_email::pg_catalog.text,
               false, false, false, true, 'requote_superseded'::pg_catalog.text,
               v_pay.id, v_pay.charged_rappen::pg_catalog.int4, v_pay.snapshot_id,
               v_other_sessions;
      return;

    elsif v_pickup_ahead then
      -- D-03/D-03a: revive, whoever cancelled it (account, cron, abandon, staff).
      update public.booking_payments
         set status = 'succeeded',
             captured_at = pg_catalog.now(),
             stripe_payment_intent_id = coalesce(v_pi_writeback, stripe_payment_intent_id),
             charged_currency = coalesce(p_charged_currency, charged_currency),
             fx_rate = case when p_charged_currency is not null then p_fx_rate else fx_rate end,
             fx_source = case when p_charged_currency is not null then p_fx_source else fx_source end,
             fx_quoted_at = case when p_charged_currency is not null then p_fx_quoted_at else fx_quoted_at end,
             presentment_amount_minor = case
                                          when p_charged_currency is not null
                                          then p_presentment_amount_minor
                                          else presentment_amount_minor
                                        end,
           presentment_currency = coalesce(pg_catalog.upper(p_presentment_currency), presentment_currency)
       where id = v_pay.id;

      update public.bookings
         set status = 'confirmed'::public.booking_status,
             refund_status = 'none',
             refund_owed_rappen = null,
             updated_at = pg_catalog.now()
       where id = v_booking.id;

      update public.booking_legs
         set status = 'confirmed'::public.booking_status,
             updated_at = pg_catalog.now()
       where booking_id = v_booking.id
         and status = 'cancelled'::public.booking_status;

      update public.coupon_redemptions
         set released_at = null,
             released_reason = null
       where booking_id = v_booking.id;

      insert into public.booking_events (
        booking_id, kind, actor_kind, actor_label, from_status, to_status, payment_id, payload
      ) values (
        v_booking.id, 'booking.revived', 'stripe', 'Stripe webhook',
        v_from_status, 'confirmed'::public.booking_status, v_pay.id,
        pg_catalog.jsonb_build_object('revived', true)
      );

      insert into public.booking_events (
        booking_id, kind, actor_kind, actor_label, payment_id
      ) values (
        v_booking.id, 'payment.succeeded', 'stripe', 'Stripe webhook', v_pay.id
      );

      update public.stripe_events
         set processed_at = pg_catalog.now()
       where id = p_event_id;

      return query
        select v_booking.id, v_booking.reference, v_booking.locale,
               v_booking.contact_email::pg_catalog.text,
               false, true, false, false, null::pg_catalog.text,
               v_pay.id, v_pay.charged_rappen::pg_catalog.int4, v_pay.snapshot_id,
               v_other_sessions;
      return;

    else
      -- Pickup already passed: the trip cannot run. Capture, do not revive.
      update public.booking_payments
         set status = 'succeeded',
             captured_at = pg_catalog.now(),
             stripe_payment_intent_id = coalesce(v_pi_writeback, stripe_payment_intent_id),
             charged_currency = coalesce(p_charged_currency, charged_currency),
             fx_rate = case when p_charged_currency is not null then p_fx_rate else fx_rate end,
             fx_source = case when p_charged_currency is not null then p_fx_source else fx_source end,
             fx_quoted_at = case when p_charged_currency is not null then p_fx_quoted_at else fx_quoted_at end,
             presentment_amount_minor = case
                                          when p_charged_currency is not null
                                          then p_presentment_amount_minor
                                          else presentment_amount_minor
                                        end,
           presentment_currency = coalesce(pg_catalog.upper(p_presentment_currency), presentment_currency)
       where id = v_pay.id;

      insert into public.booking_events (
        booking_id, kind, actor_kind, actor_label, payment_id
      ) values (
        v_booking.id, 'payment.succeeded', 'stripe', 'Stripe webhook', v_pay.id
      );

      update public.stripe_events
         set processed_at = pg_catalog.now()
       where id = p_event_id;

      return query
        select v_booking.id, v_booking.reference, v_booking.locale,
               v_booking.contact_email::pg_catalog.text,
               false, false, false, true, 'paid_after_cancel'::pg_catalog.text,
               v_pay.id, v_pay.charged_rappen::pg_catalog.int4, v_pay.snapshot_id,
               v_other_sessions;
      return;
    end if;
  end if;

  -- Otherwise: the existing pending -> paid -> confirmed path, extended with
  -- the pi_ write-back and the new return columns.
  update public.booking_payments
     set status = 'succeeded',
         captured_at = pg_catalog.now(),
         stripe_payment_intent_id = coalesce(v_pi_writeback, stripe_payment_intent_id),
         charged_currency = coalesce(p_charged_currency, charged_currency),
         fx_rate = case when p_charged_currency is not null then p_fx_rate else fx_rate end,
         fx_source = case when p_charged_currency is not null then p_fx_source else fx_source end,
         fx_quoted_at = case when p_charged_currency is not null then p_fx_quoted_at else fx_quoted_at end,
         presentment_amount_minor = case
                                      when p_charged_currency is not null
                                      then p_presentment_amount_minor
                                      else presentment_amount_minor
                                    end,
       presentment_currency = coalesce(pg_catalog.upper(p_presentment_currency), presentment_currency)
   where id = v_pay.id;

  if v_booking.status = 'pending'::public.booking_status then
    update public.bookings
       set status = 'paid'::public.booking_status,
           updated_at = pg_catalog.now()
     where id = v_booking.id;

    update public.booking_legs
       set status = 'paid'::public.booking_status
     where booking_id = v_booking.id
       and status = 'pending'::public.booking_status;

    insert into public.booking_events (
      booking_id, kind, actor_kind, actor_label, from_status, to_status, payment_id
    ) values (
      v_booking.id, 'booking.status_changed', 'stripe', 'Stripe webhook',
      'pending'::public.booking_status, 'paid'::public.booking_status, v_pay.id
    );

    v_booking.status := 'paid';
  end if;

  if v_booking.status = 'paid'::public.booking_status then
    update public.bookings
       set status = 'confirmed'::public.booking_status,
           updated_at = pg_catalog.now()
     where id = v_booking.id;

    update public.booking_legs
       set status = 'confirmed'::public.booking_status
     where booking_id = v_booking.id
       and status = 'paid'::public.booking_status;

    insert into public.booking_events (
      booking_id, kind, actor_kind, actor_label, from_status, to_status, payment_id
    ) values (
      v_booking.id, 'booking.status_changed', 'stripe', 'Stripe webhook',
      'paid'::public.booking_status, 'confirmed'::public.booking_status, v_pay.id
    );

    v_booking.status := 'confirmed';
  end if;

  insert into public.booking_events (
    booking_id, kind, actor_kind, actor_label, payment_id
  ) values (
    v_booking.id, 'payment.succeeded', 'stripe', 'Stripe webhook', v_pay.id
  );

  update public.stripe_events
     set processed_at = pg_catalog.now()
   where id = p_event_id;

  return query
    select v_booking.id, v_booking.reference, v_booking.locale,
           v_booking.contact_email::pg_catalog.text,
           false, false, false, false, null::pg_catalog.text,
           v_pay.id, v_pay.charged_rappen::pg_catalog.int4, v_pay.snapshot_id,
           v_other_sessions;
  return;
end;
$$;

revoke all on function public.checkout_payment_settle(
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.numeric,
  pg_catalog.text,
  pg_catalog.timestamptz,
  pg_catalog.int8,
  pg_catalog.text
) from public;

grant execute on function public.checkout_payment_settle(
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.numeric,
  pg_catalog.text,
  pg_catalog.timestamptz,
  pg_catalog.int8,
  pg_catalog.text
) to vamos_system;

-- ---------------------------------------------------------------------------
-- (2) vat_rate_bps column comments: tenths of a percent.
-- ---------------------------------------------------------------------------
comment on column public.settings.vat_rate_bps is
  'D-22: Swiss VAT on top of net, in tenths of a percent despite the name: 81 = 8.1 %. Default 81 = CH_VAT_RATE_BPS (apps/web/lib/checkout/vat.ts). Show it with vatPercentLabel (divide by 10, never by 100). Not an invented rate.';
comment on column public.rate_versions.vat_rate_bps is
  'D-03: VAT in tenths of a percent despite the name: 81 = 8.1 %. Applied to settings only in the Publish tx. Null until the admin sets it on the draft.';

-- ---------------------------------------------------------------------------
-- (3) S6, step 1 of 2 (expand): vamos_checkout may run the eight functions; quote_rate_book hides
--     coupon codes and notes from everyone but staff. Body: 20260914190000, byte for byte, plus the
--     lines marked 20261007310000.
-- ---------------------------------------------------------------------------
create or replace function public.quote_rate_book(p_prefer_draft boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id bigint;
  v_slug text;
  v_status public.rate_version_status;
  v_public_chf boolean;
  v_vat_rate_bps integer;
  v_version_vat_rate_bps integer;
  v_quote_lock_minutes integer;
  v_service_area_geojson jsonb;
  v_free_wait_minutes integer;
  v_max_extra_stops integer;
  -- 20261007310000 (S6): coupon codes and staff notes go to staff only.
  v_staff boolean := coalesce(app.is_staff(), false);
begin
  select s.public_chf, s.vat_rate_bps
    into v_public_chf, v_vat_rate_bps
    from public.settings as s
   where s.id = 1;

  v_public_chf := coalesce(v_public_chf, false);
  v_vat_rate_bps := coalesce(v_vat_rate_bps, 81);

  select rv.id, rv.slug, rv.status,
         rv.vat_rate_bps, rv.quote_lock_minutes, rv.service_area_geojson,
         rv.free_wait_minutes, rv.max_extra_stops
    into v_id, v_slug, v_status,
         v_version_vat_rate_bps, v_quote_lock_minutes, v_service_area_geojson,
         v_free_wait_minutes, v_max_extra_stops
    from public.rate_versions as rv
   where rv.status = 'live'
   order by rv.id desc
   limit 1;

  if v_id is null and p_prefer_draft then
    select rv.id, rv.slug, rv.status,
           rv.vat_rate_bps, rv.quote_lock_minutes, rv.service_area_geojson,
           rv.free_wait_minutes, rv.max_extra_stops
      into v_id, v_slug, v_status,
           v_version_vat_rate_bps, v_quote_lock_minutes, v_service_area_geojson,
           v_free_wait_minutes, v_max_extra_stops
      from public.rate_versions as rv
     where rv.status = 'draft'
     order by rv.created_at desc, rv.id desc
     limit 1;
  end if;

  if v_id is null then
    return jsonb_build_object(
      'rate_version', null,
      'classes', '[]'::jsonb,
      'distance_rates', '[]'::jsonb,
      'distance_bands', '[]'::jsonb,
      'region_premiums', '[]'::jsonb,
      'fixed_routes', '[]'::jsonb,
      'surcharges', '[]'::jsonb,
      'coupons', '[]'::jsonb,
      'zones', '[]'::jsonb,
      'public_chf', v_public_chf,
      'vat_rate_bps', v_vat_rate_bps
    );
  end if;

  return jsonb_build_object(
    'rate_version', jsonb_build_object(
      'id', v_id,
      'slug', v_slug,
      'status', v_status,
      'vat_rate_bps', v_version_vat_rate_bps,
      'quote_lock_minutes', v_quote_lock_minutes,
      'service_area_geojson', v_service_area_geojson,
      'free_wait_minutes', v_free_wait_minutes,
      'max_extra_stops', v_max_extra_stops
    ),
    'classes', (
      select coalesce(jsonb_agg(to_jsonb(c) order by c.sort_order, c.slug), '[]'::jsonb)
        from public.vehicle_classes as c
       where exists (
               select 1
                 from public.distance_rates as d
                where d.rate_version_id = v_id
                  and d.vehicle_class_id = c.id
             )
          or exists (
               select 1
                 from public.fixed_routes as f
                where f.rate_version_id = v_id
                  and f.vehicle_class_id = c.id
             )
    ),
    'distance_rates', (
      select coalesce(jsonb_agg(to_jsonb(d) order by d.vehicle_class_id), '[]'::jsonb)
        from public.distance_rates as d
       where d.rate_version_id = v_id
    ),
    'distance_bands', (
      select coalesce(jsonb_agg(to_jsonb(b) order by b.vehicle_class_id, b.from_km), '[]'::jsonb)
        from public.distance_bands as b
       where b.rate_version_id = v_id
    ),
    'region_premiums', (
      select coalesce(jsonb_agg(to_jsonb(p) order by p.zone_id), '[]'::jsonb)
        from public.region_premiums as p
       where p.rate_version_id = v_id
    ),
    'fixed_routes', (
      select coalesce(
               jsonb_agg(to_jsonb(f) order by f.origin_zone_id, f.dest_zone_id, f.vehicle_class_id),
               '[]'::jsonb
             )
        from public.fixed_routes as f
       where f.rate_version_id = v_id
    ),
    'surcharges', (
      select coalesce(jsonb_agg(to_jsonb(s) order by s.code), '[]'::jsonb)
        from public.surcharges as s
       where s.rate_version_id = v_id
    ),
    -- 20261007310000 (S6): a caller who is not staff gets each coupon without its code and note. The
    -- quote engine matches the voucher the traveller typed by the coupon_id evaluate_coupon returns
    -- (apps/web/lib/quote/engine.ts couponOnBook), so it needs no code from the book.
    'coupons', (
      select coalesce(
               jsonb_agg(
                 case when v_staff then to_jsonb(cp) else to_jsonb(cp) - 'code' - 'note' end
                 order by cp.code
               ),
               '[]'::jsonb
             )
        from public.coupons as cp
       where cp.rate_version_id = v_id
    ),
    'zones', (
      select coalesce(jsonb_agg(to_jsonb(z) order by z.slug), '[]'::jsonb)
        from public.service_zones as z
    ),
    'public_chf', v_public_chf,
    'vat_rate_bps', v_vat_rate_bps
  );
end;
$$;

grant execute on function public.quote_rate_book(pg_catalog.bool) to vamos_checkout;
grant execute on function public.quote_settings_version(pg_catalog.timestamptz) to vamos_checkout;
grant execute on function public.quote_lock_deadline(pg_catalog.int8) to vamos_checkout;
grant execute on function public.evaluate_coupon(pg_catalog.text, pg_catalog.uuid, extensions.citext)
  to vamos_checkout;
grant execute on function public.extra_labels_read() to vamos_checkout;
grant execute on function public.consent_choice(pg_catalog.text, pg_catalog.timestamptz) to vamos_checkout;
grant execute on function public.record_consent(
  pg_catalog.bool, pg_catalog.bool, pg_catalog.bool, pg_catalog.bool,
  pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.uuid, pg_catalog.text, pg_catalog.inet
) to vamos_checkout;
-- checkout_account_settings(): vamos_checkout already holds EXECUTE (20261001100000).

commit;

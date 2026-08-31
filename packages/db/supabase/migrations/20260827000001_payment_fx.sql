-- 20260827000001_payment_fx.sql
--
-- Resolves the F-14 hand-off recorded in 02-06-PLAN.md's <deferred> block per D-11:
-- booking_payments records the presentment currency Stripe actually settled, without
-- moving the charge gate. The gate's charged_rappen vs s.total_rappen comparison is
-- deliberately not in this file. D-12 records why booking_refunds needs nothing here.
--
-- Phase 7 owns 20260827000001–20260827000099 (hand-assigned; see packages/db/README.md).

alter table public.booking_payments
  add column fx_rate numeric(18,8) check (fx_rate > 0);
comment on column public.booking_payments.fx_rate is
  'Settlement FX rate written by the Queue consumer (plan 07-03 checkout_payment_settle). charged_rappen remains the CHF figure regardless.';

alter table public.booking_payments
  add column fx_source text;
comment on column public.booking_payments.fx_source is
  'Who quoted fx_rate. Written by the Queue consumer at settlement (plan 07-03 checkout_payment_settle).';

alter table public.booking_payments
  add column fx_quoted_at timestamptz;
comment on column public.booking_payments.fx_quoted_at is
  'When fx_rate was quoted. Written by the Queue consumer at settlement (plan 07-03 checkout_payment_settle).';

alter table public.booking_payments
  add column presentment_amount_minor bigint check (presentment_amount_minor > 0);
comment on column public.booking_payments.presentment_amount_minor is
  'Amount in charged_currency minor units as Stripe presented it. Written by the Queue consumer at settlement (plan 07-03 checkout_payment_settle). charged_rappen remains the CHF figure regardless.';

alter table public.booking_payments
  add column stripe_checkout_session_id text unique;
comment on column public.booking_payments.stripe_checkout_session_id is
  'Stripe Checkout Session id (cs_…). D-07 expire(session.id) and D-15 checkout.session.completed object_id. Nullable: unknown for any non-Checkout-Session settlement path a later phase might add.';

do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conname = 'booking_payments_charged_currency_check'
       and conrelid = 'public.booking_payments'::regclass
  ) then
    raise exception 'expected constraint booking_payments_charged_currency_check not found';
  end if;
end $$;

alter table public.booking_payments
  drop constraint booking_payments_charged_currency_check;

alter table public.booking_payments
  add constraint booking_payments_currency_allowed
    check (charged_currency in ('CHF','EUR','USD','AED'));

alter table public.booking_payments
  add constraint booking_payments_fx_currency_pair
    check ((charged_currency = 'CHF') = (fx_rate is null));

alter table public.booking_payments
  add constraint booking_payments_fx_complete
    check (num_nonnulls(fx_rate, fx_source, fx_quoted_at, presentment_amount_minor) in (0, 4));

/**
 * UPDATE-column whitelist, extended for settlement. The only function this file replaces.
 * create or replace keeps booking_payments_column_whitelist attached.
 *
 * A succeeded row is terminal. Only status, captured_at, charged_currency, and the four FX
 * columns may differ. Settlement columns are write-once; charged_currency may change only
 * while it is still CHF. charged_rappen, snapshot_id, booking_id, stripe_payment_intent_id
 * and stripe_checkout_session_id stay refused.
 */
create or replace function public.tg_payment_update_whitelist()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'succeeded' then
    raise exception 'booking_payments: a succeeded row is terminal'
      using errcode = 'restrict_violation',
            hint = 'A corrected settlement is a new row plus a compensating booking_event.';
  end if;

  if to_jsonb(new) - 'status' - 'captured_at' - 'charged_currency'
                 - 'fx_rate' - 'fx_source' - 'fx_quoted_at' - 'presentment_amount_minor'
     is distinct from
     to_jsonb(old) - 'status' - 'captured_at' - 'charged_currency'
                 - 'fx_rate' - 'fx_source' - 'fx_quoted_at' - 'presentment_amount_minor' then
    raise exception 'booking_payments: only status, captured_at, and settlement columns may be updated'
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
  if new.charged_currency is distinct from old.charged_currency
     and old.charged_currency is distinct from 'CHF' then
    raise exception 'booking_payments: charged_currency may change only while it is CHF'
      using errcode = 'restrict_violation',
            hint = 'A corrected settlement is a new row plus a compensating booking_event.';
  end if;

  return new;
end $$;

revoke all on function public.tg_payment_update_whitelist() from public;

-- public.booking_refunds is unchanged by this phase (D-12). Phase 8 owns
-- app.calculate_refund_tier(); Phase 9 owns record_booking_refund(). No third
-- spelling of a refund helper is introduced here.

-- 20261007290000_stripe_fee_record.sql
--
-- Owner decision 2026-10-04 (.planning/decisions/2026-10-04-dashboard-numbers.md, answer 3, "Record it
-- from Stripe"): each payment saves the fee Stripe actually took, and the dashboard's Expenses and Net
-- include it (loadDashboardMoney already sums booking_payments.stripe_fee_rappen).
--
-- Until now nothing wrote the column on a charge: the refund functions only pass a refund's own fee,
-- which is never set in practice. The Worker's hourly cron (apps/web/lib/checkout/stripe-fee.ts) now
-- asks Stripe for the charge's balance transaction and records its fee through the two functions below.
-- The cron runs apart from settlement: a payment never waits on it, and a failed read leaves the column
-- NULL and is tried again the next hour.
--
--   (1) checkout_payment_fee_pending(limit): Stripe PaymentIntent ids of captured payments (succeeded,
--       or a duplicate charge that was refunded: Stripe keeps the fee) whose fee is still NULL,
--       captured in the last 72 hours, newest first. Read only.
--   (2) checkout_payment_fee_record(payment_intent_id, fee_rappen): writes the fee once. Only a
--       captured row, only while the column is NULL, only 0 < fee < charged_rappen. Anything else
--       writes nothing and returns false; it never raises for a refused value. The fee is CHF rappen:
--       the Worker passes it only when Stripe's balance transaction is in CHF and never converts.
--
-- Locks: (2) is one UPDATE of one booking_payments row and touches no booking, request or refund row,
-- so it cannot take part in the payment -> booking lock order of 20261007280000. tg_payment_update_whitelist
-- already lets stripe_fee_rappen be written once on a succeeded or duplicate row.
--
-- Refunds, customer pages and e-mails do not read stripe_fee_rappen; no amount a customer sees changes.
-- The column comment is restated; no table, column, trigger or other function changes. Grants:
-- vamos_system only.
-- One transaction: apply it verbatim as a whole (connector apply_migration).
begin;

-- ---------------------------------------------------------------------------
-- (1) payments whose fee the cron still has to read
-- ---------------------------------------------------------------------------
create or replace function public.checkout_payment_fee_pending(
  p_limit pg_catalog.int4 default 25
)
returns table (stripe_payment_intent_id pg_catalog.text)
language sql
stable
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '5s'
as $$
  select bp.stripe_payment_intent_id
    from public.booking_payments as bp
   where bp.status in ('succeeded', 'duplicate')
     and bp.captured_at is not null
     and bp.captured_at >= pg_catalog.now() - interval '72 hours'
     and bp.stripe_fee_rappen is null
     and bp.stripe_payment_intent_id like 'pi\_%' escape '\'
   order by bp.captured_at desc, bp.id desc
   limit least(greatest(coalesce(p_limit, 0), 0), 100);
$$;

comment on function public.checkout_payment_fee_pending(pg_catalog.int4) is
  'Stripe PaymentIntent ids of captured payments (last 72 h) whose stripe_fee_rappen is still NULL, newest first, at most 100. Read by the Worker''s hourly fee sweep.';

-- ---------------------------------------------------------------------------
-- (2) the one write path for a charge's fee
-- ---------------------------------------------------------------------------
create or replace function public.checkout_payment_fee_record(
  p_payment_intent_id pg_catalog.text,
  p_fee_rappen pg_catalog.int4
)
returns pg_catalog.bool
language plpgsql
security definer
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '5s'
as $$
declare
  v_rows pg_catalog.int4;
begin
  if p_payment_intent_id is null or p_payment_intent_id !~ '^pi_[A-Za-z0-9_]{1,250}$' then
    return false;
  end if;
  if p_fee_rappen is null or p_fee_rappen <= 0 then
    return false;
  end if;

  update public.booking_payments as bp
     set stripe_fee_rappen = p_fee_rappen::public.rappen
   where bp.stripe_payment_intent_id = p_payment_intent_id
     and bp.status in ('succeeded', 'duplicate')
     and bp.captured_at is not null
     and bp.stripe_fee_rappen is null
     and p_fee_rappen < bp.charged_rappen;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

comment on function public.checkout_payment_fee_record(pg_catalog.text, pg_catalog.int4) is
  'Writes the CHF fee Stripe took on a captured payment, once (only while stripe_fee_rappen is NULL, only 0 < fee < charged_rappen). Returns false and writes nothing otherwise. Caller: the Worker''s hourly fee sweep.';

comment on column public.booking_payments.stripe_fee_rappen is
  'Fee Stripe took on this charge, CHF rappen, from its balance transaction (only when that is in CHF; never converted, never guessed). Written once by checkout_payment_fee_record (hourly sweep, 20261007290000). NULL until read.';

revoke all on function public.checkout_payment_fee_pending(pg_catalog.int4) from public, anon, authenticated;
revoke all on function public.checkout_payment_fee_record(pg_catalog.text, pg_catalog.int4) from public, anon, authenticated;
grant execute on function public.checkout_payment_fee_pending(pg_catalog.int4) to vamos_system;
grant execute on function public.checkout_payment_fee_record(pg_catalog.text, pg_catalog.int4) to vamos_system;

commit;

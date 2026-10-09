-- 20261009170000_purge_keeps_late_refusals.sql
--
-- Integration of the 2026-10-09 payments chains. 20261009115000 (J4, W5-11) added two refusals to
-- purge_unpaid_booking. 20261009160000 (J9, W5-18) replaced the function again for the payment-first
-- lock and dropped those refusals, because a later migration's CREATE OR REPLACE is the definition
-- that runs. This file is that later body with the refusals put back. It changes no other function.
--
-- Answers false (does not delete) when:
--   * a booking_payments row for the booking is still requires_payment and names a Checkout Session
--     (the Worker marks sessions it has read back as expired and unpaid with checkout_payments_mark_dead first);
--   * p_reason is unpaid_expired and the price lock or the pay-link hold is still in the future.
-- Lock order stays J9's: payment rows of the booking first (ORDER BY id FOR UPDATE), then the booking.
-- Consent and agreement rows stay detached, never deleted. Same grants as 20261009160000.
--
-- Apply after 20261009160000. Worker order is unchanged from J4: deploy the Worker that marks dead
-- sessions before this file (and before 20261009115000) is applied. Applying the SQL first makes
-- purge answer false until that Worker is out.
-- No data change. One transaction. Apply it verbatim as a whole.
begin;

create or replace function public.purge_unpaid_booking(p_booking_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.bookings%rowtype;
begin
  if p_reason is null or p_reason not in ('unpaid_expired', 'superseded') then
    raise exception 'purge_unpaid_booking: reason must be unpaid_expired or superseded'
      using errcode = '22023';
  end if;

  -- Payment rows first, then the booking, the same order settle uses (J9 W5-18). A settle that already
  -- holds the payment waits nowhere; this function waits on the payment and never holds the booking while
  -- it does.
  perform 1 from public.bookings as b0 where b0.id = p_booking_id;
  if not found then
    return false;
  end if;

  perform 1
     from public.booking_payments as bp
    where bp.booking_id = p_booking_id
    order by bp.id
      for update;

  select * into v from public.bookings b where b.id = p_booking_id for update;
  if not found or not app.purge_eligible(p_booking_id) then
    return false;
  end if;

  -- 20261009115000 (W5-11), restored here because 20261009160000 replaced the function without it.
  -- The booking may only go when no Stripe Checkout Session of it can still be paid. A payment row that
  -- is still requires_payment names a session nobody has proved dead: refuse. The caller (the Worker)
  -- first retrieves every session of the booking, finds it expired and unpaid, and marks exactly those
  -- rows with checkout_payments_mark_dead; only then is a purge allowed. Without this a public checkout
  -- call (reason superseded) could delete a booking, and its payment rows, while the customer was paying
  -- in another tab, and the captured payment then had no booking to settle against.
  if exists (
    select 1
      from public.booking_payments as bp0
     where bp0.booking_id = p_booking_id
       and bp0.status = 'requires_payment'
       and bp0.stripe_checkout_session_id is not null
  ) then
    return false;
  end if;

  -- 20261009115000 (W5-11): reason unpaid_expired means the price lock has expired; a booking whose lock
  -- or pay-link hold is still live is not "unpaid expired". (superseded replaces a booking the customer
  -- just changed.)
  if p_reason = 'unpaid_expired' and exists (
    select 1
      from public.price_snapshots as ps
     where ps.id = v.price_snapshot_id
       and greatest(ps.quote_lock_expires_at, coalesce(v.hold_until, ps.quote_lock_expires_at)) > pg_catalog.now()
  ) then
    return false;
  end if;

  perform set_config('vamos.purge_unpaid', 'on', true);

  update public.bookings set price_snapshot_id = null where id = p_booking_id;
  update public.consent_log set booking_id = null where booking_id = p_booking_id;
  update public.account_agreement_records set booking_id = null where booking_id = p_booking_id;

  delete from public.coupon_redemptions where booking_id = p_booking_id;
  delete from public.booking_events where booking_id = p_booking_id;
  delete from public.booking_payments where booking_id = p_booking_id;
  delete from public.price_snapshot_legs
   where snapshot_id in (select s.id from public.price_snapshots s where s.booking_id = p_booking_id);
  delete from public.price_snapshots where booking_id = p_booking_id;
  delete from public.booking_access_tokens where booking_id = p_booking_id;
  delete from public.booking_legs where booking_id = p_booking_id;
  delete from public.bookings where id = p_booking_id;

  insert into public.audit_log (table_name, record_id, action, actor_kind, actor_id, before_value)
  values ('bookings', p_booking_id::text, 'delete', 'system', null,
          jsonb_build_object(
            'reference', v.reference,
            'created_at', v.created_at,
            'deleted_at', now(),
            'reason', p_reason));

  perform set_config('vamos.purge_unpaid', 'off', true);
  return true;
end
$$;

revoke all on function public.purge_unpaid_booking(uuid, text) from public;
grant execute on function public.purge_unpaid_booking(uuid, text) to vamos_system, vamos_checkout;

comment on function public.purge_unpaid_booking(uuid, text) is
  'D-25/D-45: hard-deletes one eligible unpaid booking (pending, no pay link, no paid/captured payment, no refund/dispute/notification/edit request/review) and writes one non-PII audit_log line. Its consent_log rows and account_agreement_records rows are detached (booking_id -> NULL), never deleted (20261007300000). 20261009170000 restores the 20261009115000 (W5-11) refusals on the 20261009160000 body: answers false while a payment row still names an unverified Stripe session (requires_payment; the caller marks verified-dead sessions first with checkout_payments_mark_dead) and, for reason unpaid_expired, while the price lock or pay-link hold is live. Payment rows are locked before the booking (W5-18). Returns false when not eligible. EXECUTE: vamos_system, vamos_checkout.';

commit;

-- 20261007300000_purge_agreement_records.sql
--
-- An unpaid booking could no longer be deleted once it had an account choice record. Since 26.5
-- (20261001100000) every checkout PAY writes a row in account_agreement_records with booking_id set.
-- That table is append-only (tg_append_only on UPDATE and DELETE) and its booking_id references
-- bookings ON DELETE SET NULL. purge_unpaid_booking never touched it, so deleting the booking made the
-- foreign key update the row, the trigger refused it (restrict_violation, 23001), and the whole purge
-- rolled back. Two callers were hit:
--   * the hourly sweep and the expired-session webhook (reason unpaid_expired): the booking stays
--     pending for ever (live: VT-26-0748, VT-26-0749, VT-26-0751, nothing purged since 2026-09-29);
--   * Pay -> back -> change class, extra or voucher -> Pay again (reason superseded,
--     apps/web/lib/checkout/intent.ts supersedeBooking): the old booking cannot be replaced and the
--     second Pay is refused with quote_already_booked ("This quote already has a booking.").
--
-- Fix, the same way consent_log has been handled since 20260930110000:
--   (1) tg_append_only, carve-out 3 also lets the purge detach account_agreement_records from the
--       booking: an UPDATE in which booking_id goes from the booking to NULL and no other column
--       changes, under exactly the conditions of consent_log (flag vamos.purge_unpaid on, caller is the
--       owner of purge_unpaid_booking, app.purge_eligible(booking) true at that moment). The record
--       itself stays: it is the proof of the customer's account choice and is never deleted. Every
--       other UPDATE, every DELETE and TRUNCATE are still refused. Body: the live one (identical to
--       20260930110000, checked by md5 2026-10-05), with that one table added to the consent_log branch.
--   (2) purge_unpaid_booking detaches the booking's agreement records next to its consent rows, while
--       the booking still exists and is still eligible. Body: the live one (identical to
--       20260930110000), plus that one UPDATE.
--
-- The foreign key stays ON DELETE SET NULL (as consent_log): the purge detaches first, so the cascade
-- finds no row. Any other delete of a booking that still has a record reaches the cascade after the
-- booking row is gone, app.purge_eligible is then false, and the trigger refuses it: the link is never
-- dropped silently.
--
-- No table, column, constraint, grant or other function changes. Revoke, grant and comment restated as
-- each function's latest migration has them (the comment of purge_unpaid_booking names the detach).
-- One transaction: apply it verbatim as a whole (connector apply_migration).
begin;

-- ---------------------------------------------------------------------------
-- (1) tg_append_only: carve-out 3 also covers account_agreement_records (detach only).
-- ---------------------------------------------------------------------------
create or replace function public.tg_append_only() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_booking uuid;
begin
  if tg_op = 'UPDATE' and tg_table_name = 'price_snapshots' then
    -- Carve-out 1: binding a pre-purchase quote snapshot to the booking it became.
    -- (See 20260823000019_append_only.sql for why is_chargeable is carried forward.)
    new.is_chargeable := old.is_chargeable;
    if old.booking_id is null and new.booking_id is not null
       and to_jsonb(new) - 'booking_id' = to_jsonb(old) - 'booking_id' then
      return new;
    end if;
  elsif tg_op = 'UPDATE' and tg_table_name = 'consent_log' then
    -- Carve-out 2 (F-10): erasure redaction, customer_id -> NULL.
    if old.customer_id is not null and new.customer_id is null
       and to_jsonb(new) - 'customer_id' = to_jsonb(old) - 'customer_id' then
      return new;
    end if;
  end if;

  -- Carve-out 3 (26.3-07, D-25): purge of an expired unpaid booking. Closed unless ALL hold:
  -- the transaction-local flag is on, the caller is the owner of purge_unpaid_booking (i.e. we
  -- are inside that definer function), the table is one of five, the operation is the exact
  -- one the purge performs, and the owning booking is still eligible right now.
  if current_setting('vamos.purge_unpaid', true) = 'on'
     and current_user = (select p.proowner::regrole::text
                           from pg_catalog.pg_proc p
                          where p.oid = 'public.purge_unpaid_booking(uuid,text)'::regprocedure) then
    if tg_table_name = 'price_snapshots' then
      if tg_op = 'DELETE' then v_booking := old.booking_id; end if;
    elsif tg_table_name = 'price_snapshot_legs' then
      if tg_op = 'DELETE' then
        select s.booking_id into v_booking from public.price_snapshots s where s.id = old.snapshot_id;
      end if;
    elsif tg_table_name = 'booking_events' then
      if tg_op = 'DELETE' then v_booking := old.booking_id; end if;
    elsif tg_table_name in ('consent_log', 'account_agreement_records') then
      -- The purge detaches consent rows and account choice records from the booking (the row
      -- itself stays; 20261007300000 added account_agreement_records).
      if tg_op = 'UPDATE' then
        if old.booking_id is not null and new.booking_id is null
           and to_jsonb(new) - 'booking_id' = to_jsonb(old) - 'booking_id' then
          v_booking := old.booking_id;
        end if;
      end if;
    end if;
    if v_booking is not null and app.purge_eligible(v_booking) then
      if tg_op = 'DELETE' then
        return old;
      end if;
      return new;
    end if;
  end if;

  raise exception 'append-only table %.%: % is not permitted',
    tg_table_schema, tg_table_name, tg_op
    using errcode = 'restrict_violation',
          hint = 'Insert a superseding row; never mutate history.';
end $$;

revoke all on function public.tg_append_only() from public;

-- ---------------------------------------------------------------------------
-- (2) purge_unpaid_booking: also detaches the booking's account choice records.
-- ---------------------------------------------------------------------------
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

  select * into v from public.bookings b where b.id = p_booking_id for update;
  if not found or not app.purge_eligible(p_booking_id) then
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
  'D-25/D-45: hard-deletes one eligible unpaid booking (pending, no pay link, no paid/captured payment, no refund/dispute/notification/edit request/review) and writes one non-PII audit_log line. Its consent_log rows and account_agreement_records rows are detached (booking_id -> NULL), never deleted (20261007300000). Returns false when not eligible. EXECUTE: vamos_system, vamos_checkout.';

commit;

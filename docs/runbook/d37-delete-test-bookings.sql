-- d37-delete-test-bookings.sql
--
-- OWNER RUNS THIS. Agents never run it.
-- Phase 26.3, decision D-37: copy every pre-26.3 test booking into schema backup_d37_20261001,
-- then delete them, all in ONE transaction. Run it in the Supabase SQL editor (role postgres).
-- Steps and expected output: docs/runbook/d37-delete-test-bookings.md
--
-- ============================================================================================
-- STEP 0 - PREVIEW. Run ONLY this block first (it changes nothing). Check every row is a test
-- booking, and that no row is newer than the cutoff.
-- ============================================================================================
/*
select b.reference,
       b.status,
       b.created_at,
       coalesce((select sum(p.charged_rappen) from public.booking_payments p
                  where p.booking_id = b.id and p.status = 'succeeded'), 0) as charged_rappen
  from public.bookings b
 where b.created_at < timestamptz '2026-09-29 00:00:00+00'
 order by b.created_at;
*/
-- ============================================================================================
-- STEP 1 - THE SCRIPT. Select everything from "begin;" to "commit;" and run it once.
-- Edit ONLY the two values on the "create temporary table d37_params" line:
--   cutoff   - bookings created before this instant are deleted (last test booking VT-26-0737
--              is 2026-09-28 19:42 UTC, so 2026-09-29 00:00 UTC is safe)
--   expected - how many rows the preview showed. 33 today. If the hourly unpaid purge already
--              removed some unpaid test bookings, use the preview count instead.
-- If the live count differs from `expected`, the script stops and changes nothing.
-- ============================================================================================
begin;

create temporary table d37_params on commit drop as
select timestamptz '2026-09-29 00:00:00+00' as cutoff,
       33::int                              as expected;

create temporary table d37_ids on commit drop as
select b.id
  from public.bookings b, d37_params p
 where b.created_at < p.cutoff;

do $$
declare
  v_found int := (select count(*) from d37_ids);
  v_expected int := (select expected from d37_params);
begin
  if v_found <> v_expected then
    raise exception 'D-37 abort: % bookings before the cutoff, expected %. Nothing was changed.', v_found, v_expected;
  end if;
  raise notice 'D-37: % bookings selected (matches expected)', v_found;
end $$;

-- Foreign-key self-check: every table that points at bookings (or at any booking child listed
-- below) must be in the list. An unlisted table means the schema grew since this script was
-- written, so it aborts rather than half-deleting.
do $$
declare
  v_listed text[] := array[
    'booking_legs','price_snapshots','price_snapshot_legs','booking_payments','booking_refunds',
    'booking_notifications','coupon_redemptions','booking_access_tokens','booking_events',
    'consent_log','booking_edit_requests','reviews','booking_disputes'
  ];
  v_unlisted text;
begin
  select string_agg(distinct c.conrelid::regclass::text, ', ')
    into v_unlisted
    from pg_constraint c
   where c.contype = 'f'
     and c.confrelid in (
           select 'public.bookings'::regclass
           union
           select ('public.' || t)::regclass from unnest(v_listed) t
         )
     and c.conrelid <> 'public.bookings'::regclass
     and c.conrelid not in (select ('public.' || t)::regclass::oid from unnest(v_listed) t);
  if v_unlisted is not null then
    raise exception 'D-37 abort: unlisted table(s) reference bookings or its children: %. Nothing was changed.', v_unlisted;
  end if;
  raise notice 'D-37: foreign-key list is complete';
end $$;

-- Backup copy (before any delete) -------------------------------------------------------------
create schema backup_d37_20261001;

create table backup_d37_20261001.bookings as
  select * from public.bookings where id in (select id from d37_ids);
create table backup_d37_20261001.booking_legs as
  select * from public.booking_legs where booking_id in (select id from d37_ids);
create table backup_d37_20261001.price_snapshots as
  select * from public.price_snapshots where booking_id in (select id from d37_ids);
create table backup_d37_20261001.price_snapshot_legs as
  select * from public.price_snapshot_legs
   where snapshot_id in (select id from public.price_snapshots where booking_id in (select id from d37_ids));
create table backup_d37_20261001.booking_payments as
  select * from public.booking_payments where booking_id in (select id from d37_ids);
create table backup_d37_20261001.booking_refunds as
  select * from public.booking_refunds where booking_id in (select id from d37_ids);
create table backup_d37_20261001.booking_notifications as
  select * from public.booking_notifications where booking_id in (select id from d37_ids);
create table backup_d37_20261001.coupon_redemptions as
  select * from public.coupon_redemptions where booking_id in (select id from d37_ids);
create table backup_d37_20261001.booking_access_tokens as
  select * from public.booking_access_tokens where booking_id in (select id from d37_ids);
create table backup_d37_20261001.booking_events as
  select * from public.booking_events where booking_id in (select id from d37_ids);
create table backup_d37_20261001.consent_log as
  select * from public.consent_log where booking_id in (select id from d37_ids);
create table backup_d37_20261001.booking_edit_requests as
  select * from public.booking_edit_requests where booking_id in (select id from d37_ids);
create table backup_d37_20261001.reviews as
  select * from public.reviews where booking_id in (select id from d37_ids);
create table backup_d37_20261001.booking_disputes as
  select * from public.booking_disputes where booking_id in (select id from d37_ids);
-- Reference only. The originals in audit_log and stripe_events are KEPT (never deleted).
create table backup_d37_20261001.audit_log_ref as
  select * from public.audit_log
   where table_name = 'bookings' and record_id in (select id::text from d37_ids);
create table backup_d37_20261001.stripe_events_ref as
  select * from public.stripe_events
   where object_id in (select stripe_payment_intent_id from backup_d37_20261001.booking_payments
                       union select stripe_checkout_session_id from backup_d37_20261001.booking_payments);

-- Delete ----------------------------------------------------------------------------------------
-- Only the append-only / no-delete triggers on the tables we delete from are switched off, and
-- they are switched back on below, inside this same transaction.
alter table public.booking_events        disable trigger booking_events_append_only;
alter table public.booking_refunds       disable trigger booking_refunds_append_only;
alter table public.booking_notifications disable trigger booking_notifications_no_delete;
alter table public.price_snapshot_legs   disable trigger price_snapshot_legs_append_only;
alter table public.price_snapshots       disable trigger price_snapshots_append_only;
alter table public.consent_log           disable trigger consent_log_append_only;

-- Break the bookings <-> price_snapshots cycle.
update public.bookings set price_snapshot_id = null where id in (select id from d37_ids);
-- Consent rows are evidence: keep them, detached from the booking (the backup keeps the link).
update public.consent_log set booking_id = null where booking_id in (select id from d37_ids);

delete from public.coupon_redemptions   where booking_id in (select id from d37_ids);
delete from public.booking_events       where booking_id in (select id from d37_ids);
delete from public.booking_disputes     where booking_id in (select id from d37_ids);
delete from public.booking_edit_requests where booking_id in (select id from d37_ids);
delete from public.booking_refunds      where booking_id in (select id from d37_ids);
delete from public.booking_notifications where booking_id in (select id from d37_ids);
delete from public.reviews              where booking_id in (select id from d37_ids);
delete from public.booking_payments     where booking_id in (select id from d37_ids);
delete from public.price_snapshot_legs
 where snapshot_id in (select id from public.price_snapshots where booking_id in (select id from d37_ids));
delete from public.price_snapshots      where booking_id in (select id from d37_ids);
delete from public.booking_access_tokens where booking_id in (select id from d37_ids);
delete from public.booking_legs         where booking_id in (select id from d37_ids);
delete from public.bookings             where id in (select id from d37_ids);

alter table public.booking_events        enable trigger booking_events_append_only;
alter table public.booking_refunds       enable trigger booking_refunds_append_only;
alter table public.booking_notifications enable trigger booking_notifications_no_delete;
alter table public.price_snapshot_legs   enable trigger price_snapshot_legs_append_only;
alter table public.price_snapshots       enable trigger price_snapshots_append_only;
alter table public.consent_log           enable trigger consent_log_append_only;

-- Asserts: backups match what was deleted, nothing is left, triggers are back on ------------------
do $$
declare
  v_ids int := (select count(*) from d37_ids);
  v_left int;
  v_off text;
  v_bk_bookings int := (select count(*) from backup_d37_20261001.bookings);
  v_bk_legs int := (select count(*) from backup_d37_20261001.booking_legs);
  v_bk_pay int := (select count(*) from backup_d37_20261001.booking_payments);
begin
  if v_bk_bookings <> v_ids then
    raise exception 'D-37 abort: backup holds % bookings, expected %. Rolled back.', v_bk_bookings, v_ids;
  end if;

  select count(*) into v_left from public.bookings where id in (select id from d37_ids);
  if v_left <> 0 then raise exception 'D-37 abort: % bookings still present. Rolled back.', v_left; end if;

  select (select count(*) from public.booking_legs where booking_id in (select id from d37_ids))
       + (select count(*) from public.price_snapshots where booking_id in (select id from d37_ids))
       + (select count(*) from public.booking_payments where booking_id in (select id from d37_ids))
       + (select count(*) from public.booking_refunds where booking_id in (select id from d37_ids))
       + (select count(*) from public.booking_notifications where booking_id in (select id from d37_ids))
       + (select count(*) from public.coupon_redemptions where booking_id in (select id from d37_ids))
       + (select count(*) from public.booking_access_tokens where booking_id in (select id from d37_ids))
       + (select count(*) from public.booking_events where booking_id in (select id from d37_ids))
       + (select count(*) from public.consent_log where booking_id in (select id from d37_ids))
       + (select count(*) from public.booking_edit_requests where booking_id in (select id from d37_ids))
       + (select count(*) from public.reviews where booking_id in (select id from d37_ids))
       + (select count(*) from public.booking_disputes where booking_id in (select id from d37_ids))
    into v_left;
  if v_left <> 0 then raise exception 'D-37 abort: % child rows still present. Rolled back.', v_left; end if;

  select string_agg(tgname, ', ') into v_off
    from pg_trigger
   where tgname in ('booking_events_append_only','booking_refunds_append_only',
                    'booking_notifications_no_delete','price_snapshot_legs_append_only',
                    'price_snapshots_append_only','consent_log_append_only')
     and tgenabled = 'D';
  if v_off is not null then raise exception 'D-37 abort: trigger(s) still disabled: %. Rolled back.', v_off; end if;

  raise notice 'D-37 done: % bookings, % legs, % payments backed up in backup_d37_20261001 and deleted; 0 rows left; triggers re-enabled',
    v_bk_bookings, v_bk_legs, v_bk_pay;
end $$;

commit;

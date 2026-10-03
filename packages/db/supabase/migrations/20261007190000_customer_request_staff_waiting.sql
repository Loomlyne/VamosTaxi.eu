-- 20261007190000_customer_request_staff_waiting.sql
--
-- 26.2 P6 follow-up (quick 261002-p6-followups, item 4; P6 review 2). A customer's time-change request
-- must not end a staff change that is waiting for its difference to be paid.
--
-- Before: booking_edit_request_upsert (20261007150000, P6 review 1) supersedes ANY 'requested' row of the
-- booking. So when the owner had confirmed a dearer change and the customer had the Stripe page for the
-- difference open, the customer's own time request ended it (status 'superseded'): the page stayed open
-- on a request that no longer existed. P1 already has the mirror rule the other way round
-- (booking_staff_change refuses a staff change while a customer request waits: customer-request-waiting,
-- 20261007140000).
--
-- Now: a request by the customer is refused with 'staff-change-waiting' (SQLSTATE P0001, nothing written)
-- while a staff request of the booking is 'requested' AND its extra price record (the difference to be
-- paid, extra_snapshot_id) has not expired (price_snapshots.expires_at > now(), the same clock that makes
-- booking_edit_request_accept raise 'expired'). The customer asks again once the difference is paid
-- (the request is then 'accepted'), the owner withdrew it ('withdrawn') or the page expired. A staff
-- request with no extra price record yet, an expired one, and a staff request that replaces a staff
-- request behave exactly as before.
--
-- The block sits after every earlier refusal of the function (invalid_actor, class-change-staff-only,
-- customer-time-only, not-found, unpaid, snapshot-mismatch), directly before the supersede, so each of
-- those fires in the same situations as before and only a request that would have superseded a waiting
-- staff change is refused now.
--
-- Body = booking_edit_request_upsert of 20261007150000 (lines 1294-1396) copied verbatim, plus that one
-- block. Same signature, SECURITY DEFINER, search_path '', same return columns. The grants are
-- re-stated (public, anon, authenticated revoked; vamos_system granted) because a create or replace
-- keeps the old ACL and this file does not trust what an older replay left behind.
--
-- Safe on real paid bookings: no row is inserted, updated or deleted by this file and there is no
-- backfill; only a function body is replaced. Live holds 0 rows in booking_edit_requests (read
-- 2026-10-02), so no waiting request exists that the new rule could touch. It can run twice: create or
-- replace and revokes/grants that are no-ops the second time.
--
-- Rollback = re-apply the body of booking_edit_request_upsert from 20261007150000 (create or replace)
-- and its comment; nothing else depends on this change.

create or replace function public.booking_edit_request_upsert(
  p_booking_id pg_catalog.uuid,
  p_actor pg_catalog.text,
  p_actor_id pg_catalog.uuid,
  p_payload pg_catalog.jsonb,
  p_quote_snapshot_id pg_catalog.int8
)
returns table (
  request_id pg_catalog.uuid,
  superseded_id pg_catalog.uuid,
  old_extra_session_id pg_catalog.text,
  old_extra_snapshot_id pg_catalog.int8
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_booking public.bookings%rowtype;
  v_prev public.booking_edit_requests%rowtype;
  v_id pg_catalog.uuid;
  v_payload pg_catalog.jsonb;
begin
  if p_actor is distinct from 'customer' and p_actor is distinct from 'staff' then
    raise exception 'invalid_actor' using errcode = 'check_violation';
  end if;

  v_payload := app.edit_payload_object(p_payload);

  if p_actor = 'customer' and v_payload ? 'vehicle_class_slug' then
    raise exception 'class-change-staff-only' using errcode = 'P0001';
  end if;

  -- Review 1: a customer asks for a new time, nothing else (D9).
  if p_actor = 'customer'
     and (not (v_payload ? 'scheduled_local')
          or exists (
            select 1
              from pg_catalog.jsonb_object_keys(v_payload) as k(key)
             where k.key not in ('scheduled_local', 'scheduled_at')
          )) then
    raise exception 'customer-time-only' using errcode = 'P0001';
  end if;

  select b.*
    into v_booking
    from public.bookings as b
   where b.id = p_booking_id
     and b.erased_at is null
     for update;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
      from public.booking_payments as p
     where p.booking_id = v_booking.id
       and p.captured_at is not null
  ) then
    raise exception 'unpaid' using errcode = 'P0001';
  end if;

  -- Review 1: a customer's request is priced at the booking's own total, never at another record's.
  if p_actor = 'customer' and not exists (
    select 1
      from public.price_snapshots as s
      join public.price_snapshots as bound on bound.id = v_booking.price_snapshot_id
     where s.id = p_quote_snapshot_id
       and s.total_rappen = bound.total_rappen
  ) then
    raise exception 'snapshot-mismatch' using errcode = 'P0001';
  end if;

  -- 261002 (P6 review 2): a staff change that waits for its difference to be paid is not ended by a
  -- customer's request; the customer asks again once it is paid, withdrawn or expired (mirror of P1's
  -- customer-request-waiting).
  if p_actor = 'customer' and exists (
    select 1
      from public.booking_edit_requests as r
      join public.price_snapshots as x on x.id = r.extra_snapshot_id
     where r.booking_id = v_booking.id
       and r.actor = 'staff'
       and r.status = 'requested'
       and x.expires_at > pg_catalog.now()
  ) then
    raise exception 'staff-change-waiting' using errcode = 'P0001';
  end if;

  select r.*
    into v_prev
    from public.booking_edit_requests as r
   where r.booking_id = v_booking.id
     and r.status = 'requested'
   for update;

  if found then
    update public.booking_edit_requests
       set status = 'superseded'
     where id = v_prev.id;
  end if;

  insert into public.booking_edit_requests (
    booking_id, actor, actor_id, payload, quote_snapshot_id, status
  ) values (
    v_booking.id, p_actor, p_actor_id, v_payload, p_quote_snapshot_id, 'requested'
  )
  returning id into v_id;

  return query
    select v_id,
           v_prev.id,
           v_prev.extra_session_id,
           v_prev.extra_snapshot_id;
end;
$$;

revoke all on function public.booking_edit_request_upsert(
  pg_catalog.uuid, pg_catalog.text, pg_catalog.uuid, pg_catalog.jsonb, pg_catalog.int8
) from public;
revoke all on function public.booking_edit_request_upsert(
  pg_catalog.uuid, pg_catalog.text, pg_catalog.uuid, pg_catalog.jsonb, pg_catalog.int8
) from anon;
revoke all on function public.booking_edit_request_upsert(
  pg_catalog.uuid, pg_catalog.text, pg_catalog.uuid, pg_catalog.jsonb, pg_catalog.int8
) from authenticated;
grant execute on function public.booking_edit_request_upsert(
  pg_catalog.uuid, pg_catalog.text, pg_catalog.uuid, pg_catalog.jsonb, pg_catalog.int8
) to vamos_system;

comment on function public.booking_edit_request_upsert(
  pg_catalog.uuid, pg_catalog.text, pg_catalog.uuid, pg_catalog.jsonb, pg_catalog.int8
) is
  '08-07 D-73 + 26.2 P1 + P6 review 1 + 261002: insert requested paid-edit (a JSON string payload is stored as its object); supersede previous requested row. Unpaid refused. A customer request: vehicle_class_slug -> class-change-staff-only; any key but scheduled_local / scheduled_at, or no scheduled_local -> customer-time-only; a price record whose total is not the booking''s bound total -> snapshot-mismatch; a staff request that waits with an unexpired extra price record -> staff-change-waiting (nothing written). EXECUTE vamos_system only.';

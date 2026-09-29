-- 20260930210000_system_role_narrow_reads.sql
--
-- Quick 260929-pga (extension). Since 20260827000002_checkout_roles.sql `vamos_system` is a
-- definer-only role: `revoke all on all tables in schema public`, and only the support tables
-- were granted back. Worker code nevertheless read (and in three places wrote) bookings, booking_legs,
-- chauffeurs, booking_payments, price_snapshots, booking_edit_requests, reviews and vehicle_classes
-- directly through asSystem, and every such statement fails with 42501 on live (the 24 h reminder was
-- the first one seen; 20260930200000 fixed it).
--
-- Each function below replaces exactly one of those statements, with the same columns and filters.
-- SECURITY DEFINER, empty search_path, schema-qualified, EXECUTE to vamos_system only. No table grant
-- is added to any role. The callers are in apps/web/lib/db/system-reads.ts.

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------

-- paid-cancel.ts loadCancelMail: first leg of the booking and the assigned driver's e-mail.
create or replace function public.paid_cancel_mail_read(p_booking_id pg_catalog.uuid)
returns table (
  reference pg_catalog.text, locale pg_catalog.text, contact_email pg_catalog.text,
  pickup_text pg_catalog.text, dropoff_text pg_catalog.text, scheduled_local pg_catalog.text,
  assigned_chauffeur_id pg_catalog.uuid, chauffeur_email pg_catalog.text
)
language sql stable security definer set search_path = ''
as $$
  select b.reference, b.locale, b.contact_email::pg_catalog.text,
         l.pickup_text, l.dropoff_text, l.scheduled_local,
         l.assigned_chauffeur_id, c.email::pg_catalog.text
    from public.bookings as b
    join public.booking_legs as l on l.booking_id = b.id
    left join public.chauffeurs as c on c.id = l.assigned_chauffeur_id
   where b.id = p_booking_id
   order by l.leg_seq
   limit 1
$$;

-- paid-cancel.ts loadCapturedPayment and bookings-write.ts (auto_full refund): the captured payment.
create or replace function public.booking_captured_payment(p_booking_id pg_catalog.uuid)
returns table (id pg_catalog.int8, stripe_payment_intent_id pg_catalog.text, charged_rappen pg_catalog.int4)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.stripe_payment_intent_id, p.charged_rappen
    from public.booking_payments as p
   where p.booking_id = p_booking_id
     and p.captured_at is not null
   order by p.id
   limit 1
$$;

-- lock-mail.ts notifyPriceChangedForUnpaid: every pending, non-test, non-erased booking and its locked total.
create or replace function public.price_changed_unpaid_contacts()
returns table (
  id pg_catalog.uuid, contact_email pg_catalog.text, locale pg_catalog.text,
  is_test pg_catalog.bool, locked_rappen pg_catalog.int4
)
language sql stable security definer set search_path = ''
as $$
  select b.id, b.contact_email::pg_catalog.text, b.locale,
         coalesce(b.is_test, false), ps.total_rappen
    from public.bookings as b
    join public.price_snapshots as ps on ps.id = b.price_snapshot_id
   where b.status = 'pending'
     and coalesce(b.is_test, false) = false
     and b.erased_at is null
$$;

-- lock-mail.ts notifyExpiredForBookings: one booking's contact and locked total.
create or replace function public.expired_booking_contact(p_booking_id pg_catalog.uuid)
returns table (
  id pg_catalog.uuid, contact_email pg_catalog.text, locale pg_catalog.text,
  is_test pg_catalog.bool, locked_rappen pg_catalog.int4
)
language sql stable security definer set search_path = ''
as $$
  select b.id, b.contact_email::pg_catalog.text, b.locale,
         coalesce(b.is_test, false), ps.total_rappen
    from public.bookings as b
    join public.price_snapshots as ps on ps.id = b.price_snapshot_id
   where b.id = p_booking_id
   limit 1
$$;

-- must-fix-mail.ts (overlap, paid-after-cancel): first leg of a booking named by id or reference.
create or replace function public.must_fix_trip_read(p_key pg_catalog.text)
returns table (
  reference pg_catalog.text, locale pg_catalog.text, pickup_text pg_catalog.text,
  dropoff_text pg_catalog.text, scheduled_local pg_catalog.text
)
language sql stable security definer set search_path = ''
as $$
  select b.reference, b.locale, l.pickup_text, l.dropoff_text, l.scheduled_local
    from public.bookings as b
    join public.booking_legs as l on l.booking_id = b.id
   where b.erased_at is null
     and (b.id::pg_catalog.text = p_key or b.reference = p_key)
   order by l.leg_seq
   limit 1
$$;

-- voucher.ts: the price policy of the booking's snapshot (extras named in the mail).
create or replace function public.booking_snapshot_policy(p_booking_id pg_catalog.uuid)
returns pg_catalog.jsonb
language sql stable security definer set search_path = ''
as $$
  select ps.policy
    from public.price_snapshots as ps
   where ps.booking_id = p_booking_id
   limit 1
$$;

-- phone-booking.ts loadUnpaid: the booking named by id or reference with first leg, class,
-- snapshot window and latest payment. Empty when not found or erased.
create or replace function public.phone_booking_unpaid_read(p_key pg_catalog.text)
returns table (
  id pg_catalog.uuid, reference pg_catalog.text, status pg_catalog.text,
  contact_name pg_catalog.text, contact_email pg_catalog.text, contact_phone pg_catalog.text,
  locale pg_catalog.text, company_name pg_catalog.text, company_address pg_catalog.text,
  company_vat pg_catalog.text, billing_kind pg_catalog.text, payer_email pg_catalog.text,
  pickup_text pg_catalog.text, dropoff_text pg_catalog.text, scheduled_local pg_catalog.text,
  flight_no pg_catalog.text, class_slug pg_catalog.text, pax pg_catalog.int2, bags pg_catalog.int2,
  charged_rappen pg_catalog.int4, captured_at pg_catalog.timestamptz,
  stripe_checkout_session_id pg_catalog.text, is_test pg_catalog.bool, quote_id pg_catalog.uuid,
  snap_expires_at pg_catalog.timestamptz, snap_total_rappen pg_catalog.int4
)
language sql stable security definer set search_path = ''
as $$
  select b.id, b.reference, b.status::pg_catalog.text,
         b.contact_name, b.contact_email::pg_catalog.text, b.contact_phone,
         b.locale, b.company_name, b.company_address,
         b.company_vat, b.billing_kind::pg_catalog.text, b.payer_email::pg_catalog.text,
         l.pickup_text, l.dropoff_text, l.scheduled_local,
         l.flight_no, vc.slug, l.pax, l.bags,
         p.charged_rappen, p.captured_at,
         p.stripe_checkout_session_id, b.is_test, b.quote_id,
         greatest(s.expires_at, coalesce(b.hold_until, s.expires_at)), s.total_rappen
    from public.bookings as b
    left join public.price_snapshots as s on s.id = b.price_snapshot_id
    left join lateral (
      select leg.pickup_text, leg.dropoff_text, leg.scheduled_local, leg.flight_no,
             leg.pax, leg.bags, leg.vehicle_class_id
        from public.booking_legs as leg
       where leg.booking_id = b.id
       order by leg.leg_seq
       limit 1
    ) as l on true
    left join public.vehicle_classes as vc on vc.id = l.vehicle_class_id
    left join lateral (
      select pay.charged_rappen, pay.captured_at, pay.stripe_checkout_session_id
        from public.booking_payments as pay
       where pay.booking_id = b.id
       order by pay.created_at desc
       limit 1
    ) as p on true
   where b.erased_at is null
     and (b.id::pg_catalog.text = p_key or b.reference = p_key)
   limit 1
$$;

-- api/manage/booking: total and whether a review exists, for the booking a valid token already resolved.
create or replace function public.manage_booking_review_state(p_booking_id pg_catalog.uuid)
returns table (price_total_rappen pg_catalog.int4, review_submitted pg_catalog.bool)
language sql stable security definer set search_path = ''
as $$
  select b.price_total_rappen,
         exists (select 1 from public.reviews as r where r.booking_id = b.id)
    from public.bookings as b
   where b.id = p_booking_id
   limit 1
$$;

-- edit-request.ts: total of the previous extra-fare snapshot.
create or replace function public.edit_request_snapshot_total(p_snapshot_id pg_catalog.int8)
returns pg_catalog.int4
language sql stable security definer set search_path = ''
as $$
  select ps.total_rappen from public.price_snapshots as ps where ps.id = p_snapshot_id
$$;

-- edit-request.ts: who to bill for the extra-fare session.
create or replace function public.edit_request_booking_contact(p_booking_id pg_catalog.uuid)
returns table (reference pg_catalog.text, contact_email pg_catalog.text, locale pg_catalog.text)
language sql stable security definer set search_path = ''
as $$
  select b.reference, b.contact_email::pg_catalog.text, b.locale
    from public.bookings as b
   where b.id = p_booking_id
$$;

-- edit-request.ts: payload of the booking's pending edit request (booking by id or reference).
create or replace function public.edit_request_pending_payload(p_key pg_catalog.text)
returns table (payload pg_catalog.jsonb)
language sql stable security definer set search_path = ''
as $$
  select r.payload
    from public.booking_edit_requests as r
    join public.bookings as b on b.id = r.booking_id
   where r.status = 'requested'
     and b.erased_at is null
     and (b.id::pg_catalog.text = p_key or b.reference = p_key)
   limit 1
$$;

-- edit-request.ts: booking, first leg and driver e-mail for the time-change and flight mails.
create or replace function public.booking_trip_for_mail(p_booking_id pg_catalog.uuid)
returns table (
  booking_id pg_catalog.uuid, reference pg_catalog.text, contact_email pg_catalog.text,
  locale pg_catalog.text, pickup_text pg_catalog.text, dropoff_text pg_catalog.text,
  scheduled_local pg_catalog.text, booking_leg_id pg_catalog.text, chauffeur_email pg_catalog.text
)
language sql stable security definer set search_path = ''
as $$
  select b.id, b.reference, b.contact_email::pg_catalog.text, b.locale,
         l.pickup_text, l.dropoff_text, l.scheduled_local, l.id::pg_catalog.text,
         ch.email::pg_catalog.text
    from public.bookings as b
    join public.booking_legs as l on l.booking_id = b.id and l.leg_seq = 1
    left join public.chauffeurs as ch on ch.id = l.assigned_chauffeur_id
   where b.id = p_booking_id
   limit 1
$$;

-- edit-request.ts staffExtraPayUrl: the open extra-fare session of a booking's requested edit.
create or replace function public.edit_request_extra_session(p_key pg_catalog.text)
returns table (booking_id pg_catalog.uuid, extra_session_id pg_catalog.text)
language sql stable security definer set search_path = ''
as $$
  select b.id, r.extra_session_id
    from public.bookings as b
    left join lateral (
      select er.extra_session_id
        from public.booking_edit_requests as er
       where er.booking_id = b.id and er.status = 'requested'
       order by er.created_at desc
       limit 1
    ) as r on true
   where b.erased_at is null
     and (b.id::pg_catalog.text = p_key or b.reference = p_key)
   limit 1
$$;

-- ---------------------------------------------------------------------------
-- Writes (each is the one statement the caller issued, nothing wider)
-- ---------------------------------------------------------------------------

-- paid-cancel.ts setRefundProcessing.
create or replace function public.booking_refund_processing_mark(p_booking_id pg_catalog.uuid)
returns void
language sql volatile security definer set search_path = ''
as $$
  update public.bookings
     set refund_status = 'processing', updated_at = pg_catalog.now()
   where id = p_booking_id
$$;

-- edit-request.ts refuseEditRequest: supersede the booking's pending edit request. Empty when the
-- booking or a pending request is missing.
create or replace function public.edit_request_refuse(p_key pg_catalog.text)
returns table (booking_id pg_catalog.uuid, request_id pg_catalog.uuid)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_booking pg_catalog.uuid;
  v_request pg_catalog.uuid;
begin
  select b.id into v_booking
    from public.bookings as b
   where b.erased_at is null
     and (b.id::pg_catalog.text = p_key or b.reference = p_key)
   limit 1;
  if v_booking is null then
    return;
  end if;
  select r.id into v_request
    from public.booking_edit_requests as r
   where r.booking_id = v_booking and r.status = 'requested'
   limit 1;
  if v_request is null then
    return;
  end if;
  update public.booking_edit_requests
     set status = 'superseded'
   where id = v_request and status = 'requested';
  return query select v_booking, v_request;
end;
$$;

-- edit-request.ts writeFlight: set the flight number on the first leg, write the booking.modified
-- event, return the trip for the mail. Raises P0002 (not-found) when the booking has no leg.
create or replace function public.booking_flight_write(
  p_booking_id pg_catalog.uuid,
  p_flight_no pg_catalog.text,
  p_actor_kind pg_catalog.text,
  p_actor_id pg_catalog.uuid
)
returns table (
  booking_id pg_catalog.uuid, reference pg_catalog.text, contact_email pg_catalog.text,
  locale pg_catalog.text, pickup_text pg_catalog.text, dropoff_text pg_catalog.text,
  scheduled_local pg_catalog.text, booking_leg_id pg_catalog.text, chauffeur_email pg_catalog.text
)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_leg pg_catalog.uuid;
begin
  update public.booking_legs as bl
     set flight_no = p_flight_no
   where bl.booking_id = p_booking_id
     and bl.leg_seq = (select pg_catalog.min(x.leg_seq) from public.booking_legs as x where x.booking_id = p_booking_id)
  returning bl.id into v_leg;
  if v_leg is null then
    raise exception 'not-found' using errcode = 'P0002';
  end if;
  insert into public.booking_events (booking_id, booking_leg_id, kind, actor_kind, actor_id, actor_label, payload)
  values (p_booking_id, v_leg, 'booking.modified', p_actor_kind, p_actor_id, p_actor_kind,
          pg_catalog.jsonb_build_object('flight_no', p_flight_no));
  return query select * from public.booking_trip_for_mail(p_booking_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: vamos_system only
-- ---------------------------------------------------------------------------
do $$
declare
  f pg_catalog.regprocedure;
begin
  foreach f in array array[
    'public.paid_cancel_mail_read(pg_catalog.uuid)',
    'public.booking_captured_payment(pg_catalog.uuid)',
    'public.price_changed_unpaid_contacts()',
    'public.expired_booking_contact(pg_catalog.uuid)',
    'public.must_fix_trip_read(pg_catalog.text)',
    'public.booking_snapshot_policy(pg_catalog.uuid)',
    'public.phone_booking_unpaid_read(pg_catalog.text)',
    'public.manage_booking_review_state(pg_catalog.uuid)',
    'public.edit_request_snapshot_total(pg_catalog.int8)',
    'public.edit_request_booking_contact(pg_catalog.uuid)',
    'public.edit_request_pending_payload(pg_catalog.text)',
    'public.booking_trip_for_mail(pg_catalog.uuid)',
    'public.edit_request_extra_session(pg_catalog.text)',
    'public.booking_refund_processing_mark(pg_catalog.uuid)',
    'public.edit_request_refuse(pg_catalog.text)',
    'public.booking_flight_write(pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.uuid)'
  ]::pg_catalog.regprocedure[]
  loop
    execute pg_catalog.format('revoke all on function %s from public', f);
    execute pg_catalog.format('revoke all on function %s from anon', f);
    execute pg_catalog.format('revoke all on function %s from authenticated', f);
    execute pg_catalog.format('grant execute on function %s to vamos_system', f);
    execute pg_catalog.format(
      'comment on function %s is %L', f,
      '260929-pga: narrow definer replacement for a raw table statement issued through asSystem. EXECUTE: vamos_system only.'
    );
  end loop;
end
$$;

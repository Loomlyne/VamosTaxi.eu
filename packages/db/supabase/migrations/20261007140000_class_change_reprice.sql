-- 20261007140000_class_change_reprice.sql
--
-- 26.2 P1: a class change on a PAID trip is re-priced and works. Plan signed by the owner
-- (.planning/quick/260930-p1-class-change-reprice/PLAN.md, DECISIONS.md D0-D8) and the live
-- refunds-by-hand rule (.planning/decisions/2026-09-30-refunds-by-hand.md: nothing goes to
-- Stripe without the admin's click).
--
--   (1)  app.edit_payload_object        reader fix: a payload passed as a JSON string (the Worker's
--                                       old `${JSON.stringify(x)}::jsonb` writer) is read as the
--                                       object it holds.
--   (2)  booking_edit_apply_payload     create or replace: reads (1); an unknown class is refused
--                                       (was: kept silently); a class change takes the assigned
--                                       driver and car off the trip (D6).
--   (3)  booking_edit_request_upsert    create or replace: stores (1); a customer request cannot
--                                       carry a class (only the admin changes a class).
--   (4)  app.booking_paid_net           everything captured minus every refund.
--   (5)  app.booking_change_settle_credit  after a change: what was paid above the new total is
--                                       "Refund due" (pending_ops, owed); a credit no longer due
--                                       is cleared. Never Stripe.
--   (6)  booking_edit_request_accept    create or replace: difference = new total - (4) (W2);
--                                       cheaper = applied at once + Refund due (refund_due); the
--                                       automatic refund and the typed 24 h line are gone (W3, W4).
--   (7)  app.booking_change_mint_snapshot  the new price record: the NEW class, today's live price
--                                       book, the full lines (fare, extras, coupon, VAT) (W5).
--   (8)  booking_staff_change           the dashboard's class change: rules, (7), a staff request,
--                                       (6). One transaction.
--   (8b) booking_change_withdraw        the admin withdraws a dearer change that waits for payment
--                                       (owner sign-off 2026-10-01); status 'withdrawn' added.
--   (9)  checkout_extra_payment_settle  drop + create (same arguments, more columns): applies a
--                                       request that still waits (or one withdrawn in the same second
--                                       with nothing newer asked); names the driver taken off; a
--                                       difference not paid ends the request (D4); a payment for a
--                                       request that has ended otherwise is recorded, never applied,
--                                       and shows as Refund due.
--   (10) refunds by hand, credit tier   booking_refund_intents accepts tier 'credit' and reason
--                                       'modification_credit'; ops_refund_plan refunds exactly what
--                                       a change left due on a live booking (no percentage);
--                                       app.refund_intents_settle returns a live booking whose
--                                       credit was paid out to refund_status none.
--   (11) booking_change_mail_facts      definer read for the "trip taken off" mail after a payment.
--
-- Safe on real paid bookings: no existing row is rewritten. Three CHECK constraints are widened
-- (existing rows still pass). Every function is SECURITY DEFINER with search_path ''. New public
-- functions: EXECUTE vamos_system only. app.* helpers: no grant (called by the definer functions).
-- Replaced bodies are the newest definitions (20260910175309, 20261005140000), changed only as
-- listed. No CHF amount enters this file.

-- ---------------------------------------------------------------------------
-- (1) app.edit_payload_object
-- ---------------------------------------------------------------------------
create function app.edit_payload_object(p_payload pg_catalog.jsonb)
returns pg_catalog.jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_inner pg_catalog.jsonb;
begin
  if p_payload is null then
    return '{}'::pg_catalog.jsonb;
  end if;
  if pg_catalog.jsonb_typeof(p_payload) = 'string' then
    begin
      v_inner := (p_payload #>> '{}')::pg_catalog.jsonb;
    exception when invalid_text_representation then
      raise exception 'invalid-payload' using errcode = '22023';
    end;
    if pg_catalog.jsonb_typeof(v_inner) = 'object' then
      return v_inner;
    end if;
    raise exception 'invalid-payload' using errcode = '22023';
  end if;
  return p_payload;
end;
$$;

revoke all on function app.edit_payload_object(pg_catalog.jsonb) from public;

comment on function app.edit_payload_object(pg_catalog.jsonb) is
  '26.2 P1: a paid-edit payload as an object. A JSON string holding an object (the Worker''s old double-encoded writer) is unwrapped; anything else that is not an object raises invalid-payload. No grant.';

-- ---------------------------------------------------------------------------
-- (2) booking_edit_apply_payload -- body of 20260910175309, changed: (1), unknown class refused,
--     D6 driver and car taken off when the class changes.
-- ---------------------------------------------------------------------------
create or replace function public.booking_edit_apply_payload(
  p_booking_id pg_catalog.uuid,
  p_quote_snapshot_id pg_catalog.int8,
  p_payload pg_catalog.jsonb,
  p_actor_id pg_catalog.uuid,
  p_actor_kind pg_catalog.text,
  p_actor_label pg_catalog.text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_payload pg_catalog.jsonb;
  v_leg public.booking_legs%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_slug pg_catalog.text;
  v_class_id pg_catalog.uuid;
  v_local pg_catalog.text;
  v_quote public.price_snapshots%rowtype;
  v_prev_class pg_catalog.uuid;
  v_prev_chauffeur pg_catalog.uuid;
  v_prev_vehicle pg_catalog.uuid;
begin
  v_payload := app.edit_payload_object(p_payload);

  select s.*
    into v_quote
    from public.price_snapshots as s
   where s.id = p_quote_snapshot_id;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  if v_quote.booking_id is null then
    update public.price_snapshots
       set booking_id = p_booking_id
     where id = p_quote_snapshot_id
       and booking_id is null;
  elsif v_quote.booking_id is distinct from p_booking_id then
    raise exception 'snapshot-mismatch' using errcode = 'restrict_violation';
  end if;

  update public.bookings
     set contact_name = coalesce(v_payload ->> 'contact_name', contact_name),
         contact_email = coalesce(v_payload ->> 'contact_email', contact_email),
         contact_phone = coalesce(v_payload ->> 'contact_phone', contact_phone),
         note = coalesce(v_payload ->> 'note', note),
         price_snapshot_id = p_quote_snapshot_id,
         updated_at = pg_catalog.now()
   where id = p_booking_id;

  select l.*
    into v_leg
    from public.booking_legs as l
   where l.booking_id = p_booking_id
   order by l.leg_seq
   limit 1
     for update;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  v_prev_class := v_leg.vehicle_class_id;
  v_prev_chauffeur := v_leg.assigned_chauffeur_id;
  v_prev_vehicle := v_leg.assigned_vehicle_id;

  v_slug := nullif(v_payload ->> 'vehicle_class_slug', '');
  v_local := nullif(v_payload ->> 'scheduled_local', '');

  if v_slug is not null then
    select vc.id into v_class_id from public.vehicle_classes as vc where vc.slug = v_slug limit 1;
    -- 26.2 P1: a class the database does not know is refused; it used to keep the old class
    -- without a word, so a change that named a display name did nothing.
    if v_class_id is null then
      raise exception 'unknown-class' using errcode = 'P0001';
    end if;
  end if;

  update public.booking_legs
     set pickup_text = coalesce(nullif(v_payload ->> 'pickup_text', ''), pickup_text),
         dropoff_text = coalesce(nullif(v_payload ->> 'dropoff_text', ''), dropoff_text),
         flight_no = coalesce(nullif(v_payload ->> 'flight_no', ''), flight_no),
         scheduled_local = coalesce(v_local, scheduled_local),
         scheduled_at = case
                          when v_local is null then scheduled_at
                          else (v_local::pg_catalog.timestamp at time zone 'Europe/Zurich')
                        end,
         pax = coalesce((v_payload ->> 'pax')::pg_catalog.int2, pax),
         bags = coalesce((v_payload ->> 'bags')::pg_catalog.int2, bags),
         vehicle_class_id = coalesce(v_class_id, vehicle_class_id),
         updated_at = pg_catalog.now()
   where id = v_leg.id;

  -- D6 (owner, 2026-09-30): the class changed and a driver is on the trip -> the trip goes back to
  -- unassigned (his car is of the old class). Same writes and event as ops_unassign_leg; the
  -- Worker sends the existing "trip taken off" mail.
  if v_class_id is not null and v_class_id is distinct from v_prev_class
     and (v_prev_chauffeur is not null or v_prev_vehicle is not null) then
    update public.booking_legs
       set assigned_chauffeur_id = null,
           assigned_vehicle_id = null,
           status = case
             when status = 'assigned'::public.booking_status then 'confirmed'::public.booking_status
             else status
           end,
           updated_at = pg_catalog.now()
     where id = v_leg.id;

    update public.bookings
       set status = case
             when status = 'assigned'::public.booking_status then 'confirmed'::public.booking_status
             else status
           end,
           updated_at = pg_catalog.now()
     where id = p_booking_id;

    insert into public.booking_events (
      booking_id, booking_leg_id, kind, actor_kind, actor_id, actor_label, payload
    ) values (
      p_booking_id,
      v_leg.id,
      'assignment.cleared',
      p_actor_kind,
      p_actor_id,
      coalesce(p_actor_label, ''),
      pg_catalog.jsonb_build_object(
        'chauffeur_id', v_prev_chauffeur,
        'vehicle_id', v_prev_vehicle,
        'reason', 'class_change'
      )
    );
  end if;

  select l.*
    into v_leg
    from public.booking_legs as l
   where l.id = v_leg.id;

  if v_leg.assigned_vehicle_id is not null then
    select v.*
      into v_vehicle
      from public.vehicles as v
     where v.id = v_leg.assigned_vehicle_id;
    if found and (v_vehicle.seats < v_leg.pax or v_vehicle.bags < v_leg.bags) then
      raise exception 'capacity' using errcode = 'P0001';
    end if;
  end if;

  insert into public.booking_events (
    booking_id, kind, actor_kind, actor_id, actor_label, snapshot_id, payload
  ) values (
    p_booking_id,
    'booking.modified',
    p_actor_kind,
    p_actor_id,
    p_actor_label,
    p_quote_snapshot_id,
    v_payload
  );

  insert into public.booking_events (
    booking_id, kind, actor_kind, actor_id, actor_label, snapshot_id, payload
  ) values (
    p_booking_id,
    'price.repriced',
    p_actor_kind,
    p_actor_id,
    p_actor_label,
    p_quote_snapshot_id,
    pg_catalog.jsonb_build_object('quote_snapshot_id', p_quote_snapshot_id)
  );
end;
$$;

comment on function public.booking_edit_apply_payload(
  pg_catalog.uuid, pg_catalog.int8, pg_catalog.jsonb, pg_catalog.uuid, pg_catalog.text, pg_catalog.text
) is
  '08-07 + 26.2 P1: apply an accepted paid-edit payload (a JSON string payload is read as its object). Does not change booking.status except assigned -> confirmed when a class change takes the driver and car off the trip (D6, event assignment.cleared reason class_change). Unknown class: unknown-class. Overlap (23P01) and capacity raise; the trip is not auto-cancelled (D-75). EXECUTE vamos_system only.';

-- ---------------------------------------------------------------------------
-- (3) booking_edit_request_upsert -- body of 20260910175309, changed: (1); a customer request
--     cannot carry a class.
-- ---------------------------------------------------------------------------
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

comment on function public.booking_edit_request_upsert(
  pg_catalog.uuid, pg_catalog.text, pg_catalog.uuid, pg_catalog.jsonb, pg_catalog.int8
) is
  '08-07 D-73 + 26.2 P1: insert requested paid-edit (a JSON string payload is stored as its object); supersede previous requested row. Unpaid refused. A customer request carrying vehicle_class_slug: class-change-staff-only. EXECUTE vamos_system only.';

-- ---------------------------------------------------------------------------
-- (4) app.booking_paid_net: everything captured minus every refund (the base a change is
--     measured against, owner rule "against everything paid so far, minus refunds").
-- ---------------------------------------------------------------------------
create function app.booking_paid_net(p_booking_id pg_catalog.uuid)
returns pg_catalog.int4
language sql
stable
security definer
set search_path = ''
as $$
  select (
    coalesce((select pg_catalog.sum(p.charged_rappen)
                from public.booking_payments as p
               where p.booking_id = p_booking_id
                 and p.captured_at is not null), 0)
    - coalesce((select pg_catalog.sum(r.refund_rappen)
                  from public.booking_refunds as r
                 where r.booking_id = p_booking_id), 0)
  )::pg_catalog.int4
$$;

revoke all on function app.booking_paid_net(pg_catalog.uuid) from public;

comment on function app.booking_paid_net(pg_catalog.uuid) is
  '26.2 P1: sum of captured charged_rappen minus sum of booking_refunds.refund_rappen for one booking. No grant.';

-- ---------------------------------------------------------------------------
-- (5) app.booking_change_settle_credit: after a change was applied on a live booking. What was
--     paid above the booking's price is due back ("Refund due": pending_ops, owed = refunded +
--     due); a credit that is no longer due is cleared. Never calls Stripe, never raises: while a
--     refund is being sent (processing / failed) it leaves the booking alone.
-- ---------------------------------------------------------------------------
create function app.booking_change_settle_credit(
  p_booking_id pg_catalog.uuid,
  p_actor_id pg_catalog.uuid,
  p_actor_kind pg_catalog.text,
  p_actor_label pg_catalog.text
)
returns pg_catalog.int4
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.bookings%rowtype;
  v_total pg_catalog.int4;
  v_due pg_catalog.int4;
  v_refunded pg_catalog.int4;
  v_owed pg_catalog.int4;
begin
  select b.* into v_b from public.bookings as b where b.id = p_booking_id for update;
  if not found then
    return 0;
  end if;
  if v_b.status in ('cancelled'::public.booking_status, 'partially_cancelled'::public.booking_status,
                    'refunded'::public.booking_status)
     or v_b.refund_status in ('processing', 'failed') then
    return 0;
  end if;

  select s.total_rappen into v_total from public.price_snapshots as s where s.id = v_b.price_snapshot_id;
  if v_total is null then
    return 0;
  end if;

  v_due := greatest(app.booking_paid_net(p_booking_id) - v_total, 0);
  v_refunded := coalesce(v_b.refunded_rappen, 0);

  if v_due > 0 then
    v_owed := v_refunded + v_due;
    if v_b.refund_status is distinct from 'pending_ops' or v_b.refund_owed_rappen is distinct from v_owed then
      update public.bookings
         set refund_status = 'pending_ops',
             refund_owed_rappen = v_owed::public.rappen,
             updated_at = pg_catalog.now()
       where id = p_booking_id;
      insert into public.booking_events (
        booking_id, kind, actor_kind, actor_id, actor_label, payload
      ) values (
        p_booking_id,
        'refund.requested',
        p_actor_kind,
        p_actor_id,
        coalesce(p_actor_label, ''),
        pg_catalog.jsonb_build_object('via', 'change', 'due_rappen', v_due)
      );
    end if;
  elsif v_b.refund_status = 'pending_ops' then
    -- A live booking is pending_ops only through a change credit; the new price used it up.
    update public.bookings
       set refund_status = 'none',
           refund_owed_rappen = case when v_refunded > 0 then v_refunded::public.rappen else null end,
           updated_at = pg_catalog.now()
     where id = p_booking_id;
  end if;

  return v_due;
end;
$$;

revoke all on function app.booking_change_settle_credit(
  pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.text
) from public;

comment on function app.booking_change_settle_credit(
  pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.text
) is
  '26.2 P1: after an applied change on a live booking, paid-net above the bound price total becomes Refund due (refund_status pending_ops, refund_owed_rappen = refunded + due, event refund.requested via change); a pending_ops credit no longer due goes back to none. Cancelled bookings and refunds in flight are left alone. No Stripe. No grant.';

-- ---------------------------------------------------------------------------
-- (6) booking_edit_request_accept -- body of 20260910175309, changed: difference against
--     everything paid minus refunds (W2); a cheaper change is applied at once and leaves Refund
--     due (outcome refund_due, refunds by hand); a refund in flight blocks; an expired
--     difference request is refused.
-- ---------------------------------------------------------------------------
create or replace function public.booking_edit_request_accept(
  p_request_id pg_catalog.uuid,
  p_actor_id pg_catalog.uuid
)
returns table (
  request_id pg_catalog.uuid,
  booking_id pg_catalog.uuid,
  outcome pg_catalog.text,
  difference_rappen pg_catalog.int4,
  extra_snapshot_id pg_catalog.int8,
  extra_session_id pg_catalog.text,
  hours_before pg_catalog.numeric,
  original_payment_id pg_catalog.int8,
  original_intent_id pg_catalog.text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_req public.booking_edit_requests%rowtype;
  v_booking public.bookings%rowtype;
  v_quote public.price_snapshots%rowtype;
  v_pay public.booking_payments%rowtype;
  v_actor_label pg_catalog.text;
  v_hours pg_catalog.numeric(8,2);
  v_diff pg_catalog.int4;
  v_extra pg_catalog.int8;
  v_outcome pg_catalog.text;
begin
  select r.*
    into v_req
    from public.booking_edit_requests as r
   where r.id = p_request_id
     for update;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  if v_req.status is distinct from 'requested' then
    raise exception 'not-requested' using errcode = 'P0001';
  end if;

  select b.*
    into v_booking
    from public.bookings as b
   where b.id = v_req.booking_id
     and b.erased_at is null
     for update;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  if v_booking.refund_status in ('processing', 'failed') then
    raise exception 'refund-open' using errcode = 'P0001';
  end if;

  if v_req.extra_snapshot_id is not null and exists (
    select 1 from public.price_snapshots as x
     where x.id = v_req.extra_snapshot_id and x.expires_at <= pg_catalog.now()
  ) then
    raise exception 'expired' using errcode = 'P0001';
  end if;

  select p.*
    into v_pay
    from public.booking_payments as p
   where p.booking_id = v_booking.id
     and p.captured_at is not null
   order by p.captured_at
   limit 1
     for update;

  if not found then
    raise exception 'unpaid' using errcode = 'P0001';
  end if;

  select s.*
    into v_quote
    from public.price_snapshots as s
   where s.id = v_req.quote_snapshot_id;

  if not found or v_quote.total_rappen is null then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  -- W2: everything paid so far minus refunds, not the first payment.
  v_diff := v_quote.total_rappen - app.booking_paid_net(v_booking.id);

  select coalesce(s.full_name, '')
    into v_actor_label
    from public.staff as s
   where s.user_id = p_actor_id;

  if v_actor_label is null then
    v_actor_label := '';
  end if;

  select coalesce(
           pg_catalog.round(
             (
               pg_catalog.date_part('epoch', pg_catalog.min(l.scheduled_at) - pg_catalog.now())
               / 3600
             )::pg_catalog.numeric,
             2
           ),
           0
         )
    into v_hours
    from public.booking_legs as l
   where l.booking_id = v_booking.id;

  if v_diff > 0 then
    if v_req.extra_snapshot_id is null then
      v_extra := public.booking_edit_mint_extra_snapshot(
        v_booking.id,
        v_req.quote_snapshot_id,
        v_pay.snapshot_id,
        v_diff::public.rappen
      );
      update public.booking_edit_requests
         set extra_snapshot_id = v_extra
       where id = v_req.id;
    else
      v_extra := v_req.extra_snapshot_id;
    end if;
    v_outcome := 'extra_required';
  else
    -- Same price or cheaper: applied now. Cheaper leaves "Refund due"; the admin presses Refund
    -- (refunds by hand, decision 1). Nothing goes to Stripe here.
    perform public.booking_edit_apply_payload(
      v_booking.id,
      v_req.quote_snapshot_id,
      v_req.payload,
      p_actor_id,
      'staff',
      v_actor_label
    );
    update public.booking_edit_requests
       set status = 'accepted',
           accepted_at = pg_catalog.now()
     where id = v_req.id;
    perform app.booking_change_settle_credit(v_booking.id, p_actor_id, 'staff', v_actor_label);
    v_outcome := case when v_diff = 0 then 'applied' else 'refund_due' end;
  end if;

  return query
    select v_req.id,
           v_booking.id,
           v_outcome,
           v_diff,
           coalesce(v_extra, v_req.extra_snapshot_id),
           v_req.extra_session_id,
           v_hours,
           v_pay.id,
           v_pay.stripe_payment_intent_id;
end;
$$;

comment on function public.booking_edit_request_accept(
  pg_catalog.uuid, pg_catalog.uuid
) is
  '08-07 + 26.2 P1: ops accept. difference = new total - (captured - refunds). 0: applied. Higher: extra_required, trip unchanged until the difference is paid. Lower: applied at once, Refund due (refund_status pending_ops) for the admin''s Refund click; outcome refund_due. Refusals: not-found, not-requested, unpaid, refund-open, expired. EXECUTE vamos_system only.';

-- ---------------------------------------------------------------------------
-- (7) app.booking_change_mint_snapshot: the new price record of a change. The NEW class, the
--     live price book the Worker priced with, the full lines it computed (fare, extras at the
--     amount paid, coupon, VAT; the reconcile trigger checks they sum to the total), the
--     booking's policy, coupon, distance and duration, the leg's passengers and bags.
-- ---------------------------------------------------------------------------
create function app.booking_change_mint_snapshot(
  p_booking_id pg_catalog.uuid,
  p_vehicle_class_id pg_catalog.uuid,
  p_rate_version_id pg_catalog.int8,
  p_total_rappen pg_catalog.int4,
  p_lines pg_catalog.jsonb,
  p_engine_version pg_catalog.text,
  p_actor_id pg_catalog.uuid
)
returns pg_catalog.int8
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_src public.price_snapshots%rowtype;
  v_leg public.booking_legs%rowtype;
  v_id pg_catalog.int8;
  v_until pg_catalog.timestamptz := pg_catalog.now() + interval '24 hours';
begin
  select s.*
    into v_src
    from public.bookings as b
    join public.price_snapshots as s on s.id = b.price_snapshot_id
   where b.id = p_booking_id;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  select l.* into v_leg
    from public.booking_legs as l
   where l.booking_id = p_booking_id
   order by l.leg_seq
   limit 1;

  if p_total_rappen is null or p_total_rappen < 0
     or p_lines is null or pg_catalog.jsonb_typeof(p_lines) is distinct from 'array'
     or pg_catalog.jsonb_array_length(p_lines) = 0 then
    raise exception 'invalid-price' using errcode = '22023';
  end if;

  insert into public.price_snapshots (
    booking_id, supersedes_id, quote_id, vehicle_class_id, rate_version_id, rate_version_is_live,
    settings_version_id, engine_version, computed_by, source, currency, display_currency,
    subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
    distance_km, duration_min, pax, bags, coupon_id, coupon_code,
    lines, policy, shown_alternatives, expires_at, quote_lock_expires_at
  ) values (
    p_booking_id,
    v_src.id,
    pg_catalog.gen_random_uuid(),
    p_vehicle_class_id,
    p_rate_version_id,
    true,  -- overwritten by tg_snapshot_rate_version_flag with the truth
    v_src.settings_version_id,
    coalesce(nullif(pg_catalog.btrim(p_engine_version), ''), v_src.engine_version),
    p_actor_id,
    'modification',
    v_src.currency,
    v_src.display_currency,
    p_total_rappen,
    0,
    0,
    p_total_rappen,
    v_src.distance_km,
    v_src.duration_min,
    coalesce(v_leg.pax, v_src.pax),
    coalesce(v_leg.bags, v_src.bags),
    v_src.coupon_id,
    v_src.coupon_code,
    p_lines,
    v_src.policy,
    -- The class totals the customer was shown pin the trip's distance for the next change; they
    -- only hold for the book they were computed with.
    case
      when p_rate_version_id = v_src.rate_version_id then coalesce(v_src.shown_alternatives, '[]'::pg_catalog.jsonb)
      else '[]'::pg_catalog.jsonb
    end,
    v_until,
    v_until
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function app.booking_change_mint_snapshot(
  pg_catalog.uuid, pg_catalog.uuid, pg_catalog.int8, pg_catalog.int4, pg_catalog.jsonb, pg_catalog.text, pg_catalog.uuid
) from public;

comment on function app.booking_change_mint_snapshot(
  pg_catalog.uuid, pg_catalog.uuid, pg_catalog.int8, pg_catalog.int4, pg_catalog.jsonb, pg_catalog.text, pg_catalog.uuid
) is
  '26.2 P1: insert the price record of a change (source modification): new class, given live rate version, given full lines and total (reconcile trigger checks the sum), booking policy, coupon, distance, duration; shown class totals kept only when the rate version is the same; supersedes the bound record. No grant.';

-- ---------------------------------------------------------------------------
-- (8) booking_staff_change: the dashboard's class change (staff-made request, D0-D8).
-- ---------------------------------------------------------------------------
create function public.booking_staff_change(
  p_booking_id pg_catalog.uuid,
  p_actor_id pg_catalog.uuid,
  p_vehicle_class_slug pg_catalog.text,
  p_rate_version_id pg_catalog.int8,
  p_total_rappen pg_catalog.int4,
  p_lines pg_catalog.jsonb,
  p_engine_version pg_catalog.text,
  p_expected_paid_rappen pg_catalog.int4
)
returns table (
  request_id pg_catalog.uuid,
  booking_id pg_catalog.uuid,
  outcome pg_catalog.text,
  difference_rappen pg_catalog.int4,
  new_total_rappen pg_catalog.int4,
  paid_rappen pg_catalog.int4,
  quote_snapshot_id pg_catalog.int8,
  extra_snapshot_id pg_catalog.int8,
  old_extra_session_id pg_catalog.text,
  old_extra_snapshot_id pg_catalog.int8,
  unassigned_chauffeur_id pg_catalog.uuid
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_booking public.bookings%rowtype;
  v_leg public.booking_legs%rowtype;
  v_after public.booking_legs%rowtype;
  v_class public.vehicle_classes%rowtype;
  v_rv_status pg_catalog.text;
  v_paid pg_catalog.int4;
  v_snap pg_catalog.int8;
  v_request pg_catalog.uuid;
  v_old_session pg_catalog.text;
  v_old_extra pg_catalog.int8;
  v_outcome pg_catalog.text;
  v_diff pg_catalog.int4;
  v_extra pg_catalog.int8;
  v_unassigned pg_catalog.uuid;
begin
  select b.*
    into v_booking
    from public.bookings as b
   where b.id = p_booking_id
     and b.erased_at is null
     for update;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  -- Unpaid: no class change; cancel it and make a new trip (plan rule, 08 D-70).
  if not exists (
    select 1 from public.booking_payments as p
     where p.booking_id = v_booking.id and p.captured_at is not null
  ) then
    raise exception 'unpaid' using errcode = 'P0001';
  end if;

  if v_booking.status not in ('paid'::public.booking_status, 'confirmed'::public.booking_status,
                              'assigned'::public.booking_status) then
    raise exception 'not-editable' using errcode = 'P0001';
  end if;

  select l.* into v_leg
    from public.booking_legs as l
   where l.booking_id = v_booking.id
   order by l.leg_seq
   limit 1
     for update;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  -- D8: until the pickup time.
  if (select pg_catalog.min(l.scheduled_at) from public.booking_legs as l where l.booking_id = v_booking.id)
     <= pg_catalog.now() then
    raise exception 'too-late' using errcode = 'P0001';
  end if;

  if v_booking.refund_status in ('processing', 'failed') then
    raise exception 'refund-open' using errcode = 'P0001';
  end if;

  -- Plan rule: a customer's own change request waits -> answer it first (no silent replace).
  if exists (
    select 1 from public.booking_edit_requests as r
     where r.booking_id = v_booking.id and r.status = 'requested' and r.actor = 'customer'
  ) then
    raise exception 'customer-request-waiting' using errcode = 'P0001';
  end if;

  select vc.* into v_class
    from public.vehicle_classes as vc
   where vc.slug = p_vehicle_class_slug
     and vc.active
     and vc.hidden_at is null;

  if not found then
    raise exception 'unknown-class' using errcode = 'P0001';
  end if;

  if v_class.id = v_leg.vehicle_class_id then
    raise exception 'same-class' using errcode = 'P0001';
  end if;

  if v_leg.pax > v_class.passenger_capacity or v_leg.bags > v_class.luggage_capacity then
    raise exception 'class-too-small' using errcode = 'P0001';
  end if;

  -- D3: priced with the price book that is live today; a book replaced between preview and
  -- confirm is refused (the admin looks again).
  select rv.status::pg_catalog.text into v_rv_status
    from public.rate_versions as rv
   where rv.id = p_rate_version_id;

  if v_rv_status is distinct from 'live' then
    raise exception 'price-book-changed' using errcode = 'P0001';
  end if;

  v_paid := app.booking_paid_net(v_booking.id);
  if p_expected_paid_rappen is not null and p_expected_paid_rappen is distinct from v_paid then
    raise exception 'paid-changed' using errcode = 'P0001';
  end if;

  v_snap := app.booking_change_mint_snapshot(
    v_booking.id, v_class.id, p_rate_version_id, p_total_rappen, p_lines, p_engine_version, p_actor_id
  );

  select u.request_id, u.old_extra_session_id, u.old_extra_snapshot_id
    into v_request, v_old_session, v_old_extra
    from public.booking_edit_request_upsert(
      v_booking.id, 'staff', p_actor_id,
      pg_catalog.jsonb_build_object('vehicle_class_slug', v_class.slug),
      v_snap
    ) as u;

  select a.outcome, a.difference_rappen, a.extra_snapshot_id
    into v_outcome, v_diff, v_extra
    from public.booking_edit_request_accept(v_request, p_actor_id) as a;

  select l.* into v_after from public.booking_legs as l where l.id = v_leg.id;
  if v_leg.assigned_chauffeur_id is not null and v_after.assigned_chauffeur_id is null then
    v_unassigned := v_leg.assigned_chauffeur_id;
  end if;

  return query
    select v_request,
           v_booking.id,
           v_outcome,
           v_diff,
           p_total_rappen,
           v_paid,
           v_snap,
           v_extra,
           v_old_session,
           v_old_extra,
           v_unassigned;
end;
$$;

revoke all on function public.booking_staff_change(
  pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.int8, pg_catalog.int4,
  pg_catalog.jsonb, pg_catalog.text, pg_catalog.int4
) from public;

grant execute on function public.booking_staff_change(
  pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.int8, pg_catalog.int4,
  pg_catalog.jsonb, pg_catalog.text, pg_catalog.int4
) to vamos_system;

comment on function public.booking_staff_change(
  pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.int8, pg_catalog.int4,
  pg_catalog.jsonb, pg_catalog.text, pg_catalog.int4
) is
  '26.2 P1: the admin''s class change on a paid trip. Checks (paid, confirmed/assigned, before pickup, no refund in flight, no waiting customer request, class known/active/not hidden/different/large enough, rate version live, paid-net as previewed), writes the new price record, a staff request {vehicle_class_slug} and accepts it: applied (same price), refund_due (cheaper, Refund due) or extra_required (dearer, the trip waits for the difference). Refusals: not-found, unpaid, not-editable, too-late, refund-open, customer-request-waiting, unknown-class, same-class, class-too-small, price-book-changed, paid-changed, invalid-price. Returns the driver taken off when the change applied at once. EXECUTE vamos_system only.';

-- ---------------------------------------------------------------------------
-- (8b) Withdraw (owner sign-off 2026-10-01): the admin ends a dearer change that waits for the
--      customer's payment. The Worker closes the Stripe page first; this ends the request
--      (status withdrawn). The booking is not touched. booking_edit_requests.status gains
--      'withdrawn' (existing rows still pass the widened check).
-- ---------------------------------------------------------------------------
alter table public.booking_edit_requests
  drop constraint if exists booking_edit_requests_status_check;
alter table public.booking_edit_requests
  add constraint booking_edit_requests_status_check
  check (status in ('requested', 'accepted', 'superseded', 'withdrawn'));

create function public.booking_change_withdraw(
  p_booking_id pg_catalog.uuid,
  p_request_id pg_catalog.uuid,
  p_actor_id pg_catalog.uuid
)
returns table (
  request_id pg_catalog.uuid,
  booking_id pg_catalog.uuid,
  extra_session_id pg_catalog.text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_req public.booking_edit_requests%rowtype;
begin
  perform 1 from public.bookings as b where b.id = p_booking_id for update;

  select r.* into v_req
    from public.booking_edit_requests as r
   where r.id = p_request_id
     and r.booking_id = p_booking_id
     for update;

  if not found
     or v_req.status is distinct from 'requested'
     or v_req.actor is distinct from 'staff'
     or v_req.extra_snapshot_id is null then
    raise exception 'nothing-waiting' using errcode = 'P0001';
  end if;

  if v_req.extra_payment_id is not null then
    raise exception 'already-paid' using errcode = 'P0001';
  end if;

  update public.booking_edit_requests
     set status = 'withdrawn'
   where id = v_req.id;

  return query select v_req.id, v_req.booking_id, v_req.extra_session_id;
end;
$$;

revoke all on function public.booking_change_withdraw(pg_catalog.uuid, pg_catalog.uuid, pg_catalog.uuid) from public;

grant execute on function public.booking_change_withdraw(pg_catalog.uuid, pg_catalog.uuid, pg_catalog.uuid) to vamos_system;

comment on function public.booking_change_withdraw(pg_catalog.uuid, pg_catalog.uuid, pg_catalog.uuid) is
  '26.2 P1 (owner sign-off 2026-10-01): end the admin''s dearer class change that waits for the customer''s payment (status withdrawn); the booking is untouched; the Worker closes the Stripe page first. Refusals: nothing-waiting, already-paid. A difference paid in the same second is applied by checkout_extra_payment_settle when nothing newer was asked. EXECUTE vamos_system only.';

-- ---------------------------------------------------------------------------
-- (9) checkout_extra_payment_settle -- body of 20260910175309, changed: more columns back;
--     only a request that still waits is applied; the driver taken off is named; a difference
--     not paid ends the request; Refund due is settled after the payment.
-- ---------------------------------------------------------------------------
drop function public.checkout_extra_payment_settle(
  pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text,
  pg_catalog.numeric, pg_catalog.text, pg_catalog.timestamptz, pg_catalog.int8
);

create function public.checkout_extra_payment_settle(
  p_event_id pg_catalog.text,
  p_session_id pg_catalog.text,
  p_payment_intent_id pg_catalog.text,
  p_outcome pg_catalog.text,
  p_charged_currency pg_catalog.text,
  p_fx_rate pg_catalog.numeric,
  p_fx_source pg_catalog.text,
  p_fx_quoted_at pg_catalog.timestamptz,
  p_presentment_amount_minor pg_catalog.int8
)
returns table (
  booking_id pg_catalog.uuid,
  reference pg_catalog.text,
  locale pg_catalog.text,
  contact_email pg_catalog.text,
  already_settled pg_catalog.bool,
  request_id pg_catalog.uuid,
  applied pg_catalog.bool,
  class_changed pg_catalog.bool,
  unassigned_chauffeur_id pg_catalog.uuid
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_req public.booking_edit_requests%rowtype;
  v_booking public.bookings%rowtype;
  v_extra public.price_snapshots%rowtype;
  v_pay public.booking_payments%rowtype;
  v_orig pg_catalog.int8;
  v_actor_label pg_catalog.text;
  v_before public.booking_legs%rowtype;
  v_after public.booking_legs%rowtype;
  v_applied pg_catalog.bool := false;
  v_class_changed pg_catalog.bool := false;
  v_unassigned pg_catalog.uuid;
begin
  if p_outcome is distinct from 'succeeded'
     and p_outcome is distinct from 'failed'
     and p_outcome is distinct from 'canceled' then
    raise exception 'invalid_outcome' using errcode = 'check_violation';
  end if;

  if p_session_id is null or pg_catalog.btrim(p_session_id) = '' then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;

  select r.*
    into v_req
    from public.booking_edit_requests as r
   where r.extra_session_id = p_session_id
   for update;

  if not found then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;

  select b.*
    into v_booking
    from public.bookings as b
   where b.id = v_req.booking_id
     for update;

  if v_req.extra_payment_id is not null then
    select p.*
      into v_pay
      from public.booking_payments as p
     where p.id = v_req.extra_payment_id
       for update;
    if v_pay.status = 'succeeded' and p_outcome = 'succeeded' then
      update public.stripe_events
         set processed_at = pg_catalog.now()
       where id = p_event_id;
      return query
        select v_booking.id,
               v_booking.reference,
               v_booking.locale,
               v_booking.contact_email::pg_catalog.text,
               true,
               v_req.id,
               false,
               false,
               null::pg_catalog.uuid;
      return;
    end if;
  end if;

  if p_outcome is distinct from 'succeeded' then
    insert into public.booking_events (
      booking_id, kind, actor_kind, actor_label, payload
    ) values (
      v_booking.id,
      'payment.failed',
      'stripe',
      'Stripe webhook',
      pg_catalog.jsonb_build_object('kind', 'extra', 'extra_id', v_req.id)
    );
    -- D4: the difference was not paid (the page expired or the payment failed): the request
    -- ends; the booking is untouched; the admin can start again.
    if v_req.status = 'requested' then
      update public.booking_edit_requests
         set status = 'superseded'
       where id = v_req.id;
    end if;
    update public.stripe_events
       set processed_at = pg_catalog.now()
     where id = p_event_id;
    return query
      select v_booking.id,
             v_booking.reference,
             v_booking.locale,
             v_booking.contact_email::pg_catalog.text,
             false,
             v_req.id,
             false,
             false,
             null::pg_catalog.uuid;
    return;
  end if;

  select s.*
    into v_extra
    from public.price_snapshots as s
   where s.id = v_req.extra_snapshot_id;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  v_orig := v_booking.price_snapshot_id;

  -- Charge gate requires bookings.price_snapshot_id = extra snapshot. Restored below: by
  -- apply_payload (the new full price record) or to the original when nothing is applied.
  update public.bookings
     set price_snapshot_id = v_extra.id
   where id = v_booking.id;

  if v_pay.id is null then
    insert into public.booking_payments (
      booking_id,
      snapshot_id,
      stripe_payment_intent_id,
      stripe_checkout_session_id,
      charged_rappen,
      charged_currency,
      status,
      captured_at,
      fx_rate,
      fx_source,
      fx_quoted_at,
      presentment_amount_minor
    ) values (
      v_booking.id,
      v_extra.id,
      coalesce(p_payment_intent_id, p_session_id),
      p_session_id,
      v_extra.total_rappen,
      coalesce(p_charged_currency, 'CHF'),
      'succeeded',
      pg_catalog.now(),
      p_fx_rate,
      p_fx_source,
      p_fx_quoted_at,
      p_presentment_amount_minor
    )
    returning * into v_pay;
  else
    update public.booking_payments
       set status = 'succeeded',
           captured_at = pg_catalog.now(),
           charged_currency = coalesce(p_charged_currency, charged_currency),
           fx_rate = coalesce(p_fx_rate, fx_rate),
           fx_source = coalesce(p_fx_source, fx_source),
           fx_quoted_at = coalesce(p_fx_quoted_at, fx_quoted_at),
           presentment_amount_minor = coalesce(p_presentment_amount_minor, presentment_amount_minor)
     where id = v_pay.id
    returning * into v_pay;
  end if;

  select coalesce(s.full_name, v_req.actor)
    into v_actor_label
    from public.staff as s
   where s.user_id = v_req.actor_id;

  if v_actor_label is null then
    v_actor_label := coalesce(v_req.actor, '');
  end if;

  -- A request that still waits is applied. So is one the admin withdrew when the customer paid
  -- in the same second (owner sign-off 2026-10-01: she gets what she paid for), as long as no
  -- newer change was asked since and the trip still runs.
  if v_req.status = 'requested'
     or (v_req.status = 'withdrawn'
         and v_booking.status not in ('cancelled'::public.booking_status,
                                      'partially_cancelled'::public.booking_status,
                                      'refunded'::public.booking_status)
         -- nothing newer: no other change waits, and the booking is still bound to the price
         -- record this change was built on (no other change was applied since)
         and not exists (
           select 1 from public.booking_edit_requests as x
            where x.booking_id = v_req.booking_id
              and x.id <> v_req.id
              and x.status = 'requested'
         )
         and v_orig is not distinct from (
           select q.supersedes_id from public.price_snapshots as q where q.id = v_req.quote_snapshot_id
         )) then
    select l.* into v_before
      from public.booking_legs as l
     where l.booking_id = v_booking.id
     order by l.leg_seq
     limit 1;

    perform public.booking_edit_apply_payload(
      v_booking.id,
      v_req.quote_snapshot_id,
      v_req.payload,
      v_req.actor_id,
      case when v_req.actor = 'staff' then 'staff' else 'customer' end,
      v_actor_label
    );

    select l.* into v_after from public.booking_legs as l where l.id = v_before.id;
    v_applied := true;
    v_class_changed := v_after.vehicle_class_id is distinct from v_before.vehicle_class_id;
    if v_before.assigned_chauffeur_id is not null and v_after.assigned_chauffeur_id is null then
      v_unassigned := v_before.assigned_chauffeur_id;
    end if;

    update public.booking_edit_requests
       set status = 'accepted',
           accepted_at = pg_catalog.now(),
           extra_payment_id = v_pay.id
     where id = v_req.id;
  else
    -- The request had ended (replaced by a newer change, its time ran out, or withdrawn and
    -- overtaken by a newer change) before this payment arrived. The money is recorded; the trip
    -- is not changed; what was paid above the price shows as Refund due for the admin.
    update public.bookings
       set price_snapshot_id = v_orig
     where id = v_booking.id;
    update public.booking_edit_requests
       set extra_payment_id = v_pay.id
     where id = v_req.id;
  end if;

  perform app.booking_change_settle_credit(v_booking.id, null, 'stripe', 'Stripe webhook');

  -- Booking status is intentionally untouched (no pending->paid->confirmed).

  update public.stripe_events
     set processed_at = pg_catalog.now()
   where id = p_event_id;

  return query
    select v_booking.id,
           v_booking.reference,
           v_booking.locale,
           v_booking.contact_email::pg_catalog.text,
           false,
           v_req.id,
           v_applied,
           v_class_changed,
           v_unassigned;
end;
$$;

revoke all on function public.checkout_extra_payment_settle(
  pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text,
  pg_catalog.numeric, pg_catalog.text, pg_catalog.timestamptz, pg_catalog.int8
) from public;

grant execute on function public.checkout_extra_payment_settle(
  pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text,
  pg_catalog.numeric, pg_catalog.text, pg_catalog.timestamptz, pg_catalog.int8
) to vamos_system;

comment on function public.checkout_extra_payment_settle(
  pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text,
  pg_catalog.numeric, pg_catalog.text, pg_catalog.timestamptz, pg_catalog.int8
) is
  '08-07 D-67/D-69 + 26.2 P1: insert the extra payment against the difference snapshot. A request that still waits is applied (applied, class_changed, unassigned_chauffeur_id returned; D6), so is one withdrawn in the same second when nothing newer was asked and the trip still runs; a request that has ended otherwise is not applied and the overpayment shows as Refund due. Not paid (failed / canceled / expired): the request ends (D4), the booking is untouched. Never rewinds confirmed to pending. EXECUTE vamos_system only.';

-- ---------------------------------------------------------------------------
-- (10) Refunds by hand, credit tier
-- ---------------------------------------------------------------------------
alter table public.booking_refund_intents
  drop constraint if exists booking_refund_intents_tier_check;
alter table public.booking_refund_intents
  add constraint booking_refund_intents_tier_check check (tier in ('full', 'decided', 'credit'));

alter table public.booking_refund_intents
  drop constraint if exists booking_refund_intents_reason_check;
alter table public.booking_refund_intents
  add constraint booking_refund_intents_reason_check check (reason in
    ('ops_cancel', 'customer_cancel', 'no_driver', 'no_show', 'post_trip', 'modification_credit'));

comment on constraint booking_refund_intents_tier_check on public.booking_refund_intents is
  '20-10 full / decided; 26.2 P1 credit = exactly what a change left due on a live booking.';

-- app.refund_intents_settle -- body of 20261005140000, changed: a credit paid out on a live
-- booking returns it to none (the trip still happens; the refund rows and refunded_rappen stay).
create or replace function app.refund_intents_settle(p_booking_id pg_catalog.uuid)
returns pg_catalog.text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_b public.bookings%rowtype;
  v_open pg_catalog.int4;
  v_failed pg_catalog.int4;
  v_last_tier pg_catalog.text;
  v_last_batch pg_catalog.uuid;
  v_batch_sent pg_catalog.bool;
  v_owed pg_catalog.int4;
  v_refunded pg_catalog.int4;
  v_status pg_catalog.text;
begin
  select b.* into v_b from public.bookings as b where b.id = p_booking_id;

  select pg_catalog.count(*) filter (where i.state in ('intended', 'failed')),
         pg_catalog.count(*) filter (where i.state = 'failed')
    into v_open, v_failed
    from public.booking_refund_intents as i
   where i.booking_id = p_booking_id;

  v_owed := coalesce(v_b.refund_owed_rappen, 0);
  v_refunded := coalesce(v_b.refunded_rappen, 0);

  select i.tier, i.batch_id
    into v_last_tier, v_last_batch
    from public.booking_refund_intents as i
   where i.booking_id = p_booking_id
   order by i.id desc
   limit 1;

  if v_open > 0 then
    v_status := case when v_failed > 0 then 'failed' else 'processing' end;
  elsif v_owed > 0 and v_refunded >= v_owed then
    v_status := case
                  when v_last_tier = 'credit'
                   and v_b.status not in ('cancelled'::public.booking_status,
                                          'partially_cancelled'::public.booking_status,
                                          'refunded'::public.booking_status)
                  then 'none'
                  else 'refunded'
                end;
  else
    if v_last_tier = 'decided' then
      select exists (
        select 1
          from public.booking_refund_intents as i
         where i.booking_id = p_booking_id
           and i.batch_id = v_last_batch
           and i.state = 'sent'
      ) into v_batch_sent;
      if v_batch_sent then
        v_status := 'refunded';
        update public.bookings
           set refund_owed_rappen = v_refunded::public.rappen
         where id = p_booking_id;
      else
        v_status := 'pending_ops';
        update public.bookings
           set refund_owed_rappen = null
         where id = p_booking_id;
      end if;
    elsif v_owed > 0 then
      v_status := 'pending_ops';
    else
      v_status := case when v_refunded > 0 then 'refunded' else v_b.refund_status end;
    end if;
  end if;

  update public.bookings
     set refund_status = v_status,
         updated_at = pg_catalog.now()
   where id = p_booking_id;

  return v_status;
end;
$$;

revoke all on function app.refund_intents_settle(pg_catalog.uuid) from public;

comment on function app.refund_intents_settle(pg_catalog.uuid) is
  '20-10 + 26.2 P1: internal. Sets bookings.refund_status from the open intents, refunded_rappen and refund_owed_rappen; a credit (tier credit) paid out in full on a live booking reads none. No caller outside ops_refund_intent_sent / ops_refund_intent_failed. No grant.';

-- ops_refund_plan -- body of 20261005140000, changed: the credit tier. A live (not cancelled)
-- booking that is pending_ops with more owed than refunded owes what a change left due: the
-- plan sends exactly that (a chosen payment and an exact amount up to what is due, or what is
-- due spread over the payments), never a percentage; reason modification_credit by default.
create or replace function public.ops_refund_plan(
  p_booking_id pg_catalog.uuid,
  p_actor_id pg_catalog.uuid,
  p_payment_id pg_catalog.int8 default null,
  p_percent pg_catalog.numeric default null,
  p_reason pg_catalog.text default null,
  p_resume_only pg_catalog.bool default false,
  p_amount_rappen pg_catalog.int4 default null
)
returns table (
  intent_id pg_catalog.int8,
  payment_id pg_catalog.int8,
  stripe_payment_intent_id pg_catalog.text,
  amount_rappen pg_catalog.int4,
  idempotency_key pg_catalog.text,
  state pg_catalog.text,
  attempts pg_catalog.int4,
  resumed pg_catalog.bool
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_booking public.bookings%rowtype;
  v_reason pg_catalog.text;
  v_open pg_catalog.int4;
  v_captured pg_catalog.int4;
  v_full pg_catalog.bool;
  v_credit pg_catalog.bool;
  v_due_left pg_catalog.int4;
  v_tier pg_catalog.text;
  v_batch pg_catalog.uuid := pg_catalog.gen_random_uuid();
  v_pay public.booking_payments%rowtype;
  v_refunded pg_catalog.int4;
  v_left pg_catalog.int4;
  v_amt pg_catalog.int4;
  v_pct pg_catalog.numeric(5,2);
  v_planned pg_catalog.int4 := 0;
  v_rows pg_catalog.int4 := 0;
  v_any_left pg_catalog.bool := false;
begin
  if p_reason is not null
     and p_reason not in ('ops_cancel', 'customer_cancel', 'no_driver', 'no_show', 'post_trip', 'modification_credit') then
    raise exception 'invalid-reason' using errcode = '22023';
  end if;

  if p_percent is not null and p_amount_rappen is not null then
    raise exception 'invalid-amount' using errcode = '22023',
      detail = 'percent and exact amount are never sent together';
  end if;
  if p_percent is not null and (p_percent <= 0 or p_percent > 100) then
    raise exception 'invalid-amount' using errcode = '22023';
  end if;
  if p_amount_rappen is not null and p_amount_rappen <= 0 then
    raise exception 'invalid-amount' using errcode = '22023';
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

  select pg_catalog.count(*)::pg_catalog.int4
    into v_open
    from public.booking_refund_intents as i
   where i.booking_id = v_booking.id
     and i.state in ('intended', 'failed');

  if v_open > 0 then
    if v_booking.refund_status = 'failed' then
      update public.bookings
         set refund_status = 'processing',
             updated_at = pg_catalog.now()
       where id = v_booking.id;
    end if;
    return query
      select i.id,
             i.payment_id,
             p.stripe_payment_intent_id,
             i.amount_rappen::pg_catalog.int4,
             'refund-intent:' || i.id::pg_catalog.text,
             i.state,
             i.attempts,
             true
        from public.booking_refund_intents as i
        join public.booking_payments as p on p.id = i.payment_id
       where i.booking_id = v_booking.id
         and i.state in ('intended', 'failed')
       order by i.payment_id;
    return;
  end if;

  if p_resume_only then
    raise exception 'nothing-to-retry' using errcode = 'P0001';
  end if;

  select pg_catalog.count(*)::pg_catalog.int4
    into v_captured
    from public.booking_payments as p
   where p.booking_id = v_booking.id
     and p.captured_at is not null;

  if v_captured = 0 then
    raise exception 'not-paid' using errcode = 'P0001';
  end if;

  if p_payment_id is not null and not exists (
    select 1
      from public.booking_payments as p
     where p.id = p_payment_id
       and p.booking_id = v_booking.id
       and p.captured_at is not null
  ) then
    raise exception 'not-paid' using errcode = 'P0001';
  end if;

  if p_amount_rappen is not null and p_payment_id is null and v_captured <> 1 then
    raise exception 'invalid-amount' using errcode = '22023',
      detail = 'an exact amount needs one chosen payment';
  end if;

  -- 26.2 P1 credit: a change on a live booking left an amount due (pending_ops, owed > refunded).
  v_credit := v_booking.refund_status = 'pending_ops'
              and coalesce(v_booking.refund_owed_rappen, 0) > coalesce(v_booking.refunded_rappen, 0)
              and v_booking.status not in ('cancelled'::public.booking_status,
                                           'partially_cancelled'::public.booking_status,
                                           'refunded'::public.booking_status);
  v_due_left := case
                  when v_credit then coalesce(v_booking.refund_owed_rappen, 0) - coalesce(v_booking.refunded_rappen, 0)
                  else 0
                end;

  if v_credit and p_percent is not null then
    raise exception 'invalid-amount' using errcode = '22023',
      detail = 'a refund due from a change is an exact amount';
  end if;

  v_reason := coalesce(p_reason, case when v_credit then 'modification_credit' else 'ops_cancel' end);

  -- Full tier: cancelled more than 24 h ahead, the whole refund is due, 100 % only.
  v_full := not v_credit
            and v_booking.refund_status = 'pending_ops' and coalesce(v_booking.refund_owed_rappen, 0) > 0;
  v_tier := case
              when v_credit then 'credit'
              when v_full or (p_percent is null and p_amount_rappen is null) then 'full'
              else 'decided'
            end;

  for v_pay in
    select p.*
      from public.booking_payments as p
     where p.booking_id = v_booking.id
       and p.captured_at is not null
       and (p_payment_id is null or p.id = p_payment_id)
     order by p.id
       for update
  loop
    select coalesce(pg_catalog.sum(r.refund_rappen), 0)::pg_catalog.int4
      into v_refunded
      from public.booking_refunds as r
     where r.payment_id = v_pay.id;

    v_left := v_pay.charged_rappen - v_refunded;
    if v_left <= 0 then
      continue;
    end if;
    v_any_left := true;

    if v_credit then
      if v_due_left <= 0 then
        continue;
      end if;
      if p_amount_rappen is not null then
        if p_amount_rappen > v_left or p_amount_rappen > v_due_left then
          raise exception 'refund-exceeds-remaining' using errcode = 'P0001';
        end if;
        v_amt := p_amount_rappen;
      else
        v_amt := least(v_left, v_due_left);
      end if;
      v_due_left := v_due_left - v_amt;
    elsif p_amount_rappen is not null then
      if p_amount_rappen > v_left then
        raise exception 'refund-exceeds-remaining' using errcode = 'P0001';
      end if;
      v_amt := p_amount_rappen;
    elsif p_percent is not null then
      v_amt := least(
        v_left,
        pg_catalog.round(v_pay.charged_rappen::pg_catalog.numeric * p_percent / 100)::pg_catalog.int4
      );
    else
      v_amt := v_left;
    end if;

    if v_amt <= 0 then
      continue;
    end if;

    if v_full and v_amt < v_left then
      raise exception 'full-refund-only' using errcode = 'P0001',
        detail = 'cancelled more than 24 h ahead: each payment is refunded in full';
    end if;

    v_pct := case
               when v_credit then
                 pg_catalog.round(v_amt::pg_catalog.numeric * 100 / v_pay.charged_rappen, 2)
               when v_full then null
               when p_percent is not null then p_percent
               when p_amount_rappen is not null then
                 pg_catalog.round(v_amt::pg_catalog.numeric * 100 / v_pay.charged_rappen, 2)
               else null
             end;

    insert into public.booking_refund_intents (
      booking_id, payment_id, batch_id, amount_rappen, reason,
      decided_percent, tier, actor_id
    ) values (
      v_booking.id, v_pay.id, v_batch, v_amt, v_reason,
      v_pct, v_tier, p_actor_id
    );
    v_planned := v_planned + v_amt;
    v_rows := v_rows + 1;
  end loop;

  if v_rows = 0 then
    if v_any_left then
      raise exception 'invalid-amount' using errcode = '22023';
    end if;
    raise exception 'already-refunded' using errcode = 'P0001';
  end if;

  -- Owed never shrinks by planning: a full-tier booking keeps owing 100 % while one payment
  -- is sent first; a decided amount becomes what is owed on top of what already went.
  update public.bookings
     set refund_status = 'processing',
         refund_owed_rappen = greatest(
           coalesce(refund_owed_rappen, 0),
           coalesce(refunded_rappen, 0) + v_planned
         )::public.rappen,
         updated_at = pg_catalog.now()
   where id = v_booking.id;

  return query
    select i.id,
           i.payment_id,
           p.stripe_payment_intent_id,
           i.amount_rappen::pg_catalog.int4,
           'refund-intent:' || i.id::pg_catalog.text,
           i.state,
           i.attempts,
           false
      from public.booking_refund_intents as i
      join public.booking_payments as p on p.id = i.payment_id
     where i.batch_id = v_batch
     order by i.payment_id;
  return;
end;
$$;

comment on function public.ops_refund_plan(
  pg_catalog.uuid, pg_catalog.uuid, pg_catalog.int8, pg_catalog.numeric, pg_catalog.text,
  pg_catalog.bool, pg_catalog.int4
) is
  '20-10 refunds by hand + 26.2 P1 credit tier: plan a refund per captured payment (or one chosen payment) and write it as intended intents; no Stripe call. Open intents are returned as they are (resumed) and nothing new is created. p_percent = percent of each payment''s charged amount, capped at its remainder; p_amount_rappen = exact amount for one payment, capped at its remainder (more: refund-exceeds-remaining); never both (invalid-amount). Full-tier rule: a cancelled booking pending_ops with owed > 0 accepts only 100 % of each remainder (full-refund-only). Credit tier (26.2 P1): a live booking pending_ops with owed > refunded refunds exactly what is due (owed - refunded): no percentage (invalid-amount), an exact amount up to what is due, or what is due spread over the payments; reason modification_credit; tier credit. Sets refund_status processing and owed = greatest(owed, refunded + planned). Refusals: not-found, not-paid, already-refunded, invalid-amount, invalid-reason, nothing-to-retry, refund-exceeds-remaining, full-refund-only. EXECUTE vamos_system only.';

-- ---------------------------------------------------------------------------
-- (11) booking_change_mail_facts: the "trip taken off" mail after a change applied in the
--      Stripe webhook (the system role has no table SELECT). Languages as plain text: the
--      Worker client carries no arrays it did not register.
-- ---------------------------------------------------------------------------
create function public.booking_change_mail_facts(
  p_booking_id pg_catalog.uuid,
  p_chauffeur_id pg_catalog.uuid
)
returns table (
  email pg_catalog.text,
  languages_csv pg_catalog.text,
  reference pg_catalog.text,
  pickup_text pg_catalog.text,
  dropoff_text pg_catalog.text,
  scheduled_local pg_catalog.text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.email::pg_catalog.text,
         pg_catalog.array_to_string(c.languages, ','),
         b.reference,
         l.pickup_text,
         l.dropoff_text,
         l.scheduled_local
    from public.bookings as b
    join public.booking_legs as l on l.booking_id = b.id and l.leg_seq = 1
    join public.chauffeurs as c on c.id = p_chauffeur_id
   where b.id = p_booking_id
   limit 1
$$;

revoke all on function public.booking_change_mail_facts(pg_catalog.uuid, pg_catalog.uuid) from public;

grant execute on function public.booking_change_mail_facts(pg_catalog.uuid, pg_catalog.uuid) to vamos_system;

comment on function public.booking_change_mail_facts(pg_catalog.uuid, pg_catalog.uuid) is
  '26.2 P1: driver e-mail, languages (comma text), booking reference, first leg pickup / drop-off / wall clock for the "trip taken off" mail after a class change. EXECUTE vamos_system only.';

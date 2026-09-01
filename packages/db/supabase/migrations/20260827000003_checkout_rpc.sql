-- 20260827000003_checkout_rpc.sql
--
-- D-01 / D-02 / D-03 (plan 07-02): public.checkout_create_booking is the only writer of a
-- checkout booking. One SECURITY DEFINER transaction covers snapshot, booking, legs,
-- bind, payment attempt, coupon redemption, manage-token row, and timeline.
--
-- Phase 4 seam (inspected 20260825*): public.create_quote_snapshot(...) shipped in
-- 20260825000007_quote_snapshot_rpc.sql as a SECURITY DEFINER helper. This function
-- CALLS that helper for the snapshot + snapshot-legs INSERT rather than duplicating
-- that SQL. 07-RESEARCH.md Pattern 2 (SELECT an unbound snapshot where booking_id is
-- null) is superseded by Phase 4 D-21 — /api/quote writes nothing.
--
-- Token correction vs 07-RESEARCH.md Pattern 2: the Worker mints 32 random bytes and
-- SHA-256-hashes them. This RPC takes p_manage_token_hash bytea (same convention as
-- manage_booking_cancel). It does not call gen_random_bytes and cannot return the
-- raw token — the route already holds it.
--
-- price_snapshot_legs.booking_leg_id is left NULL. …019_append_only.sql fires
-- restrict_violation on any UPDATE of that table (no carve-out). The charge gate
-- does not read booking_leg_id.
--
-- EXECUTE is granted to vamos_checkout only. The Data API roles are not granted:
-- this function's body evaluates next_booking_reference() as the definer, and
-- …010_bookings.sql revoked that function from the publishable-key roles for
-- T-02-13. See 20260827000002_checkout_roles.sql.
--
-- p_charged_rappen is the CHF figure. charged_currency is not an argument: the
-- payment row is always inserted as CHF with a NULL FX quadruple (Adaptive Pricing
-- settles at webhook time; booking_payments_fx_currency_pair enforces that pairing).
--
-- p_manage_token_expires_at is computed by the caller (max(leg.scheduled_at) +
-- settings_versions.manage_link_validity_days). Never hard-coded here.

create function public.checkout_create_booking(
  p_quote_id pg_catalog.uuid,
  p_idempotency_key pg_catalog.text,
  p_contact pg_catalog.jsonb,
  p_locale pg_catalog.text,
  p_display_currency pg_catalog.text,
  p_snapshot pg_catalog.jsonb,
  p_legs pg_catalog.jsonb,
  p_coupon_id pg_catalog.int8,
  p_coupon_code pg_catalog.text,
  p_manage_token_hash pg_catalog.bytea,
  p_manage_token_expires_at pg_catalog.timestamptz,
  p_stripe_payment_intent_id pg_catalog.text,
  p_stripe_checkout_session_id pg_catalog.text,
  p_charged_rappen public.rappen,
  p_actor_customer_id pg_catalog.uuid
)
returns table (
  booking_id pg_catalog.uuid,
  reference pg_catalog.text,
  snapshot_id pg_catalog.int8,
  payment_id pg_catalog.int8,
  replayed pg_catalog.bool
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.bookings%rowtype;
  v_existing_payment_id pg_catalog.int8;
  v_other public.bookings%rowtype;
  v_snapshot_id pg_catalog.int8;
  v_booking_id pg_catalog.uuid;
  v_reference pg_catalog.text;
  v_payment_id pg_catalog.int8;
  v_actor_kind pg_catalog.text;
  v_actor_user_id pg_catalog.uuid;
  v_is_return pg_catalog.bool;
  v_leg record;
begin
  -- 1. Idempotent replay first (U20 / Phase 4 D-57).
  select b.*
    into v_existing
    from public.bookings as b
   where b.idempotency_key = p_idempotency_key;

  if found then
    select bp.id
      into v_existing_payment_id
      from public.booking_payments as bp
     where bp.booking_id = v_existing.id
     order by bp.id
     limit 1;

    return query
      select v_existing.id,
             v_existing.reference,
             v_existing.price_snapshot_id,
             v_existing_payment_id,
             true;
    return;
  end if;

  select b.*
    into v_other
    from public.bookings as b
   where b.quote_id = p_quote_id
     and b.idempotency_key is distinct from p_idempotency_key;

  if found then
    raise exception 'quote_already_booked'
      using errcode = 'restrict_violation';
  end if;

  -- 2. Snapshot via Phase 4 helper (chosen class + snapshot legs).
  --    expires_at is derived inside create_quote_snapshot from
  --    settings_versions.checkout_window_minutes, never from the Worker.
  v_snapshot_id := public.create_quote_snapshot(
    p_quote_id              => p_quote_id,
    p_vehicle_class_id      => (p_snapshot ->> 'vehicle_class_id')::pg_catalog.uuid,
    p_rate_version_id       => (p_snapshot ->> 'rate_version_id')::pg_catalog.int8,
    p_settings_version_id   => (p_snapshot ->> 'settings_version_id')::pg_catalog.int8,
    p_engine_version        => p_snapshot ->> 'engine_version',
    p_lock_exp              => (p_snapshot ->> 'lock_exp')::pg_catalog.timestamptz,
    p_pax                   => (p_snapshot ->> 'pax')::pg_catalog.int2,
    p_bags                  => (p_snapshot ->> 'bags')::pg_catalog.int2,
    p_lines                 => p_snapshot -> 'lines',
    p_policy                => p_snapshot -> 'policy',
    p_shown_alternatives    => coalesce(p_snapshot -> 'shown_alternatives', '[]'::pg_catalog.jsonb),
    p_legs                  => p_legs,
    p_display_currency      => coalesce(
                                 nullif(p_snapshot ->> 'display_currency', ''),
                                 p_display_currency
                               )::public.display_currency,
    p_source                => coalesce(nullif(p_snapshot ->> 'source', ''), 'web'),
    p_subtotal_rappen       => (p_snapshot ->> 'subtotal_rappen')::public.rappen,
    p_surcharges_rappen     => (p_snapshot ->> 'surcharges_rappen')::public.rappen,
    p_discount_rappen       => (p_snapshot ->> 'discount_rappen')::public.rappen,
    p_total_rappen          => (p_snapshot ->> 'total_rappen')::public.rappen,
    p_distance_km           => (p_snapshot ->> 'distance_km')::pg_catalog.numeric,
    p_duration_min          => (p_snapshot ->> 'duration_min')::pg_catalog.int4,
    p_coupon_id             => p_coupon_id,
    p_coupon_code           => p_coupon_code,
    p_booking_id            => null
  );

  v_is_return := pg_catalog.jsonb_array_length(p_legs) > 1;

  -- 3. Booking. status = 'pending' stated explicitly (D-02).
  insert into public.bookings (
    customer_id,
    contact_name,
    contact_email,
    contact_phone,
    idempotency_key,
    quote_id,
    is_return,
    status,
    locale,
    display_currency
  ) values (
    p_actor_customer_id,
    p_contact ->> 'contact_name',
    (p_contact ->> 'contact_email')::extensions.citext,
    coalesce(p_contact ->> 'contact_phone', ''),
    p_idempotency_key,
    p_quote_id,
    v_is_return,
    'pending',
    p_locale,
    p_display_currency::public.display_currency
  )
  returning public.bookings.id, public.bookings.reference
    into v_booking_id, v_reference;

  -- 4. Legs. estimated_duration_minutes is required on the web path (04-API-CONTRACT §10).
  for v_leg in
    select value as elem
      from pg_catalog.jsonb_array_elements(p_legs)
  loop
    insert into public.booking_legs (
      booking_id,
      leg_seq,
      direction,
      pickup_text,
      pickup_place_id,
      pickup_lat,
      pickup_lng,
      dropoff_text,
      dropoff_place_id,
      dropoff_lat,
      dropoff_lng,
      scheduled_at,
      scheduled_local,
      flight_no,
      vehicle_class_id,
      pax,
      bags,
      estimated_duration_minutes,
      status
    ) values (
      v_booking_id,
      (v_leg.elem ->> 'leg_seq')::pg_catalog.int2,
      (v_leg.elem ->> 'direction')::public.leg_direction,
      v_leg.elem ->> 'pickup_text',
      nullif(v_leg.elem ->> 'pickup_place_id', ''),
      (v_leg.elem ->> 'pickup_lat')::pg_catalog.numeric,
      (v_leg.elem ->> 'pickup_lng')::pg_catalog.numeric,
      v_leg.elem ->> 'dropoff_text',
      nullif(v_leg.elem ->> 'dropoff_place_id', ''),
      (v_leg.elem ->> 'dropoff_lat')::pg_catalog.numeric,
      (v_leg.elem ->> 'dropoff_lng')::pg_catalog.numeric,
      (v_leg.elem ->> 'scheduled_at')::pg_catalog.timestamptz,
      v_leg.elem ->> 'scheduled_local',
      nullif(v_leg.elem ->> 'flight_no', ''),
      coalesce(
        nullif(v_leg.elem ->> 'vehicle_class_id', '')::pg_catalog.uuid,
        (p_snapshot ->> 'vehicle_class_id')::pg_catalog.uuid
      ),
      coalesce((v_leg.elem ->> 'pax')::pg_catalog.int2, (p_snapshot ->> 'pax')::pg_catalog.int2),
      coalesce((v_leg.elem ->> 'bags')::pg_catalog.int2, (p_snapshot ->> 'bags')::pg_catalog.int2),
      coalesce(
        (v_leg.elem ->> 'estimated_duration_minutes')::pg_catalog.int4,
        (v_leg.elem ->> 'duration_min')::pg_catalog.int4
      ),
      'pending'
    );
  end loop;

  -- 5. Bind. Both required before the payment INSERT: the charge gate checks
  --    s.booking_id = new.booking_id and new.snapshot_id = bookings.price_snapshot_id.
  update public.price_snapshots
     set booking_id = v_booking_id
   where id = v_snapshot_id
     and booking_id is null;

  update public.bookings
     set price_snapshot_id = v_snapshot_id
   where id = v_booking_id;

  -- 6. Payment attempt. Do not catch restrict_violation — the route's
  --    compensating sessions.expire() depends on the exception propagating.
  insert into public.booking_payments (
    booking_id,
    snapshot_id,
    stripe_payment_intent_id,
    stripe_checkout_session_id,
    charged_rappen,
    charged_currency,
    status
  ) values (
    v_booking_id,
    v_snapshot_id,
    p_stripe_payment_intent_id,
    p_stripe_checkout_session_id,
    p_charged_rappen,
    'CHF',
    'requires_payment'
  )
  returning id into v_payment_id;

  -- 7. Coupon. FOR UPDATE serialisation already lives in tg_coupon_redemption_caps.
  if p_coupon_id is not null then
    insert into public.coupon_redemptions (
      coupon_id,
      booking_id,
      payment_id,
      customer_id
    ) values (
      p_coupon_id,
      v_booking_id,
      v_payment_id,
      p_actor_customer_id
    );
  end if;

  -- 8. Manage token (D-03). Hash only — raw token never reaches Postgres.
  insert into public.booking_access_tokens (
    booking_id,
    purpose,
    token_hash,
    expires_at
  ) values (
    v_booking_id,
    'manage',
    p_manage_token_hash,
    p_manage_token_expires_at
  );

  -- 9. Timeline (DATA-08 / Phase 2 D-17). Application-written, never a trigger.
  --    actor_id is auth.users.id (the column FK). customers.id is not that column;
  --    look up customers.user_id when a customer actor is present.
  if p_actor_customer_id is not null then
    v_actor_kind := 'customer';
    select c.user_id
      into v_actor_user_id
      from public.customers as c
     where c.id = p_actor_customer_id;
  else
    v_actor_kind := 'guest';
    v_actor_user_id := null;
  end if;

  insert into public.booking_events (
    booking_id, kind, actor_kind, actor_id, snapshot_id, payload
  ) values (
    v_booking_id, 'price.quoted', v_actor_kind, v_actor_user_id, v_snapshot_id, '{}'::pg_catalog.jsonb
  );

  insert into public.booking_events (
    booking_id, kind, actor_kind, actor_id, payload
  ) values (
    v_booking_id, 'booking.created', v_actor_kind, v_actor_user_id, '{}'::pg_catalog.jsonb
  );

  insert into public.booking_events (
    booking_id, kind, actor_kind, actor_id, payment_id, payload
  ) values (
    v_booking_id, 'payment.intent_created', v_actor_kind, v_actor_user_id, v_payment_id, '{}'::pg_catalog.jsonb
  );

  -- 10. New ids, replayed = false.
  return query
    select v_booking_id, v_reference, v_snapshot_id, v_payment_id, false;
  return;
end;
$$;

revoke all on function public.checkout_create_booking(
  pg_catalog.uuid,
  pg_catalog.text,
  pg_catalog.jsonb,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.jsonb,
  pg_catalog.jsonb,
  pg_catalog.int8,
  pg_catalog.text,
  pg_catalog.bytea,
  pg_catalog.timestamptz,
  pg_catalog.text,
  pg_catalog.text,
  public.rappen,
  pg_catalog.uuid
) from public;

grant execute on function public.checkout_create_booking(
  pg_catalog.uuid,
  pg_catalog.text,
  pg_catalog.jsonb,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.jsonb,
  pg_catalog.jsonb,
  pg_catalog.int8,
  pg_catalog.text,
  pg_catalog.bytea,
  pg_catalog.timestamptz,
  pg_catalog.text,
  pg_catalog.text,
  public.rappen,
  pg_catalog.uuid
) to vamos_checkout;

comment on function public.checkout_create_booking(
  pg_catalog.uuid,
  pg_catalog.text,
  pg_catalog.jsonb,
  pg_catalog.text,
  pg_catalog.text,
  pg_catalog.jsonb,
  pg_catalog.jsonb,
  pg_catalog.int8,
  pg_catalog.text,
  pg_catalog.bytea,
  pg_catalog.timestamptz,
  pg_catalog.text,
  pg_catalog.text,
  public.rappen,
  pg_catalog.uuid
) is
  'D-01/D-02/D-03 (plan 07-02): the checkout write door. One definer transaction: snapshot (via create_quote_snapshot), pending booking, legs, bind, requires_payment row, coupon redemption, hashed manage token, timeline. EXECUTE: vamos_checkout only.';

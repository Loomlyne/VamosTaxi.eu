-- Phase 31 test brief fixtures. LAB COPY ONLY (p31-refunds, 127.0.0.1 own stack); never live.
-- Six bookings VT-99-31301..31306 = fixtures (a)..(f). Amounts are 1-3 rappen stand-ins, never prices.
-- Runs twice safely: a second run finds VT-99-31301 and changes nothing.
begin;
set local session_replication_role = replica;  -- fixtures only: skip the quote-clock and status triggers
do $$
declare
  f record; b uuid; s bigint; s2 bigint; p bigint; p2 bigint;
  vc uuid := (select id from public.vehicle_classes where slug = 'economy');
  rv bigint := (select id from public.rate_versions where status = 'live' order by id desc limit 1);
  sv bigint := (select id from public.settings_versions order by id desc limit 1);
begin
  if exists (select 1 from public.bookings where reference = 'VT-99-31301') then
    raise notice 'p31 fixtures already there'; return;
  end if;
  for f in select * from (values
      ('a', 'VT-99-31301', 'confirmed', 'none',        0, interval '72 hours'),
      ('b', 'VT-99-31302', 'confirmed', 'none',        0, interval '72 hours'),
      ('c', 'VT-99-31303', 'confirmed', 'none',        0, interval '72 hours'),
      ('d', 'VT-99-31304', 'cancelled', 'pending_ops', 0, interval '72 hours'),
      ('e', 'VT-99-31305', 'cancelled', 'pending_ops', 0, interval '-2 hours'),
      ('f', 'VT-99-31306', 'cancelled', 'refunded',    3, interval '72 hours')
    ) as t(k, ref, st, rs, refunded, at)
  loop
    insert into public.bookings (reference, contact_name, contact_email, status, locale, refund_status, refunded_rappen)
    values (f.ref, 'Lab ' || upper(f.k), 'lab-p31-' || f.k || '@vamos.local', f.st::public.booking_status, 'en', f.rs, f.refunded)
    returning id into b;
    insert into public.booking_legs (booking_id, leg_seq, direction, pickup_text, dropoff_text, scheduled_at,
                                     scheduled_local, original_scheduled_at, vehicle_class_id, status, pax, bags)
    values (b, 1, 'outbound', 'Zurich Airport', 'Zug', now() + f.at,
            to_char((now() + f.at) at time zone 'Europe/Zurich', 'YYYY-MM-DD"T"HH24:MI'), now() + f.at,
            vc, (case when f.st = 'cancelled' then 'cancelled' else 'confirmed' end)::public.booking_status, 2, 1);
    insert into public.price_snapshots (quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
                                        engine_version, pax, bags, lines, policy, subtotal_rappen, surcharges_rappen,
                                        discount_rappen, total_rappen, expires_at, quote_lock_expires_at, booking_id, source,
                                        distance_km, duration_min)
    values (gen_random_uuid(), vc, rv, true, sv, 'quote-engine@p31-lab', 2, 1,
            '[{"seq":1,"leg_seq":1,"code":"distance_fare","kind":"fare","i18n_key":"price.line.transfer","amount_rappen":2},
              {"seq":2,"leg_seq":1,"code":"vat","kind":"vat","i18n_key":"price.line.vat","params":{"vatRateBps":81},"amount_rappen":1}]'::jsonb,
            jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24, 'airport_waiting_minutes', 60,
                               'city_waiting_minutes', 15, 'settings_version_id', sv, 'modification_deadline_hours', 24,
                               'min_advance_minutes', 180, 'policy_doc', 'test', 'extras', '[]'::jsonb),
            3, 0, 0, 3, now() - interval '1 day', now() - interval '1 day', b, 'web', 31.4, 40)
    returning id into s;
    update public.bookings set price_snapshot_id = s, price_total_rappen = 3 where id = b;
    -- (c) has a succeeded payment without a pi_ id; every other fixture has one pi_ payment.
    insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at)
    values (b, s, case when f.k = 'c' then 'lab_nopi_p31_c' else 'pi_lab_p31_' || f.k end, 3, 'succeeded', now() - interval '3 hours')
    returning id into p;
    if f.k = 'b' then  -- (b) second payment: an extra fare paid through an accepted change request
      insert into public.price_snapshots (quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
                                          engine_version, pax, bags, lines, policy, subtotal_rappen, surcharges_rappen,
                                          discount_rappen, total_rappen, expires_at, quote_lock_expires_at, booking_id, source,
                                          distance_km, duration_min)
      select gen_random_uuid(), vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id, engine_version, pax, bags,
             lines, policy, 2, 0, 0, 2, expires_at, quote_lock_expires_at, booking_id, source, distance_km, duration_min
        from public.price_snapshots where id = s
      returning id into s2;
      insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at)
      values (b, s2, 'pi_lab_p31_b_extra', 2, 'succeeded', now() - interval '1 hour')
      returning id into p2;
      insert into public.booking_edit_requests (booking_id, actor, payload, quote_snapshot_id, extra_snapshot_id, status,
                                                extra_payment_id, accepted_at)
      values (b, 'customer', '{}'::jsonb, s2, s2, 'accepted', p2, now() - interval '1 hour');
    end if;
    if f.k = 'f' then  -- (f) the refund Stripe recorded
      insert into public.booking_refunds (booking_id, snapshot_id, payment_id, reason, basis_rappen, refund_percent,
                                          refund_rappen, tier_applied, hours_before, stripe_refund_id)
      values (b, s, p, 'stripe_dashboard', 3, 100, 3, '{}'::jsonb, 72, 're_lab_p31_f');
    end if;
  end loop;
  -- manage link for (a): raw token MTIzNDU2Nzg5Ojs8PT4_QEFCQ0RFRkdISUpLTE1OT1A
  insert into public.booking_access_tokens (booking_id, token_hash, purpose, expires_at)
  select id, decode('fbc974481bd2003e2d7b74f87e5e7ac36b2ef340492ec827703b415c662b5840', 'hex'), 'manage', 'infinity'
    from public.bookings where reference = 'VT-99-31301'
  on conflict do nothing;
end $$;
commit;
select b.reference, b.status, b.refund_status, b.refunded_rappen,
       (select min(l.scheduled_at) > now() from public.booking_legs l where l.booking_id = b.id) as pickup_future,
       (select count(*) from public.booking_payments p where p.booking_id = b.id and p.status = 'succeeded') as payments,
       (select count(*) from public.booking_payments p where p.booking_id = b.id and p.stripe_payment_intent_id like 'pi\_%') as pi_payments,
       (select count(*) from public.booking_refunds r where r.booking_id = b.id) as refunds
  from public.bookings b where b.reference like 'VT-99-313%' order by b.reference;

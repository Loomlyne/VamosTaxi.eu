-- refund_ledger_mirroring.test.sql
--
-- J7 (payments review 2026-10-09). Migration 20261012160000_refund_ledger_mirroring.sql.
--   W6-05  a refund Stripe accepted and later failed: reversal row, refunded_rappen back down, the intent of
--          an app refund reopened for Retry, a dashboard-refunded booking owed again, idempotent, a refund
--          that failed does not count against the cap.
--   W6-06 / W5-15  refund_status becomes refunded only when the booking's refunds reach the booking's
--          captured total over all its payments.
--   W5-05  refunded <= charged per payment for every insert into booking_refunds (trigger).
--   W5-06  the three legacy refund writers are not executable by vamos_system.
--   W6-07 (database half)  stripe_dispute_upsert says whether a dispute is new or changed status.
--   W6-09  staff_erase_unpaid_booking: erases an unpaid booking, refuses a paid one, staff only, and
--          takes the payment locks before the booking lock.
--   W6-16  manage_booking_cancel refuses an unpaid pending booking.
-- Synthetic integer rappen only, rolled back.
begin;
select plan(70);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('lm-class', 3, 3);

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('20261009-0000-4000-a000-000000000001', 'lm-admin@vamostaxi.eu', 'authenticated', 'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.staff (user_id, role, active, accepted_at, full_name)
values ('20261009-0000-4000-a000-000000000001', 'admin', true, now(), 'LM Admin');

-- A booking with one captured payment per element of p_amounts (each on its own snapshot).
create function pg_temp.lm_booking(p_tag text, p_status text, p_amounts int[])
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
  v_snap bigint;
  i int;
begin
  insert into public.bookings (contact_name, contact_email, status)
  values ('LM ' || p_tag, 'lm-' || p_tag || '@vamostaxi.eu', p_status::public.booking_status)
  returning id into v_id;

  insert into public.booking_legs (
    booking_id, leg_seq, direction, pickup_text, dropoff_text,
    scheduled_at, scheduled_local, vehicle_class_id, status
  )
  select v_id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
         now() + interval '72 hours', to_char(now() + interval '72 hours', 'YYYY-MM-DD"T"HH24:MI'),
         vc.id, 'confirmed'
    from public.vehicle_classes vc where vc.slug = 'lm-class';

  set local session_replication_role = replica;
  for i in 1 .. coalesce(array_length(p_amounts, 1), 0) loop
    insert into public.price_snapshots (
      quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
      engine_version, pax, bags, lines, policy,
      subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
      expires_at, quote_lock_expires_at, booking_id
    )
    select gen_random_uuid(), vc.id, rv.id, false, sv.id, 'quote-engine@lm-' || p_tag || '-' || i, 2, 2, '[]'::jsonb,
           jsonb_build_object(
             'cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
             'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
             'settings_version_id', sv.id, 'modification_deadline_hours', 24,
             'min_advance_minutes', 180, 'policy_doc', 'lm'
           ),
           p_amounts[i], 0, 0, p_amounts[i], now() + interval '1 day', now() + interval '1 day', v_id
      from public.vehicle_classes vc
      cross join lateral (select id from public.rate_versions order by id limit 1) rv
      cross join lateral (select id from public.settings_versions order by id limit 1) sv
     where vc.slug = 'lm-class'
    returning id into v_snap;
    if i = 1 then
      update public.bookings set price_snapshot_id = v_snap where id = v_id;
    end if;
    insert into public.booking_payments (
      booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at
    ) values (v_id, v_snap, 'pi_lm_' || p_tag || '_' || i, p_amounts[i], 'succeeded', now());
  end loop;
  set local session_replication_role = origin;
  return v_id;
end;
$$;

create function pg_temp.lm_pay(p_tag text, p_n int) returns bigint language sql as $$
  select id from public.booking_payments where stripe_payment_intent_id = 'pi_lm_' || p_tag || '_' || p_n
$$;
create function pg_temp.lm_b(p_tag text) returns uuid language sql as $$
  select id from public.bookings where contact_email = 'lm-' || p_tag || '@vamostaxi.eu'
$$;

-- ── W6-06 / W5-15: two payments, refund_status follows the booking total ────────────── 8
select pg_temp.lm_booking('multi', 'confirmed', array[10000, 2000]);

select is((select outcome from public.stripe_charge_refunded_record('pi_lm_multi_2', null, 're_lm_m2', 2000, now(), false)),
          'recorded', 'a dashboard refund of the whole difference payment is recorded');
select is((select refund_status from public.bookings where id = pg_temp.lm_b('multi')), 'none',
          'W6-06: refunding the whole 2000 payment of a 12000 booking does not mark the booking refunded');
select is((select refunded_rappen from public.bookings where id = pg_temp.lm_b('multi'))::int, 2000,
          'the booking counter holds the 2000');
select is((select outcome from public.stripe_charge_refunded_record('pi_lm_multi_1', null, 're_lm_m1', 9999, now(), false)),
          'recorded', 'a dashboard refund of 9999 of the 10000 payment is recorded');
select is((select refund_status from public.bookings where id = pg_temp.lm_b('multi')), 'none',
          'W6-06: 11999 of 12000 is not refunded yet');
select throws_ok(
  $$select * from public.stripe_charge_refunded_record('pi_lm_multi_1', null, 're_lm_m1b', 2, now(), false)$$,
  'P0001', 'refund-exceeds-captured',
  'W5-05: a refund that would take one payment above its charge (9999 + 2 > 10000) is refused');
select is((select outcome from public.stripe_charge_refunded_record('pi_lm_multi_1', null, 're_lm_m1c', 1, now(), false)),
          'recorded', 'W5-05: the last rappen up to the charge is accepted');
select is((select refund_status from public.bookings where id = pg_temp.lm_b('multi')), 'refunded',
          'W6-06: 12000 of 12000 marks the booking refunded');

-- ── W5-05: the cap on every insert, whoever writes it ──────────────────────────────────── 4
select pg_temp.lm_booking('cap', 'confirmed', array[5000]);
select throws_ok(
  format($f$insert into public.booking_refunds (booking_id, snapshot_id, payment_id, reason, basis_rappen, refund_percent,
              refund_rappen, tier_applied, hours_before, stripe_refund_id)
            select %L::uuid, p.snapshot_id, p.id, 'ops_cancel', 5000, 100, 5001, '{}'::jsonb, 0, 're_lm_cap1'
              from public.booking_payments p where p.id = %s$f$, pg_temp.lm_b('cap'), pg_temp.lm_pay('cap', 1)),
  'P0001', 'refund-exceeds-captured', 'a refund of 5001 on a 5000 payment is refused');
select throws_ok(
  format($f$insert into public.booking_refunds (booking_id, snapshot_id, payment_id, reason, basis_rappen, refund_percent,
              refund_rappen, tier_applied, hours_before, stripe_refund_id)
            select %L::uuid, p.snapshot_id, p.id, 'ops_cancel', 9000, 100, 5001, '{}'::jsonb, 0, 're_lm_cap2'
              from public.booking_payments p where p.id = %s$f$, pg_temp.lm_b('cap'), pg_temp.lm_pay('cap', 1)),
  'P0001', 'refund-exceeds-captured', 'W5-05: a direct insert above the payment charge (basis lies) is refused by the trigger');
select lives_ok(
  format($f$insert into public.booking_refunds (booking_id, snapshot_id, payment_id, reason, basis_rappen, refund_percent,
              refund_rappen, tier_applied, hours_before, stripe_refund_id)
            select %L::uuid, p.snapshot_id, p.id, 'ops_cancel', 5000, 60, 3000, '{}'::jsonb, 0, 're_lm_cap3'
              from public.booking_payments p where p.id = %s$f$, pg_temp.lm_b('cap'), pg_temp.lm_pay('cap', 1)),
  'a refund within the charge is accepted');
select throws_ok(
  format($f$insert into public.booking_refunds (booking_id, snapshot_id, payment_id, reason, basis_rappen, refund_percent,
              refund_rappen, tier_applied, hours_before, stripe_refund_id)
            select %L::uuid, p.snapshot_id, p.id, 'ops_cancel', 5000, 50, 2001, '{}'::jsonb, 0, 're_lm_cap4'
              from public.booking_payments p where p.id = %s$f$, pg_temp.lm_b('cap'), pg_temp.lm_pay('cap', 1)),
  'P0001', 'refund-exceeds-captured', 'W5-05: 3000 + 2001 > 5000 is refused');

-- ── W6-05: an app refund that Stripe later fails ────────────────────────────────────────── 18
select pg_temp.lm_booking('app', 'confirmed', array[8000]);
create temp table lm_plan as
  select * from public.ops_refund_plan(pg_temp.lm_b('app'), null, null, null, null, false, 3000);
select is((select count(*) from lm_plan)::int, 1, 'fixture: one intent planned for 3000');
select is((select count(*) from public.ops_refund_intent_sent((select intent_id from lm_plan), 're_lm_app1', null, 'CH', null))::int, 1,
          'fixture: the app refund is recorded as sent');
select is((select refunded_rappen from public.bookings where id = pg_temp.lm_b('app'))::int, 3000, 'fixture: refunded_rappen 3000');
select is((select refund_status from public.bookings where id = pg_temp.lm_b('app')), 'refunded', 'fixture: the booking reads refunded');

select throws_ok(
  $$select * from public.stripe_refund_failed_record('re_lm_nope', 'failed', 'x', true, now())$$,
  'P0002', 'app_refund_pending', 'an app-made refund not recorded yet raises app_refund_pending (the consumer retries)');
select is((select outcome from public.stripe_refund_failed_record('re_lm_nope', 'failed', 'x', false, now())), 'unknown',
          'a refund the database never recorded answers unknown (nothing to undo)');
select throws_ok(
  $$select * from public.stripe_refund_failed_record('re_lm_app1', 'succeeded', null, false, now())$$,
  'P0001', 'invalid-status', 'only failed or canceled is accepted');

select is((select outcome from public.stripe_refund_failed_record('re_lm_app1', 'failed', 'insufficient_funds', false, now())), 'reversed',
          'W6-05: a recorded refund that Stripe failed is reversed');
select is((select refunded_rappen from public.bookings where id = pg_temp.lm_b('app'))::int, 0,
          'W6-05: bookings.refunded_rappen is back to 0');
select is((select refund_status from public.bookings where id = pg_temp.lm_b('app')), 'failed',
          'W6-05: the booking shows the refund as failed (not refunded)');
select is((select refund_owed_rappen from public.bookings where id = pg_temp.lm_b('app'))::int, 3000,
          'W6-05: the 3000 is still owed');
select is((select i.state || ':' || i.attempts from public.booking_refund_intents i where i.id = (select intent_id from lm_plan)),
          'failed:1', 'W6-05: the intent is open again (failed, attempts 1) so Retry sends it again');
select ok((select i.last_error like 'stripe:%' from public.booking_refund_intents i where i.id = (select intent_id from lm_plan)),
          'W6-05: its last_error starts with stripe: so the retry uses a new idempotency key');
select is((select count(*) from public.booking_refund_reversals where stripe_refund_id = 're_lm_app1')::int, 1, 'one reversal row');
select is((select alert_pending from public.stripe_refund_failed_record('re_lm_app1', 'failed', 'insufficient_funds', false, now())), true,
          'W6-05: the ops mail is pending until it is recorded (a failed mail is retried)');
select lives_ok($$select public.stripe_refund_failure_alerted('re_lm_app1')$$, 'the ops mail is recorded');
select is((select alert_pending from public.stripe_refund_failed_record('re_lm_app1', 'failed', 'insufficient_funds', false, now())), false,
          'W6-05: after the mail the same event does not mail again');
select is((select count(*) from public.booking_events where booking_id = pg_temp.lm_b('app') and kind = 'refund.failed')::int, 1,
          'one refund.failed event');
select is((select outcome from public.stripe_refund_failed_record('re_lm_app1', 'failed', 'insufficient_funds', false, now())), 'already',
          'W6-05: the same failure again is a no-op (idempotent)');
select is((select count(*) from public.booking_events where booking_id = pg_temp.lm_b('app') and kind = 'refund.failed')::int, 1,
          'no second event');
select is((select count(*) from public.ops_refund_plan(pg_temp.lm_b('app'), null, null, null, null, true, null) where resumed)::int, 1,
          'W6-05: Retry (resume) finds the reopened intent');
select is(app.booking_paid_net(pg_temp.lm_b('app')), 8000, 'a failed refund no longer reduces what the booking has paid');
-- the failed 3000 no longer counts against the cap: 5000 more fits (3000 failed + 5000 would be 8000 only if it counted... it must not)
select lives_ok(
  format($f$insert into public.booking_refunds (booking_id, snapshot_id, payment_id, reason, basis_rappen, refund_percent,
              refund_rappen, tier_applied, hours_before, stripe_refund_id)
            select %L::uuid, p.snapshot_id, p.id, 'ops_cancel', 8000, 100, 8000, '{}'::jsonb, 0, 're_lm_app_full'
              from public.booking_payments p where p.id = %s$f$, pg_temp.lm_b('app'), pg_temp.lm_pay('app', 1)),
  'W6-05: the failed 3000 does not count against the cap: a refund of the full 8000 is accepted');

-- ── W6-05: a dashboard refund (no intent) that closed the booking, then fails ──────────── 6
select pg_temp.lm_booking('dash', 'confirmed', array[5000]);
select is((select outcome from public.stripe_charge_refunded_record('pi_lm_dash_1', null, 're_lm_dash1', 5000, now(), false)),
          'recorded', 'fixture: a full dashboard refund');
select is((select refund_status from public.bookings where id = pg_temp.lm_b('dash')), 'refunded', 'fixture: booking reads refunded');
select is((select outcome from public.stripe_refund_failed_record('re_lm_dash1', 'canceled', 'canceled', false, now())), 'reversed',
          'W6-05: a canceled dashboard refund is reversed');
select is((select refund_status from public.bookings where id = pg_temp.lm_b('dash')), 'pending_ops',
          'W6-05: the booking is no longer refunded: pending_ops');
select is((select refunded_rappen || ':' || refund_owed_rappen from public.bookings where id = pg_temp.lm_b('dash')), '0:5000',
          'W6-05: nothing refunded, 5000 owed again');
select is((select stripe_status from public.booking_refund_reversals where stripe_refund_id = 're_lm_dash1'), 'canceled',
          'the reversal keeps Stripe''s status');

-- ── W5-06: legacy writers closed to the Worker role ───────────────────────────────────────── 3
select ok(not has_function_privilege('vamos_system', 'public.ops_refund_record(uuid,int8,text,uuid,public.rappen,text,public.rappen)', 'EXECUTE'),
          'W5-06: vamos_system cannot execute ops_refund_record');
select ok(not has_function_privilege('vamos_system', 'public.record_booking_refund(uuid,text,text,timestamptz,public.rappen)', 'EXECUTE'),
          'W5-06: vamos_system cannot execute record_booking_refund');
select ok(not has_function_privilege('vamos_system', 'public.booking_edit_refund_record(uuid,text,uuid,public.rappen)', 'EXECUTE'),
          'W5-06: vamos_system cannot execute booking_edit_refund_record');

-- ── grants of the new surface ────────────────────────────────────────────────────────────────── 5
select ok(has_function_privilege('vamos_system', 'public.stripe_refund_failed_record(text,text,text,bool,timestamptz)', 'EXECUTE'),
          'vamos_system can execute stripe_refund_failed_record');
select ok(not has_function_privilege('anon', 'public.stripe_refund_failed_record(text,text,text,bool,timestamptz)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.stripe_refund_failed_record(text,text,text,bool,timestamptz)', 'EXECUTE')
      and not has_function_privilege('vamos_staff', 'public.stripe_refund_failed_record(text,text,text,bool,timestamptz)', 'EXECUTE'),
          'anon, authenticated and vamos_staff cannot execute stripe_refund_failed_record');
select ok(not has_table_privilege('anon', 'public.booking_refund_reversals', 'SELECT')
      and not has_table_privilege('authenticated', 'public.booking_refund_reversals', 'SELECT')
      and has_table_privilege('vamos_staff', 'public.booking_refund_reversals', 'SELECT')
      and not has_table_privilege('vamos_staff', 'public.booking_refund_reversals', 'INSERT'),
          'booking_refund_reversals: staff read only, nobody else');
select throws_ok($$update public.booking_refund_reversals set failure_reason = 'x'$$, '23001', null,
          'booking_refund_reversals is append-only (update of anything but alert_sent_at)');
select throws_ok($$update public.booking_refund_reversals set alert_sent_at = null$$, '23001', null,
          'booking_refund_reversals: alert_sent_at cannot be cleared once set');
select throws_ok($$delete from public.booking_refund_reversals$$, '23001', null,
          'booking_refund_reversals is append-only (delete)');

-- ── W6-07: dispute upsert says when ops still has to be told ─────────────────────────── 9
select pg_temp.lm_booking('disp', 'confirmed', array[5000]);
select is((select alert_pending from public.stripe_dispute_upsert('du_lm_1', 'pi_lm_disp_1', null, 'needs_response', 'fraudulent', 5000, '2026-10-01 10:00+00')), true,
          'W6-07: a new dispute has its ops mail pending');
select is((select reference is not null from public.stripe_dispute_upsert('du_lm_1', 'pi_lm_disp_1', null, 'needs_response', 'fraudulent', 5000, '2026-10-01 10:01+00')), true,
          'the booking reference comes back');
select is((select alert_pending from public.stripe_dispute_upsert('du_lm_1', 'pi_lm_disp_1', null, 'needs_response', 'fraudulent', 5000, '2026-10-01 10:02+00')), true,
          'W6-07: until the mail is recorded, a repeat of the same status still says pending (a failed mail is retried)');
select lives_ok($$select public.stripe_dispute_alerted('du_lm_1', 'needs_response')$$, 'the mail is recorded');
select is((select alert_pending from public.stripe_dispute_upsert('du_lm_1', 'pi_lm_disp_1', null, 'needs_response', 'fraudulent', 5000, '2026-10-01 10:03+00')), false,
          'W6-07: after the mail, the same status is not mailed again');
select is((select alert_pending from public.stripe_dispute_upsert('du_lm_1', 'pi_lm_disp_1', null, 'under_review', 'fraudulent', 5000, '2026-10-01 11:00+00')), true,
          'W6-07: a new status has its mail pending');
select is((select alert_pending || ':' || status from public.stripe_dispute_upsert('du_lm_1', 'pi_lm_disp_1', null, 'needs_response', 'fraudulent', 5000, '2026-10-01 09:00+00')),
          'true:under_review', 'W6-07: an older event changes nothing; the stored status is returned and still pending');
select lives_ok($$select public.stripe_dispute_alerted('du_lm_1', 'needs_response')$$, 'a stale status cannot mark the current one as mailed');
select is((select alert_pending from public.stripe_dispute_upsert('du_lm_1', 'pi_lm_disp_1', null, 'under_review', 'fraudulent', 5000, '2026-10-01 11:01+00')), true,
          'W6-07: marking an older status did not record the current one');

-- ── W6-09: staff erase re-checks the payment under the locks ──────────────────────────────── 8
select pg_temp.lm_booking('unpaid', 'pending', array[]::int[]);
select pg_temp.lm_booking('paidone', 'confirmed', array[5000]);
select throws_ok($$select * from public.staff_erase_unpaid_booking('x')$$, null, null, 'no identity: refused');
set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', '20261009-0000-4000-a000-000000000001', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'admin'))::text, true);
select is((select outcome from public.staff_erase_unpaid_booking(pg_temp.lm_b('paidone')::text)), 'paid',
          'W6-09: a booking with a captured payment is not erased');
select is((select outcome from public.staff_erase_unpaid_booking('VT-NOPE-0')), 'not_found', 'unknown key: not_found');
select is((select outcome from public.staff_erase_unpaid_booking(pg_temp.lm_b('unpaid')::text)), 'erased',
          'W6-09: an unpaid booking is erased');
select is((select outcome from public.staff_erase_unpaid_booking(pg_temp.lm_b('unpaid')::text)), 'not_found',
          'an erased booking is not found again');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select erased_at is null from public.bookings where id = pg_temp.lm_b('paidone')), true, 'the paid booking is untouched');
select ok(
  (select pg_catalog.pg_get_functiondef(p.oid) ~ 'booking_payments(.|\n)*for update(.|\n)*from public\.bookings(.|\n)*for update(.|\n)*captured_at is not null(.|\n)*set erased_at'
     from pg_catalog.pg_proc p where p.oid = 'public.staff_erase_unpaid_booking(text)'::regprocedure),
  'W6-09: the function locks the booking''s payments, then the booking, then re-checks captured payments, then erases');
select ok(not has_function_privilege('anon', 'public.staff_erase_unpaid_booking(text)', 'EXECUTE')
      and has_function_privilege('vamos_staff', 'public.staff_erase_unpaid_booking(text)', 'EXECUTE'),
          'staff_erase_unpaid_booking: vamos_staff only');

-- ── W6-16: guest cancel of an unpaid pending booking is refused ───────────────────────────── 3
select pg_temp.lm_booking('guest', 'pending', array[]::int[]);
insert into public.booking_access_tokens (booking_id, token_hash, expires_at)
values (pg_temp.lm_b('guest'), extensions.digest('lm-guest-token', 'sha256'), now() + interval '1 day');
select throws_ok(
  $$select * from public.manage_booking_cancel(extensions.digest('lm-guest-token', 'sha256'))$$,
  'P0001', 'unpaid_use_hard_delete', 'W6-16: the guest manage cancel refuses an unpaid pending booking');
select is((select status::text from public.bookings where id = pg_temp.lm_b('guest')), 'pending', 'W6-16: the booking stays pending');
select pg_temp.lm_booking('guestpaid', 'confirmed', array[5000]);
insert into public.booking_access_tokens (booking_id, token_hash, expires_at)
values (pg_temp.lm_b('guestpaid'), extensions.digest('lm-guestpaid-token', 'sha256'), now() + interval '1 day');
select lives_ok(
  $$select * from public.manage_booking_cancel(extensions.digest('lm-guestpaid-token', 'sha256'))$$,
  'W6-16: the guest manage cancel of a paid booking still works');

select * from finish();
rollback;

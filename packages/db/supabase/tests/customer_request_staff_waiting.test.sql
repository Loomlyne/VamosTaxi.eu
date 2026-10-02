-- customer_request_staff_waiting.test.sql
--
-- 26.2 P6 follow-up, quick 261002-p6-followups (migration 20261007190000): a customer's time-change
-- request does not end a staff change that waits for its difference to be paid.
--   A  grants and shape: SECURITY DEFINER, search_path empty, EXECUTE vamos_system only.
--   B  refused while a staff change waits: P0001 staff-change-waiting, nothing written (the staff row is
--      still requested with its Stripe page id, no customer row); every earlier refusal still fires first.
--   C  allowed (old behaviour) once the staff change no longer waits: the extra price record expired (also
--      exactly now), the owner withdrew it, the difference was paid (accepted), or the staff request has
--      no extra price record yet.
--   D  unchanged: a staff request still supersedes a staff request; a customer request still supersedes a
--      customer request; unpaid and invalid actor are still refused.
-- Rolled back. Synthetic integer rappen only, never a product CHF.
begin;
select plan(51);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('crw-eco', 4, 4), ('crw-biz', 7, 7);

insert into public.rate_versions (slug, label) values ('crw-rv', 'CRW fixture');
update public.rate_versions set status = 'live' where slug = 'crw-rv';

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('26100019-0000-4000-a000-000000000001', 'crw-admin@vamostaxi.eu', 'authenticated', 'authenticated',
        '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.staff (user_id, role, active, accepted_at, full_name)
values ('26100019-0000-4000-a000-000000000001', 'admin', true, now(), 'CRW Admin');

create temporary table fx (k text primary key, id uuid not null);

-- One Economy booking 48 hours ahead: one leg, one price record (fare and VAT line), total 10, and,
-- when paid, one captured payment.
create function pg_temp.crw_mk(p_key text, p_paid boolean default true)
returns uuid language plpgsql as $$
declare
  v_b uuid;
  v_snap bigint;
begin
  insert into public.bookings (reference, contact_name, contact_email, status, locale)
  values (public.next_booking_reference(), 'CRW ' || p_key, 'crw-' || p_key || '@vamostaxi.eu',
          case when p_paid then 'confirmed' else 'quote' end::public.booking_status, 'de')
  returning id into v_b;

  insert into public.booking_legs (
    booking_id, leg_seq, direction, pickup_text, dropoff_text,
    scheduled_at, scheduled_local, vehicle_class_id, status, pax, bags, estimated_duration_minutes
  )
  select v_b, 1, 'outbound', 'ZRH Airport', 'Zug',
         now() + interval '48 hours', to_char(now() + interval '48 hours', 'YYYY-MM-DD"T"HH24:MI'), vc.id,
         case when p_paid then 'confirmed' else 'quote' end::public.booking_status, 2, 1, 40
    from public.vehicle_classes vc where vc.slug = 'crw-eco';

  if p_paid then
    set local session_replication_role = replica;
    insert into public.price_snapshots (
      quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
      engine_version, pax, bags, lines, policy,
      subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
      expires_at, quote_lock_expires_at, booking_id, source, distance_km, duration_min
    )
    select gen_random_uuid(), vc.id, rv.id, true, sv.id, 'quote-engine@crw', 2, 1,
           jsonb_build_array(
             jsonb_build_object('seq', 1, 'leg_seq', 1, 'code', 'distance_fare', 'kind', 'fare',
                                'i18n_key', 'price.line.transfer', 'amount_rappen', 9),
             jsonb_build_object('seq', 2, 'leg_seq', 1, 'code', 'vat', 'kind', 'vat',
                                'i18n_key', 'price.line.vat', 'params', jsonb_build_object('vatRateBps', 81),
                                'amount_rappen', 1)),
           jsonb_build_object('cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
                              'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
                              'settings_version_id', sv.id, 'modification_deadline_hours', 24,
                              'min_advance_minutes', 180, 'policy_doc', 'test', 'extras', '[]'::jsonb),
           10, 0, 0, 10, now() + interval '1 day', now() + interval '1 day', v_b, 'web', 31.4, 40
      from public.vehicle_classes vc
      cross join lateral (select id from public.rate_versions where slug = 'crw-rv') rv
      cross join lateral (select id from public.settings_versions order by id limit 1) sv
     where vc.slug = 'crw-eco'
    returning id into v_snap;
    update public.bookings set price_snapshot_id = v_snap where id = v_b;
    insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at)
    values (v_b, v_snap, 'pi_crw_' || p_key, 10, 'succeeded', now());
    set local session_replication_role = origin;
  end if;

  insert into pg_temp.fx values (p_key, v_b);
  return v_b;
end $$;

select pg_temp.crw_mk('wait');
select pg_temp.crw_mk('exp');
select pg_temp.crw_mk('edge');
select pg_temp.crw_mk('wd');
select pg_temp.crw_mk('pay');
select pg_temp.crw_mk('noextra');
select pg_temp.crw_mk('two');
select pg_temp.crw_mk('cust');
select pg_temp.crw_mk('unpaid', false);

create function pg_temp.crw_lines(p_total int) returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('seq', 1, 'leg_seq', 1, 'code', 'distance_fare', 'kind', 'fare',
                       'i18n_key', 'price.line.transfer', 'params', jsonb_build_object('vehicleClass', 'x'),
                       'amount_rappen', p_total - 1),
    jsonb_build_object('seq', 2, 'leg_seq', 1, 'code', 'vat', 'kind', 'vat',
                       'i18n_key', 'price.line.vat', 'params', jsonb_build_object('vatRateBps', 81),
                       'amount_rappen', 1))
$$;

-- The owner confirms a dearer class change (Economy -> Business at p_total, paid 10): a staff request
-- waits for the difference, with its extra price record.
create function pg_temp.crw_staff_change(p_key text, p_total int)
returns table (request_id uuid, booking_id uuid, outcome text, difference_rappen int, new_total_rappen int,
               paid_rappen int, quote_snapshot_id bigint, extra_snapshot_id bigint, old_extra_session_id text,
               old_extra_snapshot_id bigint, unassigned_chauffeur_id uuid)
language sql as $$
  select * from public.booking_staff_change(
    (select f.id from pg_temp.fx as f where f.k = p_key),
    '26100019-0000-4000-a000-000000000001'::uuid,
    'crw-biz',
    (select rv.id from public.rate_versions as rv where rv.slug = 'crw-rv'),
    p_total,
    pg_temp.crw_lines(p_total),
    'quote-engine@crw-test',
    null
  )
$$;

-- The customer asks for a new time, priced at the booking's own bound record (what the route sends).
create function pg_temp.crw_customer(p_key text)
returns table (request_id uuid, superseded_id uuid, old_extra_session_id text, old_extra_snapshot_id bigint)
language sql as $$
  select * from public.booking_edit_request_upsert(
    (select f.id from pg_temp.fx as f where f.k = p_key), 'customer', null,
    '{"scheduled_local":"2030-01-01T10:00"}'::jsonb,
    (select b.price_snapshot_id from public.bookings as b where b.id = (select f.id from pg_temp.fx as f where f.k = p_key)))
$$;

-- The extra price record of a staff request ends at p_when (price_snapshots is append-only: the test
-- lifts the trigger for this one update, as pay_link_lines.test.sql does).
create function pg_temp.crw_expire_extra(p_request uuid, p_when timestamptz)
returns void language plpgsql as $$
begin
  alter table public.price_snapshots disable trigger price_snapshots_append_only;
  update public.price_snapshots
     set expires_at = p_when,
         quote_lock_expires_at = p_when
   where id = (select r.extra_snapshot_id from public.booking_edit_requests as r where r.id = p_request);
  alter table public.price_snapshots enable trigger price_snapshots_append_only;
end $$;

-- ---------------------------------------------------------------------------
-- A. Grants and shape
-- ---------------------------------------------------------------------------
select has_function('public', 'booking_edit_request_upsert', '{uuid,text,uuid,jsonb,int8}'::text[],
  'booking_edit_request_upsert exists');
select function_privs_are('public', 'booking_edit_request_upsert', '{uuid,text,uuid,jsonb,int8}'::text[],
  'vamos_system', '{EXECUTE}'::text[], 'upsert: vamos_system holds EXECUTE');
select function_privs_are('public', 'booking_edit_request_upsert', '{uuid,text,uuid,jsonb,int8}'::text[],
  'anon', '{}'::text[], 'upsert: anon holds no EXECUTE');
select function_privs_are('public', 'booking_edit_request_upsert', '{uuid,text,uuid,jsonb,int8}'::text[],
  'authenticated', '{}'::text[], 'upsert: authenticated holds no EXECUTE');
select function_privs_are('public', 'booking_edit_request_upsert', '{uuid,text,uuid,jsonb,int8}'::text[],
  'vamos_staff', '{}'::text[], 'upsert: vamos_staff holds no EXECUTE');
-- Every grantee but the owner and service_role (live holds the Supabase default grant for it, the local
-- stack does not): vamos_system alone. A grantee of 0 (PUBLIC) would show as '-'.
select is(
  (select coalesce(pg_catalog.array_agg(g.grantee::regrole::text order by g.grantee::regrole::text), '{}'::text[])
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as g
    where n.nspname = 'public' and p.proname = 'booking_edit_request_upsert'
      and g.privilege_type = 'EXECUTE'
      and g.grantee <> p.proowner
      and g.grantee <> 'service_role'::regrole::oid),
  array['vamos_system']::text[], 'upsert: no EXECUTE grantee but vamos_system (owner and service_role apart)');
select is(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'booking_edit_request_upsert'),
  true, 'upsert is SECURITY DEFINER with search_path empty');
select matches(
  (select obj_description(p.oid, 'pg_proc')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'booking_edit_request_upsert'),
  'staff-change-waiting', 'upsert: the comment names the new refusal');

-- ---------------------------------------------------------------------------
-- B. Refused while a staff change waits
-- ---------------------------------------------------------------------------
create temporary table w as select * from pg_temp.crw_staff_change('wait', 13);
select is((select outcome from w), 'extra_required', 'a dearer staff change waits for its difference');
select ok(
  (select x.expires_at > now() from public.price_snapshots x where x.id = (select extra_snapshot_id from w)),
  'its extra price record has not expired');
select lives_ok(
  format($f$select public.booking_edit_request_set_extra_session(%L::uuid, 'cs_crw_wait')$f$, (select request_id from w)),
  'its Stripe page id is stored');

select throws_ok(
  $$select * from pg_temp.crw_customer('wait')$$,
  'P0001', 'staff-change-waiting', 'a customer request is refused while the staff change waits');
select is(
  (select r.status || ':' || r.actor || ':' || r.extra_session_id from public.booking_edit_requests r
    where r.id = (select request_id from w)),
  'requested:staff:cs_crw_wait', 'refused: the staff request is still requested, with its Stripe page id');
select is(
  (select count(*)::int from public.booking_edit_requests r where r.booking_id = (select id from fx where k = 'wait')),
  1, 'refused: no row was written (the staff request is the only one)');
select is(
  (select count(*)::int from public.booking_edit_requests r
    where r.booking_id = (select id from fx where k = 'wait') and r.status = 'superseded'),
  0, 'refused: nothing was superseded');

-- Every refusal that came before keeps its place: with a staff change waiting they fire first.
select throws_ok(
  format($f$select * from public.booking_edit_request_upsert(%L::uuid, 'customer', null,
           '{"vehicle_class_slug":"crw-biz"}'::jsonb, %s)$f$,
         (select id from fx where k = 'wait'),
         (select price_snapshot_id from public.bookings where id = (select id from fx where k = 'wait'))),
  'P0001', 'class-change-staff-only', 'class-change-staff-only still fires first');
select throws_ok(
  format($f$select * from public.booking_edit_request_upsert(%L::uuid, 'customer', null,
           '{"scheduled_local":"2030-01-01T10:00","note":"x"}'::jsonb, %s)$f$,
         (select id from fx where k = 'wait'),
         (select price_snapshot_id from public.bookings where id = (select id from fx where k = 'wait'))),
  'P0001', 'customer-time-only', 'customer-time-only (another key) still fires first');
select throws_ok(
  format($f$select * from public.booking_edit_request_upsert(%L::uuid, 'customer', null,
           '{"note":"x"}'::jsonb, %s)$f$,
         (select id from fx where k = 'wait'),
         (select price_snapshot_id from public.bookings where id = (select id from fx where k = 'wait'))),
  'P0001', 'customer-time-only', 'customer-time-only (no time) still fires first');
select throws_ok(
  format($f$select * from public.booking_edit_request_upsert(%L::uuid, 'customer', null,
           '{"scheduled_local":"2030-01-01T10:00"}'::jsonb, %s)$f$,
         (select id from fx where k = 'wait'),
         (select extra_snapshot_id from w)),
  'P0001', 'snapshot-mismatch', 'snapshot-mismatch (a record that is not the booking''s total) still fires first');
select throws_ok(
  format($f$select * from public.booking_edit_request_upsert(%L::uuid, 'customer', null,
           '{"scheduled_local":"2030-01-01T10:00"}'::jsonb, 1)$f$,
         '00000000-0000-4000-8000-000000000000'),
  'P0002', 'not-found', 'an unknown booking is still not-found');
select is(
  (select count(*)::int from public.booking_edit_requests r where r.booking_id = (select id from fx where k = 'wait')),
  1, 'after the earlier refusals: still only the staff request');

-- ---------------------------------------------------------------------------
-- C. Allowed once the staff change no longer waits
-- ---------------------------------------------------------------------------
-- C1. The extra price record expired.
create temporary table e as select * from pg_temp.crw_staff_change('exp', 13);
select lives_ok(
  format($f$select public.booking_edit_request_set_extra_session(%L::uuid, 'cs_crw_exp')$f$, (select request_id from e)),
  'expired case: the Stripe page id is stored');
select throws_ok($$select * from pg_temp.crw_customer('exp')$$, 'P0001', 'staff-change-waiting',
  'expired case: refused while the record is still alive');
select lives_ok($$select pg_temp.crw_expire_extra((select request_id from e), now() - interval '1 minute')$$,
  'expired case: the extra price record ends a minute ago');
create temporary table e_up as select * from pg_temp.crw_customer('exp');
select is((select superseded_id from e_up), (select request_id from e),
  'expired case: the customer request is accepted and names the staff request it ended');
select is((select old_extra_session_id from e_up), 'cs_crw_exp',
  'expired case: the Stripe page id of the ended request comes back, so the caller can close it');
select is(
  (select r.status from public.booking_edit_requests r where r.id = (select request_id from e)),
  'superseded', 'expired case: the staff request is superseded');
select is(
  (select r.actor || ':' || r.status from public.booking_edit_requests r where r.id = (select request_id from e_up)),
  'customer:requested', 'expired case: the customer request waits');

-- C2. The extra price record ends exactly now (the extra accept refuses it with "expired" at the same
--     instant): not waiting.
create temporary table g as select * from pg_temp.crw_staff_change('edge', 13);
select lives_ok($$select pg_temp.crw_expire_extra((select request_id from g), now())$$,
  'edge case: the extra price record ends exactly now');
create temporary table g_up as select * from pg_temp.crw_customer('edge');
select is((select superseded_id from g_up), (select request_id from g),
  'edge case: expires_at = now() does not block');

-- C3. The owner withdrew the staff change.
create temporary table d as select * from pg_temp.crw_staff_change('wd', 13);
select throws_ok($$select * from pg_temp.crw_customer('wd')$$, 'P0001', 'staff-change-waiting',
  'withdrawn case: refused while it waits');
select lives_ok(
  format($f$select * from public.booking_change_withdraw(%L::uuid, %L::uuid, '26100019-0000-4000-a000-000000000001'::uuid)$f$,
         (select id from fx where k = 'wd'), (select request_id from d)),
  'withdrawn case: the owner withdraws the staff change');
create temporary table d_up as select * from pg_temp.crw_customer('wd');
select is((select superseded_id from d_up), null, 'withdrawn case: the customer request is accepted, nothing is superseded');
select is(
  (select r.status from public.booking_edit_requests r where r.id = (select request_id from d)),
  'withdrawn', 'withdrawn case: the staff request stays withdrawn');

-- C4. The difference was paid: the request is accepted.
create temporary table p as select * from pg_temp.crw_staff_change('pay', 13);
select lives_ok(
  format($f$select public.booking_edit_request_set_extra_session(%L::uuid, 'cs_crw_pay')$f$, (select request_id from p)),
  'paid case: the Stripe page id is stored');
select throws_ok($$select * from pg_temp.crw_customer('pay')$$, 'P0001', 'staff-change-waiting',
  'paid case: refused while the difference is open');
create temporary table p_paid as
  select * from public.checkout_extra_payment_settle('evt_crw_pay', 'cs_crw_pay', 'pi_crw_pay_x', 'succeeded',
                                                     'CHF', null, null, null, null);
select is((select applied from p_paid), true, 'paid case: the difference is paid and the change applied');
select is(
  (select r.status from public.booking_edit_requests r where r.id = (select request_id from p)),
  'accepted', 'paid case: the staff request is accepted');
create temporary table p_up as select * from pg_temp.crw_customer('pay');
select is((select superseded_id from p_up), null, 'paid case: the customer request is accepted, nothing is superseded');

-- C5. A staff request that has no extra price record yet (not confirmed into a difference).
create temporary table n_staff as
  select * from public.booking_edit_request_upsert(
    (select id from fx where k = 'noextra'), 'staff', '26100019-0000-4000-a000-000000000001'::uuid,
    '{"note":"n"}'::jsonb,
    (select price_snapshot_id from public.bookings where id = (select id from fx where k = 'noextra')));
select is(
  (select r.extra_snapshot_id from public.booking_edit_requests r where r.id = (select request_id from n_staff)),
  null, 'no-extra case: the staff request has no extra price record');
create temporary table n_up as select * from pg_temp.crw_customer('noextra');
select is((select superseded_id from n_up), (select request_id from n_staff),
  'no-extra case: the customer request is accepted and supersedes it (old behaviour)');

-- ---------------------------------------------------------------------------
-- D. Unchanged
-- ---------------------------------------------------------------------------
-- D1. A staff request supersedes a staff request, extra record or not.
create temporary table t1 as select * from pg_temp.crw_staff_change('two', 13);
create temporary table t2 as select * from pg_temp.crw_staff_change('two', 14);
select is(
  (select r.status from public.booking_edit_requests r where r.id = (select request_id from t1)),
  'superseded', 'staff over staff: the first staff request is superseded');
select is(
  (select r.status from public.booking_edit_requests r where r.id = (select request_id from t2)),
  'requested', 'staff over staff: the second one waits');
select is(
  (select count(*)::int from public.booking_edit_requests r
    where r.booking_id = (select id from fx where k = 'two') and r.status = 'requested'),
  1, 'staff over staff: exactly one request waits');

-- D2. A customer request supersedes a customer request.
create temporary table c1 as select * from pg_temp.crw_customer('cust');
create temporary table c2 as select * from pg_temp.crw_customer('cust');
select is((select superseded_id from c2), (select request_id from c1),
  'customer over customer: the second request supersedes the first');
select is(
  (select r.status from public.booking_edit_requests r where r.id = (select request_id from c1)),
  'superseded', 'customer over customer: the first is superseded');

-- D3. Unpaid and invalid actor.
select throws_ok($$select * from pg_temp.crw_customer('unpaid')$$, 'P0001', 'unpaid', 'unpaid is still refused');
select throws_ok(
  format($f$select * from public.booking_edit_request_upsert(%L::uuid, 'someone', null, '{}'::jsonb, 1)$f$,
         (select id from fx where k = 'wait')),
  '23514', 'invalid_actor', 'an unknown actor is still refused');

-- D4. The waiting staff change of 'wait' stayed whole through all of it.
select is(
  (select r.status || ':' || r.extra_session_id from public.booking_edit_requests r where r.id = (select request_id from w)),
  'requested:cs_crw_wait', 'at the end the waiting staff change on its booking is untouched');
select is(
  (select count(*)::int from public.booking_edit_requests r where r.booking_id = (select id from fx where k = 'wait')),
  1, 'at the end its booking still has the one row');
select is(
  (select b.price_snapshot_id from public.bookings b where b.id = (select id from fx where k = 'wait')),
  (select s.id from public.price_snapshots s
    where s.booking_id = (select id from fx where k = 'wait') and s.source = 'web'),
  'at the end its booking is still bound to its original price record');

select * from finish();
rollback;

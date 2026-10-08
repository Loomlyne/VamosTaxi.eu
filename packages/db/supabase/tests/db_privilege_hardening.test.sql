-- db_privilege_hardening.test.sql
--
-- J9 (payments review 2026-10-09). Migration 20261009160000_db_privilege_hardening.sql. It does not depend on
-- 20261007320000 (REST function revoke) being applied or not: nothing here reads those eight ACLs.
--   W5-07  staff write only the columns the Worker writes: status, refund and price columns, inserts and
--          deletes on bookings and booking_legs are refused; the writes the dashboard really makes still work;
--          is_test cannot change once a payment is captured.
--   W5-08  service_role holds nothing on the money ledger tables and EXECUTE on only the five digest
--          functions (and a function created later does not reach it); booking_payments rows cannot be
--          deleted except by the purge of an expired unpaid booking.
--   W5-18  abandon, requote and purge lock the payment rows before the booking (function text, as
--          refund_lock_order.test.sql does; the two-connection proof is packages/db/test/local).
--   W5-19  attach refuses an erased or test booking; a pay-link resend revokes the earlier pay tokens.
--   W5-23  checkout_cancel_unpaid needs ownership or a confirmed e-mail, and answers a stranger not_found
--          before it looks at the status.
--   W5-16  a same-second event cannot move a terminal dispute status back to an open one.
-- Synthetic rappen only, rolled back.
begin;
select plan(62);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity) values ('hp-class', 3, 3);

insert into auth.users (id, email, aud, role, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('20261009-0000-4000-a000-0000000000a1', 'hp-admin@vamostaxi.eu', 'authenticated', 'authenticated', now(), '{}', '{}', now(), now()),
  ('20261009-0000-4000-a000-0000000000b1', 'hp-conf@example.test', 'authenticated', 'authenticated', now(), '{}', '{}', now(), now()),
  ('20261009-0000-4000-a000-0000000000b2', 'hp-unconf@example.test', 'authenticated', 'authenticated', null, '{}', '{}', now(), now()),
  ('20261009-0000-4000-a000-0000000000b3', 'hp-stranger@example.test', 'authenticated', 'authenticated', now(), '{}', '{}', now(), now()),
  ('20261009-0000-4000-a000-0000000000b4', 'hp-owner-id@example.test', 'authenticated', 'authenticated', now(), '{}', '{}', now(), now());
insert into public.staff (user_id, role, active, accepted_at, full_name)
values ('20261009-0000-4000-a000-0000000000a1', 'admin', true, now(), 'HP Admin');
-- (a customers row is made for each new auth user by trigger)

-- A booking with one leg; p_amounts: one captured payment per element.
create function pg_temp.hp_booking(p_tag text, p_status text, p_amounts int[])
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
  v_snap bigint;
  i int;
begin
  insert into public.bookings (contact_name, contact_email, status, quote_id)
  values ('HP ' || p_tag, 'hp-' || p_tag || '@example.test', p_status::public.booking_status, gen_random_uuid())
  returning id into v_id;
  insert into public.booking_legs (
    booking_id, leg_seq, direction, pickup_text, dropoff_text,
    scheduled_at, scheduled_local, vehicle_class_id, status
  )
  select v_id, 1, 'outbound', 'ZRH Airport', 'Zurich HB',
         now() + interval '72 hours', to_char(now() + interval '72 hours', 'YYYY-MM-DD"T"HH24:MI'),
         vc.id, 'confirmed'
    from public.vehicle_classes vc where vc.slug = 'hp-class';
  set local session_replication_role = replica;
  for i in 1 .. coalesce(array_length(p_amounts, 1), 0) loop
    insert into public.price_snapshots (
      quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
      engine_version, pax, bags, lines, policy,
      subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
      expires_at, quote_lock_expires_at, booking_id
    )
    select gen_random_uuid(), vc.id, rv.id, false, sv.id, 'quote-engine@hp-' || p_tag || '-' || i, 2, 2, '[]'::jsonb,
           jsonb_build_object(
             'cancellation_tiers', '[]'::jsonb, 'free_cancel_hours', 24,
             'airport_waiting_minutes', 60, 'city_waiting_minutes', 15,
             'settings_version_id', sv.id, 'modification_deadline_hours', 24,
             'min_advance_minutes', 180, 'policy_doc', 'hp'
           ),
           p_amounts[i], 0, 0, p_amounts[i], now() + interval '1 day', now() + interval '1 day', v_id
      from public.vehicle_classes vc
      cross join lateral (select id from public.rate_versions order by id limit 1) rv
      cross join lateral (select id from public.settings_versions order by id limit 1) sv
     where vc.slug = 'hp-class'
    returning id into v_snap;
    insert into public.booking_payments (
      booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at
    ) values (v_id, v_snap, 'pi_hp_' || p_tag || '_' || i, p_amounts[i], 'succeeded', now());
  end loop;
  set local session_replication_role = origin;
  return v_id;
end;
$$;
create function pg_temp.hp_b(p_tag text) returns uuid language sql as $$
  select id from public.bookings where contact_email = 'hp-' || p_tag || '@example.test'
$$;
grant execute on function pg_temp.hp_b(text) to public;

select pg_temp.hp_booking('paid', 'confirmed', array[5000]);
select pg_temp.hp_booking('unpaid', 'pending', array[]::int[]);

-- ── W5-07: privileges as the catalog states them ──────────────────────────────────────── 12
select ok(not has_table_privilege('vamos_staff', 'public.bookings', 'INSERT')
      and not has_table_privilege('vamos_staff', 'public.bookings', 'DELETE')
      and not has_table_privilege('vamos_staff', 'public.bookings', 'UPDATE'),
      'W5-07: vamos_staff holds no table-wide INSERT, UPDATE or DELETE on bookings');
select ok(not has_table_privilege('vamos_staff', 'public.booking_legs', 'INSERT')
      and not has_table_privilege('vamos_staff', 'public.booking_legs', 'DELETE')
      and not has_table_privilege('vamos_staff', 'public.booking_legs', 'UPDATE'),
      'W5-07: vamos_staff holds no table-wide INSERT, UPDATE or DELETE on booking_legs');
select ok(has_table_privilege('vamos_staff', 'public.bookings', 'SELECT') and has_table_privilege('vamos_staff', 'public.booking_legs', 'SELECT'),
      'staff still read bookings and booking_legs');
select is((select array_agg(a.attname::text order by a.attname)
             from pg_attribute a
            where a.attrelid = 'public.bookings'::regclass and a.attnum > 0 and not a.attisdropped
              and has_column_privilege('vamos_staff', 'public.bookings', a.attname, 'UPDATE')),
          array['contact_email', 'contact_name', 'contact_phone', 'customer_id', 'is_test', 'updated_at'],
          'W5-07: the updatable bookings columns are exactly the six the Worker writes');
select is((select array_agg(a.attname::text order by a.attname)
             from pg_attribute a
            where a.attrelid = 'public.booking_legs'::regclass and a.attnum > 0 and not a.attisdropped
              and has_column_privilege('vamos_staff', 'public.booking_legs', a.attname, 'UPDATE')),
          array['arrived_at', 'updated_at'],
          'W5-07: the updatable booking_legs columns are exactly arrived_at and updated_at');
select ok(not exists (
            select 1 from pg_attribute a
             where a.attrelid = 'public.bookings'::regclass and a.attnum > 0 and not a.attisdropped
               and a.attname in ('status', 'refund_status', 'refund_owed_rappen', 'refunded_rappen', 'price_total_rappen', 'price_snapshot_id', 'erased_at')
               and has_column_privilege('vamos_staff', 'public.bookings', a.attname, 'UPDATE')),
          'W5-07: status, refund_status, refund_owed_rappen, refunded_rappen, price_total_rappen, price_snapshot_id, erased_at are not updatable by staff');

set local role vamos_staff;
select set_config('request.jwt.claims',
  jsonb_build_object('sub', '20261009-0000-4000-a000-0000000000a1', 'role', 'authenticated', 'aal', 'aal2',
    'app_metadata', jsonb_build_object('vamos_role', 'admin'))::text, true);

select throws_ok(format($f$update public.bookings set status = 'confirmed' where id = %L$f$, pg_temp.hp_b('unpaid')), '42501', null,
  'W5-07: staff cannot set bookings.status directly');
select throws_ok(format($f$update public.bookings set refunded_rappen = 0, refund_status = 'none' where id = %L$f$, pg_temp.hp_b('paid')), '42501', null,
  'W5-07: staff cannot reset refunded_rappen or refund_status directly');
select throws_ok(format($f$update public.bookings set price_total_rappen = 1 where id = %L$f$, pg_temp.hp_b('paid')), '42501', null,
  'W5-07: staff cannot change price_total_rappen directly');
select throws_ok(format($f$update public.bookings set erased_at = now() where id = %L$f$, pg_temp.hp_b('paid')), '42501', null,
  'W5-07: staff cannot erase a booking directly (staff_erase_unpaid_booking does it)');
select throws_ok(format($f$delete from public.bookings where id = %L$f$, pg_temp.hp_b('unpaid')), '42501', null,
  'W5-07: staff cannot delete a booking');
select throws_ok($$insert into public.bookings (contact_name, contact_email, status) values ('x', 'hp-ins@example.test', 'paid')$$, '42501', null,
  'W5-07: staff cannot insert a booking');
select throws_ok(format($f$update public.booking_legs set status = 'completed' where booking_id = %L$f$, pg_temp.hp_b('paid')), '42501', null,
  'W5-07: staff cannot set a leg status directly');
select throws_ok(format($f$delete from public.booking_legs where booking_id = %L$f$, pg_temp.hp_b('unpaid')), '42501', null,
  'W5-07: staff cannot delete a leg');

-- The writes the dashboard makes today keep working (customers.ts, bookings-write.ts markArrival, test-unpaid route).
select lives_ok(
  format($f$update public.bookings set customer_id = null, contact_name = 'HP Changed', contact_email = 'hp-paid@example.test',
            contact_phone = '+41000000099', updated_at = now() where id = %L$f$, pg_temp.hp_b('paid')),
  'W5-07: the customer save (customer_id, contact_*, updated_at) still works');
select lives_ok(
  format($f$update public.booking_legs set arrived_at = coalesce(arrived_at, now()), updated_at = now() where booking_id = %L$f$, pg_temp.hp_b('paid')),
  'W5-07: mark arrival (arrived_at, updated_at) still works');
select lives_ok(format($f$update public.bookings set is_test = true where id = %L$f$, pg_temp.hp_b('unpaid')),
  'W5-07: the test-unpaid route can flag an unpaid booking as test');
select throws_ok(format($f$update public.bookings set is_test = true where id = %L$f$, pg_temp.hp_b('paid')), '23001', null,
  'W5-07: is_test cannot be set on a booking with a captured payment');
reset role;
select set_config('request.jwt.claims', '', true);
select lives_ok(format($f$update public.bookings set is_test = true where id = %L$f$, pg_temp.hp_b('paid')),
  'the owner role (maintenance) can still change is_test');
select is((select status::text from public.bookings where id = pg_temp.hp_b('paid')), 'confirmed', 'the refused writes changed nothing');

-- ── W5-08: service_role off the money ledger and the money functions ─────────────────────── 18
select ok(not (has_table_privilege('service_role', 'public.booking_payments', 'SELECT, INSERT, UPDATE, DELETE')
            or has_table_privilege('service_role', 'public.booking_refunds', 'SELECT, INSERT, UPDATE, DELETE')
            or has_table_privilege('service_role', 'public.booking_refund_intents', 'SELECT, INSERT, UPDATE, DELETE')
            or has_table_privilege('service_role', 'public.booking_refund_reversals', 'SELECT, INSERT, UPDATE, DELETE')
            or has_table_privilege('service_role', 'public.booking_disputes', 'SELECT, INSERT, UPDATE, DELETE')
            or has_table_privilege('service_role', 'public.stripe_events', 'SELECT, INSERT, UPDATE, DELETE')),
      'W5-08: service_role holds no SELECT, INSERT, UPDATE or DELETE on the six money ledger tables');
select is((select count(*)::int from (values ('booking_payments'), ('booking_refunds'), ('booking_refund_intents'),
            ('booking_refund_reversals'), ('booking_disputes'), ('stripe_events')) t(n)
            where has_table_privilege('service_role', 'public.' || n, 'TRIGGER') or has_table_privilege('service_role', 'public.' || n, 'REFERENCES')), 0,
      'W5-08: nor TRIGGER or REFERENCES on them');
select is((select array_agg(p.proname::text order by p.proname)
             from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
              and has_function_privilege('service_role', p.oid, 'EXECUTE')),
          array['staff_digest_claim', 'staff_digest_legs', 'staff_digest_mark_failed', 'staff_digest_mark_sent', 'staff_digest_recipients'],
          'W5-08: service_role holds EXECUTE on exactly the five staff_digest_* functions in public');
select ok(not has_function_privilege('service_role', 'public.checkout_payment_settle(text,text,text,text,text,numeric,text,timestamptz,int8,text)', 'EXECUTE')
      and not has_function_privilege('service_role', 'public.ops_refund_plan(uuid,uuid,int8,numeric,text,bool,int4)', 'EXECUTE')
      and not has_function_privilege('service_role', 'public.stripe_charge_refunded_record(text,text,text,public.rappen,timestamptz,bool)', 'EXECUTE')
      and not has_function_privilege('service_role', 'public.compute_cancellation_refund(uuid)', 'EXECUTE')
      and not has_function_privilege('service_role', 'public.staff_erase_unpaid_booking(text)', 'EXECUTE'),
      'W5-08: spot check, service_role cannot execute settle, the refund plan, the refund mirror, the cancel computation or the staff erase');
select ok(has_table_privilege('service_role', 'public.staff', 'INSERT'),
      'service_role keeps what the staff invite needs: INSERT on public.staff');
-- Supabase's default ACL for functions the owner creates in public no longer lists service_role.
select ok(not exists (
            select 1 from pg_default_acl d
             where d.defaclrole = 'postgres'::regrole and d.defaclnamespace = 'public'::regnamespace and d.defaclobjtype = 'f'
               and exists (select 1 from aclexplode(d.defaclacl) a where a.grantee = 'service_role'::regrole)),
      'W5-08: the default privileges for new functions in public no longer grant service_role EXECUTE');

-- booking_payments cannot be deleted by hand
select throws_ok(format($f$delete from public.booking_payments where booking_id = %L$f$, pg_temp.hp_b('paid')), '23001', null,
      'W5-08: a captured payment row cannot be deleted (even by the owner role)');
select is((select count(*)::int from public.booking_payments where booking_id = pg_temp.hp_b('paid')), 1, 'the payment row is still there');
-- the purge of an expired unpaid booking still removes its payment rows
select pg_temp.hp_booking('purge', 'pending', array[]::int[]);
insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, stripe_checkout_session_id, charged_rappen, status)
select pg_temp.hp_b('purge'), s.id, 'cs_hp_purge_1', 'cs_hp_purge_1', 6, 'requires_payment'
  from public.price_snapshots s limit 0;
select is(public.purge_unpaid_booking(pg_temp.hp_b('purge'), 'unpaid_expired'), true, 'the purge of an eligible unpaid booking still works');
select is((select count(*)::int from public.bookings where contact_email = 'hp-purge@example.test'), 0, 'and the booking is gone');
select is(public.purge_unpaid_booking(pg_temp.hp_b('paid'), 'unpaid_expired'), false, 'the purge refuses a paid booking and deletes nothing');

-- ── W5-18: lock order, payments first ─────────────────────────────────────────────────────── 8
create function pg_temp.stmts(p_fn pg_catalog.regprocedure)
returns table (n pg_catalog.int4, s pg_catalog.text)
language sql stable as $$
  select t.o::pg_catalog.int4, pg_catalog.lower(pg_catalog.regexp_replace(t.x, '\s+', ' ', 'g'))
    from pg_catalog.regexp_split_to_table(
           pg_catalog.regexp_replace((select p.prosrc from pg_catalog.pg_proc p where p.oid = p_fn), '--[^\n]*', '', 'g'),
           ';') with ordinality as t(x, o)
$$;
create function pg_temp.at(p_fn pg_catalog.regprocedure, p_kind pg_catalog.text)
returns pg_catalog.int4[]
language sql stable as $$
  select coalesce(pg_catalog.array_agg(x.n order by x.n), '{}')
    from pg_temp.stmts(p_fn) x
   where case p_kind
           when 'pay' then x.s ~ 'public\.booking_payments\M' and x.s ~ '\mfor (update|no key update|share|key share)\M'
           when 'booking' then x.s ~ 'from public\.bookings\M' and x.s ~ '\mfor update\M'
         end
$$;
create temp table lo (fn pg_catalog.regprocedure, label pg_catalog.text) on commit drop;
insert into lo values
  ('public.checkout_abandon_unpaid(uuid)', 'checkout_abandon_unpaid'),
  ('public.checkout_requote_cancel(uuid)', 'checkout_requote_cancel'),
  ('public.purge_unpaid_booking(uuid,text)', 'purge_unpaid_booking');
select ok(pg_catalog.cardinality(pg_temp.at(f.fn, 'pay')) = 1 and pg_catalog.cardinality(pg_temp.at(f.fn, 'booking')) = 1
          and (pg_temp.at(f.fn, 'pay'))[1] < (pg_temp.at(f.fn, 'booking'))[1],
          f.label || ': the payment rows are locked once, before the one booking lock (W5-18)')
  from lo f order by f.label;
select ok((pg_temp.at('public.checkout_payment_settle(text,text,text,text,text,numeric,text,timestamptz,int8,text)', 'pay'))[1]
          < (pg_temp.at('public.checkout_payment_settle(text,text,text,text,text,numeric,text,timestamptz,int8,text)', 'booking'))[1],
          'settle: still payment before booking (the order these three now follow)');
select ok(pg_catalog.pg_get_functiondef('public.checkout_abandon_unpaid(uuid)'::pg_catalog.regprocedure) ~* 'security definer'
      and pg_catalog.pg_get_functiondef('public.checkout_requote_cancel(uuid)'::pg_catalog.regprocedure) ~* 'security definer'
      and pg_catalog.pg_get_functiondef('public.purge_unpaid_booking(uuid,text)'::pg_catalog.regprocedure) ~* 'security definer',
      'the three stay security definer');
select ok(has_function_privilege('vamos_checkout', 'public.checkout_abandon_unpaid(uuid)', 'EXECUTE')
      and has_function_privilege('vamos_checkout', 'public.checkout_requote_cancel(uuid)', 'EXECUTE')
      and has_function_privilege('vamos_checkout', 'public.purge_unpaid_booking(uuid,text)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.checkout_abandon_unpaid(uuid)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.checkout_requote_cancel(uuid)', 'EXECUTE'),
      'their grants are unchanged');

-- they still do their job
select pg_temp.hp_booking('aband', 'pending', array[]::int[]);
select is((select count(*)::int from public.checkout_abandon_unpaid((select quote_id from public.bookings where id = pg_temp.hp_b('aband')))), 1,
          'abandon still cancels an unpaid pending booking');
select is((select status::text from public.bookings where id = pg_temp.hp_b('aband')), 'cancelled', 'and the booking is cancelled');
select pg_temp.hp_booking('requote', 'pending', array[]::int[]);
select is((select count(*)::int from public.checkout_requote_cancel((select quote_id from public.bookings where id = pg_temp.hp_b('requote')))), 1,
          'requote cancel still cancels an unpaid pending booking');
select throws_ok(format($f$select * from public.checkout_requote_cancel(%L::uuid)$f$, (select quote_id from public.bookings where id = pg_temp.hp_b('paid'))),
          '23001', 'quote_already_booked', 'requote cancel of a paid (confirmed) booking: still refused');

-- ── W5-19: attach refuses erased and test bookings; a resend revokes the earlier token ───── 7
select pg_temp.hp_booking('erased', 'pending', array[]::int[]);
update public.bookings set erased_at = now() where id = pg_temp.hp_b('erased');
select throws_ok(format($f$select * from public.checkout_attach_payment(%L::uuid, 'pi_hp_x', 'cs_hp_x', 6)$f$, (select quote_id from public.bookings where id = pg_temp.hp_b('erased'))),
          '23001', 'booking_not_payable', 'W5-19: attach refuses an erased booking');
select pg_temp.hp_booking('testbk', 'pending', array[]::int[]);
update public.bookings set is_test = true where id = pg_temp.hp_b('testbk');
select throws_ok(format($f$select * from public.checkout_attach_payment(%L::uuid, 'pi_hp_y', 'cs_hp_y', 6)$f$, (select quote_id from public.bookings where id = pg_temp.hp_b('testbk'))),
          '23001', 'booking_not_payable', 'W5-19: attach refuses a test booking');
select is((select count(*)::int from public.booking_payments where booking_id in (pg_temp.hp_b('erased'), pg_temp.hp_b('testbk'))), 0, 'W5-19: no payment row was written for either');

select pg_temp.hp_booking('plink', 'pending', array[]::int[]);
select lives_ok(format($f$select public.checkout_set_pay_link(%L::uuid, 'individual', null, null, null, 'payer@example.test', decode(repeat('e1', 32), 'hex'), now() + interval '24 hours')$f$, pg_temp.hp_b('plink')),
          'first pay link stored');
select lives_ok(format($f$select public.checkout_set_pay_link(%L::uuid, 'individual', null, null, null, 'payer@example.test', decode(repeat('e2', 32), 'hex'), now() + interval '24 hours')$f$, pg_temp.hp_b('plink')),
          'resend stores a second token');
select is((select revoked_at is not null from public.booking_access_tokens where token_hash = decode(repeat('e1', 32), 'hex')), true,
          'W5-19: the first pay token is revoked by the resend');
select is((select revoked_at is null from public.booking_access_tokens where token_hash = decode(repeat('e2', 32), 'hex')), true,
          'W5-19: the new pay token is live');

-- ── W5-23: checkout_cancel_unpaid ──────────────────────────────────────────────────────── 9
select pg_temp.hp_booking('conf', 'pending', array[]::int[]);
update public.bookings set contact_email = 'hp-conf@example.test' where id = pg_temp.hp_b('conf');
select pg_temp.hp_booking('unconf', 'pending', array[]::int[]);
update public.bookings set contact_email = 'hp-unconf@example.test' where id = pg_temp.hp_b('unconf');
select pg_temp.hp_booking('byid', 'pending', array[]::int[]);
update public.bookings set customer_id = (select id from public.customers where user_id = '20261009-0000-4000-a000-0000000000b4') where id = pg_temp.hp_b('byid');
select pg_temp.hp_booking('other', 'confirmed', array[]::int[]);
create temp table hp_ref as select 'conf' as k, reference from public.bookings where id = pg_temp.hp_b('conf')
  union all select 'unconf', reference from public.bookings where id = pg_temp.hp_b('unconf')
  union all select 'byid', reference from public.bookings where id = pg_temp.hp_b('byid')
  union all select 'other', reference from public.bookings where id = pg_temp.hp_b('other');
grant select on hp_ref to public;

set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', '20261009-0000-4000-a000-0000000000b3', 'role', 'authenticated', 'email', 'hp-conf@example.test')::text, true);
select throws_ok($$select * from public.checkout_cancel_unpaid((select reference from hp_ref where k = 'conf'))$$, 'P0002', 'not_found',
  'W5-23: a stranger whose JWT claims the booking''s e-mail cannot cancel it (the claim is not trusted)');
select throws_ok($$select * from public.checkout_cancel_unpaid((select reference from hp_ref where k = 'other'))$$, 'P0002', 'not_found',
  'W5-23: a stranger gets not_found, not not_cancellable, for a booking that is not pending (nothing leaks)');
select set_config('request.jwt.claims', jsonb_build_object('sub', '20261009-0000-4000-a000-0000000000b2', 'role', 'authenticated', 'email', 'hp-unconf@example.test')::text, true);
select throws_ok($$select * from public.checkout_cancel_unpaid((select reference from hp_ref where k = 'unconf'))$$, 'P0002', 'not_found',
  'W5-23: an UNCONFIRMED e-mail equal to the booking''s cannot cancel it');
select set_config('request.jwt.claims', jsonb_build_object('sub', '20261009-0000-4000-a000-0000000000b1', 'role', 'authenticated', 'email', 'hp-conf@example.test')::text, true);
select lives_ok($$select * from public.checkout_cancel_unpaid((select reference from hp_ref where k = 'conf'))$$,
  'W5-23: a confirmed e-mail equal to the booking''s cancels it');
select throws_ok($$select * from public.checkout_cancel_unpaid((select reference from hp_ref where k = 'conf'))$$, 'P0001', 'not_cancellable',
  'the owner cancelling twice gets not_cancellable');
select set_config('request.jwt.claims', jsonb_build_object('sub', '20261009-0000-4000-a000-0000000000b4', 'role', 'authenticated', 'email', 'something-else@example.test')::text, true);
select lives_ok($$select * from public.checkout_cancel_unpaid((select reference from hp_ref where k = 'byid'))$$,
  'W5-23: the owner by customer id cancels it whatever the e-mail');
reset role;
select set_config('request.jwt.claims', '', true);
select is((select status::text from public.bookings where id = pg_temp.hp_b('unconf')), 'pending', 'the refused cancels changed nothing');
select throws_ok($$select * from public.checkout_cancel_unpaid('VT-00-0000')$$, 'P0002', 'not_found',
  'W5-23: no signed-in identity at all: not_found');

-- ── W5-16: same-second dispute events ──────────────────────────────────────────────────────── 6
select pg_temp.hp_booking('disp', 'confirmed', array[5000]);
select is((select status from public.stripe_dispute_upsert('du_hp_1', 'pi_hp_disp_1', null, 'under_review', 'fraudulent', 5000, '2026-10-01 10:00:00+00')),
          'under_review', 'a dispute opens as under_review');
select is((select status from public.stripe_dispute_upsert('du_hp_1', 'pi_hp_disp_1', null, 'won', 'fraudulent', 5000, '2026-10-01 10:05:00+00')),
          'won', 'a later event moves it to won');
select is((select status from public.stripe_dispute_upsert('du_hp_1', 'pi_hp_disp_1', null, 'under_review', 'fraudulent', 5000, '2026-10-01 10:05:00+00')),
          'won', 'W5-16: an under_review event of the SAME second does not move won back');
select is((select status from public.stripe_dispute_upsert('du_hp_1', 'pi_hp_disp_1', null, 'lost', 'fraudulent', 5000, '2026-10-01 10:05:00+00')),
          'lost', 'between two terminal statuses of the same second the later arrival wins, as before');
select is((select status from public.stripe_dispute_upsert('du_hp_1', 'pi_hp_disp_1', null, 'under_review', 'fraudulent', 5000, '2026-10-01 10:04:59+00')),
          'lost', 'an older event never overwrites (unchanged)');
select is((select status from public.stripe_dispute_upsert('du_hp_1', 'pi_hp_disp_1', null, 'under_review', 'fraudulent', 5000, '2026-10-01 10:06:00+00')),
          'under_review', 'a strictly later open status still applies (a reopened dispute)');

select * from finish();
rollback;

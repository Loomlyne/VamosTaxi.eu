-- quote_identity.test.sql
--
-- The executable half of the Phase 3<->4 quote-identity seam (D-44a). `QUOTE_PG_ROLE` in
-- packages/db/src/identity.ts is "anon" today: ...21_rls_customer.sql grants INSERT on
-- public.price_snapshots to no role at all (not even anon), and ...24_rls_public.sql grants
-- `anon`/`vamos_public` only the four §14d content tables -- so the anonymous quote path has
-- no write door yet. This file proves the negative unconditionally, today (the quote identity
-- reaches no customer-scoped table, whatever write path it eventually gets), and auto-detects
-- the write path Phase 4 adds, so the seam turns green the moment Phase 4 lands it instead of
-- needing a human to remember to write this test then. Phase 3 adds no migration (D-31); it
-- neither creates public.create_quote_snapshot(...) nor a vamos_quote role.
begin;
select plan(5);

-- Fixtures for the (currently unreachable) positive half -- cheap to seed, harmless if unused.
-- `vehicle_classes` already carries a seeded 'economy' row (D-36); no insert needed here.
insert into public.rate_versions (slug, label) values ('qi-rv', 'quote_identity fixture');
insert into public.settings_versions (slug, label, checkout_window_minutes)
values ('qi-policy', 'quote_identity fixture', 30);

-- Negative half, UNCONDITIONAL (D-44a): the quote identity is a pricing identity and must
-- never reach a customer-scoped table, whether or not Phase 4 has opened a write path yet.
set local role anon;
select throws_ok(
  $$ select count(*) from public.customers $$,
  '42501', null,
  '(1) quote identity (anon) selecting customers raises 42501 -- never customer-scoped'
);
select throws_ok(
  $$ select count(*) from public.bookings $$,
  '42501', null,
  '(2) quote identity (anon) selecting bookings raises 42501 -- never customer-scoped'
);
select throws_ok(
  $$ select count(*) from public.booking_access_tokens $$,
  '42501', null,
  '(3) quote identity (anon) selecting booking_access_tokens raises 42501 -- never customer-scoped'
);
reset role;

-- Positive half, auto-detecting (D-44a): if Phase 4 has added public.create_quote_snapshot(...)
-- (executable by the quote role) or granted the quote role INSERT on public.price_snapshots,
-- run the real assertions -- as the quote role, creating a snapshot for a seeded quote_id
-- lives_ok, and the same role still gets 42501 on public.bookings. Otherwise skip(2) with a
-- named reason. Either branch emits exactly 2 TAP lines, so the plan count stays honest
-- whether or not Phase 4 has landed.
create function pg_temp.quote_write_path_probe() returns setof text
language plpgsql as $fn$
declare
  v_fn_exists           boolean;
  v_insert_exists       boolean;
  v_quote_id            uuid := extensions.gen_random_uuid();
  v_vehicle_class_id    uuid;
  v_rate_version_id     bigint;
  v_settings_version_id bigint;
begin
  -- Probe by name via pg_proc, not a fixed signature -- Phase 4 may register
  -- create_quote_snapshot(...) at whatever arity it needs.
  select exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'create_quote_snapshot'
       and has_function_privilege('anon', p.oid, 'execute')
  ) into v_fn_exists;

  select has_table_privilege('anon', 'public.price_snapshots', 'insert') into v_insert_exists;

  if v_fn_exists or v_insert_exists then
    select id into v_vehicle_class_id from public.vehicle_classes where slug = 'economy';
    select id into v_rate_version_id from public.rate_versions where slug = 'qi-rv';
    select id into v_settings_version_id from public.settings_versions where slug = 'qi-policy';

    set local role anon;

    -- Plan 04-15: the seam is now LIVE. The v_fn_exists if is retained
    -- deliberately so this file keeps documenting the contract rather than
    -- assuming the RPC exists.
    if v_fn_exists then
      return query select lives_ok(
        format(
          $sql$
            select public.create_quote_snapshot(
              p_quote_id := %L::uuid,
              p_vehicle_class_id := %L::uuid,
              p_rate_version_id := %s::bigint,
              p_settings_version_id := %s::bigint,
              p_engine_version := 'quote-engine@quote_identity_test'::text,
              p_lock_exp := now() + interval '15 minutes',
              p_pax := 1::smallint,
              p_bags := 0::smallint,
              p_lines := '[{"seq":1,"code":"distance_fare","kind":"fare","i18n_key":"price.line.distance"}]'::jsonb,
              p_policy := '{"cancellation_tiers":[],"free_cancel_hours":24,"airport_waiting_minutes":60,"city_waiting_minutes":15,"settings_version_id":1,"modification_deadline_hours":24,"min_advance_minutes":180,"policy_doc":"qi"}'::jsonb,
              p_shown_alternatives := '[]'::jsonb,
              p_legs := '[{"leg_seq":1,"distance_km":null,"duration_min":null,"leg_subtotal_rappen":null,"booking_leg_id":null}]'::jsonb
            )
          $sql$,
          v_quote_id, v_vehicle_class_id, v_rate_version_id, v_settings_version_id),
        'quote identity (anon) can create a snapshot via public.create_quote_snapshot(...) (D-44a live)'
      );
    else
      return query select lives_ok(
        format($sql$ insert into public.price_snapshots
            (quote_id, vehicle_class_id, rate_version_id, rate_version_is_live,
             settings_version_id, engine_version)
          values (%L::uuid, %L::uuid, %L::bigint, false, %L::bigint,
                  'quote-engine@quote_identity_test') $sql$,
          v_quote_id, v_vehicle_class_id, v_rate_version_id, v_settings_version_id),
        'quote identity (anon) can INSERT on public.price_snapshots (D-44a live, INSERT path)'
      );
    end if;

    return query select throws_ok(
      $sql$ select count(*) from public.bookings $sql$,
      '42501', null,
      'quote identity (anon) still cannot reach public.bookings even with a write path (D-44a)'
    );

    reset role;
  else
    return query select skip(
      2,
      'no quote write path provisioned -- Phase 4''s first migration adds ' ||
      'public.create_quote_snapshot(...) or a vamos_quote role; see 03-01 deferred D-44a'
    );
  end if;
end;
$fn$;

select * from pg_temp.quote_write_path_probe();

select * from finish();
rollback;

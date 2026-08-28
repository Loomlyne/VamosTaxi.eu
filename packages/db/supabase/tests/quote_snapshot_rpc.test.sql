-- quote_snapshot_rpc.test.sql
--
-- D-44a / D-25 / D-33 / D-43: public.create_quote_snapshot is the quote path's
-- only write door. Expired lock inserts nothing; a draft cannot charge; the two
-- clocks are independently written; a direct INSERT as anon is still 42501.
--
-- D-46: synthetic unit-free integers only; no CHF figure. Rolled back at end.
begin;
select plan(22);

-- Fixtures: seeded draft version + launch-baseline policy. Temp table is the
-- id door — anon cannot select rate_versions / settings_versions.
create temporary table qsr_fx as
select
  vc.id as vehicle_class_id,
  rv.id as rate_version_id,
  sv.id as settings_version_id,
  now() + interval '45 minutes' as lock_exp,
  jsonb_build_object(
    'cancellation_tiers', '[]'::jsonb,
    'free_cancel_hours', 24,
    'airport_waiting_minutes', 60,
    'city_waiting_minutes', 15,
    'settings_version_id', 1,
    'modification_deadline_hours', 24,
    'min_advance_minutes', 180,
    'policy_doc', 'qsr'
  ) as policy,
  '[]'::jsonb as lines_unpriced,
  jsonb_build_array(jsonb_build_object(
    'leg_seq', 1,
    'distance_km', null,
    'duration_min', null,
    'leg_subtotal_rappen', null,
    'booking_leg_id', null
  )) as one_leg,
  jsonb_build_array(
    jsonb_build_object(
      'leg_seq', 1,
      'distance_km', null,
      'duration_min', null,
      'leg_subtotal_rappen', null,
      'booking_leg_id', null
    ),
    jsonb_build_object(
      'leg_seq', 2,
      'distance_km', null,
      'duration_min', null,
      'leg_subtotal_rappen', null,
      'booking_leg_id', null
    )
  ) as two_legs
from public.vehicle_classes vc,
     public.rate_versions rv,
     public.settings_versions sv
where vc.slug = 'economy'
  and rv.slug = 'seed-placeholder'
  and sv.slug = 'launch-baseline';
grant select on qsr_fx to public;

insert into public.settings_versions (slug, label, checkout_window_minutes, effective_from)
values ('qsr-null-checkout', 'Null checkout window fixture', null, now() + interval '1 day');

create temporary table qsr_null as
select sv.id as settings_version_id
  from public.settings_versions sv
 where sv.slug = 'qsr-null-checkout';
grant select on qsr_null to public;

-- (1) PUBLIC holds no EXECUTE; anon and authenticated hold EXECUTE --------------
select function_privs_are(
  'public', 'create_quote_snapshot',
  '{uuid,uuid,int8,int8,text,timestamptz,int2,int2,jsonb,jsonb,jsonb,jsonb,display_currency,text,rappen,rappen,rappen,rappen,numeric,int4,int8,text,uuid}'::text[],
  'public', '{}'::text[],
  '(1a) PUBLIC holds no EXECUTE on create_quote_snapshot'
);
select function_privs_are(
  'public', 'create_quote_snapshot',
  '{uuid,uuid,int8,int8,text,timestamptz,int2,int2,jsonb,jsonb,jsonb,jsonb,display_currency,text,rappen,rappen,rappen,rappen,numeric,int4,int8,text,uuid}'::text[],
  'anon', '{EXECUTE}'::text[],
  '(1b) anon holds EXECUTE on create_quote_snapshot'
);
select function_privs_are(
  'public', 'create_quote_snapshot',
  '{uuid,uuid,int8,int8,text,timestamptz,int2,int2,jsonb,jsonb,jsonb,jsonb,display_currency,text,rappen,rappen,rappen,rappen,numeric,int4,int8,text,uuid}'::text[],
  'authenticated', '{EXECUTE}'::text[],
  '(1c) authenticated holds EXECUTE on create_quote_snapshot'
);

-- (2) definer flag from the catalog --------------------------------------------
select is(
  (select p.prosecdef
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_quote_snapshot'),
  true,
  '(2) create_quote_snapshot is security definer (prosecdef)'
);

-- (3) launch-state call as anon ------------------------------------------------
set local role anon;
select lives_ok(
  $$
    select public.create_quote_snapshot(
      p_quote_id => '00000000-0000-4000-8000-000000000001'::uuid,
      p_vehicle_class_id => (select vehicle_class_id from qsr_fx),
      p_rate_version_id => (select rate_version_id from qsr_fx),
      p_settings_version_id => (select settings_version_id from qsr_fx),
      p_engine_version => 'quote-engine@qsr-launch'::text,
      p_lock_exp => (select lock_exp from qsr_fx),
      p_pax => 1::smallint,
      p_bags => 0::smallint,
      p_lines => (select lines_unpriced from qsr_fx),
      p_policy => (select policy from qsr_fx),
      p_shown_alternatives => '[]'::jsonb,
      p_legs => (select one_leg from qsr_fx)
    )
  $$,
  '(3a) anon launch-state create_quote_snapshot lives_ok'
);
reset role;

select isnt(
  (select id from public.price_snapshots where engine_version = 'quote-engine@qsr-launch'),
  null,
  '(3b) returned snapshot id is not null'
);

-- (4) D-33: draft version cannot charge ----------------------------------------
select is(
  (select total_rappen from public.price_snapshots where engine_version = 'quote-engine@qsr-launch'),
  null,
  '(4a) launch-state total_rappen is null'
);
select is(
  (select is_chargeable from public.price_snapshots where engine_version = 'quote-engine@qsr-launch'),
  false,
  '(4b) launch-state is_chargeable is false'
);
select is(
  (select rate_version_is_live from public.price_snapshots where engine_version = 'quote-engine@qsr-launch'),
  false,
  '(4c) D-33: snapshot against seeded draft records rate_version_is_live = false'
);

-- (5) two clocks, independently written (lock offset from checkout window) -----
select is(
  (select quote_lock_expires_at from public.price_snapshots where engine_version = 'quote-engine@qsr-launch'),
  (select lock_exp from qsr_fx),
  '(5a) quote_lock_expires_at equals the p_lock_exp passed'
);
select ok(
  (select expires_at > now() from public.price_snapshots where engine_version = 'quote-engine@qsr-launch'),
  '(5b) expires_at is strictly greater than now()'
);
select isnt(
  (select expires_at from public.price_snapshots where engine_version = 'quote-engine@qsr-launch'),
  (select quote_lock_expires_at from public.price_snapshots where engine_version = 'quote-engine@qsr-launch'),
  '(5c) expires_at differs from quote_lock_expires_at (two clocks)'
);

create temporary table qsr_count as
select count(*)::bigint as n from public.price_snapshots;

-- (6) D-25: past lock raises and inserts nothing --------------------------------
set local role anon;
select throws_ok(
  $$
    select public.create_quote_snapshot(
      p_quote_id => '00000000-0000-4000-8000-000000000003'::uuid,
      p_vehicle_class_id => (select vehicle_class_id from qsr_fx),
      p_rate_version_id => (select rate_version_id from qsr_fx),
      p_settings_version_id => (select settings_version_id from qsr_fx),
      p_engine_version => 'quote-engine@qsr-past'::text,
      p_lock_exp => now() - interval '1 second',
      p_pax => 1::smallint,
      p_bags => 0::smallint,
      p_lines => (select lines_unpriced from qsr_fx),
      p_policy => (select policy from qsr_fx),
      p_shown_alternatives => '[]'::jsonb,
      p_legs => (select one_leg from qsr_fx)
    )
  $$,
  '23001',
  null,
  '(6a) p_lock_exp in the past raises restrict_violation'
);
reset role;

select is(
  (select count(*)::bigint from public.price_snapshots),
  (select n from qsr_count),
  '(6b) expired lock inserts nothing'
);

-- (7) null checkout_window_minutes raises --------------------------------------
set local role anon;
select throws_ok(
  $$
    select public.create_quote_snapshot(
      p_quote_id => '00000000-0000-4000-8000-000000000004'::uuid,
      p_vehicle_class_id => (select vehicle_class_id from qsr_fx),
      p_rate_version_id => (select rate_version_id from qsr_fx),
      p_settings_version_id => (select settings_version_id from qsr_null),
      p_engine_version => 'quote-engine@qsr-null-window'::text,
      p_lock_exp => (select lock_exp from qsr_fx),
      p_pax => 1::smallint,
      p_bags => 0::smallint,
      p_lines => (select lines_unpriced from qsr_fx),
      p_policy => (select policy from qsr_fx),
      p_shown_alternatives => '[]'::jsonb,
      p_legs => (select one_leg from qsr_fx)
    )
  $$,
  '23001',
  null,
  '(7) null checkout_window_minutes raises restrict_violation'
);

-- (8) p_legs empty array and non-array each raise ------------------------------
select throws_ok(
  $$
    select public.create_quote_snapshot(
      p_quote_id => '00000000-0000-4000-8000-000000000005'::uuid,
      p_vehicle_class_id => (select vehicle_class_id from qsr_fx),
      p_rate_version_id => (select rate_version_id from qsr_fx),
      p_settings_version_id => (select settings_version_id from qsr_fx),
      p_engine_version => 'quote-engine@qsr-empty-legs'::text,
      p_lock_exp => (select lock_exp from qsr_fx),
      p_pax => 1::smallint,
      p_bags => 0::smallint,
      p_lines => (select lines_unpriced from qsr_fx),
      p_policy => (select policy from qsr_fx),
      p_shown_alternatives => '[]'::jsonb,
      p_legs => '[]'::jsonb
    )
  $$,
  '23001',
  null,
  '(8a) p_legs empty array raises restrict_violation'
);
select throws_ok(
  $$
    select public.create_quote_snapshot(
      p_quote_id => '00000000-0000-4000-8000-000000000006'::uuid,
      p_vehicle_class_id => (select vehicle_class_id from qsr_fx),
      p_rate_version_id => (select rate_version_id from qsr_fx),
      p_settings_version_id => (select settings_version_id from qsr_fx),
      p_engine_version => 'quote-engine@qsr-object-legs'::text,
      p_lock_exp => (select lock_exp from qsr_fx),
      p_pax => 1::smallint,
      p_bags => 0::smallint,
      p_lines => (select lines_unpriced from qsr_fx),
      p_policy => (select policy from qsr_fx),
      p_shown_alternatives => '[]'::jsonb,
      p_legs => '{}'::jsonb
    )
  $$,
  '23001',
  null,
  '(8b) p_legs jsonb object raises restrict_violation'
);

-- (9) two legs fan out ---------------------------------------------------------
select lives_ok(
  $$
    select public.create_quote_snapshot(
      p_quote_id => '00000000-0000-4000-8000-000000000002'::uuid,
      p_vehicle_class_id => (select vehicle_class_id from qsr_fx),
      p_rate_version_id => (select rate_version_id from qsr_fx),
      p_settings_version_id => (select settings_version_id from qsr_fx),
      p_engine_version => 'quote-engine@qsr-twoleg'::text,
      p_lock_exp => (select lock_exp from qsr_fx),
      p_pax => 1::smallint,
      p_bags => 0::smallint,
      p_lines => (select lines_unpriced from qsr_fx),
      p_policy => (select policy from qsr_fx),
      p_shown_alternatives => '[]'::jsonb,
      p_legs => (select two_legs from qsr_fx)
    )
  $$,
  '(9a) two-leg create_quote_snapshot lives_ok'
);
reset role;

select is(
  (select count(*)::integer
     from public.price_snapshot_legs
    where snapshot_id = (
      select id from public.price_snapshots where engine_version = 'quote-engine@qsr-twoleg'
    )),
  2,
  '(9b) two legs in p_legs produce two price_snapshot_legs rows'
);
select is(
  (select array_agg(leg_seq order by leg_seq)
     from public.price_snapshot_legs
    where snapshot_id = (
      select id from public.price_snapshots where engine_version = 'quote-engine@qsr-twoleg'
    )),
  array[1, 2]::smallint[],
  '(9c) leg_seq is 1 then 2'
);

-- (10) lines/total identity still fires through the RPC ------------------------
set local role anon;
select throws_ok(
  $$
    select public.create_quote_snapshot(
      p_quote_id => '00000000-0000-4000-8000-000000000007'::uuid,
      p_vehicle_class_id => (select vehicle_class_id from qsr_fx),
      p_rate_version_id => (select rate_version_id from qsr_fx),
      p_settings_version_id => (select settings_version_id from qsr_fx),
      p_engine_version => 'quote-engine@qsr-mismatch'::text,
      p_lock_exp => (select lock_exp from qsr_fx),
      p_pax => 1::smallint,
      p_bags => 0::smallint,
      p_lines => jsonb_build_array(jsonb_build_object(
        'seq', 1,
        'code', 'distance_fare',
        'kind', 'fare',
        'i18n_key', 'price.line.distance',
        'amount_rappen', 7
      )),
      p_policy => (select policy from qsr_fx),
      p_shown_alternatives => '[]'::jsonb,
      p_legs => (select one_leg from qsr_fx),
      p_subtotal_rappen => 10::public.rappen,
      p_surcharges_rappen => 0::public.rappen,
      p_discount_rappen => 0::public.rappen,
      p_total_rappen => 10::public.rappen
    )
  $$,
  '23001',
  null,
  '(10) broken lines/total identity raises through the RPC'
);

-- (11) the function is the door, not a door ------------------------------------
select throws_ok(
  $$ insert into public.price_snapshots (quote_id) values ('00000000-0000-4000-8000-000000000099'::uuid) $$,
  '42501',
  null,
  '(11) anon direct INSERT on price_snapshots raises 42501'
);
reset role;

select * from finish();
rollback;

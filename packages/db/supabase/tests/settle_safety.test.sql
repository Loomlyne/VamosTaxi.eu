-- settle_safety.test.sql
--
-- 261002 settle safety (migration 20261007200000): a difference paid on Stripe's page is never lost and
-- never applied to a trip that was cancelled.
--   A  grants and shape (booking_cancel_change_pages new; the others keep their grants; comments name the job).
--   B  lock rule, static guard: the settle and Accept take the booking row before the request row. The real
--      concurrency proof is apps/web/lib/ops/settle-safety.local.test.ts (two real connections).
--   C  deterministic pick: a page shared by two requests settles the waiting one.
--   D  a cancel (customer link door, signed-in door and dashboard door share two functions) ends a waiting
--      change and lists its Stripe page for the Worker to close.
--   E  paid after a cancel: recorded, never applied, Refund due (more than 24 h ahead: owed grows by the
--      difference; inside 24 h: owed stays null); the settle's own guard when the request was not ended.
--   F  apply failure: the payment is recorded, the change is not applied, the request ends, Refund due; a
--      transient database error (deadlock, connection) is re-raised so the Worker retries.
--   G  Accept: a second Accept after the amount moved is refused (price-changed), nothing written; the same
--      amount still answers extra_required; the refusal order is unchanged.
--   H  checkout_reference_for_session finds the booking of a difference page.
-- Rolled back. Synthetic integer rappen only, never a product CHF.
begin;
select plan(124);

insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('ssf-eco', 4, 4), ('ssf-biz', 7, 7), ('ssf-gone', 7, 7);

insert into public.rate_versions (slug, label) values ('ssf-rv', 'SSF fixture');
update public.rate_versions set status = 'live' where slug = 'ssf-rv';

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('26100210-0000-4000-a000-000000000001', 'ssf-admin@vamostaxi.eu', 'authenticated', 'authenticated',
        '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.staff (user_id, role, active, accepted_at, full_name)
values ('26100210-0000-4000-a000-000000000001', 'admin', true, now(), 'SSF Admin');

create temporary table fx (k text primary key, id uuid not null);

-- One Economy booking p_offs ahead: one leg, one price record (fare and VAT line), total 10, and, when
-- paid, one captured payment of 10.
create function pg_temp.ssf_mk(p_key text, p_offs interval default interval '48 hours', p_paid boolean default true)
returns uuid language plpgsql as $$
declare
  v_b uuid;
  v_snap bigint;
begin
  insert into public.bookings (reference, contact_name, contact_email, status, locale)
  values (public.next_booking_reference(), 'SSF ' || p_key, 'ssf-' || p_key || '@vamostaxi.eu',
          case when p_paid then 'confirmed' else 'quote' end::public.booking_status, 'de')
  returning id into v_b;

  insert into public.booking_legs (
    booking_id, leg_seq, direction, pickup_text, dropoff_text,
    scheduled_at, scheduled_local, vehicle_class_id, status, pax, bags, estimated_duration_minutes
  )
  select v_b, 1, 'outbound', 'ZRH Airport', 'Zug',
         now() + p_offs, to_char(now() + p_offs, 'YYYY-MM-DD"T"HH24:MI'), vc.id,
         case when p_paid then 'confirmed' else 'quote' end::public.booking_status, 2, 1, 40
    from public.vehicle_classes vc where vc.slug = 'ssf-eco';

  if p_paid then
    set local session_replication_role = replica;
    insert into public.price_snapshots (
      quote_id, vehicle_class_id, rate_version_id, rate_version_is_live, settings_version_id,
      engine_version, pax, bags, lines, policy,
      subtotal_rappen, surcharges_rappen, discount_rappen, total_rappen,
      expires_at, quote_lock_expires_at, booking_id, source, distance_km, duration_min
    )
    select gen_random_uuid(), vc.id, rv.id, true, sv.id, 'quote-engine@ssf', 2, 1,
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
      cross join lateral (select id from public.rate_versions where slug = 'ssf-rv') rv
      cross join lateral (select id from public.settings_versions order by id limit 1) sv
     where vc.slug = 'ssf-eco'
    returning id into v_snap;
    update public.bookings set price_snapshot_id = v_snap where id = v_b;
    insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at)
    values (v_b, v_snap, 'pi_ssf_' || p_key, 10, 'succeeded', now());
    set local session_replication_role = origin;
  end if;

  insert into pg_temp.fx values (p_key, v_b);
  return v_b;
end $$;

create function pg_temp.ssf_b(p_key text) returns uuid language sql as $$
  select f.id from pg_temp.fx as f where f.k = p_key
$$;

create function pg_temp.ssf_lines(p_total int) returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('seq', 1, 'leg_seq', 1, 'code', 'distance_fare', 'kind', 'fare',
                       'i18n_key', 'price.line.transfer', 'params', jsonb_build_object('vehicleClass', 'x'),
                       'amount_rappen', p_total - 1),
    jsonb_build_object('seq', 2, 'leg_seq', 1, 'code', 'vat', 'kind', 'vat',
                       'i18n_key', 'price.line.vat', 'params', jsonb_build_object('vatRateBps', 81),
                       'amount_rappen', 1))
$$;

-- The owner confirms a dearer class change (Economy -> p_class at p_total, paid 10): a staff request waits
-- for the difference, with its extra price record.
create function pg_temp.ssf_change(p_key text, p_total int, p_class text default 'ssf-biz')
returns table (request_id uuid, booking_id uuid, outcome text, difference_rappen int, new_total_rappen int,
               paid_rappen int, quote_snapshot_id bigint, extra_snapshot_id bigint, old_extra_session_id text,
               old_extra_snapshot_id bigint, unassigned_chauffeur_id uuid)
language sql as $$
  select * from public.booking_staff_change(
    pg_temp.ssf_b(p_key),
    '26100210-0000-4000-a000-000000000001'::uuid,
    p_class,
    (select rv.id from public.rate_versions as rv where rv.slug = 'ssf-rv'),
    p_total,
    pg_temp.ssf_lines(p_total),
    'quote-engine@ssf-test',
    null
  )
$$;

-- The customer asks for a new time, priced at the booking's own bound record (what the route sends).
create function pg_temp.ssf_customer(p_key text)
returns table (request_id uuid, superseded_id uuid, old_extra_session_id text, old_extra_snapshot_id bigint)
language sql as $$
  select * from public.booking_edit_request_upsert(
    pg_temp.ssf_b(p_key), 'customer', null,
    '{"scheduled_local":"2030-01-01T10:00"}'::jsonb,
    (select b.price_snapshot_id from public.bookings as b where b.id = pg_temp.ssf_b(p_key)))
$$;

-- What Stripe's "paid" event does.
create function pg_temp.ssf_settle(p_page text, p_event text)
returns table (booking_id uuid, reference text, locale text, contact_email text, already_settled bool,
               request_id uuid, applied bool, class_changed bool, unassigned_chauffeur_id uuid)
language sql as $$
  select * from public.checkout_extra_payment_settle(p_event, p_page, 'pi_' || p_event, 'succeeded',
                                                     'CHF', null, null, null, null)
$$;

create function pg_temp.ssf_class(p_key text) returns text language sql as $$
  select vc.slug from public.booking_legs as l join public.vehicle_classes as vc on vc.id = l.vehicle_class_id
   where l.booking_id = pg_temp.ssf_b(p_key) order by l.leg_seq limit 1
$$;

create function pg_temp.ssf_page(p_request uuid, p_page text) returns void language sql as $$
  select public.booking_edit_request_set_extra_session(p_request, p_page)
$$;

select pg_temp.ssf_mk('pick');
select pg_temp.ssf_mk('cc');
select pg_temp.ssf_mk('oc');
select pg_temp.ssf_mk('mg');
select pg_temp.ssf_mk('gd');
select pg_temp.ssf_mk('in24', interval '5 hours');
select pg_temp.ssf_mk('fail');
select pg_temp.ssf_mk('busy');
select pg_temp.ssf_mk('ref');
select pg_temp.ssf_mk('a1');
select pg_temp.ssf_mk('a2');
select pg_temp.ssf_mk('a3');
select pg_temp.ssf_mk('a4');
select pg_temp.ssf_mk('a5');

-- ---------------------------------------------------------------------------
-- A. Grants and shape
-- ---------------------------------------------------------------------------
select has_function('public', 'booking_cancel_change_pages', '{uuid}'::text[], 'booking_cancel_change_pages exists');
select function_privs_are('public', 'booking_cancel_change_pages', '{uuid}'::text[],
  'vamos_system', '{EXECUTE}'::text[], 'pages: vamos_system holds EXECUTE');
select function_privs_are('public', 'booking_cancel_change_pages', '{uuid}'::text[],
  'anon', '{}'::text[], 'pages: anon holds no EXECUTE');
select function_privs_are('public', 'booking_cancel_change_pages', '{uuid}'::text[],
  'authenticated', '{}'::text[], 'pages: authenticated holds no EXECUTE');
select function_privs_are('public', 'booking_cancel_change_pages', '{uuid}'::text[],
  'vamos_edge', '{}'::text[], 'pages: vamos_edge holds no EXECUTE');
select function_privs_are('public', 'booking_cancel_change_pages', '{uuid}'::text[],
  'vamos_public', '{}'::text[], 'pages: vamos_public holds no EXECUTE');
select function_privs_are('public', 'booking_cancel_change_pages', '{uuid}'::text[],
  'vamos_staff', '{}'::text[], 'pages: vamos_staff holds no EXECUTE');
-- Every grantee but the owner and service_role (live holds the Supabase default grant for it, the local
-- stack does not): vamos_system alone. A grantee of 0 (PUBLIC) would show as '-'.
select is(
  (select coalesce(pg_catalog.array_agg(g.grantee::regrole::text order by g.grantee::regrole::text), '{}'::text[])
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as g
    where n.nspname = 'public' and p.proname = 'booking_cancel_change_pages'
      and g.privilege_type = 'EXECUTE'
      and g.grantee <> p.proowner
      and g.grantee <> 'service_role'::regrole::oid),
  array['vamos_system']::text[], 'pages: no EXECUTE grantee but vamos_system (owner and service_role apart)');
select function_privs_are('public', 'checkout_extra_payment_settle',
  '{text,text,text,text,text,numeric,text,timestamptz,int8}'::text[], 'vamos_system', '{EXECUTE}'::text[],
  'settle: vamos_system holds EXECUTE');
select function_privs_are('public', 'checkout_extra_payment_settle',
  '{text,text,text,text,text,numeric,text,timestamptz,int8}'::text[], 'anon', '{}'::text[],
  'settle: anon holds no EXECUTE');
select function_privs_are('public', 'checkout_extra_payment_settle',
  '{text,text,text,text,text,numeric,text,timestamptz,int8}'::text[], 'authenticated', '{}'::text[],
  'settle: authenticated holds no EXECUTE');
select function_privs_are('public', 'booking_edit_request_accept', '{uuid,uuid}'::text[],
  'vamos_system', '{EXECUTE}'::text[], 'accept: vamos_system holds EXECUTE');
select function_privs_are('public', 'booking_edit_request_accept', '{uuid,uuid}'::text[],
  'anon', '{}'::text[], 'accept: anon holds no EXECUTE');
select function_privs_are('public', 'booking_edit_request_accept', '{uuid,uuid}'::text[],
  'authenticated', '{}'::text[], 'accept: authenticated holds no EXECUTE');
select function_privs_are('public', 'ops_cancel_booking', '{uuid,uuid}'::text[],
  'vamos_system', '{EXECUTE}'::text[], 'ops cancel: vamos_system holds EXECUTE');
select function_privs_are('public', 'ops_cancel_booking', '{uuid,uuid}'::text[],
  'anon', '{}'::text[], 'ops cancel: anon holds no EXECUTE');
select function_privs_are('public', 'ops_cancel_booking', '{uuid,uuid}'::text[],
  'authenticated', '{}'::text[], 'ops cancel: authenticated holds no EXECUTE');
select function_privs_are('public', 'checkout_reference_for_session', '{text}'::text[],
  'vamos_system', '{EXECUTE}'::text[], 'reference lookup: vamos_system holds EXECUTE');
select function_privs_are('public', 'checkout_reference_for_session', '{text}'::text[],
  'anon', '{}'::text[], 'reference lookup: anon holds no EXECUTE');
select function_privs_are('public', 'checkout_reference_for_session', '{text}'::text[],
  'authenticated', '{}'::text[], 'reference lookup: authenticated holds no EXECUTE');
select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where ((n.nspname = 'public' and p.proname in ('checkout_extra_payment_settle', 'booking_edit_request_accept',
                                                    'ops_cancel_booking', 'checkout_reference_for_session',
                                                    'booking_cancel_change_pages'))
           or (n.nspname = 'app' and p.proname = 'apply_customer_cancel'))
      and p.prosecdef and p.proconfig @> array['search_path=""']),
  6, 'all six functions are SECURITY DEFINER with search_path empty');
select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where ((n.nspname = 'public' and p.proname in ('checkout_extra_payment_settle', 'booking_edit_request_accept',
                                                    'ops_cancel_booking', 'checkout_reference_for_session',
                                                    'booking_cancel_change_pages'))
           or (n.nspname = 'app' and p.proname = 'apply_customer_cancel'))
      and obj_description(p.oid, 'pg_proc') like '%261002 settle safety%'),
  6, 'every comment says what 261002 settle safety changed');
select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'checkout_extra_payment_settle'),
  1, 'the settle was replaced in place: one function, same signature');

-- ---------------------------------------------------------------------------
-- B. Lock rule, static guard (the booking row is read FOR UPDATE before the request row)
-- ---------------------------------------------------------------------------
select ok(
  (select position('from public.bookings' in p.prosrc) > 0
          and position('from public.bookings' in p.prosrc) < position('and r.booking_id = v_booking_id' in p.prosrc)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'checkout_extra_payment_settle'),
  'settle: the booking row is locked before the request row');
select ok(
  (select position('from public.bookings' in p.prosrc) > 0
          and position('from public.bookings' in p.prosrc) < position('and r.booking_id = v_booking_id' in p.prosrc)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'booking_edit_request_accept'),
  'accept: the booking row is locked before the request row');
select ok(
  (select position('for update' in p.prosrc) > 0
          and position('for update' in p.prosrc) < position('update public.booking_legs' in p.prosrc)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.proname = 'apply_customer_cancel'),
  'customer cancel: the booking row is locked before anything is written');

-- ---------------------------------------------------------------------------
-- C. Deterministic pick: two requests of one booking share one Stripe page
-- ---------------------------------------------------------------------------
create temporary table pk1 as select * from pg_temp.ssf_change('pick', 13);
select pg_temp.ssf_page((select request_id from pk1), 'cs_ssf_pick');
create temporary table pk2 as select * from pg_temp.ssf_change('pick', 13);
select pg_temp.ssf_page((select request_id from pk2), 'cs_ssf_pick');
select is((select r.status from public.booking_edit_requests r where r.id = (select request_id from pk1)),
  'superseded', 'pick: the older request on the page is superseded');
select is((select r.status from public.booking_edit_requests r where r.id = (select request_id from pk2)),
  'requested', 'pick: the newer request on the same page waits');
select is((select count(*)::int from public.booking_edit_requests r where r.extra_session_id = 'cs_ssf_pick'),
  2, 'pick: both requests carry the page id');
select isnt((select extra_snapshot_id from pk1), (select extra_snapshot_id from pk2),
  'pick: each request has its own extra price record');

create temporary table pk_paid as select * from pg_temp.ssf_settle('cs_ssf_pick', 'evt_ssf_pick');
select is((select request_id from pk_paid), (select request_id from pk2),
  'pick: the settle takes the request that waits (the newer one)');
select is((select applied from pk_paid), true, 'pick: the change is applied');
select is((select r.status from public.booking_edit_requests r where r.id = (select request_id from pk2)),
  'accepted', 'pick: the newer request is accepted');
select is((select r.status || ':' || coalesce(r.extra_payment_id::text, 'none')
             from public.booking_edit_requests r where r.id = (select request_id from pk1)),
  'superseded:none', 'pick: the older request is untouched');
select is(pg_temp.ssf_class('pick'), 'ssf-biz', 'pick: the class she paid for');
select is(
  (select p.snapshot_id from public.booking_payments p
    where p.booking_id = pg_temp.ssf_b('pick') and p.stripe_checkout_session_id = 'cs_ssf_pick' and p.status = 'succeeded'),
  (select extra_snapshot_id from pk2), 'pick: the payment is recorded against the newer request''s difference record');
select is(
  (select b.price_snapshot_id from public.bookings b where b.id = pg_temp.ssf_b('pick')),
  (select quote_snapshot_id from pk2), 'pick: the booking is bound to the new price record');
select is(
  (select b.refund_status from public.bookings b where b.id = pg_temp.ssf_b('pick')),
  'none', 'pick: nothing is owed after an exact payment');

-- ---------------------------------------------------------------------------
-- D. A cancel ends a waiting change and lists its Stripe page
-- ---------------------------------------------------------------------------
create temporary table cc_w as select * from pg_temp.ssf_change('cc', 13);
select pg_temp.ssf_page((select request_id from cc_w), 'cs_ssf_cc');
create temporary table oc_w as select * from pg_temp.ssf_change('oc', 13);
select pg_temp.ssf_page((select request_id from oc_w), 'cs_ssf_oc');
create temporary table ref_w as select * from pg_temp.ssf_change('ref', 13);
select pg_temp.ssf_page((select request_id from ref_w), 'cs_ssf_ref');

-- A live booking lists nothing: the pages of a change that still waits are not the cancel's to close.
select is((select count(*)::int from public.booking_cancel_change_pages(pg_temp.ssf_b('ref'))),
  0, 'live booking: no page is listed');
select is((select count(*)::int from public.booking_cancel_change_pages(pg_temp.ssf_b('cc'))),
  0, 'before the cancel: no page is listed');

create temporary table cc_cancel as select * from public.customer_paid_cancel(pg_temp.ssf_b('cc'));
select is((select refund_mode from cc_cancel), 'auto_full', 'customer cancel more than 24 h ahead: the whole amount is due');
select is((select r.status from public.booking_edit_requests r where r.id = (select request_id from cc_w)),
  'superseded', 'customer cancel: the waiting change ends');
select is((select r.extra_session_id from public.booking_edit_requests r where r.id = (select request_id from cc_w)),
  'cs_ssf_cc', 'customer cancel: the ended request keeps its page id');
select is(
  (select pg_catalog.array_agg(p.extra_session_id) from public.booking_cancel_change_pages(pg_temp.ssf_b('cc')) as p),
  array['cs_ssf_cc']::text[], 'customer cancel: its Stripe page is listed for the Worker to close');
select is(
  (select b.status::text || ':' || b.refund_status || ':' || b.refund_owed_rappen::int
     from public.bookings b where b.id = pg_temp.ssf_b('cc')),
  'cancelled:pending_ops:10', 'customer cancel: cancelled, the captured amount is due');

create temporary table oc_cancel as
  select * from public.ops_cancel_booking(pg_temp.ssf_b('oc'), '26100210-0000-4000-a000-000000000001'::uuid);
select is((select refund_mode from oc_cancel), 'auto_full', 'dashboard cancel more than 24 h ahead: the whole amount is due');
select is((select r.status from public.booking_edit_requests r where r.id = (select request_id from oc_w)),
  'superseded', 'dashboard cancel: the waiting change ends');
select is(
  (select pg_catalog.array_agg(p.extra_session_id) from public.booking_cancel_change_pages(pg_temp.ssf_b('oc')) as p),
  array['cs_ssf_oc']::text[], 'dashboard cancel: its Stripe page is listed for the Worker to close');
select is((select count(*)::int from public.booking_cancel_change_pages(pg_temp.ssf_b('cc'))),
  1, 'pages are per booking: the other booking''s page is not mixed in');

-- The guest's manage-link door (the third door; it shares app.apply_customer_cancel).
insert into public.booking_access_tokens (booking_id, token_hash, expires_at)
values (pg_temp.ssf_b('mg'), extensions.digest('ssf-mg-token', 'sha256'), now() + interval '1 day');
create temporary table mg_w as select * from pg_temp.ssf_change('mg', 13);
select pg_temp.ssf_page((select request_id from mg_w), 'cs_ssf_mg');
create temporary table mg_cancel as select * from public.manage_booking_cancel(extensions.digest('ssf-mg-token', 'sha256'));
select is((select refund_mode from mg_cancel), 'auto_full', 'manage-link cancel more than 24 h ahead: the whole amount is due');
select is((select r.status from public.booking_edit_requests r where r.id = (select request_id from mg_w)),
  'superseded', 'manage-link cancel: the waiting change ends');
select is(
  (select pg_catalog.array_agg(p.extra_session_id) from public.booking_cancel_change_pages(pg_temp.ssf_b('mg')) as p),
  array['cs_ssf_mg']::text[], 'manage-link cancel: its Stripe page is listed for the Worker to close');

-- A page that has expired, or one whose change was paid, is not listed.
create temporary table pg_x as select * from pg_temp.ssf_change('a3', 13);
select pg_temp.ssf_page((select request_id from pg_x), 'cs_ssf_expired');
select public.customer_paid_cancel(pg_temp.ssf_b('a3'));
select is((select count(*)::int from public.booking_cancel_change_pages(pg_temp.ssf_b('a3'))),
  1, 'a page whose difference record is alive is listed');
alter table public.price_snapshots disable trigger price_snapshots_append_only;
update public.price_snapshots set expires_at = now() - interval '1 minute', quote_lock_expires_at = now() - interval '1 minute'
 where id = (select extra_snapshot_id from pg_x);
alter table public.price_snapshots enable trigger price_snapshots_append_only;
select is((select count(*)::int from public.booking_cancel_change_pages(pg_temp.ssf_b('a3'))),
  0, 'a page whose difference record has expired is not listed');

-- ---------------------------------------------------------------------------
-- E. Paid after a cancel: recorded, never applied, Refund due
-- ---------------------------------------------------------------------------
create temporary table cc_paid as select * from pg_temp.ssf_settle('cs_ssf_cc', 'evt_ssf_cc');
select is((select applied || ':' || already_settled from cc_paid), 'false:false',
  'paid after a customer cancel: not applied, not a redelivery');
select is((select request_id from cc_paid), (select request_id from cc_w), 'paid after a cancel: the settle names the ended request');
select is(pg_temp.ssf_class('cc'), 'ssf-eco', 'paid after a cancel: the class is unchanged');
select is(
  (select count(*)::int from public.booking_payments p
    where p.booking_id = pg_temp.ssf_b('cc') and p.stripe_checkout_session_id = 'cs_ssf_cc'
      and p.captured_at is not null and p.status = 'succeeded' and p.charged_rappen = 3),
  1, 'paid after a cancel: the captured difference is recorded once');
select is(
  (select b.status::text from public.bookings b where b.id = pg_temp.ssf_b('cc')),
  'cancelled', 'paid after a cancel: the booking stays cancelled');
select is(
  (select b.refund_status || ':' || b.refund_owed_rappen::int from public.bookings b where b.id = pg_temp.ssf_b('cc')),
  'pending_ops:13', 'paid after a cancel: Refund due = what the cancel owed plus the difference');
select is(
  (select b.price_snapshot_id from public.bookings b where b.id = pg_temp.ssf_b('cc')),
  (select s.id from public.price_snapshots s where s.booking_id = pg_temp.ssf_b('cc') and s.source = 'web'),
  'paid after a cancel: the booking is still bound to its original price record');
select is(
  (select r.status || ':' || (r.extra_payment_id is not null)::text
     from public.booking_edit_requests r where r.id = (select request_id from cc_w)),
  'superseded:true', 'paid after a cancel: the request stays ended and names its payment');
select is(
  (select count(*)::int from public.booking_events e
    where e.booking_id = pg_temp.ssf_b('cc') and e.kind = 'refund.requested'
      and e.payload ->> 'via' = 'difference_after_cancel' and (e.payload ->> 'due_rappen')::int = 3
      and e.actor_kind = 'stripe'),
  1, 'paid after a cancel: one refund.requested event, via difference_after_cancel');
select is(
  (select count(*)::int from public.booking_events e
    where e.booking_id = pg_temp.ssf_b('cc') and e.kind in ('booking.modified', 'price.repriced')),
  0, 'paid after a cancel: no change event, nothing was applied');
select is((select count(*)::int from public.booking_cancel_change_pages(pg_temp.ssf_b('cc'))),
  0, 'paid after a cancel: the page is no longer listed');
create temporary table cc_again as select * from pg_temp.ssf_settle('cs_ssf_cc', 'evt_ssf_cc');
select is((select already_settled from cc_again), true, 'a redelivered event is already settled');
select is(
  (select b.refund_owed_rappen::int from public.bookings b where b.id = pg_temp.ssf_b('cc')),
  13, 'a redelivered event adds nothing to the amount due');
select is(
  (select count(*)::int from public.booking_events e
    where e.booking_id = pg_temp.ssf_b('cc') and e.payload ->> 'via' = 'difference_after_cancel'),
  1, 'a redelivered event writes no second event');

-- The same through the dashboard cancel.
create temporary table oc_paid as select * from pg_temp.ssf_settle('cs_ssf_oc', 'evt_ssf_oc');
select is((select applied from oc_paid), false, 'paid after a dashboard cancel: not applied');
select is(pg_temp.ssf_class('oc'), 'ssf-eco', 'paid after a dashboard cancel: the class is unchanged');
select is(
  (select b.status::text || ':' || b.refund_status || ':' || b.refund_owed_rappen::int
     from public.bookings b where b.id = pg_temp.ssf_b('oc')),
  'cancelled:pending_ops:13', 'paid after a dashboard cancel: Refund due, difference added');

-- The settle's own guard: a cancel path that did not end the request (simulated here) cannot get it applied.
create temporary table gd_w as select * from pg_temp.ssf_change('gd', 13);
select pg_temp.ssf_page((select request_id from gd_w), 'cs_ssf_gd');
select public.customer_paid_cancel(pg_temp.ssf_b('gd'));
update public.booking_edit_requests set status = 'requested' where id = (select request_id from gd_w);
select is((select r.status from public.booking_edit_requests r where r.id = (select request_id from gd_w)),
  'requested', 'guard: the request is waiting again on a cancelled booking (simulated)');
create temporary table gd_paid as select * from pg_temp.ssf_settle('cs_ssf_gd', 'evt_ssf_gd');
select is((select applied from gd_paid), false, 'guard: a waiting request on a cancelled booking is not applied');
select is(pg_temp.ssf_class('gd'), 'ssf-eco', 'guard: the class is unchanged');
select is((select r.status from public.booking_edit_requests r where r.id = (select request_id from gd_w)),
  'superseded', 'guard: the request ends');
select is(
  (select b.status::text || ':' || b.refund_status || ':' || b.refund_owed_rappen::int
     from public.bookings b where b.id = pg_temp.ssf_b('gd')),
  'cancelled:pending_ops:13', 'guard: Refund due, difference added');
select is(
  (select count(*)::int from public.booking_payments p
    where p.booking_id = pg_temp.ssf_b('gd') and p.stripe_checkout_session_id = 'cs_ssf_gd' and p.status = 'succeeded'),
  1, 'guard: the payment is recorded');

-- Inside 24 h the cancel owes nothing yet (the owner decides); the difference does not invent an amount.
create temporary table in24_w as select * from pg_temp.ssf_change('in24', 13);
select pg_temp.ssf_page((select request_id from in24_w), 'cs_ssf_in24');
create temporary table in24_cancel as select * from public.customer_paid_cancel(pg_temp.ssf_b('in24'));
select is(
  (select b.status::text || ':' || b.refund_status || ':' || coalesce(b.refund_owed_rappen::text, 'null')
     from public.bookings b where b.id = pg_temp.ssf_b('in24')),
  'cancelled:pending_ops:null', 'inside 24 h: the cancel leaves Refund due with no amount (the owner decides)');
select is((select r.status from public.booking_edit_requests r where r.id = (select request_id from in24_w)),
  'superseded', 'inside 24 h: the cancel ends the waiting change too');
create temporary table in24_paid as select * from pg_temp.ssf_settle('cs_ssf_in24', 'evt_ssf_in24');
select is((select applied from in24_paid), false, 'inside 24 h: paid after the cancel, not applied');
select is(
  (select b.status::text || ':' || b.refund_status || ':' || coalesce(b.refund_owed_rappen::text, 'null')
     from public.bookings b where b.id = pg_temp.ssf_b('in24')),
  'cancelled:pending_ops:null', 'inside 24 h: owed stays null, the owner decides');
select is(
  (select count(*)::int from public.booking_payments p
    where p.booking_id = pg_temp.ssf_b('in24') and p.stripe_checkout_session_id = 'cs_ssf_in24'
      and p.status = 'succeeded' and p.charged_rappen = 3),
  1, 'inside 24 h: the difference is recorded');
select is(
  (select count(*)::int from public.booking_events e
    where e.booking_id = pg_temp.ssf_b('in24') and e.payload ->> 'via' = 'difference_after_cancel'),
  1, 'inside 24 h: one refund.requested event');

-- ---------------------------------------------------------------------------
-- F. Apply failure and transient errors
-- ---------------------------------------------------------------------------
-- The class she paid for stops existing between the owner's confirm and her payment.
create temporary table fail_w as select * from pg_temp.ssf_change('fail', 13, 'ssf-gone');
select pg_temp.ssf_page((select request_id from fail_w), 'cs_ssf_fail');
update public.vehicle_classes set slug = 'ssf-gone-x' where slug = 'ssf-gone';
create temporary table fail_paid as select * from pg_temp.ssf_settle('cs_ssf_fail', 'evt_ssf_fail');
select is((select applied || ':' || class_changed || ':' || already_settled from fail_paid), 'false:false:false',
  'apply failure: the settle answers, not applied');
select is((select unassigned_chauffeur_id from fail_paid), null, 'apply failure: no driver is reported taken off');
select is(
  (select count(*)::int from public.booking_payments p
    where p.booking_id = pg_temp.ssf_b('fail') and p.stripe_checkout_session_id = 'cs_ssf_fail'
      and p.captured_at is not null and p.status = 'succeeded' and p.charged_rappen = 3),
  1, 'apply failure: the captured difference is recorded');
select is((select r.status || ':' || (r.extra_payment_id is not null)::text
             from public.booking_edit_requests r where r.id = (select request_id from fail_w)),
  'superseded:true', 'apply failure: the request ends and names its payment');
select is(pg_temp.ssf_class('fail'), 'ssf-eco', 'apply failure: the booking is still on its old class');
select is((select b.status::text from public.bookings b where b.id = pg_temp.ssf_b('fail')),
  'confirmed', 'apply failure: the trip still runs');
select is(
  (select b.price_snapshot_id from public.bookings b where b.id = pg_temp.ssf_b('fail')),
  (select s.id from public.price_snapshots s where s.booking_id = pg_temp.ssf_b('fail') and s.source = 'web'),
  'apply failure: the failed apply left nothing behind, the booking keeps its original price record');
select is(
  (select count(*)::int from public.booking_events e
    where e.booking_id = pg_temp.ssf_b('fail') and e.kind in ('booking.modified', 'price.repriced')),
  0, 'apply failure: no change event was written');
select is(
  (select b.refund_status || ':' || b.refund_owed_rappen::int from public.bookings b where b.id = pg_temp.ssf_b('fail')),
  'pending_ops:3', 'apply failure: the paid difference shows as Refund due on the live booking');
select is(
  (select e.payload ->> 'sqlstate' || '|' || (e.payload ->> 'reason') || '|' || (e.payload ->> 'due_rappen')
          || '|' || (e.payload ->> 'request_id')
     from public.booking_events e
    where e.booking_id = pg_temp.ssf_b('fail') and e.kind = 'refund.requested'
      and e.payload ->> 'via' = 'difference_not_applied'),
  'P0001|unknown-class|3|' || (select request_id::text from fail_w),
  'apply failure: one event via difference_not_applied with the sqlstate, the reason, the amount and the request');
select is(
  (select count(*)::int from public.booking_events e
    where e.booking_id = pg_temp.ssf_b('fail') and e.kind = 'refund.requested'),
  2, 'apply failure: the paid difference is also stamped by the existing change credit (two refund.requested events)');
create temporary table fail_again as select * from pg_temp.ssf_settle('cs_ssf_fail', 'evt_ssf_fail');
select is((select already_settled from fail_again), true, 'apply failure: a redelivered event is already settled');
select is((select b.refund_owed_rappen::int from public.bookings b where b.id = pg_temp.ssf_b('fail')),
  3, 'apply failure: a redelivered event changes nothing');

-- A database hiccup is not final: the error goes back to the Worker, nothing is recorded, the retry works.
create function public.ssf_busy() returns trigger language plpgsql as $$
begin
  raise exception 'busy' using errcode = tg_argv[0];
end $$;
create temporary table busy_w as select * from pg_temp.ssf_change('busy', 13);
select pg_temp.ssf_page((select request_id from busy_w), 'cs_ssf_busy');

create trigger ssf_busy_trg before update on public.booking_legs
  for each row execute function public.ssf_busy('40P01');
select throws_ok($$select * from pg_temp.ssf_settle('cs_ssf_busy', 'evt_ssf_busy')$$,
  '40P01', 'busy', 'a deadlock inside the apply is raised back to the Worker');
drop trigger ssf_busy_trg on public.booking_legs;

create trigger ssf_busy_trg before update on public.booking_legs
  for each row execute function public.ssf_busy('08006');
select throws_ok($$select * from pg_temp.ssf_settle('cs_ssf_busy', 'evt_ssf_busy')$$,
  '08006', 'busy', 'a lost connection inside the apply is raised back to the Worker');
drop trigger ssf_busy_trg on public.booking_legs;

create trigger ssf_busy_trg before update on public.booking_legs
  for each row execute function public.ssf_busy('55P03');
select throws_ok($$select * from pg_temp.ssf_settle('cs_ssf_busy', 'evt_ssf_busy')$$,
  '55P03', 'busy', 'a lock timeout inside the apply is raised back to the Worker');
drop trigger ssf_busy_trg on public.booking_legs;

select is(
  (select count(*)::int from public.booking_payments p
    where p.booking_id = pg_temp.ssf_b('busy') and p.stripe_checkout_session_id = 'cs_ssf_busy'),
  0, 'a raised error rolls the whole settle back: no payment row');
select is((select r.status from public.booking_edit_requests r where r.id = (select request_id from busy_w)),
  'requested', 'a raised error rolls the whole settle back: the request still waits');
select is(
  (select b.price_snapshot_id from public.bookings b where b.id = pg_temp.ssf_b('busy')),
  (select s.id from public.price_snapshots s where s.booking_id = pg_temp.ssf_b('busy') and s.source = 'web'),
  'a raised error rolls the whole settle back: the booking keeps its price record');
create temporary table busy_paid as select * from pg_temp.ssf_settle('cs_ssf_busy', 'evt_ssf_busy');
select is((select applied from busy_paid), true, 'the retry records and applies the change');
select is(
  (select count(*)::int from public.booking_payments p
    where p.booking_id = pg_temp.ssf_b('busy') and p.stripe_checkout_session_id = 'cs_ssf_busy' and p.status = 'succeeded'),
  1, 'the retry records the payment once');
select is(pg_temp.ssf_class('busy'), 'ssf-biz', 'the retry applies the class');

-- ---------------------------------------------------------------------------
-- G. Accept: a second Accept after the amount moved
-- ---------------------------------------------------------------------------
-- A refund of 3 was recorded: the booking's total 10 less 7 paid net is a difference of 3 for a customer request.
insert into public.booking_refunds (booking_id, snapshot_id, payment_id, reason, basis_rappen, refund_percent,
                                    refund_rappen, tier_applied, hours_before)
select b.id, p.snapshot_id, p.id, 'modification_credit', 10, 30, 3, '{}'::jsonb, 48
  from public.bookings b join public.booking_payments p on p.booking_id = b.id
 where b.id in (pg_temp.ssf_b('a1'), pg_temp.ssf_b('a2'));

create temporary table a1_req as select * from pg_temp.ssf_customer('a1');
create temporary table a1_first as
  select * from public.booking_edit_request_accept((select request_id from a1_req), '26100210-0000-4000-a000-000000000001'::uuid);
select is((select outcome || ':' || difference_rappen from a1_first), 'extra_required:3',
  'first Accept: the difference of 3 is to be paid');
select is((select s.total_rappen::int from public.price_snapshots s where s.id = (select extra_snapshot_id from a1_first)),
  3, 'first Accept: the difference record carries 3');
select pg_temp.ssf_page((select request_id from a1_req), 'cs_ssf_a1');

-- The amount moves (another refund of 2 lowers what is paid net: the difference is now 5).
insert into public.booking_refunds (booking_id, snapshot_id, payment_id, reason, basis_rappen, refund_percent,
                                    refund_rappen, tier_applied, hours_before)
select b.id, p.snapshot_id, p.id, 'modification_credit', 10, 20, 2, '{}'::jsonb, 48
  from public.bookings b join public.booking_payments p on p.booking_id = b.id
 where b.id = pg_temp.ssf_b('a1');
create temporary table a1_before as
  select (select count(*) from public.price_snapshots s where s.booking_id = pg_temp.ssf_b('a1')) as snaps,
         (select r.extra_snapshot_id from public.booking_edit_requests r where r.id = (select request_id from a1_req)) as extra,
         (select r.extra_session_id from public.booking_edit_requests r where r.id = (select request_id from a1_req)) as page;
select throws_ok(
  format($f$select * from public.booking_edit_request_accept(%L::uuid, '26100210-0000-4000-a000-000000000001'::uuid)$f$,
         (select request_id from a1_req)),
  'P0001', 'price-changed', 'second Accept after the amount moved: refused with price-changed');
select is(
  (select count(*) from public.price_snapshots s where s.booking_id = pg_temp.ssf_b('a1')),
  (select snaps from a1_before), 'price-changed: no new price record was written');
select is(
  (select r.extra_snapshot_id from public.booking_edit_requests r where r.id = (select request_id from a1_req)),
  (select extra from a1_before), 'price-changed: the request keeps its first difference record');
select is(
  (select r.status || ':' || r.extra_session_id from public.booking_edit_requests r where r.id = (select request_id from a1_req)),
  'requested:' || (select page from a1_before), 'price-changed: the request still waits with its first Stripe page');
select is(
  (select b.price_snapshot_id from public.bookings b where b.id = pg_temp.ssf_b('a1')),
  (select s.id from public.price_snapshots s where s.booking_id = pg_temp.ssf_b('a1') and s.source = 'web'),
  'price-changed: the booking is untouched');

-- The same amount still answers extra_required, with the same difference record.
create temporary table a2_req as select * from pg_temp.ssf_customer('a2');
create temporary table a2_first as
  select * from public.booking_edit_request_accept((select request_id from a2_req), '26100210-0000-4000-a000-000000000001'::uuid);
create temporary table a2_second as
  select * from public.booking_edit_request_accept((select request_id from a2_req), '26100210-0000-4000-a000-000000000001'::uuid);
select is((select outcome || ':' || difference_rappen from a2_second), 'extra_required:3',
  'second Accept at the same amount: still extra_required');
select is((select extra_snapshot_id from a2_second), (select extra_snapshot_id from a2_first),
  'second Accept at the same amount: the same difference record');

-- Refusal order is unchanged: not-found, not-requested, then an erased booking is not-found.
select throws_ok(
  $$select * from public.booking_edit_request_accept('00000000-0000-4000-8000-000000000000'::uuid, '26100210-0000-4000-a000-000000000001'::uuid)$$,
  'P0002', 'not-found', 'an unknown request is not-found');

-- A same-price request is applied by the first Accept; the second one finds it no longer waiting.
create temporary table a5_req as select * from pg_temp.ssf_customer('a5');
create temporary table a5_first as
  select * from public.booking_edit_request_accept((select request_id from a5_req), '26100210-0000-4000-a000-000000000001'::uuid);
select is((select outcome from a5_first), 'applied', 'a same-price request is applied by Accept');
select throws_ok(
  format($f$select * from public.booking_edit_request_accept(%L::uuid, '26100210-0000-4000-a000-000000000001'::uuid)$f$,
         (select request_id from a5_req)),
  'P0001', 'not-requested', 'an accepted request is not-requested');

-- A request that waits on an erased booking is not-found (after the status check).
create temporary table a4_req as select * from pg_temp.ssf_customer('a4');
update public.bookings set erased_at = now() where id = pg_temp.ssf_b('a4');
select throws_ok(
  format($f$select * from public.booking_edit_request_accept(%L::uuid, '26100210-0000-4000-a000-000000000001'::uuid)$f$,
         (select request_id from a4_req)),
  'P0002', 'not-found', 'a request on an erased booking is not-found');
select is((select r.status from public.booking_edit_requests r where r.id = (select request_id from a4_req)),
  'requested', 'a request on an erased booking is left as it was');

-- ---------------------------------------------------------------------------
-- H. checkout_reference_for_session finds the booking of a difference page
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from public.booking_payments p where p.stripe_checkout_session_id = 'cs_ssf_ref'),
  0, 'reference: the difference page has no booking_payments row yet');
select is(
  public.checkout_reference_for_session('cs_ssf_ref'),
  (select b.reference from public.bookings b where b.id = pg_temp.ssf_b('ref')),
  'reference: a difference page names its booking');
select is(public.checkout_reference_for_session('cs_ssf_nobody'), null, 'reference: an unknown page names nothing');
select is(
  public.checkout_reference_for_session('cs_ssf_pick'),
  (select b.reference from public.bookings b where b.id = pg_temp.ssf_b('pick')),
  'reference: a page with a payment row still names its booking');
select is(
  public.checkout_reference_for_session('cs_ssf_cc'),
  (select b.reference from public.bookings b where b.id = pg_temp.ssf_b('cc')),
  'reference: an ended request''s page still names its booking');

select * from finish();
rollback;
